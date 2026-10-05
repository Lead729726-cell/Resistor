import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {startHub} from '../platform/cloud/hub.mjs';

test('actual file interchange in a shared room preserves revisions, roles and external result provenance', {timeout:120000}, async t => {
  const hub = await startHub({port:0, stateDirectory:path.resolve('.runtime/interchange-cloud',crypto.randomUUID())});
  t.after(()=>hub.close());
  const users={}, checks=[], endpoint=`http://127.0.0.1:${hub.port}`;
  const call=async(method,params={},identity='owner')=>{
    const response=await fetch(`${endpoint}/rpc`,{method:'POST',headers:{'Content-Type':'application/json',...(users[identity]?{Authorization:`Bearer ${users[identity].token}`}:{})},body:JSON.stringify({method,params})});
    const data=await response.json();if(!data.ok)throw Object.assign(new Error(data.error.message),data.error);return data.result;
  };
  for(const identity of ['owner','editor','viewer'])users[identity]=await call('cloud.auth.signUp',{email:`${identity}-${crypto.randomUUID()}@test.invalid`,name:identity,password:crypto.randomBytes(24).toString('base64url')},identity);
  let shared=await call('cloud.create',{name:'Shared imported design',example:'wire'});
  for(const role of ['editor','viewer']){const invite=await call('cloud.invite',{room_id:shared.room.id,role});await call('cloud.join',{token:invite.token},role);}
  const native=(method,params={},identity='editor',base=shared.project.revision,commandId=crypto.randomUUID())=>call('cloud.native',{room_id:shared.room.id,method,params:{...params,project_id:shared.project.id},base_revision:base,command_id:commandId},identity);
  const upload=(name,text)=>({name,base64:Buffer.from(text).toString('base64')});
  const layout={name:'wire.gds',base64:(await fs.readFile('examples/sky130/wire.gds')).toString('base64')};
  const cdl=upload('cell.cdl','* external design fixture\n.SUBCKT extcell A Z VDD VSS\nR1 A Z 1000\n.ENDS extcell\n');
  const files=[layout,cdl], options={source_tool:'virtuoso',netlist_file:'cell.cdl',netlist_top:'extcell'};
  await t.test('viewer inspects actual bytes but cannot import a design or result',async()=>{
    const inspected=await native('compat.inspect',{files,options},'viewer');
    assert.equal(inspected.schema_version,1);assert(inspected.files.some(file=>file.name==='wire.gds'&&file.status==='supported'));
    for(const method of ['compat.import','compat.import_results'])await assert.rejects(native(method,{files,options},'viewer'),{code:'READ_ONLY'});
    checks.push('actual uploaded file inspection; viewer mutation denied');
  });
  await t.test('native GDS/CDL import commits once and broadcasts its actual project revision',async()=>{
    const base=shared.project.revision,command=crypto.randomUUID();
    const imported=await native('compat.import',{files,options,expected_revision:base},'editor',base,command);
    assert.equal(imported.project.revision,base+1);assert.equal(imported.project.id,shared.project.id);
    assert(imported.project.interchange_netlist);assert(imported.report.files.some(file=>file.name==='wire.gds'));
    const replay=await native('compat.import',{files,options,expected_revision:base},'editor',base,command);
    assert.equal(replay.project.revision,imported.project.revision);
    await assert.rejects(native('compat.import',{files,options},'owner',base),{code:'EDIT_CONFLICT'});
    shared=await call('cloud.open',{id:shared.room.id});assert.equal(shared.project.revision,base+1);
    await assert.rejects(native('compat.import',{files,options,expected_revision:base}),{code:'EDIT_CONFLICT'});
    const renamed=await native('project.rename',{name:'Shared interop receipt verified'});assert.equal(renamed.revision,base+2);
    shared=await call('cloud.open',{id:shared.room.id});
    checks.push('immutable uploaded layout/netlist; exactly once receipt; nested revision and stale form protection');
  });
  await t.test('viewer downloads the actual GDS/OAS and preserved CDL without operator paths',async()=>{
    for(const format of ['gds','oas','cdl']){
      const result=await native('compat.export',{format},'viewer');assert(result.files.length>0);
      const bytes=Buffer.from(result.files[0].base64,'base64');assert(bytes.length>0);
      if(format==='cdl')assert.match(bytes.toString(),/\.SUBCKT extcell A Z VDD VSS/i);
      else assert.equal((await native('compat.inspect',{files:result.files},'viewer')).files[0].status,'supported');
      assert(!JSON.stringify(result).includes('/workspace/.runtime'));
    }
    await assert.rejects(call('cloud.native',{room_id:shared.room.id,method:'compat.export',params:{project_id:'another-project',format:'gds'}},'viewer'),{code:'WRONG_PROJECT'});
    checks.push('real GDS/OAS decode after export; preserved CDL; authorized project only');
  });
  let importedRun;
  await t.test('explicit external current samples import once, stay unverified and are room isolated',async()=>{
    const resultFile=upload('external.csv','time_s,out_V,branch_A\n0,1,0.001\n1e-9,0.5,-0.002\n');
    const context={analysis:'tran',formats:{currents:'csv'},current_schema:{x:{column:'time_s',unit:'s'},signals:[{column:'out_V',name:'OUT',unit:'V'}],branches:[{column:'branch_A',id:'sense',name:'VSENSE',unit:'A',from_net:'IN',to_net:'OUT',source_vector:'exported i(VSENSE)'}]}};
    const params={files:[resultFile],options:{source_tool:'spectre',results:{operation:'simulation',outputs:{currents:'external.csv'},context}},expected_revision:shared.project.revision};
    const command=crypto.randomUUID();importedRun=await native('compat.import_results',params,'editor',undefined,command);
    const replay=await native('compat.import_results',params,'editor',undefined,command);assert.equal(replay.id,importedRun.id);
    assert.equal(importedRun.workflow,'imported-results');assert.equal(importedRun.current_flow.source,'imported');
    assert.equal(importedRun.current_flow.geometry_linkage,'unverified');assert(importedRun.current_flow.branches.every(branch=>branch.mapping==='unmapped'));
    assert.deepEqual(importedRun.current_flow.branches[0].values_A,[.001,-.002]);
    assert.equal((await native('job.status',{run_id:importedRun.id},'viewer')).workflow,'imported-results');
    const other=await call('cloud.create',{name:'Different interchange room',example:'wire'});
    await assert.rejects(call('cloud.native',{room_id:other.room.id,method:'job.status',params:{run_id:importedRun.id,project_id:other.project.id}},'owner'),{code:'FORBIDDEN'});
    checks.push('signed external samples; imported provenance; receipt and room history isolation');
  });
  await fs.writeFile('docs/evidence/interchange-cloud.json',JSON.stringify({checked_at:new Date().toISOString(),checks,project_id:shared.project.id,revision:shared.project.revision,run_id:importedRun.id,current_source:importedRun.current_flow.source,vendor_execution_verified:false,public_hosting:'not_provisioned'},null,2));
});
