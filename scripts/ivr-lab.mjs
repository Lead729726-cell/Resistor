// Isolated actual MOS IVR qualification. No paid AI calls or user project edits.
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile,copyFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {runtimeConfig,workerRpc} from './runtime.mjs';
import {startWorker,stopWorker} from './worker.mjs';
const root=process.cwd(),quick=process.argv.includes('--quick'),generate=process.argv.includes('--generate');
assert(process.argv.slice(2).every(a=>['--quick','--generate'].includes(a)),'Use --quick and/or --generate');
const scratch=path.resolve('.runtime/ivr');await mkdir(scratch,{recursive:true});const workspace=await mkdtemp(path.join(scratch,'native-'));
const listener=createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
const worker=await runtimeConfig(workspace);worker.url='http://127.0.0.1:'+port;await writeFile(worker.file,JSON.stringify({url:worker.url,token:worker.token}));
const folder=path.resolve('docs/evidence/ivr-20261031');await mkdir(folder,{recursive:true});
const report={schema_version:1,edition:'indust',checked_at:new Date().toISOString(),actual_native_engine:true,paid_api_calls:0,completed:false,physical_layout_generated:false,foundry_signoff:false,runs:[]};
const api=async(method,params={})=>{const r=await workerRpc(worker,method,params);assert(r.ok,`${method}: ${r.error?.code}: ${r.error?.message}`);return r.result;};
const wait=async run=>{const deadline=Date.now()+180000;while(['queued','running'].includes(run.execution_status)){assert(Date.now()<deadline,'Native simulation deadline');await new Promise(r=>setTimeout(r,350));run=await api('job.status',{run_id:run.id});}return run;};
const local=file=>{assert(file.startsWith('/workspace/'));const dest=path.resolve(workspace,file.slice(11));assert(dest.startsWith(workspace+path.sep));return dest;};
let started=false;
try{
 await startWorker(workspace,{resourcesRoot:root,mode:'native',prepare:false});started=true;
 const doctor=await api('toolchain.doctor');report.tools=doctor.tools.filter(t=>['ngspice','KLayout'].includes(t.name));report.pdk=doctor.pdk;
 const input={template_id:'soc_ivr_ldo',name:'IVR · enabled self-biased 1.2V on-chip rail',parameters:{},chip_limits:{width_um:1000,height_um:1000,max_area_um2:1000000,edge_um:10}};
 const preview=await api('design.template_preview',input);report.preview=preview;
 const project=await api('design.create_template',{...input,preview_hash:preview.preview_hash,physical_core:false,command_id:randomUUID()});report.project_id=project.id;
 await writeFile(path.join(scratch,'latest.json'),JSON.stringify({workspace,project_id:project.id}));
 const conditions=quick?[{corner:'tt',supply_V:1.8,temperature_C:27}]:[{corner:'tt',supply_V:1.8,temperature_C:27},{corner:'ss',supply_V:1.6,temperature_C:85},{corner:'ff',supply_V:1.8,temperature_C:-40}];
 for(const condition of conditions)for(const analysis of ['op','ac','tran']){
  const run=await wait(await api('simulation.run',{project_id:project.id,expected_revision:1,command_id:randomUUID(),...condition,analysis,netlister:'native'}));
  const entry={condition:{...condition,analysis},id:run.id,revision:run.revision,execution_status:run.execution_status,analysis_result:run.analysis_result,measurements:run.measurements,reference_verification:run.reference_verification,message:run.message,manifest_sha256:run.manifest_path?createHash('sha256').update(await readFile(local(run.manifest_path))).digest('hex'):null};
  report.runs.push(entry);await writeFile(path.join(folder,'native.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({condition:entry.condition,status:entry.execution_status,result:entry.analysis_result,metrics:Object.fromEntries(Object.entries(entry.measurements||{}).filter(([k])=>['output_V','quiescent_current_A','psrr_100Hz_dB','light_output_V','heavy_output_V','load_step_undershoot_V','load_release_overshoot_V','startup_settle_2pct_s','load_settle_2pct_s','heavy_power_stage_efficiency'].includes(k))),failed_criteria:entry.reference_verification?.checks.filter(c=>!c.pass)}));
  if(run.execution_status==='failed')console.log((await api('job.logs',{run_id:run.id})).text.slice(-3000));
  assert.equal(run.execution_status,'completed','Actual solver must complete; inspect retained log.');
  if(generate&&condition.corner==='tt'){
   const dest=path.resolve('examples/ivr');await mkdir(dest,{recursive:true});await writeFile(path.join(dest,analysis+'-result.json'),JSON.stringify(entry,null,2)+'\n');
   await copyFile(local(run.artifacts.waveform_data),path.join(dest,analysis+'-waveform.dat'));await copyFile(local(run.manifest_path),path.join(dest,analysis+'-manifest.json'));
   await copyFile(local(run.artifacts.testbench),path.join(dest,analysis+'-testbench.spice'));
  }
 }
 if(generate){
  const dest=path.resolve('examples/ivr'),bundle=await api('project.export_bundle',{project_id:project.id,inline:true});await writeFile(path.join(dest,'IVR-LDO.register.zip'),Buffer.from(bundle.bundle_base64,'base64'));await writeFile(path.join(dest,'core.spice'),(await api('schematic.export_spice',{project_id:project.id})).text);await writeFile(path.join(dest,'preview.json'),JSON.stringify(preview,null,2)+'\n');
  const restored=await api('project.import_bundle',{bundle_base64:bundle.bundle_base64,mode:'new',command_id:randomUUID()});assert.equal(restored.runs.length,0);report.bundle_roundtrip={project_id:restored.id,inherited_runs:0};
  report.physical_guards=[];for(const method of ['verification.run_drc','verification.run_lvs','extraction.run_pex']){const r=await workerRpc(worker,method,{project_id:restored.id});assert.equal(r.ok,false);assert.equal(r.error.code,'NO_PHYSICAL_LAYOUT');report.physical_guards.push({method,code:r.error.code});}
 }
 report.completed=true;report.all_directed_criteria_passed=report.runs.every(r=>r.analysis_result==='pass');assert(report.all_directed_criteria_passed,'Actual directed IVR criteria failed; retained results are not promoted to PASS.');
}catch(e){report.error=e.message;throw e;}
finally{
 report.source_sha256=Object.fromEntries(await Promise.all(['workers/eda/power_ivr.py','workers/eda/design_tools.py','workers/eda/chip_references.py','workers/eda/current_flow.py','workers/eda/signal_metrics.py','workers/eda/research.py','workers/eda/literature.json','scripts/ivr-lab.mjs'].map(async f=>[f,createHash('sha256').update(await readFile(f)).digest('hex')])));
 await writeFile(path.join(folder,'native.json'),JSON.stringify(report,null,2)+'\n');await writeFile(path.join(scratch,'trial-'+Date.now()+'.json'),JSON.stringify(report,null,2)+'\n');if(started)await stopWorker(workspace);
}
