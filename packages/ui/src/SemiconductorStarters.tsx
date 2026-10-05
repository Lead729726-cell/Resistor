import { useEffect, useRef, useState } from 'react';
import { rpc, type Project, type Run, type SemiconductorCatalog, type SemiconductorPreset, type StarterMode } from '@mos/contracts';
import './semiconductor-starters.css';

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
  const live = useRef(true), command = useRef<{ signature: string; id: string } | null>(null);
  const created = useRef<Project | null>(null), launched = useRef<Run | null>(null);
  const loadCatalog = async () => {
    setLoading(true); setError('');
    try {
      const next = await rpc<SemiconductorCatalog>('starter.catalog');
      if (live.current) { setCatalog(next); const item = next.presets.find(p => p.id === selected) || next.presets[0]; if (item) { setSelected(item.id); setName(item.title); if (!item.modes.includes(mode)) setMode('nominal'); } }
    } catch (cause) { if (live.current) setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { if (live.current) setLoading(false); }
  };
  useEffect(() => { live.current = true; void loadCatalog(); return () => { live.current = false; }; }, []);
  const preset = catalog?.presets.find(item => item.id === selected);
  const process = catalog?.technologies.find(item => item.id === technology);
  const settings = preset?.configurations[mode];
  const selectPreset = (item: SemiconductorPreset) => {
    setSelected(item.id); if (!nameTouched) setName(item.title);
    if (!item.modes.includes(mode)) setMode('nominal'); setError('');
  };
  const create = async () => {
    if (!preset || !settings || !process?.execution_available || disabledReason) return;
    setBusy(true); setError('');
    try {
      const params = { preset_id: preset.id, mode, name: name.trim() };
      const signature = JSON.stringify(params);
      if (command.current?.signature !== signature) { command.current = { signature, id: crypto.randomUUID() }; created.current = null; launched.current = null; }
      if (!created.current) created.current = await rpc<Project>('starter.create', { ...params, command_id: command.current!.id });
      let next = created.current;
      if (runNow && !launched.current) {
        launched.current = await rpc<Run>('simulation.run', { project_id: next.id, expected_revision: next.revision, ...next.testbench });
        next = { ...next, runs: [...next.runs, launched.current] };
      }
      if (live.current) await onProject(next);
    } catch (cause) { if (live.current) setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { if (live.current) setBusy(false); }
  };
  return <section className="semiconductor-starters" data-testid="semiconductor-starters" aria-busy={busy || loading}>
    <div className="starter-scroll">
      <header className="starter-intro"><span>MY FIRST SEMICONDUCTOR</span><h3>어떤 반도체를 먼저 만들어볼까요?</h3><p>만들고 싶은 역할을 고르면 회로와 해석 조건이 함께 준비됩니다. 만든 프로젝트에서 직접 바꾸고 실제 결과를 비교하세요.</p></header>
      {error && <div className="starter-error" role="alert">{error}{created.current && <p>생성된 설계는 워크스페이스에 보존되어 있습니다. 같은 조건으로 다시 누르면 해당 프로젝트를 이어서 엽니다.</p>}<button disabled={busy} onClick={() => void loadCatalog()}>준비 상태 다시 읽기</button></div>}
      {loading ? <p role="status">설치된 공정과 시작 설정을 읽는 중…</p> : catalog && <>
        <div className="starter-step-label"><b>01</b><h4>공정 특징 살펴보기</h4><span>공개 PDK</span></div>
        <div className="starter-processes" role="group" aria-label="반도체 공정 선택">
          {catalog.technologies.map(item => <button key={item.id} type="button" className={technology === item.id ? 'selected' : ''} aria-pressed={technology === item.id} disabled={busy} onClick={() => { setTechnology(item.id); setError(''); }}>
            <span className={`starter-status ${item.execution_available ? 'ready' : ''}`}>{item.execution_available ? '설계 시작 가능' : '특징 비교'}</span><strong>{item.name}</strong><small>{item.node}</small><span>{item.voltages}</span>
          </button>)}
        </div>
        {process && <div className="starter-process-detail"><p>{process.features.join(' · ')}</p><span>PDK 파일 {process.installed ? '설치됨' : '미설치'} · {process.execution_available ? '스타터 어댑터 연결됨' : '스타터 모델·물리 어댑터 연결 필요'}</span><a href={process.source_url} target="_blank" rel="noreferrer">공식 공정 자료 ↗</a></div>}
        {process && !process.execution_available ? <div className="starter-unavailable"><ChipGlyph/><h4>{process.name}의 공정 특징을 비교할 수 있습니다.</h4><p>{process.reason || '현재 worker에 공개 SKY130 모델과 물리 설계 리소스가 준비되어 있지 않습니다.'}</p><p>이 공정의 전압을 SKY130 모델에 적용해 다른 공정처럼 표시하지 않습니다.</p><button className="button" disabled={busy} onClick={() => setTechnology('sky130A')}>SKY130 시작 설계 살펴보기</button></div> : <>
          <div className="starter-step-label"><b>02</b><h4>내 반도체의 역할 선택하기</h4><span>편집 가능한 실제 회로</span></div>
          <div className="starter-cards" role="group" aria-label="반도체 시작 설계 선택">
            {catalog.presets.filter(item => item.technology_id === technology).map((item, index) => <button type="button" key={item.id} className={`starter-card ${selected === item.id ? 'selected' : ''}`} aria-pressed={selected === item.id} disabled={busy} data-testid={`starter-${item.id}`} onClick={() => selectPreset(item)}>
              <div className="starter-card-top"><ChipGlyph variant={index}/><span>{item.category}</span><span className="starter-selection">{selected === item.id ? '✓' : '+'}</span></div><strong>{item.title}</strong><p>{item.subtitle}</p><ul>{item.features.map(feature => <li key={feature}>{feature}</li>)}</ul><small>{item.layout === 'physical' ? '회로도 + 실제 물리 레이아웃' : '회로도 준비 · 레이아웃 미생성'}</small>
            </button>)}
          </div>
          {preset && settings && <div className="starter-configuration">
            <div className="starter-step-label"><b>03</b><h4>시작 조건 확인하기</h4></div>
            <div className="starter-fields"><label>내 설계 이름<input aria-label="내 반도체 설계 이름" maxLength={128} value={name} disabled={busy} onChange={event => { setName(event.target.value); setNameTouched(true); }}/></label><label>운전 조건<select aria-label="반도체 시작 운전 조건" value={mode} disabled={busy} onChange={event => setMode(event.target.value as StarterMode)}>{catalog.modes.filter(item => preset.modes.includes(item.id)).map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label></div>
            <dl className="starter-settings"><div><dt>실제 해석</dt><dd>{settings.analysis.toUpperCase()}</dd></div><div><dt>전원·코너</dt><dd>{settings.supply_V}V · {settings.corner.toUpperCase()}</dd></div><div><dt>온도</dt><dd>{settings.temperature_C}°C</dd></div><div><dt>출력 부하</dt><dd>{(settings.load_F * 1e15).toPrecision(3)}fF</dd></div>{settings.analysis === 'tran' && <div><dt>해석 길이 / 간격</dt><dd>{(settings.duration_s * 1e9).toFixed(1)}ns / {(settings.step_s * 1e12).toFixed(0)}ps</dd></div>}</dl>
            <div className="starter-observe"><strong>만든 뒤 이렇게 살펴보세요</strong><ol>{preset.observe.map(item => <li key={item}>{item}</li>)}</ol></div>
            <label className="starter-run"><input type="checkbox" checked={runNow} disabled={busy} onChange={event => setRunNow(event.target.checked)}/>생성 후 실제 해석도 실행하기</label>
            <p className="starter-scope">{preset.ideal_components ? '이상적 RC 부품으로 구성한 기초 회로입니다.' : '공개 SKY130 모델을 사용합니다.'} 생성만으로 DRC·LVS·제조 검증이 통과한 것은 아닙니다. 전류·파형은 실제 해석을 실행한 뒤 표시됩니다.</p>
          </div>}
        </>}
      </>}
    </div>
    <footer className="starter-footer"><div><strong>{preset?.title || '시작 설계 선택'}</strong><span>{disabledReason || (process?.execution_available ? '기존 설계는 보존하고 새 프로젝트로 시작합니다.' : '현재 선택한 공정은 특징 비교용입니다.')}</span></div><button className="button primary" data-testid="starter-create" disabled={busy || loading || !preset || !process?.execution_available || !settings || !name.trim() || !!disabledReason} onClick={() => void create()}>{busy ? '내 반도체 준비 중…' : '이 설정으로 설계 시작'}</button></footer>
  </section>;
}
