import { useState } from 'react';
import type { Run } from '@mos/contracts';
import './digital-verification.css';

export default function DigitalVerification({ run, revision }: { run: Run | undefined; revision: number | undefined }) {
  const [selection, setSelection] = useState('all');
  const result = run?.digital_verification;
  if (!run || !result) return null;
  const stale = run.freshness === 'stale' || run.revision !== revision;
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ run_id: run.id, revision: run.revision, freshness: stale ? 'stale' : 'current', conditions: run.measurements, verification: result }, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `mux4-${run.id}.truth.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="digital-verification" data-testid="digital-verification">
    <header><div><strong>4:1 MUX · 실제 파형 진리표</strong><p>입력 16가지 × 선택 4가지 · 안정 구간 70~95% · 0.3/0.7 VDD 판정</p></div><span data-testid="digital-result" className={stale || !result.pass ? 'digital-fail' : 'digital-pass'}>{stale ? 'STALE' : result.pass ? 'PASS' : 'FAIL'} · {result.passed_cases}/{result.expected_cases}</span></header>
    <div className="digital-actions"><label>선택 신호<select aria-label="MUX 진리표 선택" value={selection} onChange={e => setSelection(e.target.value)}><option value="all">전체 64개</option>{[0, 1, 2, 3].map(s => <option key={s} value={s}>S1 S0 = {s.toString(2).padStart(2, '0')} → D{s}</option>)}</select></label><button onClick={download} data-testid="digital-export">실제 진리표 JSON 저장</button><span>{String(run.measurements?.corner)} · {String(run.measurements?.temperature_C)} °C · {String(run.measurements?.supply_V)} V · {run.measurements?.post_layout === 'true' ? 'Post-layout' : 'Pre-layout'}</span></div>
    <div className="digital-table"><table><thead><tr><th>S1 S0</th><th>D3 D2 D1 D0</th><th>선택</th><th>예상 Y</th><th>실제 Y</th><th>안정 구간 최소/최대 V</th><th>판정</th></tr></thead><tbody>{result.rows.filter(r => selection === 'all' || r.select === Number(selection)).map(r => <tr key={r.index} data-testid="digital-case"><td>{r.select.toString(2).padStart(2, '0')}</td><td>{r.pattern.toString(2).padStart(4, '0')}</td><td>D{r.select}</td><td>{r.expected}</td><td>{r.actual ?? '미판정'}</td><td>{r.output_min_V?.toPrecision(5) ?? '—'} / {r.output_max_V?.toPrecision(5) ?? '—'}</td><td className={r.pass ? 'digital-pass' : 'digital-fail'}>{r.pass ? 'PASS' : 'FAIL'}</td></tr>)}</tbody></table></div>
    <p className="digital-scope">{result.delay_scope} 출력 파형의 과도 응답과 선택 신호 동시 변경은 별도 확인하세요. 진리표 통과가 hazard-free 또는 제조 signoff를 의미하지 않습니다.</p>
  </section>;
}
