import test from 'node:test';
import assert from 'node:assert/strict';
import type { Run, Waveform } from '../packages/contracts/src/index';
import { parseTimeList, prepareFlow, snapshotFlow, testSignalResponse, voltageSignals, type ResponseConfig } from '../packages/analysis/src/signal-flow';

const w = (x: number[], y: number[]): Waveform => ({ name: 'out', unit: 'V', x, y, x_unit: 's' });
const config = (extra: Partial<ResponseConfig> = {}): ResponseConfig => ({ mode: 'invert', times: [.2, 1.5], settle: 0, window: .1, low: .3, high: .7, ...extra });
const vin = w([0, 1, 1.1, 2], [0, 0, 1, 1]);
const vout = w([0, 1, 1.1, 2], [1, 1, 0, 0]);
const run = (): Run => ({ id: 'r', project_id: 'p', revision: 2, kind: 'simulation', tool: 'ngspice',
  execution_status: 'completed', analysis_result: 'pass', freshness: 'current', current_flow: {
    schema_version: 1, source: 'ngspice', analysis: 'tran', convention: 'conventional', revision: 2, run_id: 'r', project_id: 'p',
    x: [0, .2, 1], x_unit: 's', branches: [{ id: 'r1', name: 'R1', from_net: 'A', to_net: 'B', mapping: 'unmapped', source_vector: 'i(vsense)', values_A: [0, .002, -.006] }],
    node_voltages: [{ net: 'A', source_vector: 'v(A)', values_V: [0, 2, 10] }, { net: 'B', source_vector: 'v(B)', values_V: [0, 1, 5] }],
  } });
const near = (n: number | null, expected: number) => assert(n !== null && Math.abs(n - expected) < 1e-12);

