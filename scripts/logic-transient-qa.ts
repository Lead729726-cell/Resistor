// Native numerical evidence only; no students, fabricated waves or provider calls.
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdir,writeFile,readFile,cp} from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
import type {Project,Run,TimingRecipe,Device} from '../packages/contracts/src/index';
import {checkDynamicTiming} from '../packages/analysis/src/dynamic-timing';
import {runtimeConfig,workerRpc} from './runtime.mjs';
import {startWorker} from './worker.mjs';
import {getProductEdition} from './edition-workspace.mjs';
import {configureEngine} from './engine-settings.mjs';
const edition=getProductEdition(),workspace=process.env.MOS_WORKSPACE||path.resolve('.runtime/logic-qa/workspace');
const args=process.argv.slice(2);assert(args.length<=1&&args.every(a=>a.startsWith('--wsl=')),'Use only --wsl=<installed distribution>.');
if(!process.env.MOS_WORKSPACE){
 await mkdir(path.join(workspace,'.runtime'),{recursive:true});const marker=path.join(workspace,'.runtime/product-context.json');
 try{assert.equal(JSON.parse(await readFile(marker,'utf8')).product_id,edition.id,'QA workspace belongs to another edition.');}catch(e:any){if(e.code!=='ENOENT')throw e;}
 await writeFile(marker,JSON.stringify({schema_version:1,product_id:edition.id,edition:edition.edition,workspace}));
 for(const dir of ['adapters','examples/sky130','platform/commercial'])await cp(path.resolve(dir),path.join(workspace,dir),{recursive:true,force:false,filter:f=>!f.split(/[\\/]/).some(p=>['.runtime','.secrets','__pycache__'].includes(p))&&!path.basename(f).startsWith('.env')&&!/\.(pem|key|p12|pfx|sqlite3?)$/i.test(f)});
 try{await writeFile(path.join(workspace,'.runtime/worker.json'),JSON.stringify({url:'http://127.0.0.1:18985',token:randomBytes(32).toString('hex')}),{flag:'wx',mode:0o600});}catch(e:any){if(e.code!=='EEXIST')throw e;}
}
if(args[0])await configureEngine(workspace,{mode:'wsl',distribution:args[0].slice(6)});
const config=await runtimeConfig(workspace);
await startWorker(workspace,{resourcesRoot:process.cwd()});
const call=async<T>(method:string,params:Record<string,unknown>={}):Promise<T>=>{const r=await workerRpc(config,method,params);assert.equal(r.ok,true,JSON.stringify(r.error));return r.result;};
const evidence:any={schema_version:1,edition:getProductEdition().edition,checked_at:new Date().toISOString(),purpose:'qa',not_student_submission:true,physical_signoff:false,actual_runs:[],checks:{},source_sha256:{}};
const doctor=await call<any>('toolchain.doctor');assert(doctor.tools.some((t:any)=>t.name==='ngspice'&&t.available),'Actual ngspice is required.');
evidence.tools=doctor.tools.map(({name,version,available}:any)=>({name,version,available}));evidence.pdk={id:doctor.pdk.id,version:doctor.pdk.version};
let p:Project;
const edit=async(command:Record<string,unknown>)=>{await call('schematic.apply_command',{project_id:p.id,expected_revision:p.revision,command});p=await call<Project>('project.open',{project_id:p.id});};
async function execute(label:string,expected='pass'){
 const revision=p.revision,original=JSON.stringify(p.schematic);
 let r=await call<Run>('simulation.run',{project_id:p.id,analysis:'tran',netlister:'native',post_layout:false});const deadline=Date.now()+90000;
 while(['queued','running'].includes(r.execution_status)){assert(Date.now()<deadline);await new Promise(resolve=>setTimeout(resolve,150));r=await call<Run>('job.status',{run_id:r.id});}
 assert.equal(r.execution_status,'completed',JSON.stringify(r));assert.equal(r.analysis_result,'unknown');assert(r.timing_recipe);assert(r.source_stimuli?.some(s=>s.stimulus));
 const report=checkDynamicTiming(r,r.timing_recipe,revision);assert.equal(report.status,expected,JSON.stringify(report));
 assert.equal(JSON.stringify((await call<Project>('project.open',{project_id:p.id})).schematic),original);
 const hash=createHash('sha256').update(JSON.stringify(r.waveforms)).digest('hex');
 evidence.actual_runs.push({label,project_id:p.id,revision,run_id:r.id,tool:r.tool,execution_status:r.execution_status,engine_analysis_result:r.analysis_result,source_stimuli:r.source_stimuli,samples:r.waveforms?.[0].x.length,waveforms_sha256:hash,timing:report});
 console.log(JSON.stringify({label,status:report.status,summary:report.summary}));return {run:r,report};
}
for(const kind of ['nand-chain','half-adder','mux-chain']){
 p=await call<Project>('project.create',{example:'schematic',name:'[Transient QA] '+kind});await edit({type:'initialize_logic_demo',kind});await edit({type:'configure_logic_transient'});
 const before=await execute(kind),recipe={...p.schematic.timing_check!};assert(before.report.rows.length>=8);
 if(kind==='nand-chain'){
  await edit({type:'set_timing_check',recipe:{...recipe,max_delay_s:1e-12}});await execute('intentional-1ps-limit','fail');
  assert.equal(checkDynamicTiming(before.run,before.run.timing_recipe!,p.revision).status,'stale');
  await edit({type:'set_timing_check',recipe});await edit({type:'update_device',id:'load_y',parameters:{value:50e-15}});const loaded=await execute('50fF-load-1ns-rise-limit','fail');
  await edit({type:'set_timing_check',recipe:{...recipe,max_rise_s:1.5e-9}});await execute('50fF-explicit-1.5ns-rise-limit');
  assert(loaded.report.summary.rise_s!>before.report.summary.rise_s!);assert(loaded.report.summary.fall_s!>before.report.summary.fall_s!);
  await edit({type:'update_testbench',settings:{step_s:2.5e-12}});const fine=await execute('50fF-half-maxstep');
  assert(Math.abs(fine.report.summary.tpLH_s!-loaded.report.summary.tpLH_s!)<10e-12);assert(Math.abs(fine.report.summary.tpHL_s!-loaded.report.summary.tpHL_s!)<10e-12);
  await edit({type:'set_source',id:'source_a',dc:0,stimulus:{kind:'pwl',points:[[0,0],[2e-9,0],[2.1e-9,1.8],[7e-9,1.8],[7.1e-9,0],[12e-9,0],[12.1e-9,1.8],[17e-9,1.8],[17.1e-9,0],[30e-9,0]]}});await execute('nonrepeating-PWL');
  await edit({type:'set_timing_check',recipe:{...recipe,max_rise_s:1.5e-9,minimum_cycles:3}});await execute('PWL-insufficient-cycle-coverage','unavailable');
  await edit({type:'update_testbench',settings:{step_s:100e-12}});
  let failed=await call<Run>('simulation.run',{project_id:p.id,analysis:'tran',netlister:'native'});const until=Date.now()+30000;
  while(['running','queued'].includes(failed.execution_status)){assert(Date.now()<until);await new Promise(resolve=>setTimeout(resolve,150));failed=await call<Run>('job.status',{run_id:failed.id});}
  assert.equal(failed.execution_status,'failed');assert(failed.message?.includes('time step'));evidence.checks.undersampled_source_rejected=true;
 }
 await call('project.save',{project_id:p.id});const reopened=await call<Project>('project.open',{project_id:p.id});assert.equal(JSON.stringify(reopened.schematic),JSON.stringify(p.schematic));assert(reopened.runs.some(r=>r.timing_recipe));
}
// Independent analytic RC known value, including the finite input ramp correction.
p=await call<Project>('project.create',{example:'schematic',name:'[Transient QA] analytic RC delay'});
const devices:Device[]=[{id:'vin',name:'VIN',kind:'voltage',pins:{'+':'A','-':'0'},parameters:{dc:0},stimulus:{kind:'pulse',low:0,high:1.8,delay_s:2e-9,rise_s:100e-12,fall_s:100e-12,width_s:4.9e-9,period_s:10e-9},x:100,y:100},{id:'r',name:'R1',kind:'resistor',pins:{'+':'A','-':'Y'},parameters:{value:1000},x:300,y:100},{id:'c',name:'C1',kind:'capacitor',pins:{'+':'Y','-':'0'},parameters:{value:1e-12},x:500,y:100},{id:'port',name:'PORT_Y',kind:'port',pins:{P:'Y'},parameters:{},x:700,y:100}];
for(const device of devices)await edit({type:'add_device',device});
const rcRecipe:TimingRecipe={schema_version:1,input:'A',output:'Y',polarity:'same',low_V:0,high_V:1.8,start_s:0,end_s:41e-9,settle_s:3e-9,max_delay_s:1e-9,max_rise_s:3e-9,max_fall_s:3e-9,minimum_cycles:2};
await edit({type:'update_testbench',settings:{analysis:'tran',step_s:5e-12,duration_s:41e-9}});await edit({type:'set_timing_check',recipe:rcRecipe});const rc=await execute('analytic-RC');
const tau=1000*1e-12,ramp=100e-12,delay=tau*Math.log(2*tau/ramp*Math.expm1(ramp/tau))-ramp/2;
assert(Math.abs(rc.report.rows[0].delay_s!-delay)<10e-12);assert(Math.abs(rc.report.rows[0].rise_s!-tau*Math.log(9))<10e-12);
evidence.analytic_rc={R_ohm:1000,C_F:1e-12,tau_s:tau,finite_ramp_s:ramp,expected_first_50percent_delay_s:delay,actual_delay_s:rc.report.rows[0].delay_s,expected_rise_s:tau*Math.log(9),actual_rise_s:rc.report.rows[0].rise_s,tolerance_s:10e-12};
evidence.checks={...evidence.checks,actual_pulse_and_pwl:true,three_logic_compositions:true,explicit_limit_failure:true,missing_coverage_unavailable:true,source_and_criteria_save_reopen:true,stale_previous_revision:true,load_change_changes_actual_slew:true,half_maxstep_convergence:true,analytic_rc_known_value:true,original_schematic_preserved:true};
for(const f of ['workers/eda/source_stimulus.py','workers/eda/native.py','workers/eda/custom_circuit.py','workers/eda/logic_composition.py','workers/eda/server.py','packages/analysis/src/dynamic-timing.ts'])evidence.source_sha256[f]=createHash('sha256').update(await readFile(f)).digest('hex');
await mkdir('docs/evidence/logic-transient',{recursive:true});await writeFile('docs/evidence/logic-transient/native.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({actual_runs:evidence.actual_runs.length,checks:evidence.checks}));
