import { useMemo, useState } from 'react';
import type { Run, Waveform } from '@mos/contracts';
import { axisUnit, clipWaveform, csvCell, deriveWaveform, intervalStatistics, measurementWaveforms, propagationDelay, runStage, timingMeasurements, validateWaveform, type Edge, type WaveOperation } from '../../analysis/src/waveform';
import WavePlot, { formatNumber } from './WavePlot';
import SignalFlowPanel from './SignalFlowPanel';
import './waveform-workbench.css';

const numberInput = (text: string) => {
  if (!text.trim() || !Number.isFinite(Number(text))) throw new Error('유한한 숫자를 입력하세요. 단위는 각 입력란에 표시됩니다.');
  return Number(text);
};
const evaluate = <T,>(fn: () => T): { value: T | null; error: string | null } => {
  try { return { value: fn(), error: null }; } catch (error) { return { value: null, error: error instanceof Error ? error.message : String(error) }; }
};
const display = (value: number | null | undefined, unit = '') => value === null || value === undefined ? '교차 없음' : `${formatNumber(value)} ${unit}`;
function download(name: string, data: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type })), link = document.createElement('a');
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function WaveformWorkbench({ run, compare, revision, onSelectDevice }: { run?: Run; compare?: Run; revision: number; onSelectDevice?: (id: string) => void }) {
  const sources = useMemo(() => [run, compare].filter((r): r is Run => !!r).flatMap(r => measurementWaveforms(r).map((wave, i) => ({
    id: `${r.id}/${i}`, wave, run: r, axis: axisUnit(r, wave), label: `${wave.name}${compare ? ` · ${runStage(r)} · ${r.id.slice(0, 6)}` : ''}`
  }))), [run, compare]);
  const usable = useMemo(() => sources.filter(s => !evaluate(() => validateWaveform(s.wave)).error), [sources]);
  const [selected, setSelected] = useState('');
  const source = usable.find(s => s.id === selected) || usable[0];
  const [targetId, setTargetId] = useState('');
  const target = usable.find(s => s.id === targetId) || usable[1] || source;
  const [delayId, setDelayId] = useState('');
  const delaySignals = usable.filter(s => s.run.id === source?.run.id && s.axis === 's');
  const delayTarget = delaySignals.find(s => s.id === delayId) || delaySignals.find(s => s.id !== source?.id) || source;
  const [aText, setA] = useState(''), [bText, setB] = useState('');
  const [cursorTarget, setCursorTarget] = useState<'A' | 'B'>('A');
  const [zoom, setZoom] = useState(false);
  const [lowText, setLow] = useState('0'), [highText, setHigh] = useState('1.8');
  const [triggerText, setTrigger] = useState('0.9'), [targetText, setTarget] = useState('0.9');
  const [triggerEdge, setTriggerEdge] = useState<Edge>('rising'), [targetEdge, setTargetEdge] = useState<Edge>('falling');
  const [operation, setOperation] = useState<WaveOperation>('subtract');
  const [showMath, setShowMath] = useState(false);
  const interval = useMemo(() => evaluate(() => {
    if (!source) throw new Error('측정 가능한 파형이 없습니다.');
    const a = numberInput(aText || String(source.wave.x[0])), b = numberInput(bText || String(source.wave.x.at(-1)));
    return { a, b, stats: intervalStatistics(source.wave, a, b) };
  }), [source, aText, bText]);
  const timing = useMemo(() => evaluate(() => {
    if (!source || source.axis !== 's' || !interval.value) return null;
    return timingMeasurements(source.wave, interval.value.a, interval.value.b, numberInput(lowText), numberInput(highText));
  }), [source, interval.value, lowText, highText]);
  const delay = useMemo(() => evaluate(() => {
    if (!source || !delayTarget || source.axis !== 's' || delayTarget.axis !== 's' || !interval.value) return null;
    if (source.run.id !== delayTarget.run.id) throw new Error('전파 지연은 같은 실행의 입력·출력 파형으로 측정하세요.');
    return propagationDelay(source.wave, delayTarget.wave, interval.value.a, interval.value.b,
      numberInput(triggerText), numberInput(targetText), triggerEdge, targetEdge);
  }), [source, delayTarget, interval.value, triggerText, targetText, triggerEdge, targetEdge]);
  const derived = useMemo(() => evaluate(() => {
    if (!showMath || !source || !target || !interval.value) return null;
    return deriveWaveform(clipWaveform(source.wave, interval.value.a, interval.value.b),
      clipWaveform(target.wave, interval.value.a, interval.value.b), operation, source.axis, target.axis);
  }), [showMath, source, target, interval.value, operation]);
  const extra = useMemo(() => derived.value ? [derived.value] : [], [derived.value]);
  const mathStats = useMemo(() => evaluate(() => derived.value
    ? intervalStatistics(derived.value, derived.value.x[0], derived.value.x.at(-1)!) : null), [derived.value]);
  const stats = interval.value?.stats;
  const stale = !!run && (run.freshness === 'stale' || run.revision !== revision);
  const provenance = (r: Run) => ({ run_id: r.id, project_id: r.project_id, revision: r.revision,
    current_revision: revision, freshness: r.freshness === 'stale' || r.revision !== revision ? 'stale' : 'current',
    tool: r.tool, workflow: r.workflow, native_execution: r.native_execution,
    execution_status: r.execution_status, analysis_result: r.analysis_result, imported_source: r.imported_source,
    settings: r.measurements, stage: runStage(r) });
  const report = () => ({ schema_version: 1, method: 'piecewise-linear-sampled-waveforms',
    notes: ['Metrics are sampled waveform measurements, not STA or foundry sign-off.',
      'Mean/integral use trapezoidal integration; RMS integrates the square of linear segments.',
      'Timing uses the first complete edge/pair in the selected interval; missing edges remain null.',
      'Derived multiply/divide traces are sampled approximations between breakpoints.'],
    source: source && provenance(source.run), signal: source?.wave.name, signal_origin: source?.wave.name.startsWith('I: ') ? 'signed-current-flow-branch' : 'waveform-vector', x_unit: source?.axis, y_unit: source?.wave.unit,
    cursors: interval.value && { a: interval.value.a, b: interval.value.b }, statistics: stats,
    timing: source?.axis === 's' ? { low: evaluate(() => numberInput(lowText)).value,
      high: evaluate(() => numberInput(highText)).value, ...timing.value } : null,
    propagation: source?.axis === 's' ? { target: delayTarget?.wave.name, target_source: delayTarget && provenance(delayTarget.run),
      trigger_edge: triggerEdge, target_edge: targetEdge, trigger_threshold: evaluate(() => numberInput(triggerText)).value,
      target_threshold: evaluate(() => numberInput(targetText)).value, result: delay.value, error: delay.error } : null,
    math: showMath ? { operation, right_signal: target?.wave.name, right_source: target && provenance(target.run),
      output: derived.value && { name: derived.value.name, unit: derived.value.unit, samples: derived.value.x.length },
      statistics: mathStats.value, error: derived.error || mathStats.error } : null });
  const csv = () => {
    if (!source || !interval.value) return;
    const wave: Waveform = derived.value || clipWaveform(source.wave, interval.value.a, interval.value.b);
    const metadata = JSON.stringify({ ...report(), exported_signal: wave.name, exported_unit: wave.unit });
    const rows = [[`x (${source.axis})`, `${wave.name} (${wave.unit})`, 'provenance_json'].map(csvCell).join(',')];
    for (let i = 0; i < wave.x.length; i++) rows.push([csvCell(wave.x[i]), csvCell(wave.y[i]), i ? '' : csvCell(metadata)].join(','));
    download(`waveform-${run?.id.slice(0, 8)}.csv`, rows.join('\r\n'), 'text/csv;charset=utf-8');
  };
  return <>
    {run && <SignalFlowPanel run={run} revision={revision} cursor={interval.value?.a} onCursor={x => setA(String(x))} onSelectDevice={onSelectDevice}/>}
    <WavePlot run={run} compare={compare} extra={extra} inspected={source?.wave.name.startsWith('I: ') ? source.wave : undefined}
      xRange={zoom && stats ? [stats.start, stats.end] : undefined}
      cursors={interval.value ? { a: interval.value.a, b: interval.value.b } : undefined}
      onCursor={x => cursorTarget === 'A' ? setA(String(x)) : setB(String(x))}/>
    {source && <section className="waveform-workbench" aria-label="파형 측정 도구" data-testid="waveform-workbench">
      <header><div><strong>파형 측정 / Waveform lab</strong><small>{source.run.tool || '결과 파일'} · r{source.run.revision} · {source.run.id.slice(0, 8)}{source.run.workflow === 'imported-results' ? ' · 외부 파일' : ''}</small></div>
        <span className={stale ? 'wave-stale' : ''}>{stale ? `STALE · 현재 r${revision}` : '표본 기반 측정'}</span>
        <button className="button small" disabled={!stats} onClick={() => download(`measurements-${run?.id.slice(0, 8)}.json`, JSON.stringify(report(), null, 2), 'application/json')}>측정 JSON</button>
        <button className="button small" disabled={!stats || showMath && !!derived.error} onClick={csv}>구간 CSV</button>
      </header>
      {sources.length !== usable.length && <p role="alert">{sources.length - usable.length}개 파형은 중복 X축 또는 비정상 표본 때문에 측정에서 제외했습니다.</p>}
      <div className="wave-lab-inputs">
        <label>측정 신호<select aria-label="측정 신호" value={source.id} onChange={e => { setSelected(e.target.value); setA(''); setB(''); setShowMath(false); }}>
          {usable.map(s => <option key={s.id} value={s.id}>{s.label} ({s.wave.unit})</option>)}</select></label>
        <label>커서 A ({source.axis})<input aria-label="커서 A" type="number" step="any" value={aText || String(source.wave.x[0])} onChange={e => setA(e.target.value)}/></label>
        <label>커서 B ({source.axis})<input aria-label="커서 B" type="number" step="any" value={bText || String(source.wave.x.at(-1))} onChange={e => setB(e.target.value)}/></label>
        <label>차트 클릭<select aria-label="차트 커서 선택" value={cursorTarget} onChange={e => setCursorTarget(e.target.value as 'A' | 'B')}><option>A</option><option>B</option></select></label>
        <label className="wave-lab-check"><input type="checkbox" checked={zoom} disabled={!stats || stats.start === stats.end} onChange={e => setZoom(e.target.checked)}/>A–B 확대</label>
        <button className="button small" onClick={() => { setA(''); setB(''); setZoom(false); }}>전체 구간</button>
      </div>
      {interval.error && <p role="alert">{interval.error}</p>}
      {stats && <div className="wave-lab-results">
        {([['A', stats.valueA, source.wave.unit], ['B', stats.valueB, source.wave.unit], ['ΔY (B−A)', stats.delta, source.wave.unit],
          ['ΔX (B−A)', interval.value!.b - interval.value!.a, source.axis], ['Min', stats.min, source.wave.unit], ['Max', stats.max, source.wave.unit],
          ['Peak-to-peak', stats.peakToPeak, source.wave.unit], ['Mean', stats.mean, source.wave.unit], ['RMS', stats.rms, source.wave.unit],
          ['Integral', stats.integral, source.wave.unit === 'W' && source.axis === 's' ? 'J' : source.wave.unit === 'A' && source.axis === 's' ? 'C' : `${source.wave.unit}·${source.axis}`]] as const)
          .map(([label, value, unit]) => <div key={label} data-metric={label}><span>{label}</span><strong>{display(value, unit)}</strong></div>)}
      </div>}
      <p className="wave-lab-note">커서는 선형 보간합니다. Mean·RMS는 X축 간격으로 가중하며 적분은 A/B 순서에 관계없이 작은 X에서 큰 X 방향입니다.</p>
      <details>
        <summary>파형 연산 · 차동 전압 / 전력</summary>
        <div className="wave-lab-inputs"><label>대상 신호<select aria-label="연산 대상 신호" value={target?.id || ''} onChange={e => setTargetId(e.target.value)}>{usable.map(s => <option key={s.id} value={s.id}>{s.label} ({s.wave.unit})</option>)}</select></label>
          <label>연산<select aria-label="파형 연산" value={operation} onChange={e => setOperation(e.target.value as WaveOperation)}><option value="subtract">A − B</option><option value="add">A + B</option><option value="multiply">A × B (V × A → W)</option><option value="divide">A ÷ B</option></select></label>
          <label className="wave-lab-check"><input aria-label="연산 파형 표시" type="checkbox" checked={showMath} onChange={e => setShowMath(e.target.checked)}/>연산 파형 표시</label></div>
        {derived.error && <p role="alert">{derived.error}</p>}
        {mathStats.error && <p role="alert">{mathStats.error}</p>}
        {derived.value && mathStats.value && <div className="wave-lab-results">
          <div data-metric="Math mean"><span>Math mean</span><strong>{display(mathStats.value.mean, derived.value.unit)}</strong></div>
          <div data-metric="Math RMS"><span>Math RMS</span><strong>{display(mathStats.value.rms, derived.value.unit)}</strong></div>
          <div data-metric="Math integral"><span>{derived.value.unit === 'W' && source.axis === 's' ? 'Energy' : 'Math integral'}</span><strong>{display(mathStats.value.integral, derived.value.unit === 'W' && source.axis === 's' ? 'J' : `${derived.value.unit}·${source.axis}`)}</strong></div>
        </div>}
        <p className="wave-lab-note">같은 X축의 공통 구간을 보간합니다. CSV는 연산 신호를 저장합니다. 곱셈·나눗셈은 표본 사이에서 근사되며 전류 부호는 원본 기준을 따릅니다.</p>
      </details>
      {source.axis === 's' && <details><summary>상승·하강 시간 / 주기 / 전파 지연</summary>
        <div className="wave-lab-inputs"><label>Low ({source.wave.unit})<input aria-label="Low level" type="number" step="any" value={lowText} onChange={e => setLow(e.target.value)}/></label>
          <label>High ({source.wave.unit})<input aria-label="High level" type="number" step="any" value={highText} onChange={e => setHigh(e.target.value)}/></label></div>
        {timing.error && <p role="alert">{timing.error}</p>}
        <div className="wave-lab-results">{([['Rise 10–90%', timing.value?.rise, 's'], ['Fall 90–10%', timing.value?.fall, 's'], ['Period (50%)', timing.value?.period, 's'], ['Frequency', timing.value?.frequency, 'Hz']] as const)
          .map(([label, value, unit]) => <div key={label} data-metric={label}><span>{label}</span><strong>{display(value, unit)}</strong></div>)}</div>
        <div className="wave-lab-inputs"><label>출력 신호<select aria-label="지연 대상 신호" value={delayTarget?.id || ''} onChange={e => setDelayId(e.target.value)}>{delaySignals.map(s => <option key={s.id} value={s.id}>{s.label} ({s.wave.unit})</option>)}</select></label>
          <label>입력 기준 ({source.wave.unit})<input aria-label="지연 입력 기준" type="number" step="any" value={triggerText} onChange={e => setTrigger(e.target.value)}/></label>
          <label>출력 기준 ({delayTarget?.wave.unit})<input aria-label="지연 출력 기준" type="number" step="any" value={targetText} onChange={e => setTarget(e.target.value)}/></label>
          <label>입력 edge<select aria-label="지연 입력 edge" value={triggerEdge} onChange={e => setTriggerEdge(e.target.value as Edge)}><option value="rising">Rising</option><option value="falling">Falling</option></select></label>
          <label>출력 edge<select aria-label="지연 출력 edge" value={targetEdge} onChange={e => setTargetEdge(e.target.value as Edge)}><option value="rising">Rising</option><option value="falling">Falling</option></select></label></div>
        {delay.error && <p role="alert">{delay.error}</p>}
        <div className="wave-lab-results"><div data-metric="Propagation delay"><span>Propagation delay</span><strong>{display(delay.value?.delay, 's')}</strong></div></div>
        <p className="wave-lab-note">선택 구간의 첫 완전한 전이를 측정합니다. 지연은 첫 입력 교차 이후의 첫 출력 교차입니다. 글리치·서로 다른 주기의 교차는 구간을 좁혀 확인하세요.</p>
      </details>}
    </section>}
  </>;
}
