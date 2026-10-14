import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:net';
import {randomUUID,createHash} from 'node:crypto';
import {nativeEnvironment,stopNativeWorker} from './native-worker.mjs';
import {startWorker} from './worker.mjs';
import {runtimeConfig,workerRpc} from './runtime.mjs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const root=process.cwd(),base=path.join(root,'.runtime/industry-review');await mkdir(base,{recursive:true});
const workspace=await mkdtemp(path.join(base,'qa-'));
const env=await nativeEnvironment(workspace,{resourcesRoot:root,prepare:false});
const result=await new Promise((resolve,reject)=>{const process=spawn(env.python,['-B','tests/industry-review-test.py'],{cwd:root,env:{...env.environment,...env.extra,RESISTOR_EDITION:'indust',MOS_WORKSPACE:workspace,MOS_RUNTIME_KIND:'native-'+globalThis.process.platform},windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';process.stdout.on('data',b=>{output+=b;globalThis.process.stdout.write(b)});process.stderr.on('data',b=>{output+=b;globalThis.process.stdout.write(b)});process.on('error',reject);process.on('close',code=>resolve({code,output}));});
assert.equal(result.code,0,result.output);
const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
const config=await runtimeConfig(workspace);config.url='http://127.0.0.1:'+port;await writeFile(config.file,JSON.stringify({url:config.url,token:config.token}));
let started=false;
const check=(method,params={})=>workerRpc(config,method,params).then(body=>{assert(body.ok,`${method}: ${body.error?.code}: ${body.error?.message}`);return body.result;});
const evidence={schema_version:1,edition:'indust',product_name:'Resistor Indust',checked_at:new Date().toISOString(),unit_tests:17,docker_used:false,customer_value_verified:false,commercial_execution_verified:false,signoff:false,cases:[]};
try{
 await startWorker(workspace,{resourcesRoot:root,mode:'native',prepare:false});started=true;
 const doctor=await check('toolchain.doctor');evidence.tools=doctor.tools.map(({name,available,version})=>({name,available,version}));
 const source=await check('project.create',{example:'inverter',name:'Public SKY130 inv_1 review QA'});
 const origin=await check('layout.export',{project_id:source.id,format:'gds'});
 let review=await check('review.create',{edition:'indust',project_id:source.id,expected_revision:source.revision,command_id:randomUUID()});
 const identity=()=>({project_id:review.project_id,review_id:review.id,expected_revision:review.revision,expected_review_revision:review.review_revision,command_id:randomUUID()});
 review=await check('review.add_constraint',{...identity(),constraint:{kind:'fixed_region',title:'Preserve complete public inverter footprint',reason:'Source standard cell must remain untouched in review',priority:'must',author:'Public engine QA',target_ids:[],criteria:{box:['-10000','-10000','10000','10000'],layers:['68/20','65/20','66/20']}}});
 let run=await check('simulation.run',{project_id:review.project_id,expected_revision:review.revision,command_id:randomUUID(),analysis:'tran',duration_s:30e-9,step_s:50e-12});
 const until=Date.now()+120000;while(['queued','running'].includes(run.execution_status)&&Date.now()<until){await new Promise(r=>setTimeout(r,150));run=await check('job.status',{run_id:run.id});}
 assert.equal(run.execution_status,'completed',run.message);assert(run.waveforms.length>=2);
 if(process.env.REGISTER_NATIVE_PHYSICAL_QA==='1'){
  assert(doctor.tools.find(t=>t.name==='Magic')?.available&&doctor.tools.find(t=>t.name==='Netgen')?.available);
  evidence.physical_runs=[];
  for(const method of ['verification.run_drc','verification.run_lvs','extraction.run_pex']){
   let physical=await check(method,{project_id:review.project_id,expected_revision:review.revision,command_id:randomUUID()});const deadline=Date.now()+120000;
   while(['queued','running'].includes(physical.execution_status)&&Date.now()<deadline){await new Promise(r=>setTimeout(r,150));physical=await check('job.status',{run_id:physical.id});}
   assert.equal(physical.execution_status,'completed',physical.message);assert.equal(physical.analysis_result,'pass',physical.message);
   evidence.physical_runs.push({id:physical.id,kind:physical.kind,revision:physical.revision,tool:physical.tool,execution_status:physical.execution_status,analysis_result:physical.analysis_result});
  }
 }
 review=await check('review.evaluate',identity());assert.equal(review.latest.results[0].status,'pass');
 assert(review.latest.runs.some(r=>r.id===run.id&&r.manifest_sha256&&r.input_conditions));
 if(evidence.physical_runs)for(const r of evidence.physical_runs)assert(review.latest.runs.some(v=>v.id===r.id&&v.manifest_sha256&&v.input_conditions));
 assert.equal((await check('project.open',{project_id:source.id})).revision,source.revision);
 const report=await check('review.save_report',{...identity(),decision:'accepted_for_review_scope',reason:'Only the declared unchanged mask scope is accepted; not circuit performance or manufacturing.',author:'Public engine QA'});
 const reopen=await check('review.open_report',{project_id:review.project_id,review_id:review.id,report_id:report.report.id});assert.equal(reopen.sha256,report.sha256);assert.deepEqual(reopen.report,report.report);
 const client=new Client({name:'indust-review-native-qa',version:'1.0.0'});
 try{
  await client.connect(new StdioClientTransport({command:process.execPath,args:[path.join(root,'scripts/mcp.mjs')],env:{MOS_WORKSPACE:workspace,RESISTOR_EDITION:'indust'},stderr:'pipe'}));
  const tools=await client.listTools();assert.equal(tools.tools.filter(t=>t.name.startsWith('resistor_indust_review_')).length,7);
  const toolResult=await client.callTool({name:'resistor_indust_review_status',arguments:{edition:'indust',project_id:review.project_id,review_id:review.id}});assert(!toolResult.isError);assert.equal(toolResult.structuredContent.result.context.edition,'indust');assert.equal(toolResult.structuredContent.result.project_id,review.project_id);
  const wrong=await client.callTool({name:'resistor_indust_review_status',arguments:{edition:'edu',project_id:review.project_id,review_id:review.id}});assert.equal(wrong.isError,true);
  const opened=await client.callTool({name:'resistor_indust_review_reopen',arguments:{edition:'indust',project_id:review.project_id,review_id:review.id,report_id:report.report.id}});assert.equal(opened.structuredContent.result.sha256,report.sha256);
  evidence.cases.push({name:'Actual MCP review tools, native project identity, report re-open and foreign edition rejection',pass:true,industry_review_tools:7});
 }finally{await client.close();}
 evidence.cases.push({name:'Native actual public SKY130 simulation, manifest linkage and report re-open',pass:true,source_project_id:source.id,project_id:review.project_id,review_id:review.id,run_id:run.id,report_id:report.report.id,report_sha256:report.sha256,source_gds:origin.roundtrip});
 await stopNativeWorker(workspace);started=false;await startWorker(workspace,{resourcesRoot:root,mode:'native',prepare:false});started=true;
 const resumed=await check('review.status',{project_id:review.project_id,review_id:review.id});assert.equal(resumed.latest.freshness,'current');assert.equal(resumed.reports[0].sha256,report.sha256);
 const scene=(await check('review.scene',{project_id:review.project_id,review_id:review.id})).scene;
 // Add an explicit new user mask in the protected region. No auto-fix is used.
 const candidate=await check('layout.apply_command',{project_id:review.project_id,expected_revision:resumed.revision,command_id:randomUUID(),command:{type:'add_box',layer_id:'68/20',box:['5000','5000','6000','6000']}});
 const stale=await check('review.status',{project_id:review.project_id,review_id:review.id});assert.equal(stale.latest.freshness,'stale');
 const refreshed=await check('review.evaluate',{...identity(),expected_revision:candidate.revision,expected_review_revision:stale.review_revision});assert.equal(refreshed.latest.results[0].status,'fail');assert.equal(refreshed.latest.comparison.geometry_equal,false);
 const historical=await check('review.open_report',{project_id:review.project_id,review_id:review.id,report_id:report.report.id});assert.equal(historical.freshness,'stale');assert.equal(historical.sha256,report.sha256);
 evidence.cases.push({name:'Restart persistence, changed mask failure and immutable historical report',pass:true,candidate_revision:candidate.revision,original_expanded_shapes:scene.shapes.length,historical_report_freshness:historical.freshness,post_change_constraint_status:refreshed.latest.results[0].status});
 evidence.source_sha256=Object.fromEntries(await Promise.all(['workers/eda/layout_review.py','workers/eda/server.py','packages/ui/src/IndustryReview.tsx','scripts/mcp.mjs','tests/industry-review-test.py'].map(async file=>[file,createHash('sha256').update(await readFile(path.join(root,file))).digest('hex')])));
 const folder=path.join(root,'docs/evidence/industry-review');await mkdir(folder,{recursive:true});await writeFile(path.join(folder,'native-verification.json'),JSON.stringify(evidence,null,2)+'\n');await writeFile(path.join(base,'latest.json'),JSON.stringify({workspace,project_id:review.project_id,review_id:review.id,source_project_id:source.id,report_id:report.report.id})+'\n');
 console.log('PASS native review, simulation provenance, restart, stale detection and report persistence');
}finally{if(started)await stopNativeWorker(workspace);}
