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
    <header><strong>{report.kind==='sigma_delta8'||report.kind.startsWith('sdm8_')?'시그마델타 ADC':report.kind==='sar_adc8'||report.kind.startsWith('sar8_')?'SAR ADC':report.kind.startsWith('cell_')?'로직 셀':'칩 레퍼런스'} · {label}</strong><span>r{run.revision} · {report.checks.filter(c=>c.pass).length}/{report.checks.length} 항목 · {run.tool||'ngspice'}</span></header>
    <p>명시된 관측 구간의 회로 기준입니다. 레이아웃·DRC/LVS·PEX·제조 승인은 별도로 검증해야 합니다.</p>
    {(report.kind==='sigma_delta8'||report.kind.startsWith('sdm8_'))&&<><p>아날로그 모듈레이터는 실제 MOS 해석, 디지털 필터는 실제 RTL·합성 게이트 재생으로 검사합니다. 단독 블록은 연결된 검사 회로에서 실행합니다. 디지털 전체의 트랜지스터 타이밍·열잡음·공정 편차는 별도 검사입니다.</p><p className="mono">평균 CODE {typeof run.measurements?.mean_code==='number'?run.measurements.mean_code.toFixed(3):'—'} · DC 오차 {typeof run.measurements?.dc_error_LSB==='number'?run.measurements.dc_error_LSB.toFixed(3)+' LSB':'—'} · SINAD {typeof run.measurements?.SINAD_dB==='number'?run.measurements.SINAD_dB.toFixed(2)+' dB':'미측정'} · ENOB {typeof run.measurements?.ENOB_bits==='number'?run.measurements.ENOB_bits.toFixed(2)+' bit':'미측정'}</p><p>{run.measurements?.ENOB_status}</p></>}
    {report.kind==='chip_pll'&&<p>이 PLL은 XOR 위상 검출을 사용하는 Type-I, N=1 기초 루프입니다. PFD/charge-pump 합성기와 phase-noise 검사를 포함하지 않습니다.</p>}
    {(report.kind==='sar_adc8'||report.kind.startsWith('sar8_'))&&<><p>실제 커패시터 전하를 보존하며 8회 비교기 출력을 읽습니다. 제어는 RTL·합성 gate·CMOS 연결 graph 재생으로 대조하며 디지털 소자의 시간 지연은 별도입니다.</p><p className="mono">입력 {String(run.measurements?.frames??'—')}개 · 최대 코드 오차 {String(run.measurements?.max_code_error??'—')} LSB · 모호한 비교 {String(run.measurements?.ambiguous_decisions??'—')}개 · ENOB 미측정</p></>}
    {report.kind.startsWith('soc_')&&<p>아날로그 SoC 매크로 · TT/선택 corner의 실제 소자 해석입니다. PGA는 고정 ×2/×8 회로의 전압을 선택합니다. 위상 여유는 외부 DC servo·1pF 부하 조건입니다. OTA 잡음·편차는 전용 탭에서 별도로 실행하며 ESD·EM/IR·완성 SoC 검증은 별도입니다.</p>}
    <div className="chip-reference-table"><table><thead><tr><th>실제 파형 검사</th><th>관측값</th><th>결과</th></tr></thead><tbody>{report.checks.map(c=><tr key={c.name}><td>{c.name}</td><td>{value(c.observed)}</td><td className={current&&completed?(c.pass?'good':'bad'):''}>{!completed?'미완료':!current?'이전 결과':c.pass?'PASS':'FAIL'}</td></tr>)}</tbody></table></div>
  </section>;
}
