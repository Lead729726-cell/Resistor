import {useEffect,useRef,useState} from 'react';
import {rpc,type CpuInstruction,type DigitalCatalog,type DigitalKind,type Project,type Run} from '@mos/contracts';
import './digital-workbench.css';

export default function DigitalWorkbench({disabledReason,onProject}:{disabledReason?:string;onProject:(p:Project)=>Promise<void>}) {
  const [catalog,setCatalog]=useState<DigitalCatalog>(),[kind,setKind]=useState<DigitalKind>('full_adder'),[name,setName]=useState('1비트 전가산기'),[program,setProgram]=useState<CpuInstruction[]>([]);
  const [physical,setPhysical]=useState(true),[runNow,setRunNow]=useState(true),[period,setPeriod]=useState(50),[corner,setCorner]=useState('tt'),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const alive=useRef(true),receipt=useRef<{signature:string;id:string;project?:Project;run?:Run}|undefined>(undefined);
  useEffect(()=>{alive.current=true;rpc<DigitalCatalog>('digital.catalog').then(v=>{if(alive.current){setCatalog(v);setProgram(v.default_program);}}).catch(e=>setError(e.message));return()=>{alive.current=false;};},[]);
  const choose=(k:DigitalKind)=>{setKind(k);setName(catalog?.units.find(v=>v.id===k)?.name||k);setPeriod(50);setError('');};
  const create=async()=>{
    setBusy(true);setError('');
    const conditions=corner==='ss'?{temperature_C:125,supply_V:1.62}:corner==='ff'?{temperature_C:-40,supply_V:1.8}:{temperature_C:27,supply_V:1.8};
    const params={kind,name:name.trim(),physical,period_ns:period,corner,...conditions,...(kind==='cpu4'?{program}:{})},signature=JSON.stringify(params);
    if(receipt.current?.signature!==signature)receipt.current={signature,id:crypto.randomUUID()};
    try {
      const saved=receipt.current!;
      saved.project??=await rpc<Project>('digital.create',{...params,command_id:saved.id});
      if(runNow&&!saved.run)saved.run=await rpc<Run>('simulation.run',{project_id:saved.project.id,expected_revision:saved.project.revision,...saved.project.testbench,command_id:saved.id+'-sim'});
      if(alive.current)await onProject({...saved.project,runs:saved.run?[...saved.project.runs,saved.run]:saved.project.runs});
    } catch(e){if(alive.current)setError(e instanceof Error?e.message:String(e));}finally{if(alive.current)setBusy(false);}
  };
  return <section className="digital-workbench" data-testid="digital-workbench" aria-busy={busy}><div className="starter-scroll">
    <header className="starter-intro"><span>BUILD A LITTLE COMPUTER</span><h3>가산기부터, 작은 CPU까지</h3><p>트랜지스터 회로와 하위 셀이 편집 가능한 설계로 열립니다. 실제 파형으로 계산 결과와 레지스터 상태를 확인하세요.</p></header>
    {error&&<p role="alert" className="starter-error">{error}{receipt.current?.project&&' · 생성된 프로젝트는 보존되어 있습니다. 같은 조건으로 재시도하면 이어서 엽니다.'}</p>}
    {!catalog?<p role="status">공개 PDK 디지털 회로 준비 상태를 읽는 중…</p>:<fieldset disabled={busy}>
      <div className="digital-cards">{catalog.units.map((v,i)=><button type="button" key={v.id} data-testid={`digital-${v.id}`} className={kind===v.id?'selected':''} aria-pressed={kind===v.id} onClick={()=>choose(v.id)}><small>0{i+1}</small><strong>{v.name}</strong><p>{v.description}</p><span>실제 입력 검증 {v.case_count}건</span></button>)}</div>
      <div className="starter-fields"><label>설계 이름<input aria-label="디지털 설계 이름" value={name} maxLength={128} onChange={e=>setName(e.target.value)}/></label><label>공정 조건<select aria-label="디지털 공정 조건" value={corner} onChange={e=>setCorner(e.target.value)}><option value="tt">TT · 27 °C · 1.8 V</option><option value="ss">SS · 125 °C · 1.62 V</option><option value="ff">FF · −40 °C · 1.8 V</option></select></label><label>{kind==='cpu4'?'클럭 주기':'입력 조합 유지 시간'} (ns)<input aria-label="디지털 주기 ns" type="number" min={20} max={1000} value={period} onChange={e=>setPeriod(Number(e.target.value))}/></label></div>
      {kind==='cpu4'&&<><h4>ROM 프로그램 · 16개 명령</h4><p className="starter-scope">각 클럭의 상승 에지에서 실행합니다. LOAD는 즉시값을 저장, ADD는 더하기와 carry, AND/XOR는 비트 연산입니다. 15번 다음에는 0번으로 돌아갑니다. RESET은 클럭에 동기화됩니다.</p><div className="cpu-rom">{program.map((v,i)=><div key={i}><code>{i.toString(16).toUpperCase().padStart(2,'0')}</code><select aria-label={`ROM ${i} 명령`} value={v.op} onChange={e=>setProgram(program.map((p,j)=>j===i?{...p,op:e.target.value as CpuInstruction['op']}:p))}>{catalog.operations.map(op=><option key={op}>{op}</option>)}</select><input aria-label={`ROM ${i} 값`} type="number" min={0} max={15} value={v.value} onChange={e=>setProgram(program.map((p,j)=>j===i?{...p,value:Number(e.target.value)}:p))}/></div>)}</div><button className="button small" onClick={()=>setProgram(catalog.default_program)}>예제 프로그램 복원</button></>}
      <label className="starter-run"><input type="checkbox" data-testid="digital-physical" checked={physical} onChange={e=>setPhysical(e.target.checked)}/>SKY130 트랜지스터와 배선의 참조 레이아웃 생성</label>
      <p className="starter-scope">회로 계층은 NAND·전가산기·레지스터를 재사용합니다. 물리 배치는 펼친 트랜지스터를 연결하는 넓은 참조 레이아웃이며, 배치 면적·타이밍 최적화와 제조 승인은 별도 검증이 필요합니다. CPU는 ACC/PC 각 4비트, carry 레지스터와 zero 출력, 16×6비트 ROM을 갖습니다.</p>
      <label className="starter-run"><input type="checkbox" data-testid="digital-run-now" checked={runNow} onChange={e=>setRunNow(e.target.checked)}/>생성 후 실제 ngspice 입력 검증 실행</label>
    </fieldset>}
  </div><footer className="starter-footer"><div><strong>SKY130 · Native transistor circuit</strong><span>{disabledReason||(!catalog?.execution_available?'공개 PDK와 EDA worker 연결 필요':busy?'실제 설계를 생성하고 있습니다…':'현재 프로젝트와 별도 설계로 저장합니다.')}</span></div><button className="button primary" data-testid="digital-create" disabled={busy||!!disabledReason||!catalog?.execution_available||!name.trim()||period<20||period>1000||!Number.isFinite(period)||kind==='cpu4'&&program.some(v=>!Number.isInteger(v.value)||v.value<0||v.value>15)} onClick={()=>void create()}>{busy?'생성 중…':'설계 생성·열기'}</button></footer></section>;
}