test('flow interpolates synchronized node voltages and signed current on nonuniform native axis', () => {
  const frame = snapshotFlow(prepareFlow(run())!, .6)[0];
  near(frame.from_voltage_V, 6); near(frame.to_voltage_V, 3); near(frame.voltage_drop_V, 3); near(frame.current_A, -.002);
  assert.equal(frame.direction, 'reverse'); assert.equal(frame.actual_from, 'B'); assert.equal(frame.actual_to, 'A');
});
test('reference voltage drop retains sign when current reverses; zero current does not invent direction', () => {
  const flow = prepareFlow(run())!;
  assert.equal(snapshotFlow(flow, .2)[0].direction, 'forward');
  assert.equal(snapshotFlow(flow, 0)[0].direction, 'zero');
  assert.equal(snapshotFlow(flow, .2, .003)[0].direction, 'zero');
  assert.throws(() => snapshotFlow(flow, -1), /범위/); assert.throws(() => snapshotFlow(flow, .5, -1));
});
test('older current-only runs retain current but mark endpoint voltage and drop unavailable', () => {
  const r = run(); delete r.current_flow!.node_voltages;
  const frame = snapshotFlow(prepareFlow(r)!, .2)[0];
  near(frame.current_A, .002); assert.equal(frame.from_voltage_V, null); assert.equal(frame.voltage_drop_V, null);
});
test('wrong run/project/revision provenance is rejected before displaying flow', () => {
  for (const mutate of [(r: Run) => r.current_flow!.run_id = 'wrong', (r: Run) => r.current_flow!.project_id = 'wrong', (r: Run) => r.current_flow!.revision = 1]) {
    const r = run(); mutate(r); assert.throws(() => prepareFlow(r), /일치/);
  }
});
test('malformed branches/nodes remain unavailable; no finite-looking replacement data', () => {
  const r = run(); r.current_flow!.branches[0].values_A[1] = NaN; r.current_flow!.node_voltages![0].values_V.pop();
  const flow = prepareFlow(r)!; assert.equal(flow.errors.length, 2);
  const frame = snapshotFlow(flow, .2)[0]; assert.equal(frame.current_A, null); assert.equal(frame.direction, 'unknown'); assert.equal(frame.voltage_drop_V, null);
  r.current_flow!.x = [0, 0, 1]; assert.throws(() => prepareFlow(r), /증가/);
});
test('case-insensitive native nodes resolve without guessing saved waveform aliases', () => {
  const r = run(); r.current_flow!.branches[0].from_net = 'a';
  r.waveforms = [{ ...vin, name: 'Vin' }, { ...vout, name: 'Iout', unit: 'A' }];
  assert.equal(voltageSignals(r, prepareFlow(r)).length, 3); near(snapshotFlow(prepareFlow(r)!, .2)[0].from_voltage_V, 2);
  r.current_flow!.node_voltages!.push({ net: 'a', values_V: [1, 1, 1], source_vector: 'duplicate' });
  assert.equal(prepareFlow(r)!.errors.length, 1);
});
test('SI time list accepts seconds, exponents, ps/ns/us/microseconds/ms and rejects invalid values', () => {
  const times = parseTimeList('2ns, 7e-9; 12 ps\n1µs, 2us, .5ms, 3s');
  [2e-9, 7e-9, 12e-12, 1e-6, 2e-6, .5e-3, 3].forEach((expected, i) => assert(Math.abs(times[i] - expected) <= 1e-15 * expected));
  for (const s of ['', '2MHz', 'NaN', '1e999', Array(257).fill('1').join(',')]) assert.throws(() => parseTimeList(s));
});
test('inverter envelope passes known LOW/HIGH plateaus and wrong buffer expectation fails', () => {
  const result = testSignalResponse(vin, vout, config());
  assert.equal(result.pass, true); assert.equal(result.passed, 2); assert.deepEqual(result.rows.map(r => r.actual), [1, 0]);
  assert.equal(testSignalResponse(vin, vout, config({ mode: 'buffer' })).passed, 0);
});
test('whole output window detects narrow glitches even if evaluation endpoints match expectation', () => {
  const glitch = w([0, .4, .41, .42, 1], [1, 1, 0, 1, 1]);
  const result = testSignalResponse(vin, glitch, config({ times: [.1], window: .8 }));
  assert.equal(result.pass, false); assert.equal(result.rows[0].actual, 'X'); near(result.rows[0].output_min_V, 0);
});
test('settling interval moves observation past propagation and ambiguous input cannot pass', () => {
  const result = testSignalResponse(vin, vout, config({ times: [1.09], settle: .1, window: .1 }));
  assert.equal(result.rows[0].expected, 0); assert.equal(result.pass, true);
  const ambiguous = testSignalResponse(vin, vout, config({ times: [1.05], window: 0 }));
  assert.equal(ambiguous.rows[0].expected, 'X'); assert.equal(ambiguous.pass, false);
});
test('manual expected bits validate exact count and support testing output without input', () => {
  const c = config({ mode: 'manual', manualBits: [1, 0] });
  assert.equal(testSignalResponse(null, vout, c).pass, true);
  assert.equal(testSignalResponse(null, vout, { ...c, manualBits: [0, 0] }).passed, 1);
  for (const bits of [[1], [1, 2]]) assert.throws(() => testSignalResponse(null, vout, { ...c, manualBits: bits }));
});
test('analog envelope includes boundaries and rejects an excursion inside the window', () => {
  const ramp = w([0, 1], [0, 1]), c = config({ mode: 'analog', times: [.2], window: .6, analogMin: .2, analogMax: .8 });
  assert.equal(testSignalResponse(null, ramp, c).pass, true);
  assert.equal(testSignalResponse(null, ramp, c).rows[0].actual, null);
  assert.equal(testSignalResponse(null, ramp, { ...c, analogMax: .7 }).pass, false);
});
test('time out of range yields unavailable and never overall PASS', () => {
  const r = testSignalResponse(vin, vout, config({ times: [-1, 1.9, 3], settle: .2, window: .3 }));
  assert.equal(r.pass, false); assert.equal(r.passed, 0); assert(r.rows.every(row => row.result === 'unavailable'));
});
test('reject wrong units, axes, bounds, modes, nonfinite and missing inputs', () => {
  assert.throws(() => testSignalResponse(null, vout, config()), /입력/);
  for (const extra of [{ low: 1, high: 0 }, { settle: -1 }, { window: NaN }, { times: [] }, { times: [Infinity] }, { mode: 'bad' as ResponseConfig['mode'] }, { mode: 'analog' as const, analogMin: 2, analogMax: 1 }])
    assert.throws(() => testSignalResponse(vin, vout, config(extra)));
  assert.throws(() => testSignalResponse(vin, { ...vout, unit: 'A' }, config()), /전압/);
  assert.throws(() => testSignalResponse(vin, { ...vout, x_unit: 'V' }, config()), /시간축/);
  assert.throws(() => testSignalResponse(vin, w([0, 0], [0, 1]), config()), /증가/);
});
