import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {circuitPuzzles,getPuzzle,assessPuzzle,placePuzzlePart,puzzleCoach} from '../packages/education/src/circuit-puzzles.ts';
import {studyRpc} from '../scripts/self-study-service.mjs';

async function setup(fn){const dir=await mkdtemp(path.join(os.tmpdir(),'resistor-puzzles-')),workspace=path.join(dir,'edu'),source=path.join(dir,'source');let calls=0,reply={observed_facts:'현재 배치는 비어 있습니다.',applied_model:'이상 저항 수식',reasoning:'닫힌 경로가 필요합니다.',next_experiment:'R1부터 연결하세요.',question:'어느 노드에 연결할까요?'};
 try{await mkdir(path.join(workspace,'.runtime/education/study'),{recursive:true});await mkdir(path.join(source,'.runtime/assistant'),{recursive:true});await writeFile(path.join(source,'.env.local'),'OPENAI_API_KEY=test-fixture-not-real');await writeFile(path.join(source,'.runtime/assistant/settings.json'),JSON.stringify({budget_usd:1}));await writeFile(path.join(workspace,'.runtime/education/study/provider.json'),JSON.stringify({schema_version:1,credential_workspace:source}));
 const fetcher=async(url,options)=>{calls++;assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(options.body);assert.equal(body.store,false);assert.equal(body.text.format.strict,true);if(reply instanceof Error)throw reply;return {ok:true,text:async()=>JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(reply)}]}],usage:{total_tokens:180,input_tokens:120,output_tokens:60}})};};
 const raw=(method,p={},edition='edu')=>studyRpc({workspace},method,p,{edition,fetcher});const api=async(method,p={})=>{const r=await raw('study.'+method,p);assert.equal(r.ok,true,r.error?.message);return r.result;};await fn({workspace,api,raw,calls:()=>calls,setReply:r=>reply=r});
 }finally{await rm(dir,{recursive:true,force:true});}
}
const create=(api,id='half-voltage')=>api('puzzle.create',{puzzle_id:id,purpose:'qa',command_id:randomUUID()});
const act=(api,v,action,command_id=randomUUID())=>api('puzzle.act',{session_id:v.session.id,expected_version:v.session.version,action,command_id});

