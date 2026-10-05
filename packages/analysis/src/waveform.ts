import type { Run, Waveform } from '../../contracts/src/index';

export type Edge = 'rising' | 'falling';
export type WaveOperation = 'add' | 'subtract' | 'multiply' | 'divide';
export interface IntervalStatistics {
  start: number; end: number; count: number; min: number; max: number;
  peakToPeak: number; mean: number; rms: number; integral: number;
  valueA: number; valueB: number; delta: number;
}

export function measurementWaveforms(run: Run): Waveform[] {
  const original = run.waveforms || [], flow = run.current_flow;
  if (!flow || flow.revision !== run.revision || flow.project_id && flow.project_id !== run.project_id ||
    flow.run_id && flow.run_id !== run.id) return original;
  return [...original, ...flow.branches.filter(branch => !original.some(w => w.unit === 'A' && w.name === branch.source_vector))
    .map(branch => ({ name: `I: ${branch.name} [${branch.source_vector}]`, unit: 'A', x: flow.x, y: branch.values_A, x_unit: flow.x_unit }))];
}

export function axisUnit(run: Run, wave?: Waveform): string {
  return wave?.x_unit || String(run.measurements?.x_unit ||
    (run.kind.includes('dc') ? 'V' : run.kind.includes('ac') ? 'Hz' : 's'));
}

export function validateWaveform(wave: Waveform): void {
  if (!wave.x.length || wave.x.length !== wave.y.length) throw new Error('파형의 X/Y 표본 수가 일치해야 합니다.');
  for (let i = 0; i < wave.x.length; i++) {
    if (!Number.isFinite(wave.x[i]) || !Number.isFinite(wave.y[i])) throw new Error('파형에 유한하지 않은 표본이 있습니다.');
    if (i && wave.x[i] <= wave.x[i - 1]) throw new Error('X축 표본은 중복 없이 증가해야 합니다.');
  }
}

// Binary search followed by linear interpolation; never extrapolate.
export function interpolate(wave: Waveform, x: number): number {
  if (!Number.isFinite(x) || x < wave.x[0] || x > wave.x.at(-1)!) throw new Error('커서는 파형의 X축 범위 안에 있어야 합니다.');
  let lo = 0, hi = wave.x.length - 1;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (wave.x[mid] < x) lo = mid + 1; else hi = mid; }
  if (!lo || wave.x[lo] === x) return wave.y[lo];
  const t = (x - wave.x[lo - 1]) / (wave.x[lo] - wave.x[lo - 1]);
  return wave.y[lo - 1] + t * (wave.y[lo] - wave.y[lo - 1]);
}

export function clipWaveform(wave: Waveform, a: number, b: number): Waveform {
  validateWaveform(wave);
  const start = Math.min(a, b), end = Math.max(a, b);
  const first = interpolate(wave, start), last = interpolate(wave, end);
  const x = [start], y = [first];
  for (let i = 0; i < wave.x.length; i++) if (wave.x[i] > start && wave.x[i] < end) { x.push(wave.x[i]); y.push(wave.y[i]); }
  if (end > start) { x.push(end); y.push(last); }
  return { ...wave, x, y };
}

export function intervalStatistics(wave: Waveform, a: number, b: number): IntervalStatistics {
  const clipped = clipWaveform(wave, a, b);
  let min = Infinity, max = -Infinity, integral = 0, squareIntegral = 0;
  for (let i = 0; i < clipped.x.length; i++) {
    const v = clipped.y[i]; min = Math.min(min, v); max = Math.max(max, v);
    if (i) {
      const dx = clipped.x[i] - clipped.x[i - 1], u = clipped.y[i - 1];
      integral += dx * (u / 2 + v / 2);
      squareIntegral += dx * (u * u + u * v + v * v) / 3;
    }
  }
  const duration = clipped.x.at(-1)! - clipped.x[0];
  const result = { start: clipped.x[0], end: clipped.x.at(-1)!, count: clipped.x.length, min, max,
    peakToPeak: max - min, mean: duration ? integral / duration : clipped.y[0],
    rms: duration ? Math.sqrt(Math.max(0, squareIntegral / duration)) : Math.abs(clipped.y[0]),
    integral, valueA: interpolate(wave, a), valueB: interpolate(wave, b), delta: interpolate(wave, b) - interpolate(wave, a) };
  if (Object.values(result).some(value => !Number.isFinite(value))) throw new Error('측정이 수치 표현 범위를 초과했습니다.');
  return result;
}

export function crossings(wave: Waveform, threshold: number, edge: Edge): number[] {
  validateWaveform(wave);
  if (!Number.isFinite(threshold)) throw new Error('교차 기준은 유한한 수치여야 합니다.');
  const values: number[] = [];
  for (let i = 1; i < wave.x.length; i++) {
    const u = wave.y[i - 1], v = wave.y[i];
    if (edge === 'rising' ? u < threshold && v >= threshold : u > threshold && v <= threshold) {
      values.push(wave.x[i - 1] + (threshold - u) / (v - u) * (wave.x[i] - wave.x[i - 1]));
    }
  }
  return values;
}

export function timingMeasurements(wave: Waveform, a: number, b: number, low: number, high: number) {
  if (!Number.isFinite(low) || !Number.isFinite(high) || low >= high) throw new Error('Low level은 High level보다 작아야 합니다.');
  const clipped = clipWaveform(wave, a, b), span = high - low;
  const lower = low + span * .1, upper = low + span * .9, middle = low + span * .5;
  const duration = (edge: Edge) => {
    const from = edge === 'rising' ? lower : upper, to = edge === 'rising' ? upper : lower;
    const starts = crossings(clipped, from, edge), ends = crossings(clipped, to, edge);
    const aborted = crossings(clipped, from, edge === 'rising' ? 'falling' : 'rising');
    for (const start of starts) {
      const end = ends.find(value => value >= start);
      if (end !== undefined && !aborted.some(value => value > start && value < end)) return end - start;
    }
    return null;
  };
  const rising = crossings(clipped, middle, 'rising');
  const period = rising.length > 1 ? rising[1] - rising[0] : null;
  return { rise: duration('rising'), fall: duration('falling'), period, frequency: period && 1 / period,
    threshold: middle, risingEdges: rising.length, fallingEdges: crossings(clipped, middle, 'falling').length };
}

