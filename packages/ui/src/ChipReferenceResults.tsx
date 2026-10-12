import {type Run} from '@mos/contracts';
import './chip-reference-results.css';

export default function ChipReferenceResults({run,revision}:{run:Run|null|undefined;revision:number}) {
  const report=run?.reference_verification;
  if(!run || !report) return null;
  const current=run.revision===revision&&run.freshness==='current';
  const completed=run.execution_status==='completed';
  const label=!completed?'실행 미완료':!current?'이전 설계의 결과':report.pass===null?'해당 파형 기준 미검사':report.pass?'파형 기준 통과':'파형 기준 미충족';
  const value=(v:number|number[]|null):string=>Array.isArray(v)?v.map(value).join(' ~ '):v===null?'—':Number.isFinite(v)?v.toPrecision(6):'—';
  return <section className="chip-reference-results" data-testid="chip-reference-results">
    <header><strong>{report.kind.startsWith('cell_')?'로직 셀':'칩 레퍼런스'} · {label}</strong><span>r{run.revision} · {report.checks.filter(c=>c.pass).length}/{report.checks.length} 항목 · 실제 ngspice 표본</span></header>
    <p>명시된 관측 구간의 회로 기준입니다. 레이아웃·DRC/LVS·PEX·제조 승인은 별도로 검증해야 합니다.</p>
    {report.kind==='chip_pll'&&<p>이 PLL은 XOR 위상 검출을 사용하는 Type-I, N=1 기초 루프입니다. PFD/charge-pump 합성기와 phase-noise 검사를 포함하지 않습니다.</p>}
    <div className="chip-reference-table"><table><thead><tr><th>실제 파형 검사</th><th>관측값</th><th>결과</th></tr></thead><tbody>{report.checks.map(c=><tr key={c.name}><td>{c.name}</td><td>{value(c.observed)}</td><td className={current&&completed?(c.pass?'good':'bad'):''}>{!completed?'미완료':!current?'이전 결과':c.pass?'PASS':'FAIL'}</td></tr>)}</tbody></table></div>
  </section>;
}
