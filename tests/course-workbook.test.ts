import test from 'node:test';
import assert from 'node:assert/strict';
import {calculators} from '../packages/calculators/src/index';
import {courseMissions,courseRevision,newCourseWorkbook,missionDraft,calculateMission,readCourseWorkbook} from '../packages/education/src/course-workbook';
test('eight curated missions reuse shared equations, units and independent engine states',()=>{
 assert.equal(courseMissions.length,8);
 for(const m of courseMissions){const d=missionDraft(m),run=calculateMission(m,d);if(m.calculator){assert.equal(run.engine.status,'calculated');assert.deepEqual(run.result,calculators.find(c=>c.id===m.calculator)!.calculate(run.inputs));}else{assert.equal(run.result,null);assert.equal(run.engine.status,'unavailable');}}
 const divider=calculateMission(courseMissions[0],missionDraft(courseMissions[0]));assert.equal(divider.result!.primaryValue,.9);assert.equal(divider.result!.secondary![0].value,.00009);
 const rc=calculateMission(courseMissions[3],missionDraft(courseMissions[3]));assert.equal(rc.result!.primaryValue,10e-6);assert.equal(rc.result!.primaryUnit,'s');
});
test('single variable change preserves baseline, revision and student explanation through reopen',()=>{
 const m=courseMissions[0],d=missionDraft(m),w=newCourseWorkbook('fixture-edu');d.prediction='내 예측';d.explanation='내가 쓴 근거';d.runs.push(calculateMission(m,d));d.inputs.r2='20000';d.revision++;d.runs.push(calculateMission(m,d));w.drafts[m.id]=d;
 assert.equal(d.runs[0].result!.primaryValue,.9);assert.equal(d.runs[1].result!.primaryValue,1.2);assert.equal(d.runs[1].result!.secondary![0].value,.00006);assert.notEqual(d.runs[0].revision,d.revision);
 assert.deepEqual(readCourseWorkbook(JSON.stringify(w)),w);assert.equal(w.edition,'edu');assert.equal(w.course_revision,courseRevision);assert.equal(w.drafts.divider.explanation,'내가 쓴 근거');
});
test('invalid values, cross-edition records and fabricated or stale result claims are rejected',()=>{
 const m=courseMissions[0];for(const raw of ['','  ','NaN','Infinity','0','-1']){const d=missionDraft(m);d.inputs.r1=raw;assert.throws(()=>calculateMission(m,d));}
 const w=newCourseWorkbook('fixture'),d=missionDraft(m);d.runs.push(calculateMission(m,d));w.drafts[m.id]=d;
 assert.throws(()=>readCourseWorkbook(JSON.stringify({...w,edition:'indust'})));assert.throws(()=>readCourseWorkbook(JSON.stringify({...w,course_revision:'future'})));
 d.runs[0].engine.status='unavailable';assert.throws(()=>readCourseWorkbook(JSON.stringify(w)));d.runs[0]=calculateMission(m,d);d.runs[0].result!.primaryValue=999;assert.throws(()=>readCourseWorkbook(JSON.stringify(w)));
});
test('SI input conversion and RC comparison retain raw conditions',()=>{
 const m=courseMissions[3],d=missionDraft(m),before=calculateMission(m,d);d.inputs.capacitance='5e-9';d.revision++;const after=calculateMission(m,d);assert.equal(before.inputs.capacitance,1e-9);assert.equal(after.inputs.capacitance,5e-9);assert.equal(Number(after.result!.primaryValue)/Number(before.result!.primaryValue),5);
});
