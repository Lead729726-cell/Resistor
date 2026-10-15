import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,access,cp} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {studyRpc} from '../scripts/self-study-service.mjs';
import {initialStudyQuestions,parseStudyNumber,gradeObjective} from '../packages/education/src/self-study.ts';
import {structuredEstimate} from '../scripts/structured-ai.mjs';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';

async function fixture(fn){const root=await mkdtemp(path.join(os.tmpdir(),'resistor-study-'));const workspace=path.join(root,'edu'),source=path.join(root,'industry');await mkdir(path.join(source,'.runtime/assistant'),{recursive:true});await mkdir(path.join(workspace,'.runtime/education/study'),{recursive:true});await writeFile(path.join(source,'.env.local'),'OPENAI_API_KEY=test-fixture-not-a-real-key\n');await writeFile(path.join(source,'.runtime/assistant/settings.json'),JSON.stringify({budget_usd:1}));await writeFile(path.join(workspace,'.runtime/education/study/provider.json'),JSON.stringify({schema_version:1,credential_workspace:source}));const calls=[];let response;const fetcher=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});if(response instanceof Error)throw response;return {ok:true,text:async()=>JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(response)}]}],usage:{input_tokens:100,output_tokens:100,total_tokens:200}})};};const raw=(method,params={},edition='edu')=>studyRpc({workspace},method,params,{edition,fetcher});const api=async(method,params={})=>{const r=await raw(method,params);assert.equal(r.ok,true,r.error?.message);return r.result;};try{await fn({workspace,source,calls,raw,api,setResponse:v=>{response=v;}});}finally{await rm(root,{recursive:true,force:true});}}
const submit=(q,answer,approved=false)=>({question_id:q.id,answer,approved,command_id:randomUUID()});
const scores={criteria:[{id:'principle',points:30,reason:'근거 있음'},{id:'scope',points:25,reason:'조건 일부 설명'},{id:'experiment',points:20,reason:'다음 실험 제시'}],observed_facts:'답안에 나타난 사실',applied_model:'제공한 레퍼런스',reasoning:'명시된 범위',next_experiment:'조건 하나를 고정해 비교',uncertainties:['실제 설계 실행 결과는 제공되지 않음']};

