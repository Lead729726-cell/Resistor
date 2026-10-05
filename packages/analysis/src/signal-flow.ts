import type { CurrentBranch, Run, Waveform } from '../../contracts/src/index';
import { axisUnit, interpolate, intervalStatistics, validateWaveform } from './waveform';

export interface VoltageSignal { id: string; name: string; wave: Waveform; origin: string }
export interface PreparedFlow {
  x: number[]; xUnit: string; nodes: VoltageSignal[];
  branches: { branch: CurrentBranch; wave: Waveform | null; error: string | null }[];
  errors: string[]; scope?: string; omitted: string[];
}
function valid(wave: Waveform) { try { validateWaveform(wave); return null; } catch (e) { return e instanceof Error ? e.message : String(e); } }
export function prepareFlow(run: Run): PreparedFlow | null {
  const flow = run.current_flow;
  if (!flow) return null;
  if (flow.revision !== run.revision || flow.project_id && flow.project_id !== run.project_id || flow.run_id && flow.run_id !== run.id)
    throw new Error('전류·전압 데이터의 run/project/revision이 일치하지 않습니다.');
  validateWaveform({ name: 'axis', unit: '1', x: flow.x, y: flow.x });
  const errors: string[] = [], seen = new Set<string>();
  const nodes: VoltageSignal[] = [];
  for (const node of flow.node_voltages || []) {
    const wave = { name: node.net, unit: 'V', x: flow.x, y: node.values_V, x_unit: flow.x_unit };
    const error = valid(wave), key = node.net.toLowerCase();
    if (error || seen.has(key)) { errors.push(`${node.net}: ${error || '중복 node'}`); continue; }
    seen.add(key); nodes.push({ id: `node:${node.net}`, name: node.net, wave, origin: node.source_vector });
  }
  const branches = flow.branches.map(branch => {
    const wave = { name: branch.name, unit: 'A', x: flow.x, y: branch.values_A, x_unit: flow.x_unit };
    const error = valid(wave); if (error) errors.push(`${branch.name}: ${error}`);
    return { branch, wave: error ? null : wave, error };
  });
  return { x: flow.x, xUnit: flow.x_unit, nodes, branches, errors, scope: flow.voltage_probe_scope, omitted: flow.omitted_voltage_nets || [] };
}
export function voltageSignals(run: Run, prepared: PreparedFlow | null): VoltageSignal[] {
  return [...(prepared?.nodes || []), ...(run.waveforms || []).flatMap((wave, index) =>
    wave.unit === 'V' && !valid(wave) ? [{ id: `wave:${index}`, name: `${wave.name} (파형)`, wave: { ...wave, x_unit: axisUnit(run, wave) }, origin: 'saved-waveform-vector' }] : [])];
}
export function snapshotFlow(prepared: PreparedFlow, x: number, zeroTolerance = 1e-15) {
  if (!Number.isFinite(x) || x < prepared.x[0] || x > prepared.x.at(-1)!) throw new Error('탐색 위치는 저장된 해석 범위 안이어야 합니다.');
  if (!Number.isFinite(zeroTolerance) || zeroTolerance < 0) throw new Error('0 전류 표시 기준은 0 이상이어야 합니다.');
  const voltages = new Map(prepared.nodes.map(node => [node.wave.name.toLowerCase(), interpolate(node.wave, x)]));
  return prepared.branches.map(({ branch, wave, error }) => {
    const current = wave ? interpolate(wave, x) : null;
    const fromVoltage = voltages.get(branch.from_net.toLowerCase()) ?? null, toVoltage = voltages.get(branch.to_net.toLowerCase()) ?? null;
    const direction = current === null ? 'unknown' : Math.abs(current) <= zeroTolerance ? 'zero' : current > 0 ? 'forward' : 'reverse';
    return { ...branch, current_A: current, from_voltage_V: fromVoltage, to_voltage_V: toVoltage,
      voltage_drop_V: fromVoltage === null || toVoltage === null ? null : fromVoltage - toVoltage,
      direction, actual_from: direction === 'reverse' ? branch.to_net : branch.from_net,
      actual_to: direction === 'reverse' ? branch.from_net : branch.to_net, error };
  });
}
export type ResponseMode = 'buffer' | 'invert' | 'manual' | 'analog';
export function parseTimeList(text: string): number[] {
  const scale: Record<string, number> = { s: 1, ms: 1e-3, us: 1e-6, 'µs': 1e-6, ns: 1e-9, ps: 1e-12 };
  const parts = text.split(/[,;\n]+/).map(p => p.trim()).filter(Boolean);
  if (!parts.length || parts.length > 256) throw new Error('시험 시간을 1~256개 입력하세요. 예: 2ns, 7ns, 12ns');
  return parts.map(part => {
    const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*(ps|ns|us|µs|ms|s)?$/.exec(part);
    if (!match) throw new Error(`시간 입력을 확인하세요: ${part}`);
    const value = Number(match[1]) * (scale[match[2] || 's']);
    if (!Number.isFinite(value)) throw new Error('시간은 유한한 숫자여야 합니다.');
    return value;
  });
}
export interface ResponseConfig {
  mode: ResponseMode; times: number[]; settle: number; window: number; low: number; high: number;
  manualBits?: number[]; analogMin?: number; analogMax?: number;
}
export type LogicState = 0 | 1 | 'X';
export const logicState = (min: number, max: number, low: number, high: number): LogicState => max <= low ? 0 : min >= high ? 1 : 'X';
export function testSignalResponse(input: Waveform | null, output: Waveform, config: ResponseConfig) {
  if (!['buffer', 'invert', 'manual', 'analog'].includes(config.mode)) throw new Error('지원하지 않는 신호 시험 모드입니다.');
  validateWaveform(output); if (input) validateWaveform(input);
  if (output.x_unit !== 's' || input && input.x_unit !== 's') throw new Error('신호 시험에는 시간축(s)의 전압 파형이 필요합니다.');
  if (output.unit !== 'V' || input && input.unit !== 'V') throw new Error('신호 시험에는 전압(V) 파형이 필요합니다.');
  if (!config.times.length || config.times.length > 256 || config.times.some(t => !Number.isFinite(t))) throw new Error('시험 시간은 유한한 수치 1~256개로 입력하세요.');
  if (![config.settle, config.window, config.low, config.high].every(Number.isFinite) || config.settle < 0 || config.window < 0 || config.low >= config.high) throw new Error('안정화 시간·검사 폭은 0 이상, LOW 기준은 HIGH 기준보다 작아야 합니다.');
  if ((config.mode === 'buffer' || config.mode === 'invert') && !input) throw new Error('입력 신호를 선택하세요.');
  if (config.mode === 'manual' && (config.manualBits?.length !== config.times.length || config.manualBits.some(bit => bit !== 0 && bit !== 1))) throw new Error('각 시험 시간에 대응하는 기대값 0/1을 입력하세요.');
  if (config.mode === 'analog' && (!Number.isFinite(config.analogMin) || !Number.isFinite(config.analogMax) || config.analogMin! > config.analogMax!)) throw new Error('유한한 아날로그 허용 범위를 지정하세요.');
  const rows = config.times.map((time, index) => {
    let inputVoltage: number | null = null, inputLogic: LogicState | null = null;
    let expected: LogicState | null = null, min: number | null = null, max: number | null = null;
    let actual: LogicState | null = null, error: string | null = null, pass = false;
    try {
      if (input && time >= input.x[0] && time <= input.x.at(-1)!) {
        inputVoltage = interpolate(input, time); inputLogic = logicState(inputVoltage, inputVoltage, config.low, config.high);
      }
      if ((config.mode === 'buffer' || config.mode === 'invert') && inputLogic === null) throw new Error('입력 시간 범위 밖입니다.');
      expected = config.mode === 'manual' ? config.manualBits![index] as 0 | 1 : config.mode === 'analog' ? null
        : inputLogic === 'X' ? 'X' : config.mode === 'invert' ? inputLogic === 1 ? 0 : 1 : inputLogic;
      const start = time + config.settle, end = start + config.window;
      const stats = intervalStatistics(output, start, end); min = stats.min; max = stats.max;
      actual = config.mode === 'analog' ? null : logicState(min, max, config.low, config.high);
      pass = config.mode === 'analog' ? min >= config.analogMin! && max <= config.analogMax! : expected !== 'X' && expected !== null && actual === expected;
    } catch (e) { error = e instanceof Error ? e.message : String(e); }
    return { index, time_s: time, window_start_s: time + config.settle, window_end_s: time + config.settle + config.window,
      input_V: inputVoltage, input_logic: inputLogic, expected, output_min_V: min, output_max_V: max, actual,
      result: error ? 'unavailable' : pass ? 'pass' : 'fail', error };
  });
  return { rows, passed: rows.filter(row => row.result === 'pass').length, total: rows.length,
    pass: rows.every(row => row.result === 'pass'), method: 'piecewise-linear full-window voltage envelope', config };
}
