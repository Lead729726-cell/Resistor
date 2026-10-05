import { useEffect, useId, useMemo, useState } from 'react';
import type { Run } from '@mos/contracts';
import { parseTimeList, prepareFlow, snapshotFlow, testSignalResponse, voltageSignals, type ResponseConfig, type ResponseMode } from '../../analysis/src/signal-flow';
import { interpolate } from '../../analysis/src/waveform';
import { formatNumber } from './WavePlot';
import './signal-flow.css';

const show = (n: number | null | undefined, unit: string) => n == null ? '미저장' : `${formatNumber(n)} ${unit}`;
const numeric = (value: string) => { if (!value.trim() || !Number.isFinite(Number(value))) throw new Error('유한한 숫자를 입력하세요.'); return Number(value); };
function save(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function SignalFlowPanel({ run, revision, cursor, onCursor, onSelectDevice }: {
  run: Run; revision: number; cursor?: number; onCursor: (x: number) => void; onSelectDevice?: (id: string) => void;
}) {
  const arrowId = useId().replaceAll(':', '');
  const prepared = useMemo(() => {
    try { return { value: prepareFlow(run), error: null }; }
    catch (e) { return { value: null, error: e instanceof Error ? e.message : String(e) }; }
  }, [run]);
  const flow = prepared.value;
  const signals = useMemo(() => voltageSignals(run, flow).filter(s => s.wave.x_unit === 's'), [run, flow]);
  const [netFilter, setNetFilter] = useState(''), [selectedBranch, setBranch] = useState('');
  const [playing, setPlaying] = useState(false);
  const [inputId, setInput] = useState(''), [outputId, setOutput] = useState('');
  const input = signals.find(s => s.id === inputId) || signals.find(s => /^(A|IN|VIN|G)$/.test(s.name)) || signals[0];
  const output = signals.find(s => s.id === outputId) || signals.find(s => /^(Y|OUT|VOUT)$/.test(s.name)) || signals[1] || signals[0];
  const [mode, setMode] = useState<ResponseMode>('invert');
  const [times, setTimes] = useState('');
  const [settle, setSettle] = useState('0'), [windowText, setWindow] = useState('0');
  const supply = typeof run.measurements?.supply_V === 'number' ? run.measurements.supply_V : 1.8;
  const [low, setLow] = useState(String(supply * .3)), [high, setHigh] = useState(String(supply * .7));
  const [bits, setBits] = useState('1, 0'), [analogMin, setAnalogMin] = useState('0'), [analogMax, setAnalogMax] = useState(String(supply));
  const [result, setResult] = useState<ReturnType<typeof testSignalResponse> | null>(null), [error, setError] = useState<string | null>(null);
  const stale = run.freshness === 'stale' || run.current_flow?.freshness === 'stale' || run.revision !== revision;
  const eligible = !stale && run.execution_status === 'completed' && run.analysis_result === 'pass';
  const start = flow?.x[0] ?? input?.wave.x[0] ?? 0, end = flow?.x.at(-1) ?? input?.wave.x.at(-1) ?? 0;
  const x = cursor !== undefined && cursor >= start && cursor <= end ? cursor : start;
  const frame = useMemo(() => flow ? snapshotFlow(flow, x) : [], [flow, x]);
  const visible = frame.filter(b => !netFilter || b.from_net.toLowerCase() === netFilter.toLowerCase() || b.to_net.toLowerCase() === netFilter.toLowerCase());
  const selected = visible.find(b => b.id === selectedBranch) || visible[0];
  const defaultTimes = useMemo(() => input && output ? Array.from({ length: 8 }, (_, i) =>
    Math.max(input.wave.x[0], output.wave.x[0]) + (i + .5) / 8 * (Math.min(input.wave.x.at(-1)!, output.wave.x.at(-1)!) - Math.max(input.wave.x[0], output.wave.x[0]))).join(', ') : '', [input, output]);
  useEffect(() => { setResult(null); setError(null); }, [input, output, mode, times, settle, windowText, low, high, bits, analogMin, analogMax, revision, run.freshness]);
  useEffect(() => {
    if (!playing || end <= start || flow?.xUnit !== 's') return;
    const timer = setInterval(() => { const next = x + (end - start) / 100; if (next >= end) { onCursor(end); setPlaying(false); } else onCursor(next); }, 150);
    return () => clearInterval(timer);
  }, [playing, x, start, end, flow?.xUnit, onCursor]);
  const provenance = { run_id: run.id, project_id: run.project_id, revision: run.revision, current_revision: revision,
    freshness: stale ? 'stale' : 'current', tool: run.tool, workflow: run.workflow, execution_status: run.execution_status,
    analysis_result: run.analysis_result, native_execution: run.native_execution, imported_source: run.imported_source,
    flow_source: run.current_flow?.source, settings: run.measurements };
  const test = () => {
    try {
      if (!eligible) throw new Error('현재 revision의 성공한 해석 결과로 시험하세요.');
      if (!output) throw new Error('시간축 출력 전압을 선택하세요.');
      const config: ResponseConfig = { mode, times: parseTimeList(times || defaultTimes), settle: numeric(settle), window: numeric(windowText),
        low: numeric(low), high: numeric(high), ...(mode === 'manual' ? { manualBits: bits.split(/[,;\s]+/).filter(Boolean).map(Number) } : {}),
        ...(mode === 'analog' ? { analogMin: numeric(analogMin), analogMax: numeric(analogMax) } : {}) };
      setResult(testSignalResponse(input?.wave || null, output.wave, config)); setError(null);
    } catch (e) { setResult(null); setError(e instanceof Error ? e.message : String(e)); }
  };
  return <section className="signal-flow-panel" data-testid="signal-flow-panel" aria-label="전압·전류 및 신호 시험">
    <header><div><strong>전압·전류 흐름 / Signal flow</strong><small>같은 실행의 넷 전압과 signed 단자 전류 · r{run.revision}</small></div>
      <span className={stale ? 'sf-bad' : ''}>{stale ? 'STALE · 이전 설계 결과' : run.workflow === 'imported-results' ? '가져온 해석 표본' : '실제 해석 표본'}</span>
      <button className="button small" disabled={!flow} onClick={() => save(`signal-flow-${run.id.slice(0, 8)}.json`, { schema_version: 1, method: 'piecewise-linear synchronized native vectors', provenance, x, x_unit: flow?.xUnit,
        nodes: flow?.nodes.map(node => ({ net: node.name, source_vector: node.origin, voltage_V: interpolate(node.wave, x) })),
        branches: frame.map(({ values_A, ...row }) => row), scope: flow?.scope, omitted_nets: flow?.omitted })}>현재 흐름 JSON</button>
    </header>
    {prepared.error && <p role="alert">{prepared.error}</p>}
    {!flow ? <p>전류 데이터가 없습니다. Transient·DC·OP 해석을 실행하세요. 복소 AC에는 이 단자 방향 표시를 적용하지 않습니다.</p> : <>
      <div className="sf-timeline"><button className="button small" disabled={flow.xUnit !== 's' || start === end} onClick={() => { if (!playing && x >= end) onCursor(start); setPlaying(!playing); }}>{playing ? '일시정지' : '흐름 재생'}</button>
        <label>해석 위치 ({flow.xUnit})<input aria-label="흐름 해석 위치" type="range" min={start} max={end || 1} step={end > start ? (end - start) / 1000 : 1} value={x} disabled={start === end} onChange={e => { setPlaying(false); onCursor(Number(e.target.value)); }}/></label>
        <strong data-testid="flow-time">{show(x, flow.xUnit)}</strong></div>
      {!flow.nodes.length && <p className="sf-note">이전 결과에는 넷 전압이 없습니다. 해석을 다시 실행하면 양 끝 전압과 전압강하를 볼 수 있습니다.</p>}
      <div className="sf-net-list"><button className={!netFilter ? 'active' : ''} onClick={() => setNetFilter('')}>전체 넷</button>{flow.nodes.map(node => {
        const value = interpolate(node.wave, x);
        return <button key={node.id} className={netFilter === node.name ? 'active' : ''} data-net={node.name} data-voltage={value} onClick={() => setNetFilter(node.name)}><span>{node.name}</span><strong>{show(value, 'V')}</strong></button>;
      })}</div>
      {selected && <div className="sf-diagram"><svg viewBox="0 0 820 105" role="img" aria-label="선택한 단자 전류와 전압강하" data-testid="flow-diagram" data-direction={selected.direction}>
        <defs><marker id={arrowId} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto-start-reverse"><path d="M0 0L7 3.5L0 7Z" fill="currentColor"/></marker></defs>
        <line x1="165" y1="47" x2="310" y2="47" markerEnd={selected.direction === 'forward' ? `url(#${arrowId})` : undefined} markerStart={selected.direction === 'reverse' ? `url(#${arrowId})` : undefined}/>
        <line x1="510" y1="47" x2="655" y2="47" markerEnd={selected.direction === 'forward' ? `url(#${arrowId})` : undefined} markerStart={selected.direction === 'reverse' ? `url(#${arrowId})` : undefined}/>
        <text x="80" y="30" textAnchor="middle">{selected.from_net.slice(0, 24)}</text><text x="80" y="55" textAnchor="middle">{show(selected.from_voltage_V, 'V')}</text>
        <title>{selected.name} · {selected.actual_from} → {selected.actual_to}</title>
        <rect x="310" y="22" width="200" height="50" rx="5"/><text x="410" y="42" textAnchor="middle">{selected.name.split(' ')[0].slice(0, 22)}</text><text x="410" y="61" textAnchor="middle">{show(selected.current_A, 'A')}</text>
        <text x="740" y="30" textAnchor="middle">{selected.to_net.slice(0, 24)}</text><text x="740" y="55" textAnchor="middle">{show(selected.to_voltage_V, 'V')}</text>
        <text x="410" y="96" textAnchor="middle">ΔV (왼쪽−오른쪽) = {show(selected.voltage_drop_V, 'V')}</text>
      </svg></div>}
      <div className="sf-table"><table><thead><tr><th>소자 / branch</th><th>참조 from → to</th><th>V(from)</th><th>V(to)</th><th>ΔV(from−to)</th><th>Signed I</th><th>실제 기준 방향</th></tr></thead>
        <tbody>{visible.map(branch => <tr key={branch.id} data-branch={branch.id} data-current={branch.current_A} data-drop={branch.voltage_drop_V} data-direction={branch.direction} className={branch.id === selected?.id ? 'selected' : ''}>
          <td><button onClick={() => { setBranch(branch.id); if (branch.device_id && eligible) onSelectDevice?.(branch.device_id); }}>{branch.name}</button></td><td>{branch.from_net} → {branch.to_net}</td><td>{show(branch.from_voltage_V, 'V')}</td><td>{show(branch.to_voltage_V, 'V')}</td><td>{show(branch.voltage_drop_V, 'V')}</td><td>{show(branch.current_A, 'A')}</td><td>{branch.direction === 'zero' ? '≈0' : branch.direction === 'unknown' ? '미판정' : `${branch.actual_from} → ${branch.actual_to}`}</td>
        </tr>)}</tbody></table></div>
      {!visible.length && <p className="sf-note">선택 넷에 기록된 전류 branch가 없습니다. 게이트 전압이 있다는 사실로 게이트 전류를 추정하지 않습니다.</p>}
      <p className="sf-note">기준 방향은 conventional terminal current입니다. MOS의 D→S는 drain 단자 참조이며 전체 drain 전류가 source로만 흐른다는 뜻이 아닙니다. 이 도식은 단자 연결을 표시합니다.</p>
      <details><summary>저장 범위</summary><p className="sf-note">{flow.scope || '이 결과가 기록한 branch 범위'} · {flow.nodes.length} voltage nodes · {flow.branches.length} branches{flow.omitted.length ? ` · ${flow.omitted.length} nets omitted` : ''}</p>{flow.errors.map((error, index) => <p key={index} role="alert">{error}</p>)}</details>
    </>}
    {signals.length > 0 && <details className="sf-response" open><summary>입력 → 출력 신호 시험</summary>
      <div className="sf-inputs"><label>입력 신호<select aria-label="시험 입력 신호" value={input?.id || ''} onChange={e => setInput(e.target.value)}>{signals.map(s => <option value={s.id} key={s.id}>{s.name}</option>)}</select></label>
        <label>출력 신호<select aria-label="시험 출력 신호" value={output?.id || ''} onChange={e => setOutput(e.target.value)}>{signals.map(s => <option value={s.id} key={s.id}>{s.name}</option>)}</select></label>
        <label>기대 동작<select aria-label="시험 기대 동작" value={mode} onChange={e => setMode(e.target.value as ResponseMode)}><option value="invert">반전 (NOT)</option><option value="buffer">입력 그대로 (Buffer)</option><option value="manual">수동 0/1 기대값</option><option value="analog">아날로그 출력 범위</option></select></label></div>
      <div className="sf-inputs"><label className="sf-times">입력 평가 시간 (s / ns / µs)<input aria-label="신호 시험 시간" value={times || defaultTimes} onChange={e => setTimes(e.target.value)}/></label>
        <label>안정화 지연 (s)<input aria-label="시험 안정화 지연" type="number" step="any" min="0" value={settle} onChange={e => setSettle(e.target.value)}/></label>
        <label>출력 검사 구간 폭 (s)<input aria-label="시험 구간 폭" type="number" step="any" min="0" value={windowText} onChange={e => setWindow(e.target.value)}/></label></div>
      <div className="sf-inputs"><label>LOW 최대 (V)<input aria-label="시험 LOW 기준" type="number" step="any" value={low} onChange={e => setLow(e.target.value)}/></label><label>HIGH 최소 (V)<input aria-label="시험 HIGH 기준" type="number" step="any" value={high} onChange={e => setHigh(e.target.value)}/></label>
        {mode === 'manual' && <label>시간별 기대값 (0/1)<input aria-label="시험 수동 기대값" value={bits} onChange={e => setBits(e.target.value)}/></label>}
        {mode === 'analog' && <><label>출력 최소 (V)<input aria-label="시험 아날로그 최소" type="number" step="any" value={analogMin} onChange={e => setAnalogMin(e.target.value)}/></label><label>출력 최대 (V)<input aria-label="시험 아날로그 최대" type="number" step="any" value={analogMax} onChange={e => setAnalogMax(e.target.value)}/></label></>}
        <button className="button primary small" data-testid="run-signal-test" disabled={!eligible || !output} onClick={test}>저장된 결과로 신호 시험</button>
        <button className="button small" disabled={!result || !eligible} onClick={() => save(`signal-test-${run.id.slice(0, 8)}.json`, { provenance, input: input && { name: input.name, origin: input.origin }, output: output && { name: output.name, origin: output.origin }, verification: result })}>신호 시험 JSON</button></div>
      {stale && <p className="sf-bad">설계가 바뀌었습니다. 새 해석 후 현재 설계의 신호 시험을 실행하세요.</p>}{error && <p role="alert">{error}</p>}
      {result && <><strong data-testid="signal-test-result" className={result.pass ? 'sf-good' : 'sf-bad'}>{result.pass ? 'PASS' : 'FAIL'} · {result.passed}/{result.total}</strong>
        <div className="sf-table"><table><thead><tr><th>입력 평가 시간</th><th>Vin / 논리</th><th>출력 검사 구간</th><th>기대</th><th>Vout min / max</th><th>관측</th><th>판정</th></tr></thead><tbody>{result.rows.map(row => <tr key={row.index} data-testid="signal-test-case"><td><button onClick={() => onCursor(row.window_start_s)}>{show(row.time_s, 's')}</button></td><td>{show(row.input_V, 'V')} / {row.input_logic ?? '—'}</td><td>{show(row.window_start_s, 's')} – {show(row.window_end_s, 's')}</td><td>{mode === 'analog' ? `${analogMin}..${analogMax} V` : row.expected ?? '—'}</td><td>{show(row.output_min_V, 'V')} / {show(row.output_max_V, 'V')}</td><td>{mode === 'analog' ? row.result === 'unavailable' ? '미판정' : row.result === 'pass' ? '범위 내' : '범위 밖' : row.actual ?? '미판정'}</td><td className={row.result === 'pass' ? 'sf-good' : 'sf-bad'}>{row.result.toUpperCase()}{row.error && <small>{row.error}</small>}</td></tr>)}</tbody></table></div></>}
      <p className="sf-note">입력은 평가 시각에서 판정하며 출력은 안정화 지연 이후 검사 구간 전체의 min/max로 확인합니다. 저장된 표본 사이를 선형 보간하며, 해석 step보다 짧아 기록되지 않은 펄스는 검출할 수 없습니다. 시험 행을 클릭하면 해당 시각의 흐름과 파형 커서가 이동합니다.</p>
    </details>}
  </section>;
}
