// Actual public-engine jobs in an isolated workspace; never certify a foundry.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,copyFile} from 'node:fs/promises';
import {createHash,randomUUID,randomBytes} from 'node:crypto';
import net from 'node:net';
import path from 'node:path';
import {runtimeConfig,workerRpc} from './runtime.mjs';
import {configureEngine} from './engine-settings.mjs';
import {startWorker,stopWorker} from './worker.mjs';
const root=process.cwd(),out=path.join(root,'docs/evidence/industry-qualification');
await mkdir(out,{recursive:true});await mkdir('.runtime/industry-qualification',{recursive:true});
const workspace=await mkdtemp(path.join(root,'.runtime/industry-qualification/qa-'));
await writeFile(path.join(workspace,'product-edition.json'),JSON.stringify({schema_version:1,edition:'indust'}));
const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
await mkdir(path.join(workspace,'.runtime'));await writeFile(path.join(workspace,'.runtime/worker.json'),JSON.stringify({url:'http://127.0.0.1:'+port,token:randomBytes(32).toString('hex')}),{mode:0o600});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const report={schema_version:1,edition:'indust',product_id:'resistor.indust',checked_at:new Date().toISOString(),workspace,public_fixture:true,paid_calls:0,foundry_signoff:false,customer_value_verified:false,commercial_execution_verified:false,runs:[],checks:[]};
const plan={schema_version:1,scope:'Public physical SKY130 Miller OTA unity follower, 1pF load, 0.9V external bias; finite local mismatch, not device-pair matching or yield',
  conditions:[{corner:'tt',temperature_C:27,supply_V:1.8},{corner:'ff',temperature_C:-40,supply_V:1.8},{corner:'ss',temperature_C:125,supply_V:1.6}],
  samples_per_run:32,seed:729726,offset_limit_V:.01,post_layout:'Actual Magic typical-RC extraction for each post solve',
  gates:['actual DRC/LVS/PEX','finite sample offset <=10mV for every listed condition/stage','same-seed pre-layout replay','foreign project, missing PVT, insufficient samples, strict failing threshold, stale and checksum corruption rejected'],
  customer_value:'not_measured',manufacturing_signoff:'unavailable: no foundry-approved process/deck/acceptance',commercial:'unavailable: user confirmed no licensed environment'};
