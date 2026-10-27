import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {studyRpc} from '../scripts/self-study-service.mjs';
const judgment=ids=>({activity_kind:'hint',focus:'units',observed_facts:'제공된 답안의 단위를 확인합니다.',applied_model:'문제에 명시된 단위와 기존 규칙 채점',rationale:'현재 계산 근거에 맞는 힌트를 선택합니다.',next_step:'접두 단위를 기본 단위로 표현해 보세요.',evidence_ids:ids});
const activity=ids=>({title:'단위를 바꾸어 다시 설명하기',observed_facts:'이 문제의 입력 조건을 읽었습니다.',applied_model:'명시한 단위 변환 규칙만 사용합니다.',reasoning:'기준 단위로 바꾸는 순서를 스스로 설명해 봅니다.',next_experiment:'같은 양을 다른 접두 단위로 표현하세요.',learner_question:'값과 단위를 어떻게 연결했나요?',checklist:['입력 단위를 표시한다','변환 근거를 한 문장으로 쓴다'],evidence_ids:ids});
async function fixture(fn){
 const root=await mkdtemp(path.join(os.tmpdir(),'resistor-edu-coach-')),workspace=path.join(root,'edu'),source=path.join(root,'credential-source');const calls=[];let override;
 await mkdir(path.join(workspace,'.runtime/education/study'),{recursive:true});await mkdir(path.join(source,'.runtime/assistant'),{recursive:true});
 await writeFile(path.join(source,'.env.local'),'OPENAI_API_KEY=test-fixture-not-a-real-key');await writeFile(path.join(source,'.runtime/assistant/settings.json'),JSON.stringify({budget_usd:1}));await writeFile(path.join(workspace,'.runtime/education/study/provider.json'),JSON.stringify({credential_workspace:source}));
 const fetcher=async(url,options)=>{const body=JSON.parse(options.body);calls.push(body);const content=JSON.parse(body.input[1].content),role=body.text.format.name==='resistor_edu_judgment'?'judge':'executor';const value=override?override(role,content):role==='judge'?judgment(content.evidence.evidence_ids):activity(content.evidence.evidence_ids);if(value instanceof Error)throw value;return {ok:true,text:async()=>JSON.stringify({status:'completed',model:body.model,output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}],usage:{total_tokens:100}})};};
 const raw=(method,params={},edition='edu')=>studyRpc({workspace},method,params,{edition,fetcher});const api=async(method,params={})=>{const r=await raw(method,params);assert.equal(r.ok,true,r.error?.message);return r.result;};
 try{const bank=await api('study.catalog'),q=bank.questions.find(q=>q.kind==='numeric');const input={target:{kind:'question',question_id:q.id,question_version:q.version,purpose:'qa'},answer:'1 kΩ',question:'접두 단위를 어떻게 읽나요?',goal:'hint'};await fn({workspace,source,calls,api,raw,input,setReply:fn=>{override=fn;},enable:()=>api('study.settings',{budget_usd:1,expected_revision:bank.study_revision})});}finally{await rm(root,{recursive:true,force:true,maxRetries:4,retryDelay:100});}
}
const request=(input,preview)=>({...input,expected_evidence_hash:preview.evidence_hash,max_cost_usd:preview.upper_bound_usd,approved:true,command_id:randomUUID()});
test('free preview binds actual objective evidence, excludes answer keys and respects the zero study budget',()=>fixture(async({api,raw,calls,input})=>{
 const p=await api('study.coach.preview',input);assert.equal(p.new_provider_calls,2);assert(p.blocked_reason);assert.equal(p.policy.judge.model,'gpt-6-luna');assert.equal(p.policy.executor.model,'gpt-6.1-sol');assert.equal(p.evidence.objective_observation.status,'calculated');assert(!('expected' in p.evidence.question));assert(!('solution' in p.evidence.question));assert(!('correct' in p.evidence.objective_observation));assert.equal((await raw('study.coach.run',request(input,p))).ok,false);assert.equal(calls.length,0);
 assert.equal((await raw('study.coach.preview',input,'indust')).ok,false);
}));
test('Luna judgment precedes Sol activity, atomically reserves both costs and reuses each stage without provider calls',()=>fixture(async({api,raw,calls,input,enable,source,workspace})=>{
 await enable();const p=await api('study.coach.preview',input);assert.equal(p.blocked_reason,null);assert.equal((await raw('study.coach.run',{...request(input,p),approved:false})).ok,false);assert.equal((await raw('study.coach.run',{...request(input,p),max_cost_usd:0})).ok,false);assert.equal(calls.length,0);
 const r=await api('study.coach.run',request(input,p));assert.equal(r.record.status,'completed');assert.deepEqual(calls.map(c=>c.model),['gpt-6-luna','gpt-6.1-sol']);assert(calls.every(c=>c.store===false&&c.service_tier==='default'));assert.equal(r.record.engine_verification,false);
 const ledger=JSON.parse(await readFile(path.join(source,'.runtime/assistant/budget.json'),'utf8'));assert.equal(ledger.requests.length,1);assert.equal(ledger.reserved_usd,p.upper_bound_usd);
 const again=await api('study.coach.preview',input);assert.equal(again.upper_bound_usd,0);const cached=await api('study.coach.run',{...request(input,again),approved:false});assert(cached.cache_hit);assert.equal(cached.tokens_used,0);assert.equal(calls.length,2);
 const state=JSON.parse(await readFile(path.join(workspace,'.runtime/education/study/state.json'),'utf8'));assert.equal(state.attempts.length,0);assert.equal(state.reserved_usd,p.upper_bound_usd);assert.equal((await api('study.export')).edu_coach_records[r.record.id].status,'completed');
}));
test('stale input hashes and future problem versions are rejected before spending',()=>fixture(async({api,raw,calls,input,enable})=>{
 await enable();const p=await api('study.coach.preview',input);assert.equal((await raw('study.coach.run',{...request(input,p),answer:'different'})).ok,false);assert.equal((await raw('study.coach.preview',{...input,target:{...input.target,question_version:'future'}})).ok,false);assert.equal(calls.length,0);
}));
test('partial Sol failure preserves Luna and the input; explicit new run reuses Luna; replay never spends again',()=>fixture(async({api,calls,input,enable,setReply})=>{
 await enable();setReply((role,c)=>role==='judge'?judgment(c.evidence.evidence_ids):new Error('fixture failure'));
 const p=await api('study.coach.preview',input),params=request(input,p),failed=await api('study.coach.run',params);assert.equal(failed.record.status,'error');assert(failed.record.judgment);assert.equal(failed.record.evidence.learner_answer,input.answer);assert.equal((await api('study.coach.run',params)).replayed,true);assert.equal(calls.length,2);
 setReply((role,c)=>role==='judge'?judgment(c.evidence.evidence_ids):activity(c.evidence.evidence_ids));const next=await api('study.coach.preview',input);assert.equal(next.new_provider_calls,1);const ok=await api('study.coach.run',request(input,next));assert.equal(ok.record.status,'completed');assert.equal(calls.length,3);assert(ok.record.stages[0].cache_hit);
}));
test('insufficient evidence skips Sol and unknown citations cannot become a learning judgment',()=>fixture(async({api,calls,input,enable,setReply})=>{
 await enable();setReply((role,c)=>({...judgment(c.evidence.evidence_ids),activity_kind:'need_evidence'}));const p=await api('study.coach.preview',input),r=await api('study.coach.run',request(input,p));assert.equal(r.record.status,'needs_evidence');assert.equal(r.record.activity,null);assert.equal(calls.length,1);
 const other={...input,question:'다른 근거를 요청'};setReply(()=>judgment(['invented-run:PASS']));const p2=await api('study.coach.preview',other),invalid=await api('study.coach.run',request(other,p2));assert.equal(invalid.record.status,'error');assert.equal(invalid.record.judgment,null);assert.equal(calls.length,2);
}));
test('learner reflections are version guarded and distinguish AI drafts without creating grades',()=>fixture(async({api,raw,input,enable})=>{
 await enable();const p=await api('study.coach.preview',input),r=(await api('study.coach.run',request(input,p))).record;
 const params={run_id:r.id,expected_version:r.version,text:'단위 변환의 이유를 내가 설명했다.',author:'learner',command_id:randomUUID()};const saved=await api('study.coach.reflect',params);assert.equal(saved.record.reflection.author,'learner');assert.equal(saved.record.reflection.evidence_hash,r.evidence_hash);assert.equal((await api('study.coach.reflect',params)).replayed,true);
 assert.equal((await raw('study.coach.reflect',{...params,command_id:randomUUID()})).ok,false);const history=await api('study.coach.history',{target:input.target});assert.equal(history.records[0].reflection.text,params.text);assert.equal((await api('study.history')).attempts.length,0);
}));
test('puzzle board changes invalidate prepared coaching while static math remains the existing engine output',()=>fixture(async({api,raw,calls,enable})=>{
 await enable();const s=(await api('study.puzzle.create',{puzzle_id:'half-voltage',purpose:'qa',command_id:randomUUID()})).session;
 const input={target:{kind:'puzzle',session_id:s.id,board_revision:s.board_revision},answer:'절반이 될 것이다',question:'먼저 무엇을 연결하나요?',goal:'experiment'},p=await api('study.coach.preview',input);assert.equal(p.evidence.assessment.value,null);
 await api('study.puzzle.act',{session_id:s.id,expected_version:s.version,action:{type:'place',slot:'R1',part:'r1k-a'},command_id:randomUUID()});assert.equal((await raw('study.coach.run',request(input,p))).ok,false);assert.equal(calls.length,0);
}));