test('every mission has a physically consistent supported ideal solution and no engine PASS',()=>{
 for(const p of circuitPuzzles){const placement=p.kind==='led'?{R1:'r1k-a'}:p.kind==='parallel'||p.id==='series-current'?{R1:'r1k-a',R2:'r1k-b'}:p.id==='power-rating'?{R1:'r300',R2:'r100-small'}:p.id==='thermal-trap'?{R1:'r50-a',R2:'r50-b'}:p.id==='half-voltage'?{R1:'r10k-a',R2:'r10k-b'}:{R1:'r10k-a',R2:'r5k'};const a=assessPuzzle(p,placement);assert.equal(a.status,'goal-met',p.id);assert.equal(a.engine_verification,false);assert.ok(a.powers.every(x=>x.watts>=0&&x.within_rating));}
 assert.equal(assessPuzzle(getPuzzle('series-current'),{R1:'r1k-a',R2:'r1k-b'}).current_A,.0025);
 assert.equal(assessPuzzle(getPuzzle('parallel-resistance'),{R1:'r1k-a',R2:'r1k-b'}).value,500);
 assert.equal(assessPuzzle(getPuzzle('led-current'),{R1:'r1k-a'}).current_A,.003);
});
test('connectivity, value and power checks remain independent; same physical part cannot be cloned',()=>{
 const p=getPuzzle('half-voltage');assert.equal(assessPuzzle(p,{}).value,null);assert.equal(assessPuzzle(p,{X1:'r1k-a'}).status,'incomplete');assert.equal(assessPuzzle(p,{R1:'r1k-a',R2:'r1k-b',X1:'r2k'}).value,null);
 assert.deepEqual(placePuzzlePart(p,{R1:'r1k-a',R2:'r1k-b'},'R2','r1k-a'),{R2:'r1k-a'});
 assert.throws(()=>assessPuzzle(p,{R1:'r1k-a',R2:'r1k-a'}));assert.throws(()=>placePuzzlePart(p,{},'OUTSIDE','r1k-a'));assert.throws(()=>placePuzzlePart(p,{},'R1','unknown'));
 const thermal=assessPuzzle(getPuzzle('thermal-trap'),{R1:'r50-small',R2:'r50-a'});assert.equal(thermal.target_met,true);assert.equal(thermal.power_met,false);assert.equal(thermal.status,'needs-change');
 const swapped=assessPuzzle(getPuzzle('repair-divider'),getPuzzle('repair-divider').initial);assert.equal(swapped.status,'needs-change');assert.ok(Math.abs(swapped.value-10/3)<1e-6);
 assert.equal(puzzleCoach(p,{},'어떤 공식이야?').source,'curated-coach');
});
test('create, place, check, modify, undo, reopen and raw explanation survive revisions and exports',()=>setup(async({api,raw,calls})=>{
 const bank=await api('catalog');assert.equal(bank.questions.length,64);const initialAttempts=(await api('history')).attempts.length;
 let v=await create(api),oldVersion=v.session.version;v=await act(api,v,{type:'place',slot:'R1',part:'r10k-a'});v=await act(api,v,{type:'place',slot:'R2',part:'r10k-b'});v=await act(api,v,{type:'check'});assert.equal(v.preview.status,'goal-met');assert.equal(v.last_check_fresh,true);assert.equal(v.context.data_revision,v.session.board_revision);
 v=await act(api,v,{type:'place',slot:'R2',part:'r5k'});assert.equal(v.last_check_fresh,false);assert.equal(v.session.checks.at(-1).assessment.status,'goal-met');assert.equal(v.preview.status,'needs-change');
 v=await act(api,v,{type:'undo'});assert.equal(v.preview.status,'goal-met');assert.equal(v.last_check_fresh,false);v=await act(api,v,{type:'redo'});assert.equal(v.preview.status,'needs-change');v=await act(api,v,{type:'explain',text:'직접 쓴 QA 답안 <태그도 데이터>'});
 const opened=await api('puzzle.open',{session_id:v.session.id});assert.equal(opened.session.explanation,'직접 쓴 QA 답안 <태그도 데이터>');assert.equal((await api('export')).puzzle_sessions[v.session.id].purpose,'qa');assert.equal((await api('history')).attempts.length,initialAttempts);assert.equal(calls(),0);
 assert.equal((await raw('study.puzzle.act',{session_id:v.session.id,expected_version:oldVersion,action:{type:'reset'},command_id:randomUUID()})).ok,false);
}));
test('duplicate operations do not repeat moves; invalid/Industry inputs cannot alter saved boards',()=>setup(async({api,raw,workspace})=>{
 let v=await create(api);const command_id=randomUUID(),request={session_id:v.session.id,expected_version:1,action:{type:'place',slot:'R1',part:'r10k-a'},command_id};v=await api('puzzle.act',request);const repeat=await api('puzzle.act',request);assert.equal(repeat.replayed,true);assert.equal(repeat.session.version,v.session.version);assert.equal(repeat.session.history.length,1);
 const before=await readFile(path.join(workspace,'.runtime/education/study/state.json'),'utf8');assert.equal((await raw('study.puzzle.act',{...request,command_id:randomUUID(),action:{type:'place',slot:'R1',part:'external-part'},expected_version:2})).ok,false);assert.equal((await raw('study.puzzle.catalog',{},'indust')).ok,false);assert.equal(await readFile(path.join(workspace,'.runtime/education/study/state.json'),'utf8'),before);
}));
test('authored tutor is free and state-aware; AI respects consent/budget and reuses exact board/question without tokens',()=>setup(async({api,raw,calls})=>{
 let v=await create(api);v=await api('puzzle.tutor',{session_id:v.session.id,expected_version:v.session.version,question:'어디부터 연결하지?',mode:'coach',command_id:randomUUID()});assert.equal(v.session.turns[0].answer.source,'curated-coach');assert.equal(calls(),0);
 const request=()=>({session_id:v.session.id,expected_version:v.session.version,question:'R1의 연결을 설명해줘',mode:'ai',approved:true,command_id:randomUUID()});assert.equal((await raw('study.puzzle.tutor',request())).ok,false);assert.equal(calls(),0);
 const bank=await api('catalog');await api('settings',{budget_usd:.1,expected_revision:bank.study_revision});assert.equal((await raw('study.puzzle.tutor',{...request(),approved:false})).ok,false);
 v=await api('puzzle.tutor',request());assert.equal(calls(),1);assert.equal(v.session.turns.at(-1).answer.source,'ai-advisory');v=await api('puzzle.tutor',{...request(),approved:false});assert.equal(v.cache_hit,true);assert.equal(v.tokens_used,0);assert.equal(calls(),1);
 v=await act(api,v,{type:'place',slot:'R1',part:'r10k-a'});assert.equal((await raw('study.puzzle.tutor',{...request(),approved:false})).ok,false);assert.equal(calls(),1);
}));
test('failed AI turn preserves the raw question and reservation; replay cannot spend again',()=>setup(async({api,calls,setReply})=>{
 let v=await create(api);const bank=await api('catalog');await api('settings',{budget_usd:.1,expected_revision:bank.study_revision});setReply(new Error('fixture network failure'));
 const request={session_id:v.session.id,expected_version:1,question:'이 질문은 실패해도 보존',mode:'ai',approved:true,command_id:randomUUID()};v=await api('puzzle.tutor',request);assert.equal(v.session.turns.at(-1).question,request.question);assert.equal(v.session.turns.at(-1).status,'error');assert.equal(v.session.turns.at(-1).answer,null);assert.equal((await api('puzzle.tutor',request)).replayed,true);assert.equal(calls(),1);assert.ok((await api('catalog')).limits.study_reserved_usd>0);
}));
test('equivalent placement orders reuse AI context; a no-op placement does not stale a check',()=>setup(async({api,calls})=>{
 let first=await create(api);first=await act(api,first,{type:'place',slot:'R1',part:'r10k-a'});first=await act(api,first,{type:'place',slot:'R2',part:'r10k-b'});first=await act(api,first,{type:'check'});const revision=first.session.board_revision;first=await act(api,first,{type:'place',slot:'R1',part:'r10k-a'});assert.equal(first.session.board_revision,revision);assert.equal(first.last_check_fresh,true);
 const bank=await api('catalog');await api('settings',{budget_usd:.1,expected_revision:bank.study_revision});await api('puzzle.tutor',{session_id:first.session.id,expected_version:first.session.version,question:'위쪽 저항의 역할은?',mode:'ai',approved:true,command_id:randomUUID()});
 let second=await create(api);second=await act(api,second,{type:'place',slot:'R2',part:'r10k-b'});second=await act(api,second,{type:'place',slot:'R1',part:'r10k-a'});second=await api('puzzle.tutor',{session_id:second.session.id,expected_version:second.session.version,question:'위쪽   저항의 역할은?',mode:'ai',approved:false,command_id:randomUUID()});assert.equal(second.cache_hit,true);assert.equal(calls(),1);
}));
