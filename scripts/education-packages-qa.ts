// Actual owned QA projects and public ideal fixtures only; no student submissions.
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID,createHash} from 'node:crypto';
import {assignments,catalogVersion} from '../packages/education/src/assignment-catalog';
import {circuitFixtures} from '../packages/education/src/circuit-fixtures';
import {launchAssignment} from '../packages/ui/src/assignment-launch';
import {captureAssignmentEvidence,newAssignmentRecord,parseAssignmentRecord} from '../packages/education/src/assignment-record';
import type {Doctor,Project,Run} from '../packages/contracts/src';
import {getProductEdition,prepareEditionWorkspace} from './edition-workspace.mjs';
import {runtimeConfig,workerRpc} from './runtime.mjs';
import {nativeSettings} from './native-worker.mjs';
const exec=promisify(execFile),edition=getProductEdition();assert.equal(edition.edition,'edu');
const workspace=await prepareEditionWorkspace({edition}),config=await runtimeConfig(workspace),settings=await nativeSettings(workspace);
const call=async<T>(method:string,params:Record<string,unknown>={}):Promise<T>=>{const r=await workerRpc(config,method,{...params,...(params.name?{name:'[QA, not student] '+params.name}:{})});assert.equal(r.ok,true,method+': '+JSON.stringify(r.error));return r.result;};
const directory=path.resolve('docs/evidence/edu-packages'),fixtureDir=path.resolve('.runtime/edu-package-fixtures');await mkdir(directory,{recursive:true});await mkdir(fixtureDir,{recursive:true});
const doctor=await call<Doctor>('toolchain.doctor'),catalog=await call<{templates:{id:string;parameter_defaults:Record<string,number>}[]}>('design.catalog');
const report:any={schema_version:1,edition:'edu',catalog_version:catalogVersion,checked_at:new Date().toISOString(),purpose:'qa',student_submission:false,education_effect_proven:false,foundry_signoff:false,toolchain:doctor.tools.map(({name,available,version})=>({name,available,version})),public_process:{id:doctor.pdk.id,version:doctor.pdk.version},catalog_templates:catalog.templates.length,fixtures:[],created:[],actual_runs:[],checks:{},source_sha256:{}};
for(const a of assignments)if(a.launch.kind==='template'){const t=catalog.templates.find(t=>t.id===a.launch.id);assert(t,'Unsupported template '+a.id);for(const k of Object.keys(a.launch.parameters??{}))assert(k in t.parameter_defaults,'Unsupported parameter '+a.id+'/'+k);}
report.checks.all_template_bindings_verified=true;
for(const f of circuitFixtures){
 const file=path.join(fixtureDir,f.id+'.cir');await writeFile(file,f.deck);
 let result;
 if(process.platform==='win32'){
  assert.equal(settings.mode,'wsl');assert(settings.wsl_distribution&&!settings.wsl_distribution.startsWith('docker-desktop'));
  const prefix=['--distribution',settings.wsl_distribution,'--exec'];
  const converted=(await exec('wsl.exe',[...prefix,'wslpath','-a','-u',file],{windowsHide:true,timeout:10000})).stdout.trim();
  result=await exec('wsl.exe',[...prefix,'ngspice','-b',converted],{windowsHide:true,timeout:30000,maxBuffer:2*1024*1024});
 }else result=await exec('ngspice',['-b',file],{timeout:30000,maxBuffer:2*1024*1024});
 const output=result.stdout+'\n'+result.stderr;
 const checks=f.checks.map(check=>{const pattern=check.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const match=output.match(new RegExp(pattern+'\\s*=\\s*([-+0-9.eE]+)','i'));assert(match,f.id+' missing '+check.name);const actual=Number(match[1]);assert(Number.isFinite(actual));assert(Math.abs(actual-check.expected)<=Math.abs(check.expected)*check.relative_tolerance,f.id+' known-value mismatch '+actual);return {...check,actual};});
 report.fixtures.push({id:f.id,tool:'actual_ngspice',execution_status:'completed',scope:f.scope,deck_sha256:createHash('sha256').update(f.deck).digest('hex'),checks,output_sha256:createHash('sha256').update(output).digest('hex')});
 await writeFile(path.join(directory,f.id+'.log'),output);
 console.log('Actual fixture: '+f.id);
}
const created=new Map<string,Project>();
const prior=await call<Project[]>('project.list',{});
for(const a of assignments){
 if(['calculator','fixture','study'].includes(a.launch.kind))continue;
 const signature=JSON.stringify(a.launch);if(created.has(signature))continue;
 let existing=prior.find(p=>p.name==='[QA, not student] [Edu 과제] '+a.title);
 let previous=existing?await call<Project>('project.snapshot',{project_id:existing.id}):undefined;
 if(previous&&a.launch.kind==='circuit'){const fixture=circuitFixtures.find(f=>a.launch.kind==='circuit'&&f.id===a.launch.id)!;if(fixture.devices.some(d=>JSON.stringify(previous!.schematic.devices.find(v=>v.id===d.id)?.parameters)!==JSON.stringify(d.parameters))){existing=undefined;previous=undefined;}}
 const p=previous??await launchAssignment(a,call,randomUUID());created.set(signature,p);
 if(!existing)assert(p.runs.every(r=>r.execution_status!=='completed'),'Generation is not verification');
 const snapshot=await call<Project>('project.snapshot',{project_id:p.id});assert.equal(snapshot.revision,p.revision);
 report.created.push({assignment_id:a.id,launch:a.launch,project_id:p.id,revision:p.revision,devices:snapshot.schematic.devices.length,actual_run_count:p.runs.length,layout_policy:p.layout_parameter_policy,reused_owned_qa_project:!!existing});
 if(report.created.length%5===0)console.log('Actual starters created: '+report.created.length);
}
const selected=['circuit-divider','circuit-loaded-divider','circuit-parallel','circuit-series','circuit-thevenin','circuit-rc-charge','mos-common-source','mos-current-mirror','digital-nand','digital-full-adder','analog-ota','analog-ldo'];
for(const id of selected){
 const a=assignments.find(a=>a.id===id)!,p=created.get(JSON.stringify(a.launch))!;
 let run=await call<Run>('simulation.run',{project_id:p.id,expected_revision:p.revision,command_id:randomUUID(),...p.testbench,post_layout:false});
 const deadline=Date.now()+120000;
 while(['queued','running'].includes(run.execution_status)){assert(Date.now()<deadline,'Actual run timeout '+id);await new Promise(r=>setTimeout(r,250));run=await call('job.status',{run_id:run.id});}
 assert.equal(run.execution_status,'completed',id+': '+run.message);
 if(a.launch.kind==='circuit'){
  assert.equal(run.analysis_result,'unknown','Numeric OP has no functional PASS criteria');
  const f=circuitFixtures.find(f=>a.launch.kind==='circuit'&&f.id===a.launch.id)!;
  const check=f.checks.find(c=>c.name.startsWith('v('))!,net=check.name.slice(2,-1).toUpperCase();
  const v=run.current_flow?.node_voltages?.find(v=>v.net.toUpperCase()===net||v.net.toUpperCase()==='XU.'+net)?.values_V[0];assert(v!==undefined,id+' actual node voltage absent');assert(Math.abs(v-check.expected)<1e-6,id+' actual UI project mismatch');
 }
 report.actual_runs.push({assignment_id:id,project_id:p.id,revision:p.revision,run_id:run.id,execution_status:run.execution_status,analysis_result:run.analysis_result,tool:run.tool,freshness:run.freshness,measurements:run.measurements,reference_verification:run.reference_verification,current_flow_nodes:run.current_flow?.node_voltages?.map(v=>({net:v.net,first_V:v.values_V[0]}))});
 console.log('Actual app project run: '+id+' · '+run.analysis_result);
}
// The basic before/after example is compared by the actual solver, not a guide answer.
const divider=created.get(JSON.stringify(assignments.find(a=>a.id==='circuit-divider')!.launch))!;
const changed=await call<Project>('schematic.apply_command',{project_id:divider.id,expected_revision:divider.revision,command_id:randomUUID(),command:{type:'update_device',id:'r2',parameters:{value:5000}}});
let after=await call<Run>('simulation.run',{project_id:changed.id,expected_revision:changed.revision,command_id:randomUUID(),analysis:'op',post_layout:false});
const deadline=Date.now()+60000;while(['queued','running'].includes(after.execution_status)){assert(Date.now()<deadline);await new Promise(r=>setTimeout(r,200));after=await call('job.status',{run_id:after.id});}
assert.equal(after.execution_status,'completed');assert(Math.abs(after.current_flow!.node_voltages!.find(v=>v.net==='OUT'||v.net==='XU.OUT')!.values_V[0]-.6)<1e-6);
const record=newAssignmentRecord('circuit-divider',randomUUID(),new Date().toISOString(),'qa');record.student.explanation='[QA fixture, not a student submission] Actual OP before 0.9V and after 0.6V; R2 10k to 5k.';record.evidence=captureAssignmentEvidence(changed,[after],doctor,new Date().toISOString());record.saved_at=new Date().toISOString();await writeFile(path.join(directory,'qa-student-record.json'),JSON.stringify(record,null,2)+'\n');
const reopened=parseAssignmentRecord(await readFile(path.join(directory,'qa-student-record.json'),'utf8'));assert.equal(reopened.student.explanation,record.student.explanation);assert.equal(reopened.evidence!.data_revision,changed.revision);assert.equal(reopened.grade,null);
const projectRuns=await call<{runs:Run[]}>('project.snapshot',{project_id:divider.id});assert(projectRuns.runs.some(r=>r.revision===divider.revision&&r.freshness==='stale'));
const conflict=await workerRpc(config,'schematic.apply_command',{project_id:divider.id,expected_revision:divider.revision,command_id:randomUUID(),command:{type:'update_device',id:'r2',parameters:{value:7000}}});assert.equal(conflict.error.code,'REVISION_CONFLICT');
report.actual_runs.push({assignment_id:'circuit-divider-after',project_id:changed.id,revision:changed.revision,run_id:after.id,execution_status:after.execution_status,analysis_result:after.analysis_result,tool:after.tool});
Object.assign(report.checks,{actual_fixtures:8,distinct_starters_created:report.created.length,actual_app_runs:report.actual_runs.length,revision_conflict_rejected:true,historical_run_preserved:true,student_record_roundtrip:true,auto_grade:false});
for(const file of ['packages/education/src/assignment-catalog.ts','packages/education/src/circuit-fixtures.ts','packages/education/src/course-package.ts','packages/education/src/assignment-record.ts','packages/ui/src/assignment-launch.ts','packages/ui/src/AssignmentLibrary.tsx'])report.source_sha256[file]=createHash('sha256').update(await readFile(file)).digest('hex');
await writeFile(path.join(directory,'native.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({edition:'edu',...report.checks,education_effect_proven:false,foundry_signoff:false},null,2));
