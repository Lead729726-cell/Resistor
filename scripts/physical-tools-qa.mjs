// Real public-deck jobs in newly created QA projects; existing designs are read only.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {getProductEdition,prepareEditionWorkspace} from './edition-workspace.mjs';
import {startWorker} from './worker.mjs';
import {workerRpc} from './runtime.mjs';
const edition=getProductEdition(),arg=process.argv.find(v=>v.startsWith('--workspace=')),label=process.argv.find(v=>v.startsWith('--label='))?.slice(8)||edition.edition;
if(!/^[a-z0-9-]+$/.test(label))throw Error('Invalid QA evidence label');
const workspace=arg?path.resolve(arg.slice(12)):await prepareEditionWorkspace({edition});
const resources=path.resolve(process.env.REGISTER_RESOURCES_ROOT||process.cwd()),config=await startWorker(workspace,{resourcesRoot:resources});
const call=async(method,params={})=>{const r=await workerRpc(config,method,params);assert.equal(r.ok,true,JSON.stringify(r.error));return r.result;};
const report={schema_version:1,edition:edition.edition,scope:label==='pilot'?'isolated physical tool pilot':'new QA project in selected edition',checked_at:new Date().toISOString(),student_submission:false,foundry_signoff:false,physical_process_simulation:false,doctor:await call('toolchain.doctor',{refresh:true}),cases:[],completed:false};
await mkdir('docs/evidence/physical-tools',{recursive:true});
try{
 for(const name of ['Magic','Netgen','KLayout','ngspice'])assert(report.doctor.tools.find(t=>t.name===name)?.available,name+' is not actually available');
 assert(report.doctor.pdk.available,'Actual PDK/model/rule resources missing');
 const p=await call('project.create',{example:'inverter',name:'['+edition.name+' QA] physical tools '+label,command_id:randomUUID()});report.project_id=p.id;report.revision=p.revision;
 for(const [kind,method,settings]of [['pre','simulation.run',{analysis:'tran',duration_s:30e-9,step_s:20e-12,post_layout:false}],['drc','verification.run_drc',{}],['lvs','verification.run_lvs',{}],['pex','extraction.run_pex',{}],['post','simulation.run',{analysis:'tran',duration_s:30e-9,step_s:20e-12,post_layout:true}]]){
  let run=await call(method,{project_id:p.id,expected_revision:p.revision,command_id:randomUUID(),...settings});const deadline=Date.now()+180000;
  while(['queued','running'].includes(run.execution_status)){assert(Date.now()<deadline,'Native job deadline exceeded: '+kind);await new Promise(r=>setTimeout(r,250));run=await call('job.status',{run_id:run.id});}
  const entry={kind,run_id:run.id,project_id:run.project_id,revision:run.revision,tool:run.tool,execution_status:run.execution_status,analysis_result:run.analysis_result,freshness:run.freshness,measurements:run.measurements,parasitics:run.parasitics,artifacts:run.artifacts,message:run.message};report.cases.push(entry);console.log(JSON.stringify(entry));
  assert.equal(run.execution_status,'completed',run.message);assert.equal(run.analysis_result,'pass',run.message);
  const manifestFile=run.manifest_path.startsWith('/workspace/')?path.join(workspace,run.manifest_path.slice(11)):run.manifest_path;
  const manifest=JSON.parse(await readFile(manifestFile,'utf8'));entry.manifest={run_id:manifest.run_id,project_id:manifest.project_id,revision:manifest.revision,tool_binaries:manifest.tool_binaries,model_files:manifest.model_files,pdk:manifest.pdk,commands:manifest.commands,artifacts:manifest.artifacts};
 }
 const mapping=await call('extraction.get_net_mapping',{project_id:p.id,run_id:report.cases.find(r=>r.kind==='pex').run_id});report.extracted_elements={resistors:mapping.elements.filter(e=>e.kind==='R').length,capacitors:mapping.elements.filter(e=>e.kind==='C').length,source:mapping.source};
 report.negative_checks=[];
 for(const kind of ['drc','lvs']){
  let bad=await call('project.clone',{project_id:p.id,name:'['+edition.name+' QA] intentional '+kind+' failure',command_id:randomUUID()});
  bad=await call(kind==='drc'?'layout.apply_command':'schematic.apply_command',{project_id:bad.id,expected_revision:bad.revision,command_id:randomUUID(),command:kind==='drc'?{type:'add_box',layer_id:'68/20',box:['10000','0','10005','5']}:{type:'set_pin',id:'mn1',pin:'G',net:'Y'}});
  let run=await call(kind==='drc'?'verification.run_drc':'verification.run_lvs',{project_id:bad.id,expected_revision:bad.revision,command_id:randomUUID()});const deadline=Date.now()+180000;
  while(['queued','running'].includes(run.execution_status)){assert(Date.now()<deadline);await new Promise(r=>setTimeout(r,250));run=await call('job.status',{run_id:run.id});}
  const evidence={kind,project_id:bad.id,revision:bad.revision,run_id:run.id,execution_status:run.execution_status,analysis_result:run.analysis_result,message:run.message};report.negative_checks.push(evidence);console.log(JSON.stringify(evidence));assert.equal(run.execution_status,'completed',run.message);assert.equal(run.analysis_result,'fail','An intentionally invalid layout/circuit must not display PASS');
 }
 const unchanged=await call('project.snapshot',{project_id:p.id});assert.equal(unchanged.revision,p.revision);report.original_qa_design_preserved=true;report.completed=true;
}catch(e){report.error=e.message;throw e;}finally{await writeFile('docs/evidence/physical-tools/'+label+'.json',JSON.stringify(report,null,2)+'\n');}
