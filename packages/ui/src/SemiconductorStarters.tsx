import { useEffect, useRef, useState } from 'react';
import { rpc, type Project, type Run, type SemiconductorCatalog, type SemiconductorPreset, type StarterMode } from '@mos/contracts';
import './semiconductor-starters.css';
import './starter-flow.css';

const starterSteps = ['family', 'design', 'process', 'settings', 'review'] as const;
const starterTitles = ['어떤 역할을 만들까요?', '시작할 회로를 골라주세요', '사용할 공정을 확인하세요', '이름과 운전 조건을 정하세요', '이 설정으로 시작할까요?'];
const starterHints = ['관심 있는 한 가지 역할부터 선택하세요.', '한 회로를 고른 뒤 다음 단계에서 공정을 확인합니다.', '실행 가능한 공정에서 새 설계를 만들 수 있습니다.', '이전 단계로 돌아가도 입력한 내용은 유지됩니다.', '생성 버튼을 누르면 새 프로젝트가 만들어집니다.'];

const starterQuantity=(value:number,unit:string)=>{
  if(!Number.isFinite(value))return '—';
  if(value===0)return '0 '+unit;
  const [scale,prefix]=([[1,''],[1e-3,'m'],[1e-6,'µ'],[1e-9,'n'],[1e-12,'p'],[1e-15,'f']] as const).find(([s])=>Math.abs(value)>=s*(1-1e-12))||[1,''];
  return Number((value/scale).toPrecision(4))+' '+prefix+unit;
};

function ChipGlyph({ variant = 0 }: { variant?: number }) {
  return <svg viewBox="0 0 80 64" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="21" y="13" width="38" height="38" rx="5"/>
    {[25, 33, 41].map(y => <g key={y}><path d={`M13 ${y}h8 M59 ${y}h8`}/></g>)}
    {[29, 39, 49].map(x => <g key={x}><path d={`M${x} 6v7 M${x} 51v7`}/></g>)}
    {variant % 3 === 0 ? <path d="M28 23h11v17H28 M39 27h11 M39 36h11 M50 23v17"/> : variant % 3 === 1 ? <path d="M29 23v17 M36 21v21 M36 25h13v14H36 M49 32h5"/> : <><path d="M28 32h5l3-9 7 18 4-9h6"/><circle cx="28" cy="32" r="2"/></>}
  </svg>;
}

