import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {plan,execute,get,history,validateProposal,workflowRpc} from '../scripts/assistant-workflow.mjs';
import {collectEvidence,assistantRpc,status} from '../scripts/design-assistant.mjs';

const id='b'.repeat(32);
const decision={verdict:'proceed',summary:'R1 값 변경 가능',rationale:'요청한 값과 실제 R1이 있습니다.',action_kind:'change_parameter',evidence_ids:['device:r1'],questions:[],limitations:['해석과 물리 검증은 미실행입니다.']};
const proposal={summary:'R1을 2200 Ω으로 변경',action:{kind:'change_parameter',device_id:'r1',parameter:'value',value:2200},evidence_ids:['device:r1'],expected_effect:'전류와 시정수가 바뀔 수 있으므로 실제 해석이 필요합니다.',limitations:['검증된 성능 수치가 아닙니다.']};
const response=(v,model)=>new Response(JSON.stringify({status:'completed',model,output:[{content:[{type:'output_text',text:JSON.stringify(v)}]}],usage:{input_tokens:100,output_tokens:100,total_tokens:200,secret:'not-returned'}}));
async function fixture(t,budget=1){
  const workspace=await mkdtemp(path.join(os.tmpdir(),'resistor-workflow-'));t.after(()=>rm(workspace,{recursive:true,force:true}));
  await mkdir(path.join(workspace,'.runtime/assistant'),{recursive:true});await writeFile(path.join(workspace,'.env.local'),'OPENAI_API_KEY=fixture-not-a-real-key');await writeFile(path.join(workspace,'.runtime/assistant/settings.json'),JSON.stringify({budget_usd:budget}));
  const w={workspace},state={project:{id,name:'Workflow QA',cell:'top',revision:1,runs:[],testbench:{analysis:'tran'}},device:{id:'r1',name:'R1',kind:'resistor',pins:{'+':'IN','-':'OUT'},parameters:{value:1000,retained:7}},sends:[],mutations:0,receipts:new Map(),run:null};
  const call=async(_w,method,p)=>{
    let result;
    if(method==='project.snapshot')result=structuredClone(state.project);
    else if(method==='design.connectivity')result={revision:state.project.revision,devices:[structuredClone(state.device)],nets:[],issues:[],layout_binding:{status:'not-generated'},scope:'root',limits:[]};
    else if(method==='project.command_receipt')result=state.receipts.get(p.command_id)||null;
    else if(method==='schematic.apply_command'){assert.equal(p.expected_revision,state.project.revision);state.mutations++;state.device.parameters={...p.command.parameters};state.project.revision++;result=structuredClone(state.project);state.receipts.set(p.command_id,{result});}
    else if(method==='simulation.run'){state.mutations++;state.run={id:'run-native',project_id:id,revision:state.project.revision,kind:'simulation',execution_status:'running',analysis_result:'unknown',tool:'ngspice'};result=structuredClone(state.run);state.receipts.set(p.command_id,{result});}
    else if(method==='job.status')result=structuredClone(state.run);
    else throw Error('Unexpected method '+method);
    return {ok:true,result};
  };
  const fetcher=async(url,init)=>{assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(init.body);state.sends.push(body);assert.equal(body.store,false);assert.equal(body.tools,undefined);assert.equal(body.text.format.strict,true);return response(body.model==='gpt-6-luna'?decision:proposal,body.model);};
  const e=await collectEvidence(w,{project_id:id,expected_revision:1},call),args={project_id:id,expected_revision:1,evidence_hash:e.fingerprint,goal:'R1 저항을 2200 Ω으로 변경',request_id:randomUUID(),approved:true};
  return {w,state,call,fetcher,args,e};
}
const applyArgs=row=>({project_id:id,expected_revision:row.revision,workflow_id:row.id,plan_hash:row.plan_hash,approved:true});

