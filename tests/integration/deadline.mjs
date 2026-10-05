import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const config=JSON.parse(await fs.readFile('.runtime/worker.json','utf8'));
async function rpc(method,params={}) {
  const response=await fetch(config.url+'/rpc',{method:'POST',headers:{'content-type':'application/json','X-MOS-Token':config.token},body:JSON.stringify({method,params})});
  const body=await response.json();assert.equal(body.ok,true,JSON.stringify(body.error));return body.result;
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const blockers=[];let experiment;
try {
  const source=await rpc('project.create',{example:'differential_pair',name:'Genuine long transient workload for aggregate deadline regression'});
  // Repeated fast edges and the actual 212R/21C extracted core keep both native
  // slots busy. No engine mocks, artificial sleep, mutated clock or deck edits.
  for(let i=0;i<2;i++) blockers.push(await rpc('simulation.run',{project_id:source.id,analysis:'tran',post_layout:true,duration_s:1e-3,step_s:5e-9}));
  for(let i=0;i<300;i++) {
    const runs=await Promise.all(blockers.map(r=>rpc('job.status',{run_id:r.id})));
    assert.ok(runs.every(r=>['queued','running'].includes(r.execution_status)),'Workload unexpectedly finished before the expiry test started');
    if(runs.every(r=>r.execution_status==='running')) break;
    await sleep(100);
  }
  const mos=await rpc('project.create',{example:'mosfet',name:'Actual 60-second queued experiment deadline'});
  experiment=await rpc('experiment.create',{project_id:mos.id,algorithm:'grid',trial_budget:1,wall_time_s:60,variables:[{device_id:'mn1',parameter:'w_um',min:.65,max:1.3}],objective:{metric:'Id_max',goal:'maximize'}});
  const started=Date.now();experiment=await rpc('experiment.evaluate',{experiment_id:experiment.id});
  while(experiment.execution_status==='running'&&Date.now()-started<90000) {await sleep(500);experiment=await rpc('experiment.status',{experiment_id:experiment.id});}
  const elapsed_s=(Date.now()-started)/1000;
  assert.equal(experiment.execution_status,'canceled');assert.equal(experiment.stop_reason,'aggregate_wall_time_exceeded');assert.ok(elapsed_s>=59&&elapsed_s<75);
  // The coordinator may be committing the final canceled trial immediately
  // after the experiment state is observable; wait for that bounded cleanup.
  for(let i=0;i<100&&experiment.active_run_ids.length;i++) {await sleep(100);experiment=await rpc('experiment.status',{experiment_id:experiment.id});}
  assert.equal(experiment.trials.length,1);const trial=experiment.trials[0];assert.equal(trial.feasible,false);assert.equal(trial.score,null);assert.equal(trial.error_code,'EXPERIMENT_TIMEOUT');
  const candidate=await rpc('project.snapshot',{project_id:trial.candidate_project_id});assert.equal(candidate.runs.length,1);const canceled=candidate.runs[0];assert.equal(canceled.execution_status,'canceled');assert.equal(canceled.analysis_result,'unknown');
  // Release the genuine workloads so the executor can drain its canceled queued
  // item and persist the no-command manifest before reading that artifact.
  for(const run of blockers) await rpc('job.cancel',{run_id:run.id});
  const manifestFile=canceled.manifest_path.replace('/workspace',process.cwd());
  let manifest;
  for(let i=0;i<200;i++) {try{manifest=JSON.parse(await fs.readFile(manifestFile,'utf8'));break;}catch(error){if(error.code!=='ENOENT')throw error;await sleep(100);}}
  assert.ok(manifest,'Canceled queue did not drain and preserve its manifest');assert.deepEqual(manifest.commands,[]);
  const evidence={case:'actual aggregate 60-second experiment deadline includes native queue wait',result:'pass',elapsed_s,experiment,canceled_run:{id:canceled.id,execution_status:canceled.execution_status,analysis_result:canceled.analysis_result,manifest_path:canceled.manifest_path},workloads:blockers.map(r=>({id:r.id,settings:{analysis:'tran',post_layout:true,duration_s:1e-3,step_s:5e-9}}))};
  await fs.writeFile('.runtime/evidence/deadline.json',JSON.stringify(evidence,null,2));console.log(`Actual aggregate deadline PASS after ${elapsed_s}s; queued native run canceled with no engine commands.`);
} finally {
  if(experiment?.execution_status==='running') await rpc('experiment.cancel',{experiment_id:experiment.id});
  for(const run of blockers) await rpc('job.cancel',{run_id:run.id});
}