export function UnitResults({run,revision}:{run?:Run;revision:number}) {
  const [failOnly,setFailOnly]=useState(false);const v=run?.unit_verification;if(!v)return null;
  const rows=v.rows.filter(r=>!failOnly||!r.pass);const stale=run.freshness==='stale'||run.revision!==revision;
  return <section className="digital-verification" data-testid="unit-verification"><header><div><strong>{v.kind==='cpu4'?'CPU 명령 실행 추적':'가산기 전체 입력 조합'}</strong><p>실제 ngspice 파형 · {v.passed_cases}/{v.expected_cases} 통과 · {stale?'현재 설계 변경으로 오래된 결과':v.pass?'PASS':'FAIL'}</p></div><label><input type="checkbox" checked={failOnly} onChange={e=>setFailOnly(e.target.checked)}/>실패만 보기</label></header><div className="digital-table"><table><thead><tr><th>#</th>{v.kind==='cpu4'?<><th>PC →</th><th>명령</th><th>ACC 이전</th></>:<><th>A</th><th>B</th><th>CIN</th></>}<th>예상 → 실제</th><th>Carry 예상/실제</th>{v.kind==='cpu4'&&<th>Zero</th>}<th>결과</th></tr></thead><tbody>{rows.map(r=><tr key={r.index}><td>{r.index}</td>{v.kind==='cpu4'?<><td>{r.pc_before} → {r.pc_actual??'?'}</td><td>{r.op} {r.immediate}</td><td>{r.acc_before}</td></>:<><td>{r.a}</td><td>{r.b}</td><td>{r.cin}</td></>}<td>{r.expected} → {r.actual??'불확정'}</td><td>{r.carry_expected}/{r.carry_actual??'?'}</td>{v.kind==='cpu4'&&<td>{r.zero_expected}/{r.zero_actual??'?'}</td>}<td className={r.pass?'digital-pass':'digital-fail'}>{r.pass?'PASS':'FAIL'}</td></tr>)}</tbody></table></div><p className="digital-scope">논리 0 ≤ {v.logic_low_max_V.toFixed(3)} V · 논리 1 ≥ {v.logic_high_min_V.toFixed(3)} V. 안정 구간과 실제 입력·PC·ROM을 함께 검사합니다. 제조 승인이나 정적 타이밍 분석 결과를 뜻하지 않습니다.</p></section>;
}
