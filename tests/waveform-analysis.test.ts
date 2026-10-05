import test from 'node:test';
import assert from 'node:assert/strict';
import type { Run, Waveform } from '../packages/contracts/src/index';
import { axisUnit, comparableRuns, crossings, csvCell, deriveWaveform, interpolate, intervalStatistics, measurementWaveforms,
  plotSamples, propagationDelay, runStage, timingMeasurements, validateWaveform } from '../packages/analysis/src/waveform';

const wave = (x: number[], y: number[], unit = 'V'): Waveform => ({ name: 'v(out)', unit, x, y, x_unit: 's' });
const near = (actual: number, expected: number) => assert(Math.abs(actual - expected) <= 1e-12 * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);

test('interpolation uses actual nonuniform coordinates and refuses extrapolation', () => {
  const w = wave([0, .2, 1], [0, 2, 10]);
  near(interpolate(w, .6), 6); near(interpolate(w, 1), 10); near(interpolate(w, 0), 0);
  assert.throws(() => interpolate(w, 1.01), /범위/);
});
test('RMS and mean integrate a linear ramp analytically, independent of sample density', () => {
  for (const w of [wave([0, 1], [0, 1]), wave([0, .01, .4, 1], [0, .01, .4, 1])]) {
    const s = intervalStatistics(w, 0, 1); near(s.mean, .5); near(s.rms, Math.sqrt(1 / 3)); near(s.integral, .5);
  }
});
test('partial/reversed intervals interpolate boundaries, preserve cursor direction and positive integration', () => {
  const s = intervalStatistics(wave([0, 1], [0, 10]), .8, .2);
  near(s.min, 2); near(s.max, 8); near(s.delta, -6); near(s.integral, 3); near(s.mean, 5);
  const point = intervalStatistics(wave([0, 1], [-2, -2]), .5, .5);
  near(point.rms, 2); near(point.integral, 0);
});
test('tiny engineering units retain time-weighted statistics', () => {
  const s = intervalStatistics(wave([0, 2e-9], [1e-6, 1e-6], 'A'), 0, 2e-9);
  assert(Math.abs(s.integral - 2e-15) < 1e-28); assert(Math.abs(s.rms - 1e-6) < 1e-18);
});
test('invalid samples and duplicate/decreasing axes are explicitly rejected', () => {
  for (const w of [wave([], []), wave([0, 1], [0]), wave([0, 0], [0, 1]), wave([1, 0], [0, 1]), wave([0, 1], [0, NaN])]) assert.throws(() => validateWaveform(w));
  assert.throws(() => intervalStatistics(wave([0, 1], [1e308, 1e308]), 0, 1), /표현 범위/);
});
test('edge timing measures first complete 10–90 and 90–10 transitions and first full period', () => {
  const w = wave([0, 1, 2, 3, 4, 5, 6], [0, 0, 1, 1, 0, 0, 1]);
  const t = timingMeasurements(w, 0, 6, 0, 1);
  near(t.rise!, .8); near(t.fall!, .8); near(t.period!, 4); near(t.frequency!, .25);
  assert.equal(t.risingEdges, 2); assert.equal(t.fallingEdges, 1);
  assert.equal(timingMeasurements(w, 0, 1, 0, 1).rise, null);
  assert.throws(() => timingMeasurements(w, 0, 6, 1, 0));
});
test('threshold plateaus count once and aborted glitches are excluded from rise duration', () => {
  assert.deepEqual(crossings(wave([0, 1, 2, 3], [0, .5, .5, 1]), .5, 'rising'), [1]);
  const t = timingMeasurements(wave([0, 1, 2, 3, 4], [0, .2, 0, 0, 1]), 0, 4, 0, 1);
  near(t.rise!, .8);
});
test('propagation pairs the first target edge at/after input; missing edges remain null', () => {
  const source = wave([0, 1, 2, 3], [0, 0, 1, 1]), target = wave([0, 2, 3, 4], [1, 1, 0, 0]);
  near(propagationDelay(source, target, 0, 3, .5, .5, 'rising', 'falling')!.delay, 1);
  assert.equal(propagationDelay(source, target, 0, 1, .5, .5, 'rising', 'falling'), null);
});
test('derived signals align both breakpoint sets and carry physical units', () => {
  const voltage = wave([0, 1, 2], [2, 4, 6]), current = wave([0, .5, 2], [1, 1, 1], 'A');
  const power = deriveWaveform(voltage, current, 'multiply', 's', 's');
  assert.equal(power.unit, 'W'); assert.deepEqual(power.x, [0, .5, 1, 2]); assert.deepEqual(power.y, [2, 3, 4, 6]);
  assert.equal(deriveWaveform(voltage, current, 'divide', 's', 's').unit, 'ohm');
  assert.throws(() => deriveWaveform(voltage, current, 'add', 's', 's'), /Y축/);
  assert.throws(() => deriveWaveform(voltage, voltage, 'subtract', 's', 'Hz'), /X축/);
  assert.throws(() => deriveWaveform(wave([0, 1], [0, 1]), wave([2, 3], [1, 2]), 'add', 's', 's'), /겹치지/);
});
test('division rejects both sampled and between-sample zeros', () => {
  assert.throws(() => deriveWaveform(wave([0, 1], [1, 1]), wave([0, 1], [-1, 1]), 'divide', 's', 's'), /0을 통과/);
  assert.throws(() => deriveWaveform(wave([0, 1], [1, 1]), wave([0, 1], [0, 1]), 'divide', 's', 's'), /분모/);
  // A zero outside the common interval must not invalidate that interval.
  assert.doesNotThrow(() => deriveWaveform(wave([1, 2], [1, 1]), wave([0, 3], [-1, 4]), 'divide', 's', 's'));
});
test('plot decimation retains single-sample positive/negative pulses and endpoints', () => {
  const x = Array.from({ length: 50000 }, (_, i) => i), y = x.map(() => 0); y[999] = 42; y[1234] = -7;
  const samples = plotSamples(wave(x, y), 400);
  assert(samples.length <= 400); assert(samples.some(([, y]) => y === 42)); assert(samples.some(([, y]) => y === -7));
  assert.equal(samples[0][0], 0); assert.equal(samples.at(-1)![0], 49999);
});
const run = (id: string, post: boolean): Run => ({ id, project_id: 'p', revision: 2, kind: 'simulation',
  tool: 'ngspice', execution_status: 'completed', analysis_result: 'pass', freshness: 'current',
  analysis_stage: post ? 'post-layout' : 'pre-layout', measurements: { analysis: 'tran', corner: 'tt', supply_V: 1.8 } });
