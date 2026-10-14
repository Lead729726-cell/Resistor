import test from 'node:test';
import assert from 'node:assert/strict';
import { describeRun, freshnessExplanation, currentFlowFreshness } from '../packages/ui/src/run-status';

test('no engine run is explicitly unexecuted', () => {
  assert.equal(describeRun().label, '미실행');
});
test('queued, running, canceled and failed jobs cannot display PASS even with a premature result', () => {
  for (const execution_status of ['queued', 'running', 'canceled', 'failed'] as const) {
    const run = { execution_status, analysis_result: 'pass' as const };
    assert.notEqual(describeRun(run).label, 'PASS');
    assert.equal(describeRun(run, true).label, '미판정');
  }
});
test('completed native success, violation and unsupported/unknown results stay distinct', () => {
  assert.equal(describeRun({ execution_status: 'completed', analysis_result: 'pass' }).label, 'PASS');
  assert.equal(describeRun({ execution_status: 'completed', analysis_result: 'fail' }).label, 'FAIL');
  assert.equal(describeRun({ execution_status: 'completed', analysis_result: 'unsupported' }).label, '미지원');
  assert.equal(describeRun({ execution_status: 'completed', analysis_result: 'unknown' }).label, '미판정');
});
test('imported numeric files never masquerade as an engine verification PASS', () => {
  assert.equal(describeRun({ execution_status: 'completed', analysis_result: 'pass', workflow: 'imported-results' }).label, '반입 완료');
});

test('an explicit non-native execution flag cannot certify an engine PASS', () => {
  const run = { execution_status: 'completed' as const, analysis_result: 'pass' as const, native_execution: false };
  assert.equal(describeRun(run).label, '엔진 미실행');
  assert.equal(describeRun(run, true).tone, 'neutral');
});

test('freshness distinguishes design revision changes from same-revision engine or model changes',()=>{
  assert.match(freshnessExplanation({revision:4,freshness:'stale'},5)!,/이전 설계 r4.*현재 설계는 r5/);
  assert.match(freshnessExplanation({revision:5,freshness:'stale'},5)!,/모델·PDK·엔진 입력/);
  assert.equal(freshnessExplanation({revision:5,freshness:'current'}),null);
  assert.equal(freshnessExplanation({revision:5,freshness:'current'},5),null);
  assert.equal(freshnessExplanation(undefined,5),null);
});

test('completed current numeric data remains current without claiming a functional PASS',()=>{
  for(const analysis_result of ['unknown','fail','pass'] as const){const run={execution_status:'completed' as const,revision:5,freshness:'current' as const,analysis_result};assert.equal(currentFlowFreshness(run,5),'current');assert.equal(describeRun(run).label,analysis_result==='unknown'?'미판정':analysis_result.toUpperCase());}
  assert.equal(currentFlowFreshness({execution_status:'failed',revision:5,freshness:'current'},5),'stale');
  assert.equal(currentFlowFreshness({execution_status:'completed',revision:4,freshness:'current'},5),'stale');
  assert.equal(currentFlowFreshness({execution_status:'completed',revision:5,freshness:'stale'},5),'stale');
});
