import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const config=JSON.parse(await fs.readFile('.runtime/worker.json','utf8'));
async function raw(method,params={}) {return (await (await fetch(config.url+'/rpc',{method:'POST',headers:{'content-type':'application/json','X-MOS-Token':config.token},body:JSON.stringify({method,params})})).json());}
async function rpc(method,params={}){const b=await raw(method,params);assert.equal(b.ok,true,JSON.stringify(b.error));return b.result;}
async function wait(r){for(let i=0;i<2000;i++){r=await rpc('job.status',{run_id:r.id});if(!['queued','running'].includes(r.execution_status))return r;await new Promise(r=>setTimeout(r,100));}throw new Error('Native timeout');}
let p=await rpc('project.create',{example:'inverter',name:'Actual LVS short open bulk fault regressions'});const evidence=[];
for(const [name,pin,net] of [['gate short','G','Y'],['open drain','D','OPEN_FAULT'],['incorrect bulk connection','B','VPWR']]){
 const original=p.schematic.devices.find(d=>d.id==='mn1').pins[pin];p=await rpc('schematic.apply_command',{project_id:p.id,expected_revision:p.revision,command_id:crypto.randomUUID(),command:{type:'set_pin',id:'mn1',pin,net}});
 let r=await wait(await rpc('verification.run_lvs',{project_id:p.id}));assert.equal(r.execution_status,'completed',r.message);assert.equal(r.analysis_result,'fail',r.message);evidence.push({case:name,expected:'fail',result:r.analysis_result,run_id:r.id,revision:r.revision,manifest_path:r.manifest_path});
 p=await rpc('schematic.apply_command',{project_id:p.id,expected_revision:p.revision,command_id:crypto.randomUUID(),command:{type:'set_pin',id:'mn1',pin,net:original}});r=await wait(await rpc('verification.run_lvs',{project_id:p.id}));assert.equal(r.execution_status,'completed',r.message);assert.equal(r.analysis_result,'pass',r.message);evidence.push({case:name+' repaired',expected:'pass',result:r.analysis_result,run_id:r.id,revision:r.revision,manifest_path:r.manifest_path});
 console.log(name+': real Netgen FAIL then repair PASS');
}
const fixture=await rpc('project.create',{example:'fixture',name:'No inferred PDK support'});for(const method of ['simulation.run','verification.run_drc','verification.run_lvs','extraction.run_pex']){const r=await raw(method,{project_id:fixture.id});assert.equal(r.ok,false);assert.equal(r.error.code,'UNSUPPORTED');}evidence.push({case:'fixture without verified physical profile never returns native success',result:'pass',project_id:fixture.id});
await fs.writeFile('.runtime/evidence/faults.json',JSON.stringify(evidence,null,2));