test('Luna decides, Sol proposes; actual models, strict schema, citations and separate cost reservations',async t=>{
  const f=await fixture(t),r=await plan(f.w,f.args,f);assert.deepEqual(f.state.sends.map(r=>r.model),['gpt-6-luna','gpt-6.1-sol']);assert.equal(r.proposal.status,'completed');assert.equal(r.engine.status,'not_run');assert.equal(f.state.mutations,0);assert.equal(r.before.unit,'Ω');
  const ledger=JSON.parse(await readFile(path.join(f.w.workspace,'.runtime/assistant/budget.json')));assert.equal(ledger.requests.length,2);assert(ledger.requests[1].reserved_usd>ledger.requests[0].reserved_usd*10);assert(!JSON.stringify(r).includes('fixture-not-a-real-key'));assert(!JSON.stringify(r).includes('not-returned'));
  const s=await status(f.w.workspace,{fetcher:async()=>new Response('{"models":[]}')});assert.equal(s.openai.roles.execution.model,'gpt-6.1-sol');
});
test('provider consent, revision and evidence precede both paid stages',async t=>{
  const f=await fixture(t);await assert.rejects(plan(f.w,{...f.args,approved:false},f));await assert.rejects(plan(f.w,{...f.args,evidence_hash:'f'.repeat(64)},f),{code:'STALE_AI_EVIDENCE'});assert.equal(f.state.sends.length,0);
});
test('needs_input stops before Sol; repeating a request ID never repeats provider calls',async t=>{
  const f=await fixture(t);let calls=0;const options={...f,fetcher:async()=>{calls++;return response({...decision,verdict:'needs_input',questions:['어떤 저항값으로 바꿀까요?']},'gpt-6-luna');}};
  const r=await plan(f.w,f.args,options);assert.equal(r.proposal.status,'not_run');assert(!r.plan_hash);await plan(f.w,f.args,options);assert.equal(calls,1);await assert.rejects(plan(f.w,{...f.args,goal:'another goal'},options),{code:'AI_IDEMPOTENCY_CONFLICT'});
});
test('a completed plan is restored without another provider call',async t=>{const f=await fixture(t),r=await plan(f.w,f.args,f);assert.equal((await plan(f.w,f.args,f)).id,r.id);assert.equal(f.state.sends.length,2);assert.equal((await history(f.w,{project_id:id,expected_revision:1},f))[0].id,r.id);});
test('zero budget and HTTP failure do not retry or substitute another model',async t=>{
  const f=await fixture(t,0),r=await plan(f.w,f.args,f);assert.equal(r.error.code,'AI_BUDGET');assert.equal(f.state.sends.length,0);
  const g=await fixture(t);let calls=0;const bad=await plan(g.w,g.args,{...g,fetcher:async()=>{calls++;return new Response('provider-body-not-for-logs',{status:404});}});assert.equal(calls,1);assert.equal(bad.proposal.status,'not_run');assert.equal(bad.error.code,'AI_PROVIDER_ERROR');assert(!JSON.stringify(bad).includes('provider-body'));assert.equal((await plan(g.w,g.args,g)).id,bad.id);assert.equal(g.state.sends.length,0);
});
test('a response for an unrequested model is rejected',async t=>{const f=await fixture(t),r=await plan(f.w,f.args,{...f,fetcher:async()=>response(decision,'another-model')});assert.equal(r.error.code,'AI_MODEL_MISMATCH');assert.equal(r.proposal.status,'not_run');});
test('changed evidence after Luna prevents the Sol call',async t=>{
  const f=await fixture(t);let calls=0;const r=await plan(f.w,f.args,{...f,fetcher:async()=>{calls++;f.state.project.runs=[{id:'new-run',revision:1,kind:'simulation',execution_status:'failed',analysis_result:'unknown'}];return response(decision,'gpt-6-luna');}});assert.equal(calls,1);assert.equal(r.error.code,'STALE_AI_EVIDENCE');assert.equal(r.freshness,'stale');assert.equal(r.proposal.status,'not_run');
});
test('unknown evidence, negative passive, unsupported target and conflicting action fail closed',async t=>{
  const f=await fixture(t);for(const value of [{...proposal,evidence_ids:['fake']},{...proposal,action:{...proposal.action,value:-1}},{...proposal,action:{...proposal.action,device_id:'unknown'}},{...proposal,action:{kind:'simulation',device_id:null,parameter:null,value:null}}])assert.throws(()=>validateProposal(value,decision,f.e));
  assert.throws(()=>validateProposal({...proposal,command:'delete all'},decision,f.e));
});
test('execution needs exact saved hash and approval; renderer cannot inject a command',async t=>{
  const f=await fixture(t),r=await plan(f.w,f.args,f);await assert.rejects(execute(f.w,{...applyArgs(r),approved:false},f));await assert.rejects(execute(f.w,{...applyArgs(r),plan_hash:'f'.repeat(64)},f),{code:'AI_PLAN_MISMATCH'});await assert.rejects(execute(f.w,{...applyArgs(r),command:{type:'delete_device'}},f));assert.equal(f.state.mutations,0);
});
test('one engine command preserves unrelated parameters and uses revision-bound native receipts',async t=>{
  const f=await fixture(t),r=await plan(f.w,f.args,f),applied=await execute(f.w,applyArgs(r),f);assert.equal(applied.engine.status,'completed');assert.equal(applied.engine.result_revision,2);assert.equal(f.state.device.parameters.value,2200);assert.equal(f.state.device.parameters.retained,7);await execute(f.w,applyArgs(r),f);assert.equal(f.state.mutations,1);assert.equal(f.state.sends.length,2);
});
test('new engine evidence at the same revision blocks a saved proposal',async t=>{
  const f=await fixture(t),r=await plan(f.w,f.args,f);f.state.project.runs=[{id:'new-run',revision:1,kind:'drc',execution_status:'failed',analysis_result:'unknown'}];await assert.rejects(execute(f.w,applyArgs(r),f),{code:'STALE_AI_EVIDENCE'});assert.equal(f.state.mutations,0);
});
test('lost mutation response recovers a confirmed receipt without a duplicate edit',async t=>{
  const f=await fixture(t),r=await plan(f.w,f.args,f);const lost=async(w,m,p)=>{const result=await f.call(w,m,p);if(m==='schematic.apply_command')throw Error('lost connection');return result;};const pending=await execute(f.w,applyArgs(r),{call:lost});assert.equal(pending.engine.status,'unknown');assert.equal(f.state.mutations,1);const restored=await execute(f.w,applyArgs(r),f);assert.equal(restored.engine.status,'completed');assert.equal(f.state.mutations,1);
});
test('unknown dispatch without a receipt is never blindly replayed',async t=>{
  const f=await fixture(t),r=await plan(f.w,f.args,f);let sends=0;const lost=async(w,m,p)=>{if(m==='schematic.apply_command'){sends++;throw Error('unknown');}return f.call(w,m,p);};await execute(f.w,applyArgs(r),{call:lost});await assert.rejects(execute(f.w,applyArgs(r),{call:lost}),{code:'AI_EXECUTION_UNKNOWN'});assert.equal(sends,1);
});
test('simulation dispatch and refreshed result reflect actual job state, including failure',async t=>{
  const f=await fixture(t),d={...decision,action_kind:'simulation'},p={...proposal,action:{kind:'simulation',device_id:null,parameter:null,value:null}};const r=await plan(f.w,f.args,{...f,fetcher:async(_u,init)=>{const m=JSON.parse(init.body).model;return response(m==='gpt-6-luna'?d:p,m);}});const dispatched=await execute(f.w,applyArgs(r),f);assert.equal(dispatched.engine.status,'running');assert.equal(dispatched.engine.run.analysis_result,'unknown');f.state.run.execution_status='failed';f.state.run.message='Actual ngspice failure';const latest=await get(f.w,{project_id:id,expected_revision:1,workflow_id:r.id},f);assert.equal(latest.engine.status,'failed');assert.equal(latest.engine.run.message,'Actual ngspice failure');assert.equal(f.state.mutations,1);
});
test('commercial/imported backend is not silently run through native commands',async t=>{const f=await fixture(t),r=await plan(f.w,f.args,f);f.state.project.active_backend='commercial';await assert.rejects(execute(f.w,applyArgs(r),f),{code:'AI_ACTION_SCOPE'});assert.equal(f.state.mutations,0);});
test('one request lock prevents duplicate paid plans; unsupported methods and cross-project use are rejected',async t=>{
  const f=await fixture(t),rs=await Promise.allSettled([plan(f.w,f.args,f),plan(f.w,f.args,f)]);assert.equal(rs.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.state.sends.length,2);const r=rs.find(r=>r.status==='fulfilled').value;await assert.rejects(execute(f.w,{...applyArgs(r),project_id:'c'.repeat(32)},f),{code:'AI_WORKFLOW_SCOPE'});assert.equal((await workflowRpc(f.w,'assistant.workflow_shell',{},f)).ok,false);assert.equal((await assistantRpc(f.w,'assistant.workflow_history',{project_id:id,expected_revision:1},f)).ok,true);
});
test('credential-like goals never reach provider or workflow storage',async t=>{
  const f=await fixture(t);await assert.rejects(plan(f.w,{...f.args,goal:'sk-proj-'+ 'A'.repeat(40)},f),{code:'AI_SECRET_INPUT'});assert.equal(f.state.sends.length,0);await assert.rejects(readFile(path.join(f.w.workspace,'.runtime/assistant/workflows',f.args.request_id+'.json')),{code:'ENOENT'});
});
test('physical PDK passive model values cannot be mistaken for an ideal editable value',async t=>{
  const f=await fixture(t),e=structuredClone(f.e);e.connectivity.devices[0].model='sky130_fd_pr__res_high_po_0p35';assert.throws(()=>validateProposal(proposal,decision,e),{code:'AI_ACTION_UNSUPPORTED'});
});
test('an incomplete or mismatched Sol proposal cannot be executed',async t=>{
  const f=await fixture(t),r=await plan(f.w,f.args,{...f,fetcher:async(_u,init)=>{const m=JSON.parse(init.body).model;return response(m==='gpt-6-luna'?decision:{...proposal,action:{...proposal.action,kind:'drc'}},m);}});assert.equal(r.proposal.status,'failed');assert.equal(r.error.code,'AI_PLAN_MISMATCH');assert(r.proposal.budget_reservation.reserved_usd>0);assert(!r.plan_hash);assert.equal(f.state.mutations,0);
});
test('an explicit native rejection is failed, while a transport loss stays unknown',async t=>{
  const f=await fixture(t),r=await plan(f.w,f.args,f),rejected=await execute(f.w,applyArgs(r),{call:async(w,m,p)=>m==='schematic.apply_command'?{ok:false,error:{code:'REVISION_CONFLICT',message:'Actual engine revision conflict'}}:f.call(w,m,p)});assert.equal(rejected.engine.status,'failed');assert.equal(rejected.engine.error.code,'REVISION_CONFLICT');assert.equal(f.state.mutations,0);
});
test('workflow receipts cannot cross the product edition boundary',async t=>{
  const f=await fixture(t),r=await plan(f.w,f.args,f),file=path.join(f.w.workspace,'.runtime/assistant/workflows',r.id+'.json'),row=JSON.parse(await readFile(file));row.product_id=r.product_id==='resistor.indust'?'resistor.edu':'resistor.indust';await writeFile(file,JSON.stringify(row));await assert.rejects(get(f.w,{project_id:id,expected_revision:1,workflow_id:r.id},f),{code:'AI_WORKFLOW_SCOPE'});
});
test('DRC LVS and PEX use only their fixed native methods and retain actual failures',async t=>{
  for(const [kind,method]of [['drc','verification.run_drc'],['lvs','verification.run_lvs'],['pex','extraction.run_pex']]){
    const f=await fixture(t),d={...decision,action_kind:kind},p={...proposal,action:{kind,device_id:null,parameter:null,value:null}},r=await plan(f.w,f.args,{...f,fetcher:async(_u,init)=>{const m=JSON.parse(init.body).model;return response(m==='gpt-6-luna'?d:p,m);}});let sends=0;
    const result=await execute(f.w,applyArgs(r),{call:async(w,m,args)=>{if(m===method){sends++;assert.equal(args.expected_revision,1);assert.equal(args.command_id,'assistant-'+r.id);return {ok:true,result:{id:'run-'+kind,revision:1,kind,execution_status:'failed',analysis_result:'unknown',message:'Actual engine/deck unavailable'}};}return f.call(w,m,args);}});
    assert.equal(sends,1);assert.equal(result.engine.status,'failed');assert.equal(result.engine.run.analysis_result,'unknown');
  }
});
