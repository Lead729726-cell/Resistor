// Reproduce editable SKY130 schematic references through the real native app API.
// Each invocation keeps its own attempt, including failed solves and failed criteria.
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile,copyFile,stat} from 'node:fs/promises';
import {createServer} from 'node:net';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {runtimeConfig,workerRpc} from './runtime.mjs';
import {startWorker,stopWorker} from './worker.mjs';

const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i++){
  const name=args[i];assert(['--quick','--matrix','--workspace','--keep-worker','--output'].includes(name),'Unknown option: '+name);
  if(['--workspace','--output'].includes(name)){assert(args[i+1]&&!args[i+1].startsWith('--'),'Missing '+name+' value');options[name]=args[++i];}
  else options[name]=true;
}
assert(!(options['--quick']&&options['--matrix']),'Choose --quick or --matrix.');
const root=process.cwd(),scratch=path.resolve('.runtime/practical-analog-20261112');await mkdir(scratch,{recursive:true});
const workspace=options['--workspace']?path.resolve(options['--workspace']):await mkdtemp(path.join(scratch,'native-'));
assert(workspace.startsWith(scratch+path.sep),'Only the owned practical-analog scratch workspace is allowed.');
const config=await runtimeConfig(workspace);
if(!options['--workspace']){const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));config.url='http://127.0.0.1:'+socket.address().port;await new Promise(r=>socket.close(r));await writeFile(config.file,JSON.stringify({url:config.url,token:config.token}),{mode:0o600});}
const attempt='attempt-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8);
const destination=path.resolve(options['--output']||'examples/practical-analog-20261112',attempt);await mkdir(destination,{recursive:true});
const report={schema_version:1,edition:'indust',attempt,checked_at:new Date().toISOString(),workspace,actual_native_engine:false,paid_api_calls:0,completed:false,all_directed_criteria_passed:false,physical_layout_generated:false,foundry_signoff:false,conditions:[],projects:[],runs:[],supplemental_runs:[],limitations:['Directed pre-layout schematic checks only; not measured silicon or manufacturing signoff.','Public SKY130 MOS models with ideal testbench sources and explicitly stated passive/load assumptions.','MOS corners do not by themselves vary ideal resistors/capacitors.','An editable bundle intentionally imports without inherited simulation PASS results.']};
const sources=['workers/eda/practical_analog.py','workers/eda/design_tools.py','workers/eda/native.py','workers/eda/server.py','workers/eda/current_flow.py','workers/eda/signal_metrics.py','workers/eda/analog_soc.py','workers/eda/chip_references.py','workers/eda/research.py','workers/eda/literature.json','workers/eda/semiconductor_starters.py','scripts/practical-analog-lab.mjs'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourceHashes=async()=>Object.fromEntries(await Promise.all(sources.map(async file=>[file,sha(await readFile(file))])));
const save=()=>writeFile(path.join(destination,'report.json'),JSON.stringify(report,null,2)+'\n');
const api=async(method,params={})=>{const response=await workerRpc(config,method,params);assert(response.ok,method+': '+response.error?.code+': '+response.error?.message);return response.result;};
const local=file=>{const target=path.resolve(file.startsWith('/workspace/')?path.join(workspace,file.slice(11)):file);assert(target.startsWith(workspace+path.sep),'Artifact escaped owned workspace.');return target;};
const wait=async run=>{const until=Date.now()+240000;while(['queued','running'].includes(run.execution_status)){assert(Date.now()<until,'Native simulation exceeded bounded wait; job remains in owned workspace.');await new Promise(r=>setTimeout(r,350));run=await api('job.status',{run_id:run.id});}return run;};
const nominal={corner:'tt',supply_V:1.8,temperature_C:27};
report.conditions=options['--quick']?[nominal]:options['--matrix']?['tt','ss','ff'].flatMap(corner=>[1.6,1.7,1.8].flatMap(supply_V=>[-40,27,85].map(temperature_C=>({corner,supply_V,temperature_C})))):[nominal,{corner:'ss',supply_V:1.6,temperature_C:85},{corner:'ff',supply_V:1.8,temperature_C:-40},{corner:'ss',supply_V:1.62,temperature_C:125}];
report.condition_scope=options['--matrix']?'27 independent MOS-corner/supply/temperature combinations':options['--quick']?'Nominal only':'Four directed joint conditions including offered slow-hot starter; not a full Cartesian PVT matrix';
let started=false;
try{
  report.source_sha256=await sourceHashes();
  for(const file of sources){const target=path.join(destination,'source',file);await mkdir(path.dirname(target),{recursive:true});await copyFile(file,target);}
  await startWorker(workspace,{resourcesRoot:root,mode:'native',prepare:false});started=true;
  report.doctor=await api('toolchain.doctor');
  assert(report.doctor.tools.find(t=>t.name==='ngspice')?.available,'Actual ngspice is required.');
  report.actual_native_engine=true;
  for(const template of ['sensor_current_tia','adc_track_hold','sensor_schmitt']){
    const input={template_id:template,name:'Practical analog · '+template,parameters:{},chip_limits:{width_um:300,height_um:300,max_area_um2:90000,edge_um:10}};
    const preview=await api('design.template_preview',input);
    const project=await api('design.create_template',{...input,preview_hash:preview.preview_hash,physical_core:false,command_id:randomUUID()});
    const folder=path.join(destination,template);await mkdir(folder,{recursive:true});
    await writeFile(path.join(folder,'preview.json'),JSON.stringify(preview,null,2)+'\n');
    const projectEntry={template_id:template,project_id:project.id,revision:project.revision,device_count:preview.device_count,primitive_counts:preview.primitive_counts,layout_status:project.design_template.layout_status,ports:project.ports,chip_limits:project.chip_limits,analyses:template==='sensor_current_tia'?['op','ac','tran']:['op','tran']};report.projects.push(projectEntry);await save();
    const stale=await workerRpc(config,'simulation.run',{project_id:project.id,expected_revision:project.revision+1,command_id:randomUUID(),analysis:'op',netlister:'native'});assert.equal(stale.ok,false);assert.equal(stale.error.code,'REVISION_CONFLICT');assert.equal((await api('project.open',{project_id:project.id})).runs.length,0);projectEntry.stale_revision_guard={code:stale.error.code,new_runs:0};
    const cases=report.conditions.flatMap(condition=>projectEntry.analyses.map(analysis=>({...condition,analysis,qualification:true})));
    if(template==='adc_track_hold')cases.push({...nominal,analysis:'tran',load_F:2e-12,qualification:false});
    for(const item of cases){
      const {qualification,...condition}=item,analysis=condition.analysis;
      const runFolder=path.join(folder,`${condition.corner}-${condition.supply_V}V-${condition.temperature_C}C-${analysis}`+(qualification?'':'-load-2pF'));await mkdir(runFolder,{recursive:true});
      const entry={template_id:template,condition,role:qualification?'directed-qualification':'supplemental-custom-load',project_id:project.id,revision:project.revision,artifact_directory:path.relative(destination,runFolder).replaceAll('\\','/')};
      try{
        const run=await wait(await api('simulation.run',{project_id:project.id,expected_revision:project.revision,command_id:randomUUID(),...condition,analysis,netlister:'native'}));
        Object.assign(entry,{id:run.id,revision:run.revision,execution_status:run.execution_status,analysis_result:run.analysis_result,measurements:run.measurements,reference_verification:run.reference_verification,message:run.message,tool:run.tool,freshness:run.freshness,traces:(run.waveforms||[]).map(w=>({name:w.name,unit:w.unit,samples:w.x.length,start:w.x[0],end:w.x.at(-1)})),files:{}});
        const logs=await api('job.logs',{run_id:run.id});await writeFile(path.join(runFolder,'engine.log'),logs.text||'');entry.files['engine.log']=sha(logs.text||'');
        const waveText=JSON.stringify({schema_version:1,source:'actual-ngspice-samples',run_id:run.id,project_id:project.id,revision:run.revision,waveforms:run.waveforms||[]});await writeFile(path.join(runFolder,'waveforms.json'),waveText+'\n');entry.files['waveforms.json']=sha(waveText+'\n');
        const artifacts={manifest:run.manifest_path,...Object.fromEntries(['testbench','waveform_data','reference_netlist','current_flow_data','current_probe_netlist','node_voltage_data','node_voltage_probes'].filter(key=>run.artifacts?.[key]).map(key=>[key,run.artifacts[key]]))};
        for(const [kind,file]of Object.entries(artifacts)){if(!file)continue;const source=local(file);try{await stat(source);}catch{continue;}const name=kind==='manifest'?'manifest.json':path.basename(source);await copyFile(source,path.join(runFolder,name));entry.files[name]=sha(await readFile(source));}
        if(!qualification){const text=await readFile(local(run.artifacts.testbench),'utf8'),match=/^CLOAD\s+OUT\s+VGND\s+(\S+)/m.exec(text);assert(match,'Actual testbench has no output load.');const observed=Number(match[1]);assert.equal(observed,condition.load_F,'Requested load was not applied to the native testbench.');assert.equal(run.measurements.testbench_output_load_F,condition.load_F);entry.load_override_validation={requested_F:condition.load_F,observed_F:observed,measurement_F:run.measurements.testbench_output_load_F,pass:true};}
        entry.numerical_execution_passed=run.execution_status==='completed'&&run.tool==='ngspice'&&run.measurements?.metric_source==='actual-ngspice-samples'&&entry.traces.length>0;
        entry.directed_criteria_passed=entry.numerical_execution_passed&&run.analysis_result==='pass'&&run.reference_verification?.pass===true&&run.reference_verification?.checks?.length>0;
        entry.failure_class=entry.numerical_execution_passed?(entry.directed_criteria_passed?null:'directed-criteria'):'native-execution-or-provenance';
      }catch(error){Object.assign(entry,{execution_status:'not-completed',analysis_result:'unknown',numerical_execution_passed:false,directed_criteria_passed:false,failure_class:'dispatch-or-harness',error:error.message});}
      (qualification?report.runs:report.supplemental_runs).push(entry);await writeFile(path.join(runFolder,'result.json'),JSON.stringify(entry,null,2)+'\n');await save();
      console.log(JSON.stringify({template,condition:entry.condition,execution_status:entry.execution_status,analysis_result:entry.analysis_result,failure_class:entry.failure_class,failed_checks:entry.reference_verification?.checks?.filter(c=>!c.pass),error:entry.error}));
    }
    const bundle=await api('project.export_bundle',{project_id:project.id,revision:project.revision,inline:true}),bytes=Buffer.from(bundle.bundle_base64,'base64');assert.equal(sha(bytes),bundle.sha256);
    await writeFile(path.join(folder,template+'.register.zip'),bytes);projectEntry.bundle={path:template+'/'+template+'.register.zip',sha256:sha(bytes),size_bytes:bytes.length};
    const netlist=await api('schematic.export_spice',{project_id:project.id});await writeFile(path.join(folder,'core.spice'),netlist.text);
    const restored=await api('project.import_bundle',{bundle_base64:bundle.bundle_base64,mode:'new',command_id:randomUUID()});
    assert.equal(restored.runs.length,0,'Imported bundle must not inherit PASS.');assert.deepEqual(restored.schematic,project.schematic,'Editable hierarchy changed during roundtrip.');assert.deepEqual(restored.testbench,project.testbench);assert.deepEqual(restored.design_template,project.design_template);
    projectEntry.bundle_roundtrip={project_id:restored.id,inherited_runs:0,schematic_equal:true,testbench_equal:true,template_metadata_equal:true};projectEntry.physical_guards=[];
    for(const method of ['verification.run_drc','verification.run_lvs','extraction.run_pex']){const response=await workerRpc(config,method,{project_id:restored.id,expected_revision:restored.revision,command_id:randomUUID()});assert.equal(response.ok,false);assert.equal(response.error.code,'NO_PHYSICAL_LAYOUT');projectEntry.physical_guards.push({method,code:response.error.code});}
    await save();
  }
  assert.deepEqual(await sourceHashes(),report.source_sha256,'Engine source changed during measured run. Rerun final frozen source.');
  report.completed=true;report.all_directed_criteria_passed=report.runs.length>0&&report.runs.every(r=>r.directed_criteria_passed);
  report.supplemental_execution_verified=report.supplemental_runs.every(r=>r.numerical_execution_passed&&r.load_override_validation?.pass);
  report.summary={runs:report.runs.length,numerical_completed:report.runs.filter(r=>r.numerical_execution_passed).length,directed_passed:report.runs.filter(r=>r.directed_criteria_passed).length,supplemental_runs:report.supplemental_runs.length,supplemental_numerical_completed:report.supplemental_runs.filter(r=>r.numerical_execution_passed).length,supplemental_directed_passed:report.supplemental_runs.filter(r=>r.directed_criteria_passed).length};
  if(!report.all_directed_criteria_passed||!report.supplemental_execution_verified)process.exitCode=1;
}catch(error){report.error=error.message;process.exitCode=1;}
finally{
  report.finished_at=new Date().toISOString();await save();
  await writeFile(path.join(scratch,'latest-lab.json'),JSON.stringify({workspace,report:path.join(destination,'report.json'),projects:report.projects.map(p=>({template_id:p.template_id,project_id:p.project_id})),completed:report.completed,all_directed_criteria_passed:report.all_directed_criteria_passed},null,2)+'\n');
  console.log(JSON.stringify({report:path.join(destination,'report.json'),completed:report.completed,all_directed_criteria_passed:report.all_directed_criteria_passed,summary:report.summary,error:report.error}));
  if(started&&!options['--keep-worker'])await stopWorker(workspace);
}
