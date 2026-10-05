import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const root=process.cwd();
const config=JSON.parse(await fs.readFile(path.join(root,'.runtime/worker.json'),'utf8'));
async function rpc(method,params={}) {
 const response=await fetch(config.url+'/rpc',{method:'POST',headers:{'content-type':'application/json','X-MOS-Token':config.token},body:JSON.stringify({method,params})});
 const body=await response.json(); if(!body.ok) throw new Error(`${method}: ${body.error.code} ${body.error.message}`); return body.result;
}
async function wait(run) {
 while(true) {const r=await rpc('job.status',{run_id:run.id}); if(!['queued','running'].includes(r.execution_status)) return r; await new Promise(r=>setTimeout(r,100));}
}
const evidence=[];
const p=await rpc('project.create',{example:'inverter',name:'Advanced native job verification'});
for(const analysis of ['dc','ac','op']) {
 const run=await wait(await rpc('simulation.run',{project_id:p.id,analysis}));
 assert.equal(run.execution_status,'completed',run.message); assert.equal(run.analysis_result,'pass');
 evidence.push({case:`inverter ${analysis}`,run_id:run.id,revision:run.revision,result:'pass',measurements:run.measurements,manifest_path:run.manifest_path});
 console.log(`${analysis}: ${run.measurements.samples} native samples`);
}
const mos=await rpc('project.create',{example:'mosfet',name:'Advanced PCell width regression'});
const before=await wait(await rpc('simulation.run',{project_id:mos.id,analysis:'dc'}));
const edited=await rpc('layout.apply_command',{project_id:mos.id,command:{type:'update_device',id:'mn1',parameters:{w_um:1.3}}});
const after=await wait(await rpc('simulation.run',{project_id:mos.id,analysis:'dc'}));
assert.ok(after.measurements.Id_max>before.measurements.Id_max*1.5);
for(const method of ['verification.run_drc','verification.run_lvs']) {
 const run=await wait(await rpc(method,{project_id:mos.id})); assert.equal(run.execution_status,'completed',run.message); assert.equal(run.analysis_result,'pass');
 evidence.push({case:`MOS W 1.3 ${method}`,run_id:run.id,revision:edited.revision,result:'pass',manifest_path:run.manifest_path});
}
evidence.push({case:'MOS regenerated width changes actual current',result:'pass',before_A:before.measurements.Id_max,after_A:after.measurements.Id_max});
const busy=[];
for(let i=0;i<2;i++) busy.push(await rpc('simulation.run',{project_id:p.id,analysis:'tran',duration_s:2e-6,step_s:20e-12}));
const queued=await rpc('simulation.run',{project_id:p.id,analysis:'tran'});
const canceled=await rpc('job.cancel',{run_id:queued.id}); assert.equal(canceled.execution_status,'canceled');
// Cancel the genuinely running ngspice jobs as well; validate process-tree cancellation and queue drain.
for(const r of busy) await rpc('job.cancel',{run_id:r.id});
for(const r of busy) {const done=await wait(r); assert.equal(done.execution_status,'canceled',done.message);}
// The scheduler can report canceled before the native process exit is reaped; wait until the queued manifest exists.
for(let i=0;i<100;i++) {try {await fs.access(queued.manifest_path.replace('/workspace',root)); break;} catch {await new Promise(r=>setTimeout(r,100));}}
const retained=await rpc('job.status',{run_id:queued.id}); assert.equal(retained.execution_status,'canceled'); assert.equal(retained.analysis_result,'unknown');
const cancelManifest=JSON.parse(await fs.readFile(retained.manifest_path.replace('/workspace',root),'utf8'));
assert.equal(cancelManifest.commands.length,0,'Queued canceled job must not launch a native engine.');
evidence.push({case:'queued cancel survives thread-pool drain',result:'pass',busy_run_ids:busy.map(r=>r.id),canceled_run_id:queued.id,commands:cancelManifest.commands.length});
const last=await rpc('job.status',{run_id:after.id}); assert.equal(last.freshness,'current');
const file='/foss/pdks/sky130A/libs.tech/ngspice/parameters/lod.spice';
const mutation=`from pathlib import Path\np=Path('${file}')\nb=p.read_bytes()\nPath('/tmp/mos-lod-freshness-original').write_bytes(b)\np.write_bytes(b+b'\\n* MOS Studio dependency freshness regression\\n')`;
const restore=`from pathlib import Path\np=Path('${file}')\np.write_bytes(Path('/tmp/mos-lod-freshness-original').read_bytes())\nPath('/tmp/mos-lod-freshness-original').unlink()`;
let changed=false;
try {
 const result=spawnSync('docker',['exec','--user','0','mos-studio-eda','python3','-c',mutation],{encoding:'utf8'}); assert.equal(result.status,0,result.stderr); changed=true;
 const stale=await rpc('job.status',{run_id:after.id}); assert.equal(stale.freshness,'stale');
 evidence.push({case:'model dependency modification marks results stale',result:'pass',run_id:after.id,file});
} finally {
 if(changed) {const r=spawnSync('docker',['exec','--user','0','mos-studio-eda','python3','-c',restore],{encoding:'utf8'}); assert.equal(r.status,0,r.stderr);}
}
assert.equal((await rpc('job.status',{run_id:after.id})).freshness,'current');
await fs.mkdir(path.join(root,'.runtime/evidence'),{recursive:true});
await fs.writeFile(path.join(root,'.runtime/evidence/advanced.json'),JSON.stringify(evidence,null,2));
console.log('Advanced native regression passed; original PDK bytes restored.');
