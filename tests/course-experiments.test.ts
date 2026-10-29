import test from 'node:test';
import assert from 'node:assert/strict';
import {courseMissions,missionDraft,calculateMission} from '../packages/education/src/course-workbook';
import {appendMissionRun,compareMissionRuns,engineeringValue,isCurrentRun,suggestedExperiment} from '../packages/education/src/course-experiments';
test('engineering display converts units without changing stored SI values or signs',()=>{
 assert.deepEqual(engineeringValue(90e-6,'A'),{value:'90',unit:'µA'});assert.deepEqual(engineeringValue(10e-6,'s'),{value:'10',unit:'µs'});assert.deepEqual(engineeringValue(-60e-6,'A'),{value:'-60',unit:'µA'});assert.deepEqual(engineeringValue(10000,'ohm'),{value:'10',unit:'kΩ'});assert.deepEqual(engineeringValue(0,'V'),{value:'0',unit:'V'});
 assert.equal(engineeringValue(1e-24,'F').unit,'F');assert.match(String(engineeringValue(Infinity,'A').value),/범위/);
});
test('one-variable comparison uses recorded results and marks edited revisions stale',()=>{
 const m=courseMissions[0],d=missionDraft(m);d.prediction='내 예측';d.explanation='내 설명';appendMissionRun(m,d);assert.equal(compareMissionRuns(m,d).kind,'before_only');suggestedExperiment(m,d);assert.equal(compareMissionRuns(m,d).fresh,false);appendMissionRun(m,d);const c=compareMissionRuns(m,d);assert.equal(c.kind,'single_variable');assert.equal(c.fresh,true);assert.deepEqual(c.changes.map(v=>v.id),['r2']);assert.match(c.observed,/0.9 V → 1.2 V/);assert.equal(d.prediction,'내 예측');assert.equal(d.explanation,'내 설명');
});
test('multiple changes and identical inputs never masquerade as a controlled single-variable experiment',()=>{
 const m=courseMissions[0],d=missionDraft(m);appendMissionRun(m,d);d.revision++;appendMissionRun(m,d);assert.equal(compareMissionRuns(m,d).kind,'identical');d.inputs.vin='3';d.inputs.r2='20000';d.revision++;appendMissionRun(m,d);assert.equal(compareMissionRuns(m,d).kind,'multiple_variables');
});
test('duplicate clicks keep one result and unavailable engines never manufacture numeric comparisons',()=>{
 const m=courseMissions[3],d=missionDraft(m);assert.equal(appendMissionRun(m,d).added,true);assert.equal(appendMissionRun(m,d).added,false);assert.equal(d.runs.length,1);const n=courseMissions[6],nd=missionDraft(n);appendMissionRun(n,nd);assert.equal(compareMissionRuns(n,nd).kind,'unavailable');assert.equal(nd.runs[0].result,null);
});
test('overflow and precision loss reject the new result without replacing prior valid history',()=>{
 const m=courseMissions[3],d=missionDraft(m);appendMissionRun(m,d);for(const values of [['1e308','1e308'],['1e-30','1e-30']]){d.inputs.resistance=values[0];d.inputs.capacitance=values[1];d.revision++;assert.throws(()=>appendMissionRun(m,d));assert.equal(d.runs.length,1);assert.equal(d.runs[0].result!.primaryValue,1e-5);}
});
test('matching revision alone does not make mismatched input conditions current',()=>{
 const m=courseMissions[0],d=missionDraft(m);const {run}=appendMissionRun(m,d);d.inputs.r2='20000';assert.equal(isCurrentRun(run,d),false);assert.equal(compareMissionRuns(m,d).fresh,false);d.inputs.r2='10000';assert.equal(isCurrentRun(run,d),true);d.inputs.r2='';assert.equal(isCurrentRun(run,d),false);
});
