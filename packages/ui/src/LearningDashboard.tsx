import {useState} from 'react';
import {rpc} from '@mos/contracts';
import type {LearningSummary} from '../../education/src/learning-dashboard';
import {useReadResource} from './useReadResource';
import ReadConnection from './ReadConnection';
import {lessonStorageKey,inspectLessonDraft} from './lesson-draft';
import {eduDesignSteps} from './edu-navigation';
import './learning-dashboard.css';

type Dashboard={schema_version:1;edition:'edu';checked_at:string;records:LearningSummary[];warnings:{lesson_id:string;reason:string}[];total:number;offset:number;limit:number;has_more:boolean;qa_hidden:number;read_only:true};
const local=(key:string)=>{try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return {schema_version:-1};}};
function localLesson(record:LearningSummary){
 const draft=inspectLessonDraft(local(lessonStorageKey+'.draft.'+record.id),{lesson_id:record.id,project_id:record.project_id,revision:record.current_revision??record.recorded_revision,base_saved_at:record.student.saved_at});
 const page=local(lessonStorageKey+'.page.'+record.id);
 return {draft,step:Number.isInteger(page)&&page>=1&&page<=7?page:record.suggested_step};
}
const loadLabel=(value:number|undefined)=>Number.isFinite(value)?(value!*1e15).toPrecision(4)+' fF':'수치 없음';
export default function LearningDashboard({onOpen,onNew,active=true}:{onOpen:(lessonId:string,step:number)=>void;onNew:()=>void;active?:boolean}){
 const [qa,setQa]=useState(false),[offset,setOffset]=useState(0),[query,setQuery]=useState('');
 const resource=useReadResource(()=>rpc<Dashboard>('learning.dashboard',{include_qa:qa,offset,limit:20}),`dashboard-${qa}-${offset}`,active);
 const cached=resource.loading||!!resource.error;
 const records=(resource.data?.records||[]).filter(r=>(qa||r.purpose!=='qa')&&(!query||[r.name,r.project_id,r.id].some(s=>s.toLowerCase().includes(query.toLowerCase()))));
 const groups=new Map<string,LearningSummary[]>();for(const r of records)groups.set(r.project_id,[...(groups.get(r.project_id)||[]),r]);
 return <main className="learning-dashboard" data-testid="learning-dashboard"><header><div><p className="edu-start-eyebrow">RESISTOR EDU / MY LEARNING PROJECTS</p><h1>내 학습 프로젝트</h1><p>저장된 조건과 실제 실행 기록을 확인하고 실습을 이어가세요.</p></div><button className="button primary" onClick={onNew}>새 설계 실습 선택</button></header>
  <ReadConnection loading={resource.loading} error={resource.error} checkedAt={resource.checkedAt} cached={!!resource.data} onRetry={()=>void resource.reload()} label="프로젝트 상태 다시 읽기"/>
  <div className="learning-dashboard-filters"><label>현재 페이지에서 검색<input type="search" aria-label="학습 프로젝트 검색" placeholder="프로젝트 이름 또는 ID" value={query} onChange={e=>setQuery(e.target.value)}/></label><label className="learning-qa-filter"><input type="checkbox" checked={qa} onChange={e=>{setQa(e.target.checked);setOffset(0);}}/>QA 사본 포함{!qa&&resource.data?` · ${resource.data.qa_hidden}건 숨김`:''}</label><span>{resource.data?`저장 실습 ${resource.data.total}건 · 현재 ${groups.size}개 프로젝트`:'저장 기록 조회 중'}</span></div>
  <p className="learning-dashboard-note">설명 저장과 학습 단계는 DRC·LVS·PEX 통과가 아닙니다. 엔진 연결이 끊기면 저장 기록만 표시하며 현재성을 확인했다고 표시하지 않습니다. 초안·마지막 페이지는 이 기기에만 남습니다.</p>
  {resource.data?.warnings.map(w=><p className="edu-caution" key={w.lesson_id}>{w.lesson_id.slice(0,8)} · {w.reason}</p>)}
  {!records.length&&!resource.loading&&<section className="learning-dashboard-empty"><h2>{query?'검색 조건에 맞는 실습이 없습니다.':'표시할 학습 실습이 없습니다.'}</h2><p>{qa?'새 설계 실습에서 시작하세요.':'학생 실습을 시작하거나 QA 사본 포함을 선택하세요.'}</p></section>}
  <div className="learning-projects">{[...groups].map(([projectId,lessons])=><article className="learning-project" key={projectId} data-testid="learning-project"><header><h2>{lessons[0].name}</h2><span>{lessons[0].connection.status==='current'?`${cached?'마지막 조회':'현재'} r${lessons[0].current_revision}`:'엔진 연결 확인 필요'}</span></header><code>project {projectId}</code>{lessons.map(r=>{
   const {draft,step}=localLesson(r),conditions=r.inputs.conditions;
   return <section key={r.id} className="learning-lesson" data-lesson-id={r.id}><div className="learning-lesson-heading"><strong>{r.purpose==='qa'?'QA 사본 · 학생 제출물 아님':r.purpose==='practice'?'학생 실습':'이전 기록 · 용도 미지정'}</strong><time>{new Date(r.updated_at).toLocaleString()}</time></div><code>lesson {r.id.slice(0,8)} · schema {r.schema_version} · edu · 기록 r{r.recorded_revision}</code>
    {r.connection.status!=='current'&&<p role="status" className="edu-caution">현재 설계 조회 실패 · {r.connection.reason} 저장된 실행 상태는 과거 조회 기록입니다.</p>}
    <dl className="learning-inputs"><div><dt>출력 부하</dt><dd>{loadLabel(conditions?.load_F)} <small>{r.inputs.source==='project_snapshot'?`${cached?'마지막 조회':'현재'} 입력 r${r.inputs.revision}`:r.inputs.source==='recorded_trial'?`이전 실행 입력 r${r.inputs.revision}`:'입력 확인 필요'}</small></dd></div><div><dt>모델 조건</dt><dd>{conditions?`${conditions.corner??'미확인'} · ${conditions.temperature_C??'미확인'} °C · ${conditions.supply_V??'미확인'} V`:'현재 입력을 읽지 못했습니다.'}</dd></div><div><dt>학생 설명</dt><dd>{r.student.saved_at?(r.student.explanation_saved?'설명 저장됨':'기록 저장됨 · 설명 없음'):'저장 전'}{r.student.written_for_revision!==null&&<small>작성 기준 r{r.student.written_for_revision}{r.current_revision!==null&&r.student.written_for_revision!==r.current_revision?' · 현재 설계와 다름':''}</small>}</dd></div><div><dt>기기 임시 저장</dt><dd>{({none:'없음',invalid:'형식 확인 필요',conflict:'충돌 확인 필요',restored:'보관 중'})[draft.status]}{draft.draft&&<small>부하 입력 {draft.draft.load} fF · 기기 초안</small>}</dd></div></dl>
    <div className="learning-result-list">{r.trials.length?r.trials.map((t,i)=><p key={t.run_id||i}><b>{t.slot==='before'?'변경 전':'변경 후'}</b> r{t.revision} · {t.execution_status} / {t.analysis_result} · {cached?'마지막 조회 · 현재성 미확인':t.freshness==='current'?'현재':t.freshness==='stale'?'이전 revision / 의존성':'현재성 미확인'}<small>{t.run_id||'실행 ID 없음'} · {t.source==='project_snapshot'?'프로젝트 조회':'저장 기록'} · {t.metrics_available?'측정 수치 보관':'측정 수치 없음'}</small></p>):<p>실제 시뮬레이션 실행 기록 없음 · not_run</p>}</div>
    <div className="learning-verification">{Object.entries(r.verification).map(([kind,v])=><span key={kind} title={v.reason}>{kind.toUpperCase()} · {v.execution_status} / {v.analysis_result}{cached&&<small>마지막 조회 · 현재성 미확인</small>}{!cached&&v.revision!==null&&<small>r{v.revision} · {!cached&&v.freshness==='current'?'현재':'현재성 확인 필요'}</small>}</span>)}</div>
    <p className="learning-provenance">기록의 엔진 {r.engine.id||'미확인'} · 공정 {r.process.id} · {r.process.version||'버전 미확인'}</p><button className="button" disabled={resource.loading} onClick={()=>onOpen(r.id,step)}>이 실습 이어가기 · {step}/7 {eduDesignSteps[step-1]} →</button>
   </section>;
  })}</article>)}</div>
  <nav className="learning-pagination" aria-label="학습 프로젝트 목록 페이지"><button className="button" disabled={offset===0||resource.loading} onClick={()=>setOffset(Math.max(0,offset-20))}>이전 목록</button><span>{Math.floor(offset/20)+1} 페이지</span><button className="button" disabled={!resource.data?.has_more||resource.loading} onClick={()=>setOffset(offset+20)}>다음 목록</button></nav>
 </main>;
}
