import test from 'node:test';
import assert from 'node:assert/strict';
import { describeRun } from '../packages/ui/src/run-status';

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
