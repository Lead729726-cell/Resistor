// Owned, isolated Indust QA workspace. Never reconnects or replaces a user engine.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:net';
import path from 'node:path';
import {startWorker} from './worker.mjs';
import {runtimeConfig,workerRpc} from './runtime.mjs';

const root=process.cwd(),out=path.resolve(process.env.RESISTOR_QA_OUT??'.runtime/qa-20261024');
const workspace=path.join(out,'workspace');
await mkdir(path.join(workspace,'.runtime'),{recursive:true});
const context={schema_version:1,product_id:'resistor.indust',edition:'indust'};
try{assert.equal(JSON.parse(await readFile(path.join(workspace,'.runtime/product-context.json'),'utf8')).edition,'indust');}catch(e){if(e.code!=='ENOENT')throw e;}
try{await readFile(path.join(workspace,'.runtime/worker.json'));}catch(e){
 if(e.code!=='ENOENT')throw e;
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));
 const port=socket.address().port;await new Promise(r=>socket.close(r));
 await writeFile(path.join(workspace,'.runtime/worker.json'),JSON.stringify({url:`http://127.0.0.1:${port}`,token:randomUUID()+randomUUID()}));
}
await writeFile(path.join(workspace,'.runtime/product-context.json'),JSON.stringify(context));
await writeFile(path.join(workspace,'.runtime/engine.json'),JSON.stringify({mode:process.platform==='win32'?'wsl':'native',wsl_distribution:'ResistorEDA'}));
await startWorker(workspace,{resourcesRoot:root,mode:process.platform==='win32'?'wsl':'native',prepare:false});
const config=await runtimeConfig(workspace);
const call=async(method,params={})=>{
 const body=await workerRpc(config,method,params);assert(body.ok,`${method}: ${JSON.stringify(body.error)}`);return body.result;
};
if(process.argv.includes('--setup')){console.log(JSON.stringify({edition:'Resistor Indust',workspace,ready:true}));process.exit(0);}
const results={edition:'Resistor Indust',checked_at:new Date().toISOString(),actual_native:true,runs:[],negative_controls:[]};
const save=()=>writeFile(path.join(out,'native.json'),JSON.stringify(results,null,2)+'\n');
const catalog=await call('design.catalog');
for(const kind of ['sar16_unit_cap','sar16_controller','sar_adc16']){
 const item=catalog.templates.find(b=>b.id===kind);assert(item);
 const p=await call('design.create_template',{template_id:kind,name:`Debug QA · ${kind}`,parameters:item.parameter_defaults,command_id:randomUUID()});
 let run=await call('simulation.run',{project_id:p.id,expected_revision:p.revision,...p.testbench});
 const deadline=Date.now()+10*60000;
 while(['queued','running'].includes(run.execution_status)){
  assert(Date.now()<deadline,`Timed out; preserved run ${run.id}`);
  await new Promise(r=>setTimeout(r,1000));run=await call('job.status',{run_id:run.id});
 }
 await writeFile(path.join(out,`${run.id}.json`),JSON.stringify(run,null,2)+'\n');
 results.runs.push({kind,project_id:p.id,id:run.id,execution:run.execution_status,result:run.analysis_result,tool:run.tool,measurements:run.measurements});await save();
 assert.equal(run.execution_status,'completed',run.message);assert.equal(run.analysis_result,'pass',run.message);
 assert.equal(run.tool,kind==='sar16_unit_cap'?'ngspice':kind==='sar16_controller'?'Icarus Verilog':'ngspice + Icarus Verilog');
 if(kind==='sar16_unit_cap'){
  const short=await call('simulation.run',{project_id:p.id,expected_revision:p.revision,...p.testbench,duration_s:1e-6});
  let failed=short;while(['queued','running'].includes(failed.execution_status)){assert(Date.now()<deadline,`Timed out; preserved negative-control run ${failed.id}`);await new Promise(r=>setTimeout(r,1000));failed=await call('job.status',{run_id:short.id});}
  await writeFile(path.join(out,`${failed.id}.json`),JSON.stringify(failed,null,2)+'\n');
  assert.equal(failed.execution_status,'failed');assert.notEqual(failed.analysis_result,'pass');assert.match(failed.message,/sampling time/);
  results.negative_controls.push({case:'fixture-shorter-than-measurement-window',run_id:failed.id,execution:failed.execution_status,result:failed.analysis_result});await save();
 }
 console.log(JSON.stringify(results.runs.at(-1)));
}
const original=await call('project.open',{project_id:results.runs.at(-1).project_id});
const bundle=await call('project.export_bundle',{project_id:original.id,inline:true});
const copy=await call('project.import_bundle',{bundle_base64:bundle.bundle_base64});
assert.notEqual(copy.id,original.id);assert.deepEqual(copy.runs,[]);
const roundtrip=await call('project.export_bundle',{project_id:copy.id,inline:true});
assert.equal(roundtrip.geometry_hash,bundle.geometry_hash);
assert.deepEqual(copy.schematic,original.schematic);
const before=(await call('project.list',{metadata_only:true})).length;
const rejected=await workerRpc(config,'project.import_bundle',{bundle_base64:Buffer.from('invalid ZIP').toString('base64')});
assert.equal(rejected.ok,false);assert.equal((await call('project.list',{metadata_only:true})).length,before);
assert.equal((await call('project.open',{project_id:original.id})).revision,original.revision);
results.bundle={original_project:original.id,copy_project:copy.id,geometry_hash:roundtrip.geometry_hash,schematic_equal:true,imported_jobs:0,invalid_zip_rejected:true,original_preserved:true};
results.scope='Actual isolated native smoke at default conditions. Directed ADC accuracy, PVT/noise/mismatch, full-chip timing and manufacturing signoff are separate.';
await save();
