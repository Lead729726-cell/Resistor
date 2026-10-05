import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const config=JSON.parse(await fs.readFile('.runtime/worker.json','utf8'));
async function rpc(method,params={}) {const b=await (await fetch(config.url+'/rpc',{method:'POST',headers:{'content-type':'application/json','X-MOS-Token':config.token},body:JSON.stringify({method,params})})).json();assert.equal(b.ok,true,JSON.stringify(b.error));return b.result;}
async function wait(run) {for(let i=0;i<2000;i++){const r=await rpc('job.status',{run_id:run.id});if(!['queued','running'].includes(r.execution_status))return r;await new Promise(r=>setTimeout(r,100));}throw new Error('Job timeout');}
let p=await rpc('project.create',{example:'fixture',name:'Geometric graph crossings'});
async function apply(command,cell_name) {p=await rpc('schematic.apply_command',{project_id:p.id,expected_revision:p.revision,command_id:crypto.randomUUID(),command,cell_name});}
for(const [id,x,y] of [['left',30,0],['right',130,0],['up',80,-50],['down',80,50]]) await apply({type:'add_device',device:{id,name:id,kind:'port',pins:{P:''},parameters:{},x,y}});
await apply({type:'add_wire',wire:{id:'horizontal',points:[[0,0],[50,0],[100,0]]}});await apply({type:'add_wire',wire:{id:'vertical',points:[[50,-50],[50,0],[50,50]]}});
await apply({type:'set_connectivity_mode',mode:'geometric'});let check=await rpc('schematic.validate',{project_id:p.id});assert.equal(check.valid,true);assert.equal(check.connectivity.nets.length,2);
await apply({type:'add_junction',junction:{id:'cross',x:50,y:0}});check=await rpc('schematic.validate',{project_id:p.id});assert.equal(check.valid,true);assert.equal(check.connectivity.nets.length,1);
await apply({type:'move_junction',id:'cross',dx:10,dy:10});check=await rpc('schematic.validate',{project_id:p.id});assert.equal(check.connectivity.nets.filter(n=>n.pins.length).length,2);
await apply({type:'delete_junction',id:'cross'});await apply({type:'copy_wire',id:'horizontal',dx:0,dy:100});await apply({type:'move_wire',id:'vertical',dx:100,dy:0});
const evidence=[{case:'exact pin contact and explicit crossing junctions; wire movement/copy',result:'pass'}];
p=await rpc('project.create',{example:'inverter',name:'Native hierarchical block reference'});const devices=structuredClone(p.schematic.devices);
await apply({type:'add_cell',name:'INV_CHILD',ports:['A','VGND','VPWR','Y']});
for(const device of devices) await apply({type:'add_device',device},'INV_CHILD');
for(const device of devices) await apply({type:'delete_device',id:device.id});
await apply({type:'add_device',device:{id:'block1',name:'INV',kind:'block',cell_name:'INV_CHILD',pins:{A:'A',VGND:'VGND',VPWR:'VPWR',Y:'Y'},parameters:{},x:400,y:240}});
check=await rpc('schematic.validate',{project_id:p.id});assert.equal(check.valid,true);
const spice=await rpc('schematic.export_spice',{project_id:p.id});assert.match(spice.text,/\.subckt INV_CHILD/);assert.match(spice.text,/XINV A VGND VPWR Y INV_CHILD/);
let run=await wait(await rpc('simulation.run',{project_id:p.id,analysis:'tran'}));assert.equal(run.execution_status,'completed',run.message);assert.equal(run.analysis_result,'pass');
const lvs=await wait(await rpc('verification.run_lvs',{project_id:p.id}));assert.equal(lvs.execution_status,'completed',lvs.message);assert.equal(lvs.analysis_result,'pass',lvs.message);
evidence.push({case:'hierarchical native emission actual ngspice and Netgen flatten-equivalence',result:'pass',run_id:run.id,lvs_run_id:lvs.id});
p=await rpc('project.create',{example:'mosfet',name:'Real model corner and testbench regression'});
for(const corner of ['tt','ff','ss']) for(const analysis of ['dc','ac','op']) {
  run=await wait(await rpc('simulation.run',{project_id:p.id,corner,analysis}));assert.equal(run.execution_status,'completed',run.message);assert.equal(run.analysis_result,'pass');assert.equal(run.measurements.corner,corner);
  evidence.push({case:`actual MOS ${corner} ${analysis}`,result:'pass',run_id:run.id,measurements:run.measurements,manifest_path:run.manifest_path});
}
await apply({type:'update_testbench',settings:{analysis:'dc',corner:'ss',temperature_C:125,supply_V:1.2,vds_V:1.2}});
const params={project_id:p.id,expected_revision:p.revision,command_id:'job-once'};const first=await rpc('simulation.run',params);const replay=await rpc('simulation.run',params);assert.equal(first.id,replay.id);
const receipt=await rpc('project.command_receipt',{project_id:p.id,command_id:'job-once'});assert.equal(receipt.result.id,first.id);
run=await wait(first);assert.equal(run.execution_status,'completed',run.message);assert.equal(run.measurements.analysis,'dc');assert.equal(run.measurements.temperature_C,125);assert.equal(run.measurements.supply_V,1.2);assert.equal(run.measurements.corner,'ss');
evidence.push({case:'persisted testbench fallback and exactly-once native submission',result:'pass',run_id:run.id,measurements:run.measurements});
await fs.writeFile('.runtime/evidence/native-extended.json',JSON.stringify(evidence,null,2));console.log(evidence.map(e=>e.case+': '+e.result).join('\n'));
