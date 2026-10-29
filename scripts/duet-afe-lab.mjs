// Reproducible native PVT qualification. No paid AI calls or user project edits.
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile,copyFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {runtimeConfig,workerRpc} from './runtime.mjs';
import {startWorker,stopWorker} from './worker.mjs';
const root=process.cwd(),generate=process.argv.includes('--generate'),quick=process.argv.includes('--quick');
assert(process.argv.slice(2).every(a=>['--generate','--quick'].includes(a)),'Use --generate and/or --quick');
const scratch=path.resolve('.runtime/duet-afe');await mkdir(scratch,{recursive:true});const workspace=await mkdtemp(path.join(scratch,'native-'));
const listener=createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
const worker=await runtimeConfig(workspace);worker.url='http://127.0.0.1:'+port;await writeFile(worker.file,JSON.stringify({url:worker.url,token:worker.token}));
const folder=path.resolve('docs/evidence/duet-afe-20261029');await mkdir(folder,{recursive:true});
const report={schema_version:1,edition:'indust',checked_at:new Date().toISOString(),actual_native_engine:true,paid_api_calls:0,completed:false,physical_layout_generated:false,foundry_signoff:false,runs:[]};
const api=async(method,params={})=>{const r=await workerRpc(worker,method,params);assert(r.ok,`${method}: ${r.error?.code}: ${r.error?.message}`);return r.result;};
const wait=async run=>{const deadline=Date.now()+180000;while(['queued','running'].includes(run.execution_status)){assert(Date.now()<deadline,'Native simulation deadline');await new Promise(r=>setTimeout(r,350));run=await api('job.status',{run_id:run.id});}return run;};
const local=file=>{assert(file.startsWith('/workspace/'));const target=path.resolve(workspace,file.slice(11));assert(target.startsWith(workspace+path.sep));return target;};
let started=false;
try{
  await startWorker(workspace,{resourcesRoot:root,mode:'native',prepare:false});started=true;
  const doctor=await api('toolchain.doctor');report.tools=doctor.tools.filter(t=>['ngspice','KLayout'].includes(t.name));report.pdk=doctor.pdk;
  const input={template_id:'sensor_afe_dualband',name:'DUET-AFE · dual-band sensor research prototype',parameters:{},chip_limits:{width_um:300,height_um:300,max_area_um2:90000,edge_um:10}};
  const preview=await api('design.template_preview',input);report.preview=preview;
  const project=await api('design.create_template',{...input,preview_hash:preview.preview_hash,physical_core:false,command_id:randomUUID()});report.project_id=project.id;
  await writeFile(path.join(scratch,'latest.json'),JSON.stringify({workspace,project_id:project.id}));
  const conditions=quick?[{corner:'tt',supply_V:1.8,temperature_C:27}]:[{corner:'tt',supply_V:1.8,temperature_C:27},{corner:'ss',supply_V:1.6,temperature_C:85},{corner:'ff',supply_V:1.8,temperature_C:-40}];
  for(const condition of conditions)for(const analysis of ['op','ac','tran']){
    const run=await wait(await api('simulation.run',{project_id:project.id,expected_revision:1,command_id:randomUUID(),...condition,analysis,netlister:'native'}));
    const log=await api('job.logs',{run_id:run.id});
    const entry={condition:{...condition,analysis},id:run.id,revision:run.revision,execution_status:run.execution_status,analysis_result:run.analysis_result,measurements:run.measurements,reference_verification:run.reference_verification,message:run.message,manifest_sha256:run.manifest_path?createHash('sha256').update(await readFile(local(run.manifest_path))).digest('hex'):null};
    report.runs.push(entry);await writeFile(path.join(folder,'native.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({condition:entry.condition,status:run.execution_status,result:run.analysis_result,metrics:run.measurements,message:run.message,...(run.execution_status==='failed'?{log:log.text.slice(-2500)}:{})}));
    assert.equal(run.execution_status,'completed','Actual ngspice must complete; inspect retained log.');
    if(generate&&condition.corner==='tt'){
      const dest=path.resolve('examples/duet-afe');await mkdir(dest,{recursive:true});
      await writeFile(path.join(dest,analysis+'-result.json'),JSON.stringify(entry,null,2)+'\n');
      await copyFile(local(run.artifacts.waveform_data),path.join(dest,analysis+'-waveform.dat'));
      await copyFile(local(run.manifest_path),path.join(dest,analysis+'-manifest.json'));
    }
  }
  if(generate){const dest=path.resolve('examples/duet-afe'),bundle=await api('project.export_bundle',{project_id:project.id,inline:true});await writeFile(path.join(dest,'DUET-AFE.register.zip'),Buffer.from(bundle.bundle_base64,'base64'));await writeFile(path.join(dest,'core.spice'),(await api('schematic.export_spice',{project_id:project.id})).text);await writeFile(path.join(dest,'preview.json'),JSON.stringify(preview,null,2)+'\n');}
  report.completed=true;report.all_directed_criteria_passed=report.runs.every(r=>r.analysis_result==='pass');
}catch(e){report.error=e.message;throw e;}
finally{report.source_sha256=Object.fromEntries(await Promise.all(['workers/eda/duet_afe.py','workers/eda/design_tools.py','workers/eda/analog_soc.py','workers/eda/native.py','scripts/duet-afe-lab.mjs'].map(async f=>[f,createHash('sha256').update(await readFile(f)).digest('hex')])));await writeFile(path.join(folder,'native.json'),JSON.stringify(report,null,2)+'\n');if(started)await stopWorker(workspace);}
