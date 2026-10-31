import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {prepareEditionWorkspace,getProductEdition} from './edition-workspace.mjs';
import {startWorker} from './worker.mjs';
import {workerRpc} from './runtime.mjs';
const edition=getProductEdition();assert.equal(edition.edition,'edu');
const config=await startWorker(await prepareEditionWorkspace({edition}),{resourcesRoot:process.cwd()});
const call=async(method,params={})=>{const r=await workerRpc(config,method,params);assert(r.ok,r.error?.message);return r.result;};
const cases=[];
for(const [name,r1,r2,rl,expected]of [['baseline',10000,10000,null,.9],['r2-only',10000,20000,null,1.2],['loaded',10000,10000,10000,.6],['low-current',100000,100000,null,.9]]){
 let p=await call('project.create',{example:'schematic',name:'[Edu recording QA] '+name,command_id:randomUUID()});
 const device=(id,kind,pins,value)=>({id,name:id,kind,pins,parameters:kind==='voltage'?{dc:value}:{value},x:100,y:100});
 const devices=[device('V1','voltage',{'+':'IN','-':'0'},1.8),device('R1','resistor',{'+':'IN','-':'OUT'},r1),device('R2','resistor',{'+':'OUT','-':'0'},r2),...(rl?[device('RL','resistor',{'+':'OUT','-':'0'},rl)]:[])];
 for(const d of devices)p=await call('schematic.apply_command',{project_id:p.id,expected_revision:p.revision,command_id:randomUUID(),command:{type:'add_device',device:d}});
 let run=await call('simulation.run',{project_id:p.id,expected_revision:p.revision,analysis:'op',post_layout:false,command_id:randomUUID()});const deadline=Date.now()+60000;
 while(['queued','running'].includes(run.execution_status)){assert(Date.now()<deadline,'OP timeout');await new Promise(r=>setTimeout(r,200));run=await call('job.status',{run_id:run.id});}
 assert.equal(run.execution_status,'completed',run.message);const output=run.waveforms.find(w=>w.name==='OUT')?.y[0];assert.equal(typeof output,'number');assert(Math.abs(output-expected)<1e-8,'Actual native OP mismatch: '+name);
 const current=run.current_flow.branches.find(b=>b.device_id==='R1')?.values_A[0],expectedCurrent=(1.8-expected)/r1;assert.equal(typeof current,'number');assert(Math.abs(Math.abs(current)-expectedCurrent)<1e-10,'Actual branch current mismatch');
 cases.push({name,edition:'edu',project_id:p.id,revision:p.revision,run_id:run.id,execution_status:run.execution_status,analysis_result:run.analysis_result,tool:run.tool,output_V:output,current_A:current,expected_output_V:expected,expected_current_A:expectedCurrent,manifest_path:run.manifest_path,checks:{voltage_tolerance_V:1e-8,current_tolerance_A:1e-10},drc:'not_run',lvs:'not_run',pex:'not_run'});
}
const directory='docs/evidence/recording-20261031';await mkdir(directory,{recursive:true});await writeFile(directory+'/divider-native.json',JSON.stringify({schema_version:1,edition:'edu',checked_at:new Date().toISOString(),scope:'new QA designs only',cases,foundry_signoff:false},null,2)+'\n');
console.log(JSON.stringify({status:'passed',actual_op_runs:cases.length,cases:cases.map(({name,output_V,current_A})=>({name,output_V,current_A}))}));