test('current branch measurements retain signed engine vectors and reject foreign provenance', () => {
  const r = { ...run('r', false), current_flow: { revision: 2, project_id: 'p', run_id: 'r', x: [0, 1], x_unit: 's',
    branches: [{ name: 'supply', source_vector: 'i(VDD)', values_A: [-1, -2] }] } } as Run;
  const currents = measurementWaveforms(r); assert.equal(currents.length, 1); assert.equal(currents[0].unit, 'A');
  assert.deepEqual(currents[0].y, [-1, -2]);
  assert.equal(measurementWaveforms({ ...r, revision: 3 }).length, 0);
  assert.equal(measurementWaveforms({ ...r, project_id: 'other' }).length, 0);
});
test('pre/post comparison excludes unknown stages, imported sources and mismatched settings', () => {
  const a = run('a', false), b = run('b', true); assert(comparableRuns(a, b));
  for (const patch of [{ project_id: 'other' }, { revision: 1 }, { tool: 'spectre' }, { execution_status: 'failed' as const },
    { workflow: 'imported-results' as const }, { analysis_stage: undefined }, { measurements: { analysis: 'tran', supply_V: 3.3 } }]) assert(!comparableRuns(a, { ...b, ...patch }));
  assert.equal(runStage({ ...a, analysis_stage: undefined }), 'unknown');
  assert.equal(axisUnit({ ...a, kind: 'simulation_ac' }), 'Hz');
});
test('CSV cells preserve signed numbers and neutralize formula-like names', () => {
  assert.equal(csvCell(-.001), '-0.001'); assert.equal(csvCell('=SUM(A1)'), '"\'=SUM(A1)"');
  assert.equal(csvCell('v("out")'), '"v(""out"")"');
});
