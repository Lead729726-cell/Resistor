import {readFile,writeFile,mkdir,readdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {runtimeConfig,workerRpc} from './runtime.mjs';
const cfg=await runtimeConfig(),out='examples/analog-soc/characterization';await mkdir(out,{recursive:true});
const rpc=async(m,p={})=>{const r=await workerRpc(cfg,m,p);if(!r.ok)throw Error(`${r.error.code}: ${r.error.message}`);return r.result;};
const e=JSON.parse(await readFile('examples/analog-soc/evidence.json','utf8')),row=e.rows.find(r=>r.reference==='soc_miller_ota');
if(!row?.physical_verification_pass||!row.post_layout_criteria_pass)throw Error('A freshly verified actual physical OTA is required');
const p=await rpc('project.open',{project_id:row.project_id});if(p.revision!==row.revision)throw Error('Preserve edited project; use a new qualification source');
const local=f=>{if(!f.startsWith('/workspace/'))throw Error('Unexpected artifact root');return path.resolve(f.slice(11));};
const sha=b=>createHash('sha256').update(b).digest('hex'),runs=[];
const fingerprint=sha(JSON.stringify(e.source_sha256));const stateFile=`.runtime/analog-soc/characterization-${fingerprint}.json`;let state;try{state=JSON.parse(await readFile(stateFile,'utf8'));}catch(err){if(err.code!=='ENOENT')throw err;state={runs:{}};}
const wait=async run=>{const deadline=Date.now()+360000;while(['queued','running'].includes(run.execution_status)){if(Date.now()>deadline)throw Error('Owned job deadline; result remains on worker');await new Promise(r=>setTimeout(r,800));run=await rpc('job.status',{run_id:run.id});}return run;};
async function solve(name,mode,post_layout){
 let run=state.runs[name]?await rpc('job.status',{run_id:state.runs[name]}):null;
 if(!run){run=await rpc('simulation.run',{project_id:p.id,expected_revision:p.revision,command_id:randomUUID(),analysis:'op',corner:'tt',temperature_C:27,supply_V:1.8,post_layout,characterization:{mode,...(mode==='mismatch'?{samples:16,seed:729726,offset_limit_V:.01}:{noise_limit_V:.0001})}});state.runs[name]=run.id;await writeFile(stateFile,JSON.stringify(state));}
 run=await wait(run);if(run.execution_status!=='completed'||run.analysis_result!=='pass'||run.freshness!=='current')throw Error(`Actual ${name} failed: ${run.message}`);
 const report=JSON.parse(await readFile(local(run.artifacts.characterization),'utf8'));const folder=out+'/'+name;await mkdir(folder,{recursive:true});
 await writeFile(folder+'/run.json',JSON.stringify(run,null,2)+'\n');await copyFile(local(run.artifacts.characterization),folder+'/characterization.json');await copyFile(local(run.manifest_path),folder+'/manifest.json');
 const native=path.dirname(local(run.manifest_path)),files=[];
 async function collect(dir,dest){await mkdir(dest,{recursive:true});for(const file of await readdir(dir,{withFileTypes:true})){const source=path.join(dir,file.name),target=path.join(dest,file.name);if(file.isDirectory()&&file.name.startsWith('sample-'))await collect(source,target);else if(file.isFile()&&/\.(spice|dat|log)$/.test(file.name)){await copyFile(source,target);const bytes=await readFile(source);files.push({file:path.relative(folder,target).replaceAll('\\','/'),bytes:bytes.length,sha256:sha(bytes)});}}}
 await collect(native,folder+'/native');await writeFile(folder+'/SHA256SUMS.json',JSON.stringify(files,null,2)+'\n');
 const record={name,run_id:run.id,project_id:p.id,revision:p.revision,execution_status:run.execution_status,analysis_result:run.analysis_result,freshness:run.freshness,post_layout,metrics:report.metrics,config:report.config,rows:report.rows};runs.push(record);
 console.log(JSON.stringify({name,status:run.execution_status,result:run.analysis_result,metrics:report.metrics}));return record;
}
const pre=await solve('pre-noise','noise',false),mm=await solve('pre-mismatch','mismatch',false),post=await solve('post-noise','noise',true),pm=await solve('post-mismatch','mismatch',true);
const replay=await solve('pre-mismatch-replay','mismatch',false),postReplay=await solve('post-mismatch-replay','mismatch',true);
const replayDifference=(a,b)=>{if(a.rows.length!==16||b.rows.length!==16||a.rows.some((r,i)=>r.seed!==b.rows[i].seed))throw Error('Seed/sample replay coverage changed');return {offset_max_delta_V:Math.max(...a.rows.map((r,i)=>Math.abs(r.offset_V-b.rows[i].offset_V))),supply_current_max_delta_A:Math.max(...a.rows.map((r,i)=>Math.abs(r.supply_current_A-b.rows[i].supply_current_A)))};};
const preDifference=replayDifference(mm,replay),postDifference=replayDifference(pm,postReplay);
if(preDifference.offset_max_delta_V!==0||preDifference.supply_current_max_delta_A!==0||postDifference.offset_max_delta_V>5e-9||postDifference.supply_current_max_delta_A>1e-12)throw Error('Native seeded replay exceeds the declared numerical tolerance');
const before=await rpc('project.open',{project_id:p.id});const rejected=await workerRpc(cfg,'simulation.run',{project_id:p.id,expected_revision:p.revision,command_id:randomUUID(),analysis:'op',characterization:{mode:'mismatch',samples:65}});
if(rejected.ok||rejected.error.code!=='CHARACTERIZATION_RANGE')throw Error('Invalid sample count was not rejected');
const after=await rpc('project.open',{project_id:p.id});if(before.runs.length!==after.runs.length||p.revision!==after.revision||JSON.stringify(p.schematic)!==JSON.stringify(after.schematic))throw Error('Invalid input or characterization modified the source circuit');
let canceled=await rpc('simulation.run',{project_id:p.id,expected_revision:p.revision,command_id:randomUUID(),analysis:'op',characterization:{mode:'mismatch',samples:64}});canceled=await rpc('job.cancel',{run_id:canceled.id});await new Promise(r=>setTimeout(r,500));canceled=await rpc('job.status',{run_id:canceled.id});
if(canceled.execution_status!=='canceled'||canceled.analysis_result!=='unknown')throw Error('Cancellation was not authoritative');
await writeFile(out+'/evidence.json',JSON.stringify({schema_version:1,source_sha256:e.source_sha256,runs,replay:{pre:{...preDifference,exact:true},post:{...postDifference,exact:postDifference.offset_max_delta_V===0&&postDifference.supply_current_max_delta_A===0,offset_tolerance_V:5e-9,current_tolerance_A:1e-12,scope:'Repeats actual Magic extraction and native OP; numeric matrix ordering may differ. Tolerance is explicit, not bitwise equality.'}},invalid_input_rejected:rejected.error.code,source_preserved:true,cancellation:{run_id:canceled.id,execution_status:canceled.execution_status,analysis_result:canceled.analysis_result},scope:'Actual installed public-model OTA unity follower, TT/27C/1.8V, typical extracted RC; finite 16-sample mismatch, not foundry yield.',foundry_signoff:false,paid_calls:0},null,2)+'\n');