export function propagationDelay(trigger: Waveform, target: Waveform, a: number, b: number,
  triggerThreshold: number, targetThreshold: number, triggerEdge: Edge, targetEdge: Edge) {
  const source = crossings(clipWaveform(trigger, a, b), triggerThreshold, triggerEdge)[0];
  if (source === undefined) return null;
  const destination = crossings(clipWaveform(target, a, b), targetThreshold, targetEdge).find(x => x >= source);
  return destination === undefined ? null : { trigger: source, target: destination, delay: destination - source };
}

export function deriveWaveform(left: Waveform, right: Waveform, operation: WaveOperation, leftAxis: string, rightAxis: string): Waveform {
  validateWaveform(left); validateWaveform(right);
  if (leftAxis !== rightAxis) throw new Error('파형 연산에는 같은 X축 단위가 필요합니다.');
  if ((operation === 'add' || operation === 'subtract') && left.unit !== right.unit) throw new Error('덧셈·뺄셈에는 같은 Y축 단위가 필요합니다.');
  const start = Math.max(left.x[0], right.x[0]), end = Math.min(left.x.at(-1)!, right.x.at(-1)!);
  if (start > end) throw new Error('두 파형의 X축 범위가 겹치지 않습니다.');
  // Include both breakpoint sets: subtraction/integration remains exact for linear traces.
  const x = [...new Set([start, end, ...left.x.filter(v => v > start && v < end), ...right.x.filter(v => v > start && v < end)])].sort((a, b) => a - b);
  const y = x.map(value => {
    const a = interpolate(left, value), b = interpolate(right, value);
    if (operation === 'divide' && b === 0) throw new Error('분모 파형에 0이 있습니다. 0을 포함하지 않는 구간을 선택하세요.');
    return operation === 'add' ? a + b : operation === 'subtract' ? a - b : operation === 'multiply' ? a * b : a / b;
  });
  if (operation === 'divide' && right.y.some((v, i) => {
    if (!i || v * right.y[i - 1] >= 0) return false;
    const zero = right.x[i - 1] - right.y[i - 1] / (v - right.y[i - 1]) * (right.x[i] - right.x[i - 1]);
    return zero >= start && zero <= end;
  })) throw new Error('분모 파형이 구간 안에서 0을 통과합니다.');
  if (y.some(v => !Number.isFinite(v))) throw new Error('파형 연산이 수치 표현 범위를 초과했습니다.');
  const unit = operation === 'add' || operation === 'subtract' ? left.unit : operation === 'multiply'
    ? [left.unit, right.unit].sort().join('*') === 'A*V' ? 'W' : `${left.unit}·${right.unit}`
    : left.unit === right.unit ? '1' : left.unit === 'V' && right.unit === 'A' ? 'ohm' : `${left.unit}/${right.unit}`;
  return { name: `${left.name} ${ { add: '+', subtract: '−', multiply: '×', divide: '÷' }[operation]} ${right.name}`, unit, x, y, x_unit: leftAxis };
}

// Rendering only: retain min/max in every bucket so narrow pulses survive.
export function plotSamples(wave: Waveform, limit = 4000): [number, number][] {
  if (wave.x.length <= limit) return wave.x.map((x, i) => [x, wave.y[i]]);
  const output: [number, number][] = [[wave.x[0], wave.y[0]]];
  const stride = Math.ceil((wave.x.length - 2) / Math.max(1, Math.floor((limit - 2) / 2)));
  for (let start = 1; start < wave.x.length - 1; start += stride) {
    let min = start, max = start;
    for (let i = start; i < Math.min(wave.x.length - 1, start + stride); i++) { if (wave.y[i] < wave.y[min]) min = i; if (wave.y[i] > wave.y[max]) max = i; }
    for (const i of [...new Set([min, max])].sort((a, b) => a - b)) output.push([wave.x[i], wave.y[i]]);
  }
  output.push([wave.x.at(-1)!, wave.y.at(-1)!]); return output;
}

export function runStage(run: Run): 'pre' | 'post' | 'unknown' {
  if (run.analysis_stage) return run.analysis_stage === 'post-layout' ? 'post' : 'pre';
  return run.measurements?.post_layout === 'true' ? 'post' : run.measurements?.post_layout === 'false' ? 'pre' : 'unknown';
}

export function comparableRuns(a: Run, b: Run): boolean {
  const keys = ['analysis', 'corner', 'temperature_C', 'supply_V', 'duration_s', 'step_s', 'load_F', 'dc_sweep', 'vgs_bias'];
  return a.id !== b.id && a.project_id === b.project_id && a.revision === b.revision &&
    a.execution_status === 'completed' && b.execution_status === 'completed' &&
    a.workflow !== 'imported-results' && b.workflow !== 'imported-results' &&
    a.profile_id === b.profile_id && a.backend_profile_id === b.backend_profile_id && a.tool === b.tool &&
    runStage(a) !== 'unknown' && runStage(b) !== 'unknown' && runStage(a) !== runStage(b) &&
    typeof a.measurements?.analysis === 'string' && keys.every(key => a.measurements?.[key] === b.measurements?.[key]);
}

export function csvCell(value: string | number): string {
  if (typeof value === 'number') return String(value);
  const safe = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
