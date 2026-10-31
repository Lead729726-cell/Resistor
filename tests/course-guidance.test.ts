import test from 'node:test';
import assert from 'node:assert/strict';
import {courseMissions,missionDraft} from '../packages/education/src/course-workbook';
import {appendMissionRun,suggestedExperiment} from '../packages/education/src/course-experiments';
import {courseGuidance,validateMissionInputs} from '../packages/education/src/course-guidance';

test('guide follows prediction, baseline, one change, fresh comparison and learner explanation without mutating evidence',()=>{
 const m=courseMissions[0],d=missionDraft(m);
 assert.equal(courseGuidance(m,d).next.action,'predict');
 d.prediction='R2가 커지면 OUT이 올라갈 것 같다.';
 assert.equal(courseGuidance(m,d).next.action,'calculate');
 appendMissionRun(m,d);
 assert.equal(courseGuidance(m,d).next.action,'change');
 suggestedExperiment(m,d);
 assert.equal(courseGuidance(m,d).next.action,'calculate');
 assert.equal(courseGuidance(m,d).steps.find(s=>s.id==='calculate')!.status,'stale');
 appendMissionRun(m,d);
 const before=structuredClone(d),g=courseGuidance(m,d);
 assert.equal(g.next.action,'explain');
 assert.equal(g.steps.find(s=>s.id==='compare')!.status,'done');
 assert.match(g.steps.find(s=>s.id==='compare')!.detail,/자동 판정은 아닙니다/);
 assert.deepEqual(d,before);
 d.explanation='R2의 비율이 커져 OUT이 높아지고 전체 저항이 커져 전류는 작아졌다.';
 assert.equal(courseGuidance(m,d).next.action,'review');
 assert.equal(d.complete,false);
});

test('missing retrospective prediction and self-completion do not fabricate completed explanation',()=>{
 const m=courseMissions[0],d=missionDraft(m);
 appendMissionRun(m,d);suggestedExperiment(m,d);appendMissionRun(m,d);d.complete=true;
 const g=courseGuidance(m,d);
 assert.equal(g.selfCompleteWithoutExplanation,true);
 assert.equal(g.steps.find(s=>s.id==='predict')!.status,'pending');
 assert.equal(g.steps.find(s=>s.id==='explain')!.status,'pending');
 assert.equal(g.next.action,'explain');
 assert.match(g.steps.find(s=>s.id==='predict')!.detail,/다음 조건/);
 assert.equal(d.complete,true);
});

test('revision freshness and identical conditions never imply a changed-condition comparison',()=>{
 const m=courseMissions[0],d=missionDraft(m);
 appendMissionRun(m,d);d.revision++;appendMissionRun(m,d);
 assert.equal(courseGuidance(m,d).comparisonKind,'identical');
 assert.equal(courseGuidance(m,d).steps.find(s=>s.id==='compare')!.status,'pending');
 d.inputs.r2='20000';
 assert.equal(courseGuidance(m,d).fresh,false);
 assert.equal(courseGuidance(m,d).next.action,'calculate');
});

test('multiple-variable recorded pairs are available to read but not represented as one-variable evidence',()=>{
 const m=courseMissions[0],d=missionDraft(m);
 appendMissionRun(m,d);d.inputs.r1='20000';d.inputs.r2='30000';d.revision++;appendMissionRun(m,d);
 const g=courseGuidance(m,d);
 assert.equal(g.comparisonKind,'multiple_variables');
 assert.equal(g.next.action,'explain');
 assert.match(g.next.detail,/한 변수의 영향으로 단정하지/);
 assert.match(g.steps.find(s=>s.id==='compare')!.detail,/여러 변수/);
});

test('unavailable external engines remain unavailable even when the attempted record is current',()=>{
 const m=courseMissions[6],d=missionDraft(m);
 d.prediction='게이트 입력에 따라 출력이 바뀔 것 같다.';
 assert.equal(courseGuidance(m,d).next.action,'calculate');
 appendMissionRun(m,d);
 const g=courseGuidance(m,d);
 assert.equal(g.fresh,true);
 assert.equal(g.comparisonKind,'unavailable');
 assert.equal(g.steps.find(s=>s.id==='calculate')!.status,'unavailable');
 assert.equal(g.steps.find(s=>s.id==='compare')!.status,'unavailable');
 assert.equal(g.next.action,'app');
 assert.equal(d.runs[0].result,null);
 d.explanation='실제 엔진이 없어 아직 동작을 확인하지 못했다.';
 assert.equal(courseGuidance(m,d).next.action,'review');
 assert.equal(courseGuidance(m,d).steps.find(s=>s.id==='calculate')!.status,'unavailable');
});

test('report mission asks for student explanation rather than inventing an unnecessary engine run',()=>{
 const m=courseMissions[7],d=missionDraft(m);
 assert.equal(courseGuidance(m,d).next.action,'explain');
 d.explanation='수식 결과와 실제 실행은 구분했다.';
 assert.equal(courseGuidance(m,d).next.action,'review');
 assert.equal(d.runs.length,0);
});

test('validation reuses shared range rules and identifies the field without replacing prior records',()=>{
 const m=courseMissions[0],d=missionDraft(m);appendMissionRun(m,d);
 for(const value of ['', 'Infinity', '-5','0']){
  d.inputs.r1=value;
  const v=validateMissionInputs(m,d);
  assert.equal(v.valid,false);assert.equal(v.fieldId,'r1');assert.match(v.message!,/위쪽 R1/);
  assert.equal(d.runs.length,1);
 }
 d.inputs.r1='10000';d.inputs.vin='-1.8';
 assert.equal(validateMissionInputs(m,d).valid,true);
 const series=courseMissions[2],sd=missionDraft(series);sd.inputs.r3='-1';
 assert.match(validateMissionInputs(series,sd).message!,/0 이상/);
 sd.inputs={r1:'0',r2:'0',r3:'0',r4:'0'};
 assert.equal(validateMissionInputs(series,sd).fieldId,null);
 assert.match(validateMissionInputs(series,sd).message!,/하나 이상/);
});

test('validation preserves existing overflow and precision protections',()=>{
 const m=courseMissions[3],d=missionDraft(m);
 d.inputs.resistance='1e308';d.inputs.capacitance='1e308';
 assert.equal(courseGuidance(m,d).validation.valid,false);
 assert.match(courseGuidance(m,d).validation.message!,/수치 범위/);
 d.inputs.resistance='1e-30';d.inputs.capacitance='1e-30';
 assert.match(validateMissionInputs(m,d).message!,/정밀도/);
 assert.equal(d.runs.length,0);
});