export default function SemiconductorStarters({ project, disabledReason, onProject }: {
  project: Project | null; disabledReason?: string; onProject: (project: Project) => Promise<void>;
}) {
  const [catalog, setCatalog] = useState<SemiconductorCatalog | null>(null);
  const [technology, setTechnology] = useState('sky130A'), [selected, setSelected] = useState(project?.semiconductor_starter?.id || 'first_cmos');
  const [mode, setMode] = useState<StarterMode>(project?.semiconductor_starter?.mode || 'nominal');
  const [name, setName] = useState(''), [nameTouched, setNameTouched] = useState(false), [runNow, setRunNow] = useState(false);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [category,setCategory]=useState(''), [step,setStep]=useState(0);
  const [familyPage,setFamilyPage]=useState(0), [designPage,setDesignPage]=useState(0);
  const [observation,setObservation]=useState<number|null>(null);
  const heading=useRef<HTMLHeadingElement>(null);
  const live = useRef(true), command = useRef<{ signature: string; id: string } | null>(null);
  const created = useRef<Project | null>(null), launched = useRef<Run | null>(null);
  const loadCatalog = async () => {
    setLoading(true); setError('');
    try {
      const next = await rpc<SemiconductorCatalog>('starter.catalog');
      if (live.current) { setCatalog(next); const item = next.presets.find(p => p.id === selected) || next.presets[0]; if (item) { setSelected(item.id); if (!nameTouched) setName(item.title); if (!item.modes.includes(mode)) setMode(item.modes.includes('nominal')?'nominal':item.modes[0]); } }
    } catch (cause) { if (live.current) setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { if (live.current) setLoading(false); }
  };
  useEffect(() => { live.current = true; void loadCatalog(); return () => { live.current = false; }; }, []);
  useEffect(()=>{heading.current?.focus();},[step,observation]);
  const preset = catalog?.presets.find(item => item.id === selected);
  const process = catalog?.technologies.find(item => item.id === technology);
  const settings = preset?.configurations[mode];
  const families=[...new Set(catalog?.presets.map(item=>item.category)||[])];
  const familyDesigns=catalog?.presets.filter(item=>item.category===category)||[];
  const selectedInFamily=!!preset&&preset.category===category;
  const nextAllowed=step===0?!!category:step===1?selectedInFamily:step===2?!!process?.execution_available&&preset?.technology_id===technology:step===3?!!name.trim()&&!!settings:false;
  const chooseFamily=(family:string)=>{
    setCategory(family);setDesignPage(0);setError('');
    if(preset?.category!==family){const first=catalog?.presets.find(item=>item.category===family);if(first)selectPreset(first);}
  };
  const selectPreset = (item: SemiconductorPreset) => {
    setSelected(item.id);setTechnology(item.technology_id); if (!nameTouched) setName(item.title);
    if (!item.modes.includes(mode)) setMode(item.modes.includes('nominal')?'nominal':item.modes[0]); setError('');
  };
  const create = async () => {
    if (step!==4 || !preset || !settings || !name.trim() || !process?.execution_available || preset.technology_id!==technology || disabledReason) return;
    setBusy(true); setError('');
    try {
      const params = { preset_id: preset.id, mode, name: name.trim() };
      const signature = JSON.stringify(params);
      if (command.current?.signature !== signature) { command.current = { signature, id: crypto.randomUUID() }; created.current = null; launched.current = null; }
      if (!created.current) created.current = await rpc<Project>('starter.create', { ...params, command_id: command.current!.id });
      let next = created.current;
      if (runNow && !launched.current) {
        launched.current = await rpc<Run>('simulation.run', { project_id: next.id, expected_revision: next.revision, ...next.testbench });
      }
      if(launched.current)next={...next,runs:[...next.runs.filter(run=>run.id!==launched.current!.id),launched.current]};
      if (live.current) await onProject(next);
    } catch (cause) { if (live.current) setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { if (live.current) setBusy(false); }
  };
  return <section className="semiconductor-starters starter-guided" data-testid="semiconductor-starters" data-step={observation===null?starterSteps[step]:'observation'} aria-busy={busy || loading}>
    <div className="starter-scroll">
      <header className="starter-intro"><span aria-live="polite">{observation===null?`내 반도체 · ${step+1} / ${starterSteps.length}`:`만든 뒤 살펴보기 · ${observation+1} / ${preset?.observe.length||0}`}</span><h3 ref={heading} tabIndex={-1}>{observation===null?starterTitles[step]:'무엇을 확인하면 좋을까요?'}</h3><p>{observation===null?starterHints[step]:'회로를 만든 뒤 실제 해석 결과와 함께 살펴보세요.'}</p></header>
      {error && <div className="starter-error" role="alert">{error}{created.current && <p>생성된 설계는 워크스페이스에 보존되어 있습니다. 같은 조건으로 다시 누르면 해당 프로젝트를 이어서 엽니다.</p>}<button disabled={busy} onClick={() => void loadCatalog()}>준비 상태 다시 읽기</button></div>}
      {loading ? <p role="status">설치된 공정과 시작 설정을 읽는 중…</p> : catalog && <>
        {step===0&&<><div className="starter-family-grid" role="group" aria-label="시작 설계 종류">
          {families.slice(familyPage*4,familyPage*4+4).map((family,index)=><button type="button" key={family} data-testid={`starter-family-${family}`} className={category===family?'selected':''} aria-pressed={category===family} disabled={busy} onClick={()=>chooseFamily(family)}><ChipGlyph variant={index}/><strong>{family}</strong><span>{catalog.presets.filter(item=>item.category===family).length}개 시작 회로</span></button>)}
        </div>{families.length>4&&<nav className="starter-choice-pages" aria-label="설계 종류 더 보기"><button className="button small" disabled={familyPage===0} onClick={()=>setFamilyPage(page=>page-1)}>앞선 종류</button><span>{familyPage+1} / {Math.ceil(families.length/4)}</span><button className="button small" disabled={(familyPage+1)*4>=families.length} onClick={()=>setFamilyPage(page=>page+1)}>다른 종류</button></nav>}</>}
        {step===1&&<><p className="starter-context">{category}</p><div className="starter-cards" role="group" aria-label="반도체 시작 설계 선택">
          {familyDesigns.slice(designPage*3,designPage*3+3).map((item,index)=><button type="button" key={item.id} className={`starter-card ${selected===item.id?'selected':''}`} aria-pressed={selected===item.id} disabled={busy} data-testid={`starter-${item.id}`} onClick={()=>selectPreset(item)}><div className="starter-card-top"><ChipGlyph variant={index}/><span className="starter-selection">{selected===item.id?'✓':'+'}</span></div><strong>{item.title}</strong><p>{item.subtitle}</p><small>{item.layout==='physical'?'회로도 + 실제 물리 레이아웃':'회로도 준비 · 레이아웃 미생성'}</small></button>)}
        </div>{familyDesigns.length>3&&<nav className="starter-choice-pages" aria-label="시작 회로 더 보기"><button className="button small" disabled={designPage===0} onClick={()=>setDesignPage(page=>page-1)}>앞선 회로</button><span>{designPage+1} / {Math.ceil(familyDesigns.length/3)}</span><button className="button small" disabled={(designPage+1)*3>=familyDesigns.length} onClick={()=>setDesignPage(page=>page+1)}>다른 회로</button></nav>}{selectedInFamily&&<p className="starter-context">{preset.features.join(' · ')}</p>}</>}
        {step===2&&<>
        <div className="starter-processes" role="group" aria-label="반도체 공정 선택">
          {catalog.technologies.map(item => <button key={item.id} type="button" className={technology === item.id ? 'selected' : ''} aria-pressed={technology === item.id} disabled={busy} onClick={() => { setTechnology(item.id); setError(''); }}>
            <span className={`starter-status ${item.execution_available ? 'ready' : ''}`}>{item.execution_available ? '설계 시작 가능' : '특징 비교'}</span><strong>{item.name}</strong><small>{item.node}</small><span>{item.voltages}</span>
          </button>)}
        </div>
        {process && <div className="starter-process-detail"><p>{process.features.join(' · ')}</p><span>PDK 파일 {process.installed ? '설치됨' : '미설치'} · {process.execution_available ? '스타터 어댑터 연결됨' : '스타터 모델·물리 어댑터 연결 필요'}</span><a href={process.source_url} target="_blank" rel="noreferrer">공식 공정 자료 ↗</a></div>}
        {process && !process.execution_available && <div className="starter-unavailable"><h4>{process.name}은 현재 특징 비교용입니다.</h4><p>{process.reason || '현재 worker에 공개 SKY130 모델과 물리 설계 리소스가 준비되어 있지 않습니다.'}</p><button className="button" disabled={busy} onClick={() => setTechnology(preset?.technology_id||'sky130A')}>선택한 회로의 공정으로 돌아가기</button></div>}
        {process?.execution_available&&preset?.technology_id!==technology&&<p className="starter-error" role="alert">선택한 회로는 {preset?.technology_id} 공정용입니다. 해당 공정으로 돌아가거나 회로를 다시 선택하세요.</p>}
        </>}
        {step===3&&preset&&settings&&<div className="starter-configuration">
            <div className="starter-fields"><label>내 설계 이름<input aria-label="내 반도체 설계 이름" maxLength={128} value={name} disabled={busy} onChange={event => { setName(event.target.value); setNameTouched(true); }}/></label><label>운전 조건<select aria-label="반도체 시작 운전 조건" value={mode} disabled={busy} onChange={event => setMode(event.target.value as StarterMode)}>{catalog.modes.filter(item => preset.modes.includes(item.id)).map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label></div>
            <p className="starter-context">{preset.title} · {process?.name}</p><p className="starter-scope">선택한 운전 조건에 맞춰 공정 코너·전압·온도를 함께 설정합니다. 다음 단계에서 실제 해석 조건을 확인하세요.</p>
        </div>}
        {step===4&&preset&&settings&&observation===null&&<div className="starter-configuration">
            <div className="starter-review-title"><strong>{name.trim()}</strong><span>{preset.title} · {process?.name}</span></div>
            <dl className="starter-settings"><div><dt>실제 해석</dt><dd>{settings.analysis.toUpperCase()}</dd></div><div><dt>전원·코너</dt><dd>{settings.supply_V}V · {settings.corner.toUpperCase()}</dd></div><div><dt>온도</dt><dd>{settings.temperature_C}°C</dd></div><div><dt>출력 부하</dt><dd>{starterQuantity(settings.load_F,'F')}</dd></div>{settings.analysis === 'tran' && <div><dt>해석 길이 / 간격</dt><dd>{starterQuantity(settings.duration_s,'s')} / {starterQuantity(settings.step_s,'s')}</dd></div>}</dl>
            <label className="starter-run"><input type="checkbox" checked={runNow} disabled={busy} onChange={event => setRunNow(event.target.checked)}/>생성 후 실제 해석도 실행하기</label>
            <p className="starter-scope">{preset.ideal_components ? '이상적 RC 부품으로 구성한 기초 회로입니다.' : '공개 SKY130 모델을 사용합니다.'} 생성만으로 DRC·LVS·제조 검증이 통과한 것은 아닙니다. 전류·파형은 실제 해석을 실행한 뒤 표시됩니다.</p>
            {preset.observe.length>0&&<button type="button" className="button small" data-testid="starter-observe-open" disabled={busy} onClick={()=>setObservation(0)}>만든 뒤 살펴볼 내용 →</button>}
        </div>}
        {observation!==null&&preset&&<p className="starter-observation-page">{preset.observe[observation]}</p>}
      </>}
    </div>
    {disabledReason&&<p className="starter-error" role="status">{disabledReason}</p>}
    <footer className="starter-footer"><button className="button" data-testid="starter-back" disabled={step===0||busy||loading} onClick={()=>observation!==null?setObservation(null):setStep(value=>value-1)}>{observation!==null?'설정으로':'이전'}</button><span className="starter-progress" aria-label="진행 단계">{observation===null?`${step+1} / ${starterSteps.length}`:`${observation+1} / ${preset?.observe.length||0}`}</span>{observation!==null?<button className="button primary" onClick={()=>setObservation(value=>value!==null&&value+1<(preset?.observe.length||0)?value+1:null)}>{observation+1<(preset?.observe.length||0)?'다음 내용':'설정으로'}</button>:step<4?<button className="button primary" data-testid="starter-next" disabled={busy||loading||!nextAllowed} onClick={()=>setStep(value=>value+1)}>다음</button>:<button className="button primary" data-testid="starter-create" disabled={busy || loading || !preset || !process?.execution_available || preset.technology_id!==technology || !settings || !name.trim() || !!disabledReason} onClick={() => void create()}>{busy ? '내 반도체 준비 중…' : '이 설정으로 설계 시작'}</button>}</footer>
  </section>;
}
