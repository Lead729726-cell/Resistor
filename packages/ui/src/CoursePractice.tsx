import {useEffect,useRef,useState} from 'react';
import {courseMissions,missionDraft,newCourseWorkbook,readCourseWorkbook,type CourseWorkbook,type WorkbookRun} from '../../education/src/course-workbook';
import {CourseWorkbookStore,workbookStorageKey,type WorkbookRecovery} from '../../education/src/course-workbook-store';
import {appendMissionRun,compareMissionRuns,suggestedExperiment,engineeringValue,resultLabel} from '../../education/src/course-experiments';
import {workbookProgress,workbookReport,workbookResultLabels} from '../../education/src/course-progress';
import './course-practice.css';

const download=(raw:string,name:string)=>{const url=URL.createObjectURL(new Blob([raw],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
function RunCard({run,label,reference}:{run:WorkbookRun;label:string;reference:number}){const result=run.result,primary=result?engineeringValue(result.primaryValue,result.primaryUnit,reference):null;return <article className="course-run-card"><h4>{label} · r{run.revision}</h4>{primary&&<><strong>{primary.value} {primary.unit}</strong><p>{resultLabel(result!.primaryLabel)}</p>{result!.secondary?.map(s=>{const v=engineeringValue(s.value,s.unit);return <p key={s.label}>{resultLabel(s.label)}: <b>{v.value} {v.unit}</b></p>;})}</>}<small>{run.engine.scope}</small></article>;}
export default function CoursePractice({active,onAppPractice}:{active:boolean;onAppPractice:(quiz:boolean)=>void}){
 const [store]=useState(()=>new CourseWorkbookStore(()=>localStorage,()=>crypto.randomUUID()));
 const [,refresh]=useState(0),[index,setIndex]=useState(0),[message,setMessage]=useState(''),[error,setError]=useState('');
 const [candidate,setCandidate]=useState<CourseWorkbook|null>(null),sequence=useRef(0);
 const [backups,setBackups]=useState<WorkbookRecovery[]>([]),[selected,setSelected]=useState('');
 const [showReport,setShowReport]=useState(false);
 const w=store.workbook,m=courseMissions[index],d=w.drafts[m.id]??=missionDraft(m),p=workbookProgress(w),comparison=compareMissionRuns(m,d);
 const redraw=()=>refresh(n=>n+1);
 const save=()=>{store.save();redraw();};
 const calculate=()=>{try{const result=appendMissionRun(m,d);save();setError('');setMessage(result.added?'새 조건의 기록을 추가했습니다.':'같은 조건의 기록이 있어 중복 저장하지 않았습니다.');}catch(e){setError((e as Error).message);setMessage('');}};
 useEffect(()=>{const sync=(e:StorageEvent)=>{if(e.key===workbookStorageKey){store.inspectExternalChange();redraw();}};window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);},[store]);
 useEffect(()=>{if(!active)return;const key=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&!e.repeat){e.preventDefault();calculate();}};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);});
 const choose=(next:number)=>{setIndex(next);setMessage('');setError('');};
 const open=(value:CourseWorkbook)=>{if(store.replace(value)){setCandidate(null);setShowReport(false);redraw();return true;}redraw();return false;};
 const backup=selected===''?undefined:backups[Number(selected)];
 const primaryReference=Math.max(...d.runs.map(run=>Math.abs(Number(run.result?.primaryValue??0))),0);
 return <main className="course-practice" data-active={active} data-testid="course-practice">
  <header><p className="muted">RESISTOR EDU / FIRST CIRCUITS · 오프라인 수식 실습</p><h1>나의 첫 회로 실험</h1><p>예측 → 한 변수 변경 → 계산 → 비교 → 내 설명. 웹과 앱은 같은 수식·기록 형식을 사용합니다.</p><p className="course-save" role="status">{store.message}</p><small>현재 앱·브라우저 안에 저장합니다. 웹사이트 기록은 JSON으로 직접 옮길 수 있습니다. 서버 동기화는 하지 않습니다.</small></header>
  <details><summary>내 학습 현황 · 다음 학습</summary><p>자기 완료 {p.completed}/{courseMissions.length} · 현재 수식 기록 {p.calculated} · 이전 조건 {p.stale}</p><p>완료 표시는 학생의 자기 점검입니다. 엔진 검증 결과가 아닙니다.</p><div className="course-progress-list">{p.missions.map((item,i)=><button key={item.id} onClick={()=>choose(i)}><span>{item.title}</span><small>{item.self_complete?'자기 완료 표시':item.started?'진행 중':'시작 전'} · {workbookResultLabels[item.result]}</small></button>)}</div>{p.next&&<button onClick={()=>choose(courseMissions.findIndex(m=>m.id===p.next))}>다음 학습 이어서 →</button>}</details>
  <nav aria-label="워크북 미션">{courseMissions.map((item,i)=><button key={item.id} aria-current={i===index?'step':undefined} onClick={()=>choose(i)}>{item.title}</button>)}</nav>
  <section aria-label="현재 실습">
   <h2>{m.title}</h2><p>{m.goal}</p><p>{m.question}</p>
   {m.calculator==='voltage-divider'&&<p className="course-circuit" aria-label="무부하 전압 분배기 연결">IN → R1 → <b>OUT</b> → R2 → GND (0 V)</p>}
   <label>계산 전 내 예측<textarea value={d.prediction} onChange={e=>{d.prediction=e.target.value;save();}}/></label>
   <div className="course-inputs">{m.inputs.map(input=><label key={input.id}>{input.label} ({input.unit})<input type="number" step="any" value={d.inputs[input.id]} onChange={e=>{d.inputs[input.id]=e.target.value;d.revision++;save();}}/></label>)}</div>
   <p><code>{comparison.model}</code></p>
   <div className="course-tools"><button onClick={calculate} aria-keyshortcuts="Control+Enter Meta+Enter">{m.calculator?'조건 계산·기록':'웹·오프라인 실행 불가 사유 기록'}</button>{m.inputs.some(i=>i.changed!==undefined)&&<button onClick={()=>{const change=suggestedExperiment(m,d);save();setError('');setMessage(change.message);}}>추천 변수 하나 변경</button>}<button onClick={()=>onAppPractice(m.app.includes('quiz'))}>실제 앱 실습으로 이동 →</button></div>
   <small>계산: Ctrl+Enter · Mac: ⌘+Enter</small><p role="status">{message}</p>{error&&<p role="alert" className="course-error">{error}</p>}
   <aside className="course-comparison" aria-live="polite"><h3>변경 전후 이해하기</h3><p>{comparison.fresh?'현재 조건의 기록':'현재 조건의 계산·실행 기록 없음 · 과거 기록은 보존합니다.'}</p><div className="course-run-cards">{d.runs[0]&&<RunCard run={d.runs[0]} label="기준 기록" reference={primaryReference}/>} {d.runs.length>1&&<RunCard run={d.runs.at(-1)!} label="최근 기록" reference={primaryReference}/>}</div><p><b>관찰한 사실</b> · {comparison.observed}</p><p><b>적용 모델</b> · {comparison.model}</p><p><b>판단 근거</b> · {comparison.reason}</p><p><b>다음 실험</b> · {comparison.next_experiment}</p><ul>{comparison.changes.map(c=><li key={c.id}>{c.label}: {c.before} → {c.after} {c.unit}</li>)}</ul><small>공통 수식 계산 · AI 호출 없음 · DRC/LVS/PEX/실제 시뮬레이션 미실행</small></aside>
   <details><summary>입력 조건과 실행 기록 {d.runs.length}개</summary>{d.runs.map((run,i)=><pre key={i}>{JSON.stringify(run,null,2)}</pre>)}</details>
   <p>{m.diagnosis}</p><label>결과를 본 뒤 내 설명<textarea value={d.explanation} onChange={e=>{d.explanation=e.target.value;save();}}/></label>
   <label className="course-check"><input type="checkbox" checked={d.complete} onChange={e=>{d.complete=e.target.checked;save();}}/>내 설명까지 작성했습니다 (자기 점검 · 엔진 PASS 아님)</label>
   <p className="course-meta">edition: edu · schema_version: {w.schema_version} · project_id: {w.project_id}<br/>{w.course_revision} · 현재 revision {d.revision}</p>
   <div className="course-tools"><button disabled={index===0} onClick={()=>choose(index-1)}>← 이전 미션</button><button disabled={index===courseMissions.length-1} onClick={()=>choose(index+1)}>다음 미션 →</button></div>
  </section>
  <section><h2>학습 기록 보관</h2><div className="course-tools"><button onClick={save}>저장 재시도</button><button onClick={()=>download(JSON.stringify(w,null,2),'Resistor-Edu-'+w.project_id+'.json')}>JSON 내려받기</button><button aria-expanded={showReport} onClick={()=>setShowReport(!showReport)}>보고서 미리보기</button><button onClick={()=>{setShowReport(true);requestAnimationFrame(()=>requestAnimationFrame(()=>window.print()));}}>보고서 인쇄 / PDF</button></div>
   <label>JSON 기록 다시 열기<input type="file" accept="application/json,.json" onChange={async e=>{const current=++sequence.current;setCandidate(null);const file=e.target.files?.[0];if(!file)return;try{if(file.size>2e6)throw Error('2 MB 이하 기록을 선택하세요.');const value=readCourseWorkbook(await file.text());if(current===sequence.current){setCandidate(value);setMessage('호환 기록입니다. 현재 노트를 백업한 뒤에만 전환합니다.');}}catch(err){if(current===sequence.current)setError((err as Error).message);}}}/></label>
   {candidate&&<button onClick={()=>open(candidate)}>현재 노트 백업 후 선택한 기록 열기</button>}
   <details><summary>브라우저 백업 확인 · 새 노트</summary><p>이 기기의 현재 앱 저장소만 표시합니다. 백업을 자동 삭제하지 않습니다. 중요한 기록은 JSON으로 보관하세요.</p><button onClick={()=>{try{setBackups(store.recoveryRecords());setSelected('');setError('');}catch{setError('백업 목록을 읽지 못했습니다. 현재 작성 내용은 유지됩니다.');}}}>백업 목록 새로고침</button><label>복구 후보<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">복구할 기록 선택</option>{backups.map((b,i)=><option key={b.id} value={i}>{b.source} · {b.workbook?.project_id??'원본 보관만 가능'} · {i+1}</option>)}</select></label>
    {backup&&<><details><summary>선택한 원본 내용</summary><pre>{backup.raw}</pre></details><div className="course-tools"><button disabled={!backup.workbook} onClick={()=>backup.workbook&&open(backup.workbook)}>현재 노트 백업 후 후보 열기</button><button onClick={()=>download(backup.raw,'Resistor-Edu-recovery-original.json')}>선택한 원본 내려받기</button></div></>}
    <p>새 노트는 현재 노트와 원본의 백업을 확인한 뒤 시작합니다.</p><button onClick={()=>{const next=newCourseWorkbook(crypto.randomUUID());if(open(next))choose(0);}}>백업하고 새 실험 노트 시작</button>
   </details>
  </section>
  {showReport&&<div className="course-report" aria-label="실험 보고서 미리보기" dangerouslySetInnerHTML={{__html:workbookReport(w)}}/>}
 </main>;
}