await writeFile(path.join(out,'plan.json'),JSON.stringify(plan,null,2)+'\n');report.plan_sha256=sha(await readFile(path.join(out,'plan.json')));
let started=false,config;
const rpc=async(method,params={})=>{const response=await workerRpc(config,method,params);assert.equal(response.ok,true,JSON.stringify(response.error));return response.result;};
const local=file=>{
 if(file.startsWith('/mnt/')&&/^\/mnt\/[a-z]\//.test(file))return file[5].toUpperCase()+':/'+file.slice(7);
 if(file.startsWith('/workspace/'))return path.join(workspace,file.slice(11));
 return file;
};
const check=(name,ok,detail={})=>{report.checks.push({name,pass:ok,...detail});assert(ok,name);};
async function run(name,method,p,settings={}){
 let result=await rpc(method,{project_id:p.id,expected_revision:p.revision,command_id:randomUUID(),...settings});const deadline=Date.now()+360000;
 while(['queued','running'].includes(result.execution_status)){assert(Date.now()<deadline,'Native deadline: '+name);await new Promise(resolve=>setTimeout(resolve,350));result=await rpc('job.status',{run_id:result.id});}
 const folder=path.join(out,'runs',name);await mkdir(folder,{recursive:true});
 const manifest=await readFile(local(result.manifest_path));await writeFile(path.join(folder,'manifest.json'),manifest);
 const record={name,id:result.id,project_id:result.project_id,revision:result.revision,execution_status:result.execution_status,analysis_result:result.analysis_result,freshness:result.freshness,tool:result.tool,measurements:result.measurements,parasitics:result.parasitics,message:result.message,manifest_sha256:sha(manifest),manifest:'runs/'+name+'/manifest.json'};
 await writeFile(path.join(folder,'run.json'),JSON.stringify(result,null,2)+'\n');
 if(result.artifacts.characterization){const raw=await readFile(local(result.artifacts.characterization));await writeFile(path.join(folder,'characterization.json'),raw);record.characterization_sha256=sha(raw);record.characterization=JSON.parse(raw);}
 if(result.artifacts.stdout)await copyFile(local(result.artifacts.stdout),path.join(folder,'stdout.log'));
 report.runs.push(record);console.log(JSON.stringify({name,id:result.id,status:result.execution_status,result:result.analysis_result,metrics:record.characterization?.metrics,message:result.execution_status==='failed'?result.message:undefined}));
 check(name+' completed actual native solve',result.execution_status==='completed'&&result.freshness==='current');return record;
}
try{
 // Registered site profiles are re-probed, but never run without a licensed site.
 const current=await runtimeConfig(root),profiles=(await workerRpc(current,'backend.list_profiles',{})).result;
 const latest=new Map();for(const p of profiles)latest.set(p.tool_id+'/'+p.runner,p);
 report.commercial={checked_at:new Date().toISOString(),registered_profile_count:profiles.length,profiles:[]};
 for(const p of latest.values()){
  const result=await workerRpc(current,'backend.validate',{profile_id:p.id});assert(result.ok);
  report.commercial.profiles.push({id:p.id,tool_id:p.tool_id,runner:p.runner,valid:result.result.valid,checked_at:result.result.checked_at,checks:result.result.checks});
 }
 report.commercial.status='unavailable';report.commercial.reason='No licensed commercial environment supplied; ngspice calibration is open source.';
 report.commercial.commercial_ready_profiles=report.commercial.profiles.filter(p=>p.tool_id!=='ngspice'&&p.valid).length;
 await configureEngine(workspace,{mode:process.platform==='win32'?'wsl':'native',...(process.platform==='win32'?{distribution:'ResistorEDA'}:{})});
 config=await startWorker(workspace,{resourcesRoot:root});started=true;report.doctor=await rpc('toolchain.doctor',{refresh:true});
 for(const name of ['Magic','Netgen','KLayout','ngspice'])check(name+' available',report.doctor.tools.find(t=>t.name===name)?.available===true);
 const template=(await rpc('design.catalog')).templates.find(t=>t.id==='soc_miller_ota');
 const source=await rpc('design.create_template',{template_id:template.id,name:'Indust qualification · public OTA',physical_core:true,parameters:template.parameter_defaults,command_id:randomUUID()});
 const sourceExport=await rpc('layout.export',{project_id:source.id,format:'gds'});const sourceHash=sha(await readFile(local(sourceExport.path)));
 let review=await rpc('review.create',{project_id:source.id,expected_revision:source.revision,command_id:randomUUID()});const p=review.working_project;
 report.source_project_id=source.id;report.project_id=p.id;report.revision=p.revision;report.review_id=review.id;
 const params=()=>({project_id:p.id,review_id:review.id,expected_revision:p.revision,expected_review_revision:review.review_revision,command_id:randomUUID()});
 for(const [name,method]of [['drc','verification.run_drc'],['lvs','verification.run_lvs'],['pex','extraction.run_pex']]){
  const result=await run(name,method,p);check(name+' public-deck criterion',result.analysis_result==='pass');
 }
 const mismatch=[];
 for(const condition of plan.conditions)for(const post_layout of [false,true]){
  const name=condition.corner+'-'+(post_layout?'post':'pre');
  mismatch.push(await run(name,'simulation.run',p,{analysis:'op',...condition,post_layout,characterization:{mode:'mismatch',samples:32,seed:plan.seed,offset_limit_V:plan.offset_limit_V}}));
 }
 const replay=await run('tt-pre-replay','simulation.run',p,{analysis:'op',...plan.conditions[0],post_layout:false,characterization:{mode:'mismatch',samples:32,seed:plan.seed,offset_limit_V:plan.offset_limit_V}});
 const initial=mismatch[0].characterization.rows;
 check('same seed actual pre-layout replay',initial.every((r,i)=>r.offset_V===replay.characterization.rows[i].offset_V&&r.supply_current_A===replay.characterization.rows[i].supply_current_A));
 const criteria={assessment:'ota_follower_offset',run_ids:mismatch.map(r=>r.id),offset_limit_V:plan.offset_limit_V,minimum_samples:32,seed:plan.seed,conditions:plan.conditions,require_pre_and_post:true};
 const constraint=value=>({kind:'matching',title:'OTA finite offset · explicit 3 PVT × pre/post',reason:'Predeclared public-model 10mV demonstration criterion; no calibrated yield or pair-device claim.',author:'Public engine qualification',priority:'must',target_ids:[],criteria:value});
 review=await rpc('review.add_constraint',{...params(),constraint:constraint(criteria)});const id=review.constraints.at(-1).id;
 review=await rpc('review.evaluate',params());const main=review.latest.results.at(-1);
 report.electrical_matching={status:main.status,scope:plan.scope,metrics:main.metrics,device_pair_matching_verified:false,yield_verified:false};
 check('actual public OTA offset evaluator ran',main.electrical_assessment==='evaluated'&&['pass','fail'].includes(main.status));
 const saved=await rpc('review.save_report',{...params(),decision:main.status==='pass'?'accepted_for_review_scope':'needs_changes',author:'Public qualification',reason:'Only listed native finite OTA offset conditions and public physical rule checks; no manufacturing/customer acceptance.'});
 review=await rpc('review.status',{project_id:p.id,review_id:review.id});report.report_id=saved.report.id;report.report_sha256=saved.sha256;
 await writeFile(path.join(out,'layout-review.json'),JSON.stringify(saved,null,2)+'\n');
 const evaluate=async value=>{review=await rpc('review.update_constraint',{...params(),constraint_id:id,constraint:constraint(value)});review=await rpc('review.evaluate',params());return review.latest.results.at(-1);};
 check('stricter 1uV offset criterion fails',(await evaluate({...criteria,offset_limit_V:1e-6})).status==='fail');
 check('missing post/PVT evidence never passes',(await evaluate({...criteria,run_ids:[mismatch[0].id]})).status==='not_run');
 check('insufficient declared sample count never passes',(await evaluate({...criteria,minimum_samples:64})).status==='not_run');
 const foreign=await run('foreign-project-tt','simulation.run',source,{analysis:'op',...plan.conditions[0],characterization:{mode:'mismatch',samples:4,seed:plan.seed,offset_limit_V:plan.offset_limit_V}});
 check('another project cannot supply matching evidence',(await evaluate({...criteria,run_ids:[foreign.id]})).status==='not_run');
 await evaluate(criteria);
 const rawFile=local(mismatch[0].characterization?JSON.parse(await readFile(path.join(out,'runs/tt-pre/run.json'),'utf8')).artifacts.characterization:'');
 const bytes=await readFile(rawFile);
 try{
  const corrupt=JSON.parse(bytes);corrupt.metrics.offset_abs_max_V=0;await writeFile(rawFile,JSON.stringify(corrupt));
  review=await rpc('review.status',{project_id:p.id,review_id:review.id});check('tampered evidence invalidates current review',review.latest.freshness==='stale');
  review=await rpc('review.evaluate',params());check('tampered native metrics cannot become PASS',review.latest.results.at(-1).status==='error');
 }finally{await writeFile(rawFile,bytes);}
 review=await rpc('review.evaluate',params());
 const edited=await rpc('layout.apply_command',{project_id:p.id,expected_revision:p.revision,command_id:randomUUID(),command:{type:'add_box',layer_id:'68/20',box:['0','0','5','5']}});
 review=await rpc('review.status',{project_id:p.id,review_id:review.id});check('layout revision invalidates past matching review',review.latest.freshness==='stale');
 review=await rpc('review.evaluate',{...params(),expected_revision:edited.revision});check('old simulation cannot evaluate new layout',review.latest.results.at(-1).status==='not_run');
 const historical=await rpc('review.open_report',{project_id:p.id,review_id:review.id,report_id:saved.report.id});check('immutable historical report retained stale',historical.sha256===saved.sha256&&historical.freshness==='stale');
 check('source circuit/layout preserved',(await rpc('project.snapshot',{project_id:source.id})).revision===source.revision&&sha(await readFile(local(sourceExport.path)))===sourceHash);
 report.customer_value={status:'not_measured',baseline:'KLayout direct Python extension included',protocol:'customer-study.json',participants:0};
 report.manufacturing={status:'unavailable',public_drc_lvs_pex:report.runs.slice(0,3).every(r=>r.analysis_result==='pass'),gaps:['named foundry/process and approved deck/tool versions','complete signoff corner/RC/mismatch requirements','antenna/density/fill and final post-fill DRC/LVS/PEX','EM/IR/ESD/latch-up/reliability where required','package/IO/top-level integration','qualified reviewer, waivers and foundry acceptance receipt'],approved:false};
 report.completed=true;
}catch(error){report.completed=false;report.error=error.message;process.exitCode=1;}
finally{
 report.source_sha256=Object.fromEntries(await Promise.all(['workers/eda/layout_review.py','workers/eda/electrical_review.py','workers/eda/characterization.py','scripts/industry-qualification.mjs'].map(async file=>[file,sha(await readFile(file))])));
 await writeFile(path.join(out,'verification.json'),JSON.stringify(report,null,2)+'\n');
 await writeFile('.runtime/industry-qualification/latest.json',JSON.stringify({workspace,project_id:report.project_id,review_id:report.review_id,report_id:report.report_id})+'\n');
 if(started)await stopWorker(workspace);
 console.log(JSON.stringify({completed:report.completed,checks:report.checks.length,electrical:report.electrical_matching?.status,error:report.error}));
}