test('all seeded numeric answers use the existing calculator and accept their declared units',()=>{
 const questions=initialStudyQuestions();assert.ok(questions.length>=60);
 for(const q of questions.filter(q=>q.kind==='numeric')){assert.equal(parseStudyNumber(String(q.expected)+' '+q.unit,q.unit),q.expected);assert.equal(gradeObjective({...q,id:'fixture'},String(q.expected)).score,100);}
 for(const [value,unit,expected] of [['900 mV','V',.9],['1 kΩ','ohm',1000],['1000 ns','s',1e-6],['1e-3 A','A',.001],['2 µF','F',2e-6],['6 dB','dB',6]])assert.ok(Math.abs(parseStudyNumber(value,unit)-expected)<1e-12);
 for(const value of ['','NaN','Infinity','1,000 V','1 A','1 V trailing'])assert.throws(()=>parseStudyNumber(value,'V'));
 assert.equal(gradeObjective({...questions.find(q=>q.kind==='numeric'),expected:0,id:'fixture'},'0').correct,true);
 assert.equal(gradeObjective({...questions.find(q=>q.kind==='numeric'),expected:0,id:'fixture'},'1e-20').correct,false);
});
test('free bank, objective grading, history reopen and export never call AI or expose credentials',()=>fixture(async({api,raw,workspace,calls})=>{
 const bank=await api('study.catalog');assert.equal(bank.edition,'edu');assert.equal(bank.limits.configured,true);assert.equal(bank.limits.study_budget_usd,0);assert.ok(bank.questions.every(q=>!('solution' in q)&&!('expected' in q)&&!('correct_index' in q)));
 const q=bank.questions.find(q=>q.kind==='numeric'),original=initialStudyQuestions().find(x=>x.title===q.title);const request=submit(q,String(original.expected));const graded=await api('study.submit',request);assert.equal(graded.attempt.feedback.score,100);assert.equal(graded.attempt.feedback.engine_verification,false);assert.equal((await api('study.submit',request)).replayed,true);
 await api('study.reveal',{question_id:q.id});assert.equal((await api('study.submit',submit(q,'-9999999'))).attempt.assisted,true);
 const essay=bank.questions.find(q=>q.kind==='explanation');assert.equal((await api('study.submit',submit(essay,'관찰한 사실과 다음 실험을 비교한다.'))).attempt.feedback.status,'ungraded');
 const history=await api('study.history');assert.equal(history.attempts.length,3);assert.equal((await api('study.export')).attempts.length,3);assert.equal(calls.length,0);
 const serialized=await readFile(path.join(workspace,'.runtime/education/study/state.json'),'utf8');assert.ok(!serialized.includes('test-fixture-not-a-real-key'));await assert.rejects(access(path.join(workspace,'.env.local')));
 assert.equal((await raw('study.submit',{...request,answer:'different'})).ok,false);
}));
test('shared and study budget plus per-call approval gate generation; saved set and same essay reuse after reload',()=>fixture(async({api,raw,calls,setResponse,source})=>{
 let bank=await api('study.catalog');const generation={reference_id:bank.references[0].id,level:2,command_id:randomUUID(),approved:true};assert.equal((await raw('study.generate',generation)).ok,false);assert.equal(calls.length,0);
 await api('study.settings',{budget_usd:.1,expected_revision:bank.study_revision});bank=await api('study.catalog');assert.equal((await raw('study.generate',{...generation,approved:false})).ok,false);
 setResponse({questions:[1,2,3].map(i=>({title:'Fixture concept '+i,prompt:'주어진 레퍼런스의 적용 조건과 한계를 설명하세요.',conditions:['교육용 조건만 사용'],solution:'제공된 원리를 조건과 한계에 따라 설명하고 추가 실험을 확인합니다.',hints:['알 수 있는 범위를 구분합니다.']}))});
 const first=await api('study.generate',generation);assert.equal(first.questions.length,3);assert.equal(calls.length,1);assert.equal(calls[0].url,'https://api.openai.com/v1/responses');assert.equal(calls[0].body.store,false);assert.equal(calls[0].body.text.format.strict,true);
 const ledgerBefore=await readFile(path.join(source,'.runtime/assistant/budget.json'),'utf8');const reused=await api('study.generate',{...generation,approved:false,command_id:randomUUID()});assert.equal(reused.cache_hit,true);assert.equal(calls.length,1);
 setResponse(scores);const request=submit(first.questions[0],'원리와 적용 조건을 구분하고 다음 실험을 제안합니다.',true);const graded=await api('study.submit',request);assert.equal(graded.attempt.feedback.score,75);assert.equal(calls.length,2);
 await api('study.catalog');const cached=await api('study.submit',{...request,approved:false,command_id:randomUUID()});assert.equal(cached.cache_hit,true);assert.equal(cached.tokens_used,0);assert.equal(calls.length,2);assert.equal(cached.attempt.answer,request.answer);assert.ok(ledgerBefore.includes('reserved_usd'));
}));
test('failed response keeps raw answer, reserves conservatively and never retries the same command',()=>fixture(async({api,raw,calls,setResponse,workspace})=>{
 const bank=await api('study.catalog');await api('study.settings',{budget_usd:.1,expected_revision:bank.study_revision});const q=bank.questions.find(q=>q.kind==='explanation');setResponse(new Error('fixture transport interrupted'));
 const request=submit(q,'학생이 직접 작성한 답안 · 네트워크 실패에도 보존',true);const first=await api('study.submit',request);assert.equal(first.attempt.feedback.status,'error');assert.equal(first.attempt.feedback.score,null);assert.equal(calls.length,1);
 const replay=await api('study.submit',request);assert.equal(replay.replayed,true);assert.equal(calls.length,1);assert.equal((await api('study.history')).attempts[0].answer,request.answer);assert.ok((await api('study.catalog')).limits.study_reserved_usd>0);
 const statePath=path.join(workspace,'.runtime/education/study/state.json');const s=JSON.parse(await readFile(statePath,'utf8'));s.schema_version=999;await writeFile(statePath,JSON.stringify(s));assert.equal((await raw('study.catalog')).ok,false);assert.equal(JSON.parse(await readFile(statePath,'utf8')).schema_version,999);
}));
test('invalid rubric is not a grade; Industry is rejected before storage',()=>fixture(async({api,raw,setResponse,calls})=>{
 const bank=await api('study.catalog');await api('study.settings',{budget_usd:.1,expected_revision:bank.study_revision});setResponse({...scores,criteria:scores.criteria.map(x=>({...x,id:'principle'}))});const q=bank.questions.find(q=>q.kind==='explanation');assert.equal((await api('study.submit',submit(q,'条件を限定し結果を比較',true))).attempt.feedback.status,'error');assert.equal((await raw('study.catalog',{},'indust')).ok,false);assert.equal(calls.length,1);
}));
test('in-flight duplicate is bounded by lock and sends one provider request',()=>fixture(async({api,raw,calls,setResponse})=>{
 const bank=await api('study.catalog');await api('study.settings',{budget_usd:.1,expected_revision:bank.study_revision});setResponse(scores);const q=bank.questions.find(q=>q.kind==='explanation'),p=submit(q,'같은 요청을 동시에 보내도 API 호출은 한 번',true);const result=await Promise.all([raw('study.submit',p),raw('study.submit',p)]);assert.ok(result.some(r=>r.ok));assert.equal(calls.length,1);
 assert.ok(structuredEstimate('system',{answer:'bounded'},{} )<.01);
}));
test('QA assistance stays outside learner progress; subsequent learner retries are marked assisted',()=>fixture(async({api,raw,calls})=>{
 const bank=await api('study.catalog'),q=bank.questions.find(q=>q.kind==='choice');
 const original=initialStudyQuestions().find(x=>x.title===q.title);
 await api('study.reveal',{question_id:q.id,purpose:'qa'});
 const qa=await api('study.submit',{...submit(q,String(original.correct_index)),purpose:'qa'});assert.equal(qa.attempt.assisted,true);
 assert.equal((await api('study.catalog')).questions.find(x=>x.id===q.id).last_attempt,null);
 const first=await api('study.submit',submit(q,String(original.correct_index)));assert.equal(first.attempt.assisted,false);assert.equal(first.attempt.feedback.score,100);
 assert.equal((await api('study.submit',submit(q,String(original.correct_index)))).attempt.assisted,true);
 assert.equal((await raw('study.submit',submit(q,'99'))).ok,false);assert.equal(calls.length,0);
}));
test('desktop self-study bundle runs outside the source tree without copying keys',()=>fixture(async({workspace})=>{
 const stage=path.join(workspace,'packaged'),outfile=path.join(stage,'scripts/self-study-service.mjs');await mkdir(path.join(stage,'apps/desktop'),{recursive:true});for(const name of ['product-edition.cjs','product-editions.json'])await cp(path.join('apps/desktop',name),path.join(stage,'apps/desktop',name));await writeFile(path.join(stage,'product-edition.json'),JSON.stringify({schema_version:1,edition:'edu'}));
 await build({entryPoints:['scripts/self-study-service.mjs'],outfile,bundle:true,platform:'node',target:'node24',format:'esm',banner:{js:"import {createRequire as __studyCreateRequire} from 'node:module'; const require=__studyCreateRequire(import.meta.url);"}});
 const bundled=await import(pathToFileURL(outfile));const response=await bundled.studyRpc({workspace},'study.catalog',{}, {edition:'edu'});assert.equal(response.ok,true,response.error?.message);assert.equal(response.result.questions.length,64);assert.equal(response.result.engine_verification,false);assert.equal(response.result.limits.configured,true);await assert.rejects(access(path.join(workspace,'.env.local')));
}));
