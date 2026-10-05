import { useMemo, useState } from 'react';
import type { Run } from '@mos/contracts';
import type { Waveform } from '@mos/contracts';
import { axisUnit as getAxisUnit, interpolate, plotSamples, runStage } from '../../analysis/src/waveform';

export const formatNumber = (value: number) => {
  if (value === 0) return '0';
  const scales: [number, string][] = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];
  const scale = scales.find(([factor]) => Math.abs(value) >= factor) || scales[scales.length - 1];
  return `${Number((value / scale[0]).toPrecision(4))}${scale[1]}`;
};
const colors = ['var(--wave-1)', 'var(--wave-2)', 'var(--wave-3)', 'var(--wave-4)', 'var(--wave-5)'];
export default function WavePlot({ run, compare, extra, inspected, xRange, cursors, onCursor }: {
  run: Run | undefined; compare?: Run; extra?: Waveform[]; inspected?: Waveform; xRange?: [number, number];
  cursors?: { a: number; b: number }; onCursor?: (x: number) => void;
}) {
  const [hidden, setHidden] = useState<string[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [logFrequency, setLogFrequency] = useState(true);
  const axisUnit = run ? getAxisUnit(run, run.waveforms?.[0]) : 's';
  const waveforms = useMemo(() => {
    const sources = compare ? [compare, run].filter((source): source is Run => !!source) : run ? [run] : [];
    return [...sources.flatMap((source, sourceIndex) => (source.waveforms || [])
      .filter(w => w.x.length && w.x.length === w.y.length && getAxisUnit(source, w) === axisUnit)
      .map(w => ({ ...w, name: compare ? `${w.name} · ${runStage(source)}` : w.name, dashed: !!compare && sourceIndex === 0 }))),
      ...(extra || []).filter(w => w.x_unit === axisUnit).map(w => ({ ...w, name: `Math: ${w.name}`, dashed: false })),
      ...(inspected && inspected.x_unit === axisUnit ? [{ ...inspected, dashed: false }] : [])];
  }, [run, compare, extra, inspected, axisUnit]);
  const visible = useMemo(() => waveforms.filter(w => !hidden.includes(w.name)), [waveforms, hidden]);
  const units = [...new Set(visible.map(w => w.unit || 'value'))];
  const range = useMemo(() => {
    let xmin = Infinity, xmax = -Infinity;
    const axes: Record<string, { ymin: number; ymax: number }> = {};
    visible.forEach(w => {
      const unit = w.unit || 'value';
      const values = axes[unit] ??= { ymin: Infinity, ymax: -Infinity };
      w.x.forEach((x, i) => {
        if (Number.isFinite(x) && Number.isFinite(w.y[i])) {
          xmin = Math.min(xmin, x); xmax = Math.max(xmax, x);
          if (!xRange || x >= xRange[0] && x <= xRange[1]) {
            values.ymin = Math.min(values.ymin, w.y[i]); values.ymax = Math.max(values.ymax, w.y[i]);
          }
        }
      });
      if (xRange) for (const x of xRange) {
        if (x >= w.x[0] && x <= w.x.at(-1)!) {
          const y = interpolate(w, x); values.ymin = Math.min(values.ymin, y); values.ymax = Math.max(values.ymax, y);
        }
      }
    });
    for (const values of Object.values(axes)) {
      if (!Number.isFinite(values.ymin)) { values.ymin = 0; values.ymax = 1; }
      const pad = (values.ymax - values.ymin || Math.abs(values.ymax) || 1) * .08;
      values.ymin -= pad; values.ymax += pad;
    }
    if (!Number.isFinite(xmin)) { xmin = 0; xmax = 1; }
    if (xRange && xRange[1] > xRange[0]) { xmin = xRange[0]; xmax = xRange[1]; }
    return { xmin, xmax: xmax === xmin ? xmin + 1 : xmax, axes };
  }, [visible, xRange]);
  const rendered = useMemo(() => visible.map(w => {
    let wave = w;
    if (xRange) {
      const start = Math.max(xRange[0], w.x[0]), end = Math.min(xRange[1], w.x.at(-1)!);
      if (start > end) return { wave: w, points: [] };
      const x: number[] = [start], y: number[] = [interpolate(w, start)];
      for (let i = 0; i < w.x.length; i++) if (w.x[i] > start && w.x[i] < end) { x.push(w.x[i]); y.push(w.y[i]); }
      if (end > start) { x.push(end); y.push(interpolate(w, end)); }
      wave = { ...w, x, y };
    }
    return { wave: w, points: plotSamples(wave) };
  }), [visible, xRange]);
  const width = 820, height = 420, left = 68, right = 25 + Math.max(0, units.length - 1) * 60, top = 28, bottom = 58;
  const logarithmic = axisUnit === 'Hz' && logFrequency && range.xmin > 0;
  const xValue = (fraction: number) => logarithmic ? Math.pow(10, Math.log10(range.xmin) + fraction * (Math.log10(range.xmax) - Math.log10(range.xmin))) : range.xmin + fraction * (range.xmax - range.xmin);
  const sx = (x: number) => left + (logarithmic ? (Math.log10(x) - Math.log10(range.xmin)) / (Math.log10(range.xmax) - Math.log10(range.xmin)) : (x - range.xmin) / (range.xmax - range.xmin)) * (width - left - right);
  const sy = (y: number, unit: string) => {
    const values = range.axes[unit || 'value'];
    return height - bottom - (y - values.ymin) / (values.ymax - values.ymin) * (height - top - bottom);
  };
  const axisX = (index: number) => index === 0 ? left - 12 : width - right + 12 + (index - 1) * 60;
  const unitColor = (unit: string) => colors[waveforms.findIndex(w => (w.unit || 'value') === unit) % colors.length];
  if (!waveforms.length) return <div className="empty-plot"><div className="empty-wave">⌁</div><h3>실제 해석 결과를 기다리고 있습니다</h3><p>ngspice를 실행하면 저장된 raw 데이터의 파형이 여기에 표시됩니다.</p><span className="tag">No synthetic waveform</span>{run?.message && <p className="run-error">{run.message}</p>}</div>;
  if (axisUnit === 'point') return <div className="operating-point-results"><div className="operating-point-heading"><strong>실제 operating point</strong><span>{run?.workflow === 'imported-results' ? 'EXTERNAL FILE' : `${run?.tool?.toUpperCase() || 'ENGINE'} RAW`} · {waveforms[0].x.length} point{compare ? ' · pre / post' : ''}</span></div><div className="operating-point-grid">{waveforms.map((waveform, index) => <div key={waveform.name}><span style={{ color: colors[index % colors.length] }}>{waveform.name}</span><strong>{formatNumber(waveform.y.at(-1)!)}</strong><small>{waveform.unit}</small></div>)}</div><p>{run?.workflow === 'imported-results' ? '외부 파일에서 읽은 operating point 수치입니다. 엔진 실행과 물리적 대응을 검증하지 않습니다.' : '실제 model의 DC 동작점입니다. gm / gds / Vth / Vdsat은 해당 raw vector가 반환된 경우에만 표시합니다.'}</p></div>;
  const cursorX = cursor === null ? null : xValue(cursor);
  const axis = `${run?.measurements?.x_label || (axisUnit === 'V' ? 'Sweep voltage' : axisUnit === 'Hz' ? 'Frequency' : axisUnit === 'point' ? 'Operating point' : 'Time')} (${axisUnit})`;
  return <div className="waveplot">
    <div className="wave-legend">{waveforms.map((waveform, index) => <button key={waveform.name} className={hidden.includes(waveform.name) ? 'muted' : ''} onClick={() => setHidden(current => current.includes(waveform.name) ? current.filter(name => name !== waveform.name) : [...current, waveform.name])}><i style={{ background: colors[index % colors.length] }}/>{waveform.name}<span>{waveform.unit}</span></button>)}{axisUnit === 'Hz' && <label className="log-frequency"><input type="checkbox" checked={logFrequency} onChange={event => setLogFrequency(event.target.checked)}/>Log Hz</label>}<span className="raw-badge">{run?.workflow === 'imported-results' ? 'EXTERNAL FILE' : `${run?.tool?.toUpperCase() || 'ENGINE'} RAW`} · {Math.max(...waveforms.map(w => w.x.length)).toLocaleString()} samples</span></div>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="실제 ngspice 파형" onPointerLeave={() => setCursor(null)} onClick={event => { const rect = event.currentTarget.getBoundingClientRect(), x = (event.clientX - rect.left) / rect.width * width; onCursor?.(xValue(Math.min(1, Math.max(0, (x - left) / (width - left - right))))); }} onPointerMove={event => { const rect = event.currentTarget.getBoundingClientRect(); const coordinate = (event.clientX - rect.left) / rect.width * width; setCursor(Math.min(1, Math.max(0, (coordinate - left) / (width - left - right)))); }}>
      {[0, 1, 2, 3, 4, 5].map(index => { const fraction = index / 5, x = left + fraction * (width - left - right), y = top + fraction * (height - top - bottom); return <g key={index} className="plot-grid"><line x1={x} y1={top} x2={x} y2={height - bottom}/><line x1={left} y1={y} x2={width - right} y2={y}/><text x={x} y={height - bottom + 23} textAnchor="middle">{formatNumber(xValue(fraction))}</text>{units.map((unit, axisIndex) => { const values = range.axes[unit]; return <text key={unit} x={axisX(axisIndex)} y={y + 4} textAnchor={axisIndex === 0 ? 'end' : 'start'} style={{fill:unitColor(unit)}}>{formatNumber(values.ymax - fraction * (values.ymax - values.ymin))}</text>; })}</g>; })}
      {rendered.map(({ wave: w, points }) => <polyline key={w.name} data-signal={w.name} data-unit={w.unit} points={points.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)).map(([x, y]) => `${sx(x)},${sy(y,w.unit)}`).join(' ')} fill="none" stroke={colors[waveforms.indexOf(w) % colors.length]} strokeWidth="1.8" strokeDasharray={w.dashed ? '5 4' : undefined}/>)}
      {cursors && ([['A', cursors.a], ['B', cursors.b]] as const).filter(([, x]) => x >= range.xmin && x <= range.xmax).map(([name, x]) => <g key={name} data-cursor={name}><line x1={sx(x)} x2={sx(x)} y1={top} y2={height - bottom} className={`plot-cursor-${name.toLowerCase()}`}/><text x={sx(x) + 5} y={top + 12} fill="currentColor">{name}</text></g>)}
      {cursorX !== null && <line x1={sx(cursorX)} x2={sx(cursorX)} y1={top} y2={height - bottom} className="plot-cursor"/>}
      <text x={width / 2} y={height - 12} className="plot-axis" textAnchor="middle">{axis}</text>{units.map((unit,index) => <text key={unit} data-axis-unit={unit} x={axisX(index)} y={17} className="plot-axis" textAnchor={index === 0 ? 'end' : 'start'} style={{fill:unitColor(unit)}}>{unit}</text>)}
    </svg>
    <div className="plot-readout">{cursorX !== null ? <><span>x = {formatNumber(cursorX)} {axisUnit}</span>{visible.map(w => <span key={w.name}>{w.name} = {cursorX >= w.x[0] && cursorX <= w.x.at(-1)! ? formatNumber(interpolate(w, cursorX)) : '범위 밖'} {w.unit}</span>)}</> : <span>Hover: 보간 수치 · 신호명 클릭: 숨기기 · 차트 클릭: A/B 커서 · revision {run?.revision}</span>}</div>
  </div>;
}
