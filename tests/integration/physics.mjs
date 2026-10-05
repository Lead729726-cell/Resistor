import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd();
const config=JSON.parse(await fs.readFile(path.join(root,'.runtime/worker.json'),'utf8'));
async function rpc(method,params={}) {
  const res=await fetch(config.url+'/rpc',{method:'POST',headers:{'content-type':'application/json','X-MOS-Token':config.token},body:JSON.stringify({method,params})});
  const body=await res.json(); if (!body.ok) throw new Error(`${method}: ${body.error.code} ${body.error.message}`); return body.result;
}
async function wait(run) {
  const limit=Date.now()+180000;
  while(Date.now()<limit) {
    const r=await rpc('job.status',{run_id:run.id});
    if(!['queued','running'].includes(r.execution_status)) {console.log(`${r.kind} ${r.execution_status} ${r.analysis_result}: ${r.message}`); return r;}
    await new Promise(r=>setTimeout(r,400));
  }
  throw new Error('Job timeout');
}
const evidence={date:new Date().toISOString(),doctor:await rpc('toolchain.doctor'),cases:[]};
async function runCase(project,method,params={},expected='pass') {
  const run=await wait(await rpc(method,{project_id:project.id,...params}));
  evidence.cases.push({project_id:project.id,name:project.name,revision:run.revision,method,params,expected,run});
  await fs.mkdir(path.join(root,'.runtime/evidence'),{recursive:true});
  await fs.writeFile(path.join(root,'.runtime/evidence/physics.json'),JSON.stringify(evidence,null,2));
  if(process.env.MOS_DIAG!=='1') { assert.equal(run.execution_status,'completed'); assert.equal(run.analysis_result,expected); }
  return run;
}
const inverter=await rpc('project.create',{example:'inverter',name:'Regression SKY130 inverter'});
console.log(`inverter ${inverter.id}`);
await runCase(inverter,'simulation.run',{analysis:'tran',corner:'tt'});
await runCase(inverter,'verification.run_drc');
await runCase(inverter,'verification.run_lvs');
await runCase(inverter,'extraction.run_pex');
await runCase(inverter,'simulation.run',{analysis:'tran',post_layout:true});
const mos=await rpc('project.create',{example:'mosfet',name:'Regression public SKY130 MOS PCell'});
console.log(`mos ${mos.id}`);
await runCase(mos,'simulation.run',{analysis:'dc'});
await runCase(mos,'verification.run_drc');
await runCase(mos,'verification.run_lvs');
await runCase(mos,'extraction.run_pex');
await runCase(mos,'simulation.run',{analysis:'dc',post_layout:true});
const wire=await rpc('project.create',{example:'wire',name:'Regression 200um RC wire'});
console.log(`wire ${wire.id}`);
await runCase(wire,'verification.run_drc');
const wirePex=await runCase(wire,'extraction.run_pex');
if(process.env.MOS_DIAG!=='1') { assert.ok(wirePex.parasitics.resistors>0); assert.ok(wirePex.parasitics.capacitors>0); }
await runCase(wire,'simulation.run',{analysis:'tran',post_layout:true});
let broken=await rpc('layout.apply_command',{project_id:inverter.id,command:{type:'add_box',layer_id:'68/20',box:['10000','0','10050','1000']}});
await runCase(broken,'verification.run_drc',{},'fail');
broken=await rpc('layout.apply_command',{project_id:inverter.id,command:{type:'undo'}});
await runCase(broken,'verification.run_drc');
broken=await rpc('schematic.apply_command',{project_id:inverter.id,command:{type:'update_device',id:'mn1',parameters:{w_um:1.3}}});
await runCase(broken,'verification.run_lvs',{},'fail');
broken=await rpc('schematic.apply_command',{project_id:inverter.id,command:{type:'undo'}});
await runCase(broken,'verification.run_lvs');
console.log('Physics regression complete. Evidence .runtime/evidence/physics.json');
