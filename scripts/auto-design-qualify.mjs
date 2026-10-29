// Qualify and export a completed public AI design experiment without model
// calls. Requires explicit workspace/id; never changes an existing graph.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {runtimeConfig,workerRpc} from './runtime.mjs';
import {evaluateTargets} from './auto-design.mjs';
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const m=a.match(/^--(workspace|design-id)=(.+)$/);if(!m)throw Error('Use --workspace=PATH --design-id=ID');return [m[1],m[2]];}));
assert(args.workspace&&/^[a-f0-9-]{36}$/.test(args['design-id']),'Explicit isolated experiment required.');
const workspace=path.resolve(args.workspace),worker=await runtimeConfig(workspace),row=JSON.parse(await readFile(path.join(workspace,'.runtime/assistant/auto-designs',args['design-id']+'.json'),'utf8'));
assert.equal(row.product_id,'resistor.indust');assert.equal(row.engine.status,'completed');assert.equal(row.family,'sensor_afe_dualband');
const out=path.resolve('docs/evidence/auto-design-20261029'),dest=path.resolve('examples/duet-afe/ai-candidates');await mkdir(out,{recursive:true});await mkdir(dest,{recursive:true});
const report={schema_version:1,edition:'indust',checked_at:new Date().toISOString(),design_id:row.id,paid_api_calls:0,models:{decision:row.decision,proposal:row.proposal},constraints:row.constraints,candidates:[],extra_pvt:[],completed:false,foundry_signoff:false,physical_layout_generated:false};
const api=async(m,p={})=>{const r=await workerRpc(worker,m,p);assert(r.ok,`${m}: ${r.error?.code} ${r.error?.message}`);return r.result;};
const local=f=>{assert(f.startsWith('/workspace/'));const p=path.resolve(workspace,f.slice(11));assert(p.startsWith(workspace+path.sep));return p;};
try{
 for(const c of row.candidates){
  const snapshot=await api('project.snapshot',{project_id:c.project_id});assert.equal(snapshot.revision,c.revision,'Candidate must retain its approved graph.');
  const jobs=[];for(const j of c.jobs){const r=await api('job.status',{run_id:j.result.id});assert.equal(r.project_id,c.project_id);assert.equal(r.revision,c.revision);assert.equal(r.tool,'ngspice');assert.equal(r.execution_status,'completed');assert.equal(r.measurements.analysis,j.analysis);jobs.push({analysis:j.analysis,status:r.execution_status,result:r});}
  const targets=evaluateTargets(row.constraints.targets,jobs);assert(targets.every(t=>t.status==='met'));
  const bundle=await api('project.export_bundle',{project_id:c.project_id,inline:true}),archive=Buffer.from(bundle.bundle_base64,'base64');await writeFile(path.join(dest,`candidate-${c.index+1}.register.zip`),archive);
  await writeFile(path.join(dest,`candidate-${c.index+1}.spice`),(await api('schematic.export_spice',{project_id:c.project_id})).text);
  const imported=await api('project.import_bundle',{bundle_base64:bundle.bundle_base64,mode:'new',command_id:randomUUID()});assert.equal(imported.runs.length,0);assert.equal(imported.design_template.id,row.family);
  const physical_guards=[];for(const method of ['verification.run_drc','verification.run_lvs','extraction.run_pex']){const r=await workerRpc(worker,method,{project_id:imported.id});assert.equal(r.ok,false);assert.equal(r.error.code,'NO_PHYSICAL_LAYOUT');physical_guards.push({method,code:r.error.code});}
  report.candidates.push({index:c.index,name:c.name,parameters:c.parameters,project_id:c.project_id,revision:c.revision,targets,preview_hash:c.preview.preview_hash,primitive_counts:c.preview.primitive_counts,archive_sha256:createHash('sha256').update(archive).digest('hex'),bundle_roundtrip:{new_project:true,inherited_runs:0},physical_guards,jobs:jobs.map(j=>({analysis:j.analysis,id:j.result.id,execution_status:j.status,analysis_result:j.result.analysis_result,measurements:j.result.measurements,reference_verification:j.result.reference_verification}))});
 }
 const best=[...report.candidates].sort((a,b)=>a.targets.find(t=>t.metric==='supply_power_W').observed-b.targets.find(t=>t.metric==='supply_power_W').observed)[0];report.selected_candidate_index=best.index;
 const byId=row.candidates.find(c=>c.index===best.index),tt=row.candidates[0].jobs.find(j=>j.analysis==='op').result.measurements.supply_power_W;
 report.dc_power_reduction_vs_first=1-best.targets.find(t=>t.metric==='supply_power_W').observed/tt;
 for(const condition of [{corner:'ss',supply_V:1.6,temperature_C:85},{corner:'ff',supply_V:1.8,temperature_C:-40}])for(const analysis of ['op','ac','tran']){
  let run=await api('simulation.run',{project_id:best.project_id,expected_revision:best.revision,command_id:randomUUID(),...condition,analysis,netlister:'native'});const deadline=Date.now()+180000;
  while(['queued','running'].includes(run.execution_status)){assert(Date.now()<deadline,'PVT deadline');await new Promise(r=>setTimeout(r,350));run=await api('job.status',{run_id:run.id});}
  assert.equal(run.execution_status,'completed');
  const entry={condition:{...condition,analysis},id:run.id,execution_status:run.execution_status,analysis_result:run.analysis_result,measurements:run.measurements,reference_verification:run.reference_verification,manifest_sha256:createHash('sha256').update(await readFile(local(run.manifest_path))).digest('hex')};report.extra_pvt.push(entry);await writeFile(path.join(out,'qualification.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({candidate:best.index+1,condition:entry.condition,result:run.analysis_result,power_W:run.measurements.supply_power_W,slow_Hz:run.measurements.slow_bandwidth_Hz,fast_Hz:run.measurements.fast_bandwidth_Hz}));
 }
 const bestTran=await api('job.status',{run_id:byId.jobs.find(j=>j.analysis==='tran').result.id});await copyFile(local(bestTran.artifacts.waveform_data),path.join(dest,'selected-tran-waveform.dat'));
 const bestAc=await api('job.status',{run_id:byId.jobs.find(j=>j.analysis==='ac').result.id});await copyFile(local(bestAc.artifacts.waveform_data),path.join(dest,'selected-ac-waveform.dat'));
 report.completed=true;report.all_extra_directed_criteria_passed=report.extra_pvt.every(r=>r.analysis_result==='pass');
}catch(e){report.error=e.message;throw e;}
finally{report.source_sha256=Object.fromEntries(await Promise.all(['scripts/auto-design.mjs','scripts/auto-design-qualify.mjs','workers/eda/duet_afe.py','workers/eda/design_tools.py','packages/ui/src/AutoDesign.tsx'].map(async f=>[f,createHash('sha256').update(await readFile(f)).digest('hex')])));await writeFile(path.join(out,'qualification.json'),JSON.stringify(report,null,2)+'\n');}
