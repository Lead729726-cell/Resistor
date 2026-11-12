import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

// Render the actual result page without a browser or engine/provider requests.
// CSS is intentionally omitted: visual and focus acceptance are separate UI checks.
const built=await build({stdin:{contents:"export {StudyFeedbackContent,currentStudyFeedback} from './packages/ui/src/SelfStudy.tsx';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'cjs',target:'node24',loader:{'.css':'empty'},external:['react','react/*'],logLevel:'silent'});
const subject={exports:{}};
runInNewContext(built.outputFiles[0].text,{module:subject,exports:subject.exports,require:createRequire(import.meta.url),TextEncoder,TextDecoder});
const {StudyFeedbackContent,currentStudyFeedback}=subject.exports;
const feedback=(patch={})=>({status:'graded',score:100,method:'deterministic',feedback:'저장된 기준과 일치합니다.',expected:0.9,unit:'V',formula:'Vout = Vin × R2 / (R1 + R2)',solution:'두 저항이 같을 때 전압은 절반입니다.',...patch});
const render=(value,kind='numeric')=>renderToStaticMarkup(React.createElement(StudyFeedbackContent,{feedback:value,kind}));

test('returning to a result retains the exact answer binding and rejects another question, version or workspace',()=>{
 const key='edu:store-a:question-a:v1:practice',value=feedback(),entry={key,answer:'900 mV',value};
 assert.equal(currentStudyFeedback(entry,key,'900 mV'),value);
 // Back/reopen is read-only; changing the draft cannot relabel an old grade.
 assert.equal(currentStudyFeedback(entry,key,'901 mV'),null);
 for(const other of ['edu:store-b:question-a:v1:practice','edu:store-a:question-b:v1:practice','edu:store-a:question-a:v2:practice','edu:store-a:question-a:v1:qa'])assert.equal(currentStudyFeedback(entry,other,'900 mV'),null);
 assert.equal(currentStudyFeedback(null,key,'900 mV'),null);
 assert.deepEqual(entry,{key,answer:'900 mV',value});
});

test('the focused result preserves real values, units, formula and zero-score failures',()=>{
 const value=feedback({score:0,expected:0.9000000000001}),before=structuredClone(value),html=render(value);
 assert.match(html,/0 \/ 100 · 규칙 채점/);
 assert.match(html,/0\.9000000000001 V/);
 assert.match(html,/Vout = Vin × R2 \/ \(R1 \+ R2\)/);
 assert.match(html,/공식 성적이나 설계 엔진 검증이 아닙니다/);
 assert.doesNotMatch(html,/PASS|AI 연습 평가/);
 assert.deepEqual(value,before);
});

test('pending, unavailable grading and provider errors never become a scored success',()=>{
 for(const [status,label] of [['pending','피드백 처리 중'],['error','피드백 요청 실패'],['ungraded','미채점 · 해설 비교']]){
  const html=render(feedback({status,score:100,method:'ai-advisory'}));
  assert.match(html,new RegExp(label));assert.doesNotMatch(html,/100 \/ 100|규칙 채점|AI 연습 평가/);
 }
 for(const score of [null,undefined,NaN,Infinity])assert.match(render(feedback({score})),/미채점 · 해설 비교/);
});

test('AI feedback retains observations, uncertainty and rubric without becoming engine verification',()=>{
 const html=render(feedback({method:'ai-advisory',observed_facts:'입력 1.8 V',applied_model:'이상 저항',reasoning:'저항 비를 비교',next_experiment:'R2만 변경',uncertainties:['배선 기생은 미추출'],criteria:[{id:'units',points:25,reason:'단위 표시'}]}),'explanation');
 for(const value of ['AI 연습 평가','관찰한 사실','적용 규칙·모델','판단 근거','다음 실험','배선 기생은 미추출','units · 25점 · 단위 표시'])assert.ok(html.includes(value));
 assert.doesNotMatch(html,/PASS/);
});

test('choice numbering changes presentation only and learner/provider text remains escaped',()=>{
 const value=feedback({expected:0,unit:'',solution:'<script>alert(1)</script>'}),html=render(value,'choice');
 assert.match(html,/기준값: 1 /);assert.equal(value.expected,0);
 assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
 assert.doesNotMatch(render(feedback({method:'unrecognized'})),/AI 연습 평가/);
});
