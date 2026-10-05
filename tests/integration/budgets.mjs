import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const config=JSON.parse(await fs.readFile('.runtime/worker.json','utf8'));
async function raw(method,params={}) {return (await(await fetch(config.url+'/rpc',{method:'POST',headers:{'content-type':'application/json','X-MOS-Token':config.token},body:JSON.stringify({method,params})})).json());}
async function rpc(method,params={}){const b=await raw(method,params);assert.equal(b.ok,true,JSON.stringify(b.error));return b.result;}
const p=await rpc('project.create',{example:'mosfet',name:'Actual experiment budget and cancellation checks'});const defaults={project_id:p.id,algorithm:'grid',trial_budget:16,wall_time_s:60,variables:[{device_id:'mn1',parameter:'w_um',min:.65,max:1.3,steps:16}],objective:{metric:'Id_max',goal:'maximize'}};const evidence=[];
for(const wall_time_s of [59,1801]){const b=await raw('experiment.create',{...defaults,wall_time_s});assert.equal(b.ok,false);assert.equal(b.error.code,'EXPERIMENT_RANGE');}evidence.push({case:'aggregate wall-time bounds 60..1800 enforced',result:'pass'});
const first=await rpc('experiment.create',{...defaults,command_id:'create-budget-once'});assert.equal((await rpc('experiment.create',{...defaults,command_id:'create-budget-once'})).id,first.id);
const others=await Promise.all([rpc('experiment.create',defaults),rpc('experiment.create',defaults)]);
const started1=await rpc('experiment.evaluate',{experiment_id:first.id,command_id:'evaluate-once'});assert.equal((await rpc('experiment.evaluate',{experiment_id:first.id,command_id:'evaluate-once'})).id,started1.id);
const started2=await rpc('experiment.evaluate',{experiment_id:others[0].id});assert.equal(started2.execution_status,'running');const blocked=await raw('experiment.evaluate',{experiment_id:others[1].id});assert.equal(blocked.ok,false);assert.equal(blocked.error.code,'EXPERIMENT_CONCURRENCY');
for(const e of [first,...others]){await rpc('experiment.cancel',{experiment_id:e.id});}
for(const e of [first,...others]){const r=await rpc('experiment.status',{experiment_id:e.id});assert.equal(r.execution_status,'canceled');for(const rid of r.active_run_ids){const run=await rpc('job.status',{run_id:rid});assert.equal(run.execution_status,'canceled');assert.equal(run.analysis_result,'unknown');}}
const listed=await rpc('experiment.list',{project_id:p.id});assert.equal(listed.length,3);evidence.push({case:'exactly-once create/evaluate max2running and active native cancellation',result:'pass',experiment_ids:[first.id,...others.map(e=>e.id)],states:listed});
await fs.writeFile('.runtime/evidence/budgets.json',JSON.stringify(evidence,null,2));console.log(evidence.map(e=>e.case+': '+e.result).join('\n'));
