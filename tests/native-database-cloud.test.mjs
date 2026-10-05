import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {startHub} from '../platform/cloud/hub.mjs';
import {runtimeConfig,workerRpc} from '../scripts/runtime.mjs';

test('native database source access and immutable graph import in shared projects',{timeout:120000},async t=>{
  const hub=await startHub({port:0,stateDirectory:path.resolve('.runtime/native-database-cloud',crypto.randomUUID())});
  t.after(()=>hub.close());
  const users={},checks=[],url=`http://127.0.0.1:${hub.port}`,config=await runtimeConfig();
  const call=async(method,params={},identity='owner')=>{
    const data=await fetch(`${url}/rpc`,{method:'POST',headers:{'Content-Type':'application/json',...(users[identity]?{Authorization:`Bearer ${users[identity].token}`}:{})},body:JSON.stringify({method,params})}).then(response=>response.json());
    if(!data.ok)throw Object.assign(new Error(data.error.message),data.error);return data.result;
  };
  const operator=async(method,params={})=>{const data=await workerRpc(config,method,params);if(!data.ok)throw Object.assign(new Error(data.error.message),data.error);return data.result;};
  for(const identity of ['owner','editor','viewer'])users[identity]=await call('cloud.auth.signUp',{email:`${identity}-${crypto.randomUUID()}@test.invalid`,name:identity,password:crypto.randomBytes(24).toString('base64url')},identity);
  let shared=await call('cloud.create',{name:'Native graph shared import',example:'fixture'});
  const other=await call('cloud.create',{name:'Separate native source scope',example:'fixture'});
  for(const role of ['editor','viewer']){const invite=await call('cloud.invite',{room_id:shared.room.id,role});await call('cloud.join',{token:invite.token},role);}
  const native=(method,params={},identity='editor',base=shared.project.revision,commandId=crypto.randomUUID(),room=shared.room.id,projectId=shared.project.id)=>call('cloud.native',{room_id:room,method,params:{...params,project_id:projectId},base_revision:base,command_id:commandId},identity);
  const sourceId=`public_${crypto.randomUUID().replaceAll('-','')}`,privateId=`private_${crypto.randomUUID().replaceAll('-','')}`;
  const manifest={schema_version:1,id:sourceId,name:'Actual public KLayout calibration',adapter:'klayout-file',layout_file:'/workspace/examples/sky130/wire.gds',library:'wire',view:'layout',layer_map:[],shared_project_ids:[shared.project.id]};
  await operator('database.register',{manifest});await operator('database.register',{manifest:{...manifest,id:privateId,shared_project_ids:[]}});
  let read;
  await t.test('operator binding filters sources and shared callers cannot register paths',async()=>{
    const sources=await native('database.list_sources',{},'viewer');
    assert(sources.some(source=>source.id===sourceId));assert(!sources.some(source=>source.id===privateId));
    assert(!JSON.stringify(sources).includes('/workspace/'),'private operator paths are not shared');
    await assert.rejects(native('database.register',{manifest},'owner'),{code:'UNSUPPORTED_METHOD'});
    await assert.rejects(native('database.probe',{source_id:privateId,access_project_id:shared.project.id},'owner'));
    checks.push('explicit operator source binding; private source filtering; no remote registration or path exposure');
  });
  await t.test('viewer performs an actual read-only graph query without changing the design',async()=>{
    const catalog=await native('database.catalog',{},'viewer');assert(catalog.adapters.some(adapter=>adapter.id==='cadence-skill'));
    const listed=await native('database.list_cells',{source_id:sourceId},'viewer');assert(listed.cells.length>0);
    const selected=listed.cells[0];read=await native('database.read',{source_id:sourceId,cell:selected.cell,view:selected.view},'viewer');
    assert.equal(read.can_import,true);assert(read.graph);assert.match(read.graph_sha256,/^[a-f0-9]{64}$/);
    assert.equal(read.vendor_execution_verified,false,'public calibration is never commercial verification');
    const artifact=await native('database.read_artifact',{read_id:read.id},'viewer');
    const bytes=Buffer.from(artifact.base64,'base64');assert(bytes.length>0);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),artifact.sha256);
    assert.equal((await call('cloud.open',{id:shared.room.id})).project.revision,shared.project.revision);
    checks.push('actual KLayout source cell/graph query; immutable artifact hash; no vendor PASS or project mutation');
  });
  await t.test('editor commits a graph once with stale and viewer protection',async()=>{
    const base=shared.project.revision,command=crypto.randomUUID(),params={read_id:read.id,expected_revision:base};
    await assert.rejects(native('database.import',params,'viewer',base,command),{code:'READ_ONLY'});
    const imported=await native('database.import',params,'editor',base,command);assert.equal(imported.project.revision,base+1);
    const replay=await native('database.import',params,'editor',base,command);assert.equal(replay.project.revision,imported.project.revision);
    await assert.rejects(native('database.import',params,'owner',base),{code:'EDIT_CONFLICT'});
    shared=await call('cloud.open',{id:shared.room.id});assert.equal(shared.project.revision,base+1);
    const scene=await native('view.get_scene',{max_shapes:100},'viewer');assert(scene.shapes.length>0);
    checks.push('real graph revision and scene; exactly once import; viewer and stale forms rejected');
  });
  await t.test('source and read receipts cannot cross room boundaries or accept command code',async()=>{
    for(const [method,params] of [['database.probe',{source_id:sourceId}],['database.read_artifact',{read_id:read.id}],['database.import',{read_id:read.id}]])
      await assert.rejects(native(method,{...params,access_project_id:shared.project.id},'owner',other.project.revision,crypto.randomUUID(),other.room.id,other.project.id));
    await assert.rejects(native('database.read',{source_id:sourceId,cell:read.cell,argv:['sh','-c','echo unsafe']}));
    checks.push('source/receipt isolation; reserved scope overwritten by hub; command injection rejected');
  });
  await fs.writeFile('docs/evidence/native-database-cloud.json',JSON.stringify({checked_at:new Date().toISOString(),checks,actual_reader:'klayout-file',vendor_execution_verified:false,read_id:read.id,graph_sha256:read.graph_sha256,revision:shared.project.revision,external_hosting:'deferred'},null,2));
});