test('coach support is purpose isolated and marks subsequent independent quiz attempts as assisted',()=>fixture(async({api,input,enable,calls,workspace})=>{
 const preview=await api('study.coach.preview',input);let state=JSON.parse(await readFile(path.join(workspace,'.runtime/education/study/state.json'),'utf8'));assert.equal(state.revealed.length,0);
 await enable();await api('study.coach.run',request(input,preview));const r=await api('study.submit',{question_id:input.target.question_id,answer:input.answer,purpose:'qa',command_id:randomUUID()});assert.equal(r.attempt.assisted,true);
 const other=await api('study.coach.history',{target:{...input.target,purpose:'practice'}});assert.equal(other.records.length,0);assert.equal(calls.length,2);
 const practice=await api('study.submit',{question_id:input.target.question_id,answer:input.answer,purpose:'practice',command_id:randomUUID()});assert.equal(practice.attempt.assisted,false);
}));

test('current native samples retain provenance, old board samples never become present measurements',()=>fixture(async({api,workspace})=>{
 const s=(await api('study.puzzle.create',{puzzle_id:'half-voltage',purpose:'qa',command_id:randomUUID()})).session;
 const file=path.join(workspace,'.runtime/education/study/state.json'),state=JSON.parse(await readFile(file,'utf8'));
 // Deliberately seeded native-result fixture; no actual ngspice execution is claimed.
 state.puzzle_sessions[s.id].simulations=[{run_id:'fixture-run',project_id:'fixture-project',project_revision:4,board_revision:s.board_revision,status:'completed',engine:{id:'ngspice',version:'fixture'},process:{id:null,version:null},waveforms:[{name:'OUT',unit:'V',x:[0,1],y:[0,1.8]}]}];await writeFile(file,JSON.stringify(state));
 const input={target:{kind:'puzzle',session_id:s.id,board_revision:s.board_revision},goal:'experiment'};
 const current=await api('study.coach.preview',input);assert.equal(current.context.engine.id,'ngspice');assert.equal(current.context.project_id,'fixture-project');assert.equal(current.evidence.actual_run.metrics[0].max,1.8);
 const next=await api('study.puzzle.act',{session_id:s.id,expected_version:s.version,action:{type:'place',slot:'R1',part:'r1k-a'},command_id:randomUUID()});
 const stale=await api('study.coach.preview',{...input,target:{...input.target,board_revision:next.session.board_revision}});assert.equal(stale.evidence.actual_run.current,false);assert.deepEqual(stale.evidence.actual_run.metrics,[]);assert(!stale.evidence.evidence_ids.includes('run:fixture-run'));
 const missing=JSON.parse(await readFile(file,'utf8'));missing.puzzle_sessions[s.id].simulations=[{board_revision:next.session.board_revision,status:'unavailable',message:'ngspice missing',waveforms:[]}];await writeFile(file,JSON.stringify(missing));
 const unavailable=await api('study.coach.preview',{...input,target:{...input.target,board_revision:next.session.board_revision}});assert.equal(unavailable.evidence.actual_run.status,'unavailable');assert.equal(unavailable.evidence.actual_run.message,'ngspice missing');assert.equal(unavailable.evidence.actual_run.verification.pex,'not_run');assert.deepEqual(unavailable.evidence.actual_run.metrics,[]);assert.equal(unavailable.context.engine.id,null);
}));
