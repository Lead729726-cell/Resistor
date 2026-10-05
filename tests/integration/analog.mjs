import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const config=JSON.parse(await fs.readFile('.runtime/worker.json','utf8'));
async function raw(method,params={}) {return(await(await fetch(config.url+'/rpc',{method:'POST',headers:{'content-type':'application/json','X-MOS-Token':config.token},body:JSON.stringify({method,params})})).json());}
async function rpc(method,params={}){const b=await raw(method,params);assert.equal(b.ok,true,JSON.stringify(b.error));return b.result;}
async function wait(r){for(let i=0;i<2000;i++){r=await rpc('job.status',{run_id:r.id});if(!['queued','running'].includes(r.execution_status))return r;await new Promise(r=>setTimeout(r,100));}throw new Error('Native timeout');}
const evidence=[];
for(const example of ['current_mirror','differential_pair']){
 const p=await rpc('project.create',{example,name:'Verified '+example+' analog core'});
 for(const [method,settings] of [['verification.run_drc',{}],['verification.run_lvs',{}],['extraction.run_pex',{}],['simulation.run',{analysis:'dc'}],['simulation.run',{analysis:'dc',post_layout:true}],['simulation.run',{analysis:'op'}],['simulation.run',{analysis:'ac'}]]){
  const r=await wait(await rpc(method,{project_id:p.id,...settings}));assert.equal(r.execution_status,'completed',r.message);assert.equal(r.analysis_result,'pass',r.message);evidence.push({example,project_id:p.id,method,settings,run_id:r.id,measurements:r.measurements,parasitics:r.parasitics,manifest_path:r.manifest_path,result:'pass'});
  if(example==='differential_pair'&&method==='simulation.run'&&settings.analysis==='dc'){const [a,b]=r.waveforms;assert.ok(a.y[0]<b.y[0]);assert.ok(a.y.at(-1)>b.y.at(-1));}
  if(example==='current_mirror'&&method==='simulation.run'&&settings.analysis==='dc'){const out=r.waveforms.find(w=>w.name==='Iout');assert.ok(out.y.at(-1)>80e-6&&out.y.at(-1)<120e-6);}
 }
 for(const format of ['gds','oas']){const x=await rpc('layout.export',{project_id:p.id,format});assert.equal(x.roundtrip.geometry_equal,true);assert.equal(x.roundtrip.stable_ids_preserved,true);}
 console.log(example+': actual DRC/LVS/PEX and pre/postDC/OP/AC PASS');
}
let p=await rpc('project.create',{example:'wire',name:'Public via helper physical verification'});
for(const via of ['via1','via2']){
 p=await rpc('layout.generate_pcell',{project_id:p.id,expected_revision:p.revision,command_id:'via-'+via,kind:'via',via,position:[via==='via1'?'10000':'20000','1000']});const r=await wait(await rpc('verification.run_drc',{project_id:p.id}));assert.equal(r.execution_status,'completed',r.message);assert.equal(r.analysis_result,'pass',JSON.stringify(r.markers));evidence.push({case:via,project_id:p.id,run_id:r.id,result:'pass',manifest_path:r.manifest_path});
}
p=await rpc('project.create',{example:'mosfet',name:'Actual MOS small-signal/output curves'});
for(const post_layout of [false,true]){
 let r=await wait(await rpc('simulation.run',{project_id:p.id,analysis:'op',post_layout}));assert.equal(r.execution_status,'completed',r.message);assert.ok(r.measurements.gm>0&&r.measurements.gds>0);assert.ok(r.measurements.vth>0);assert.equal(r.measurements.region_estimate,'saturation');evidence.push({case:'native BSIM OP '+post_layout,result:'pass',run_id:r.id,measurements:r.measurements,manifest_path:r.manifest_path});
 r=await wait(await rpc('simulation.run',{project_id:p.id,analysis:'dc',dc_sweep:'vds',vgs_V:1.2,post_layout}));assert.equal(r.execution_status,'completed',r.message);assert.equal(r.measurements.x_label,'Vds');assert.ok(r.waveforms.some(w=>w.name==='gds_sampled'));evidence.push({case:'actual Id-Vds output sweep '+post_layout,result:'pass',run_id:r.id,measurements:r.measurements,manifest_path:r.manifest_path});
}
await fs.writeFile('.runtime/evidence/analog.json',JSON.stringify(evidence,null,2));console.log('via and native gm/gds/Id-Vds regressions PASS');
