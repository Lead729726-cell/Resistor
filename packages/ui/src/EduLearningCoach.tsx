import {useEffect,useRef,useState} from 'react';
import {rpc} from '@mos/contracts';
import {eduAiPolicy} from '../../education/src/ai-policy';
import {useStudyDraft} from './useStudyDraft';
import './edu-learning-coach.css';

type Target={kind:'question';question_id:string;question_version:string;purpose:'practice'|'qa'}|{kind:'puzzle';session_id:string;board_revision:number};
type Goal='hint'|'explain'|'experiment';
type Texts={observed_facts:string;applied_model:string;rationale?:string;reasoning?:string;next_step?:string;next_experiment?:string};
type RecordValue={id:string;version:number;policy_version:string;purpose:'practice'|'qa';status:string;created_at:string;evidence_hash:string;judgment:(Texts&{activity_kind:string})|null;activity:(Texts&{title:string;learner_question:string;checklist:string[]})|null;reflection:{text:string;author:string}|null;stages:{role:string;model:string;status:string;cache_hit:boolean}[];error?:string};
type Preview={evidence_hash:string;evidence:unknown;upper_bound_usd:number;new_provider_calls:number;cached:{judge:boolean;executor:boolean};blocked_reason:string|null};
const statusName:Record<string,string>={pending:'미실행',running:'진행 중',completed:'완료',error:'오류',needs_evidence:'추가 근거 필요'};
export default function EduLearningCoach({target,storeId,purpose,answer='',disabled=false,onBusyChange,expanded=false}:{target:Target;storeId:string;purpose?:'practice'|'qa';answer?:string;disabled?:boolean;onBusyChange?:(busy:boolean)=>void;expanded?:boolean}){
 const [goal,setGoal]=useState<Goal>('hint');
 const scope=JSON.stringify(target);
 const questionDraft=useStudyDraft({store_id:storeId,question_id:'coach-question:'+scope,question_version:eduAiPolicy.version,purpose:target.kind==='question'?target.purpose:purpose||'practice'});
 const predictionDraft=useStudyDraft({store_id:storeId,question_id:'coach-prediction:'+scope,question_version:eduAiPolicy.version,purpose:target.kind==='question'?target.purpose:purpose||'practice'});
 const question=questionDraft.answer,setQuestion=questionDraft.setAnswer,prediction=predictionDraft.answer,setPrediction=predictionDraft.setAnswer;
 const [prepared,setPrepared]=useState<{key:string;value:Preview}|null>(null),[approved,setApproved]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [record,setRecord]=useState<RecordValue|null>(null),[history,setHistory]=useState<RecordValue[]>([]),[recordInputKey,setRecordInputKey]=useState('');
 const pending=useRef(false);
 const input={target,answer:target.kind==='question'?answer:prediction,question,goal},key=JSON.stringify(input);
 const preview=prepared?.key===key?prepared.value:null,locked=disabled||busy||!questionDraft.ready||(target.kind==='puzzle'&&!predictionDraft.ready),tooLong=input.answer.length>2000;
 const draft=useStudyDraft(record?{store_id:storeId,question_id:'edu-coach:'+record.id,question_version:record.policy_version,purpose:record.purpose}:null);
 const reflection=draft.hasDraft?draft.answer:record?.reflection?.text||'';
 useEffect(()=>{setApproved(false);},[key]);
 const action=async(fn:()=>Promise<void>)=>{if(pending.current)return;pending.current=true;setBusy(true);onBusyChange?.(true);setError('');setNotice('');try{await fn();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{pending.current=false;setBusy(false);onBusyChange?.(false);setApproved(false);}};
 const readHistory=async()=>{const v=await rpc<{records:RecordValue[]}>('study.coach.history',{target});setHistory(v.records);return v.records;};
 const prepare=()=>action(async()=>{const v=await rpc<Preview>('study.coach.preview',input);setPrepared({key,value:v});await readHistory();setNotice(' 전송 범위와 최대 비용을 확인했습니다. AI 호출 0회');});
 const run=()=>action(async()=>{if(!preview)return;const v=await rpc<{record:RecordValue;cache_hit?:boolean}>('study.coach.run',{...input,expected_evidence_hash:preview.evidence_hash,max_cost_usd:preview.upper_bound_usd,approved,command_id:crypto.randomUUID()});setRecord(v.record);setRecordInputKey(key);await readHistory();setPrepared(null);setNotice(v.cache_hit?'저장된 판단·활동을 재사용했습니다. 추가 AI 호출 0회':'실행 기록을 저장했습니다. 각 단계의 실제 상태를 확인하세요.');});
 const save=()=>action(async()=>{if(!record)return;const v=await rpc<{record:RecordValue}>('study.coach.reflect',{run_id:record.id,expected_version:record.version,text:reflection,author:'learner',command_id:crypto.randomUUID()});setRecord(v.record);await readHistory();setNotice('학생이 작성한 이유 설명을 저장했습니다. 자동 채점·성적과 별도입니다.');});
 const fields=(v:Texts)=><dl>{([['관찰한 사실',v.observed_facts],['적용 규칙·모델',v.applied_model],['판단 근거',v.rationale||v.reasoning],['다음 실험·활동',v.next_step||v.next_experiment]] as const).map(([label,text])=>text?<div key={label}><dt>{label}</dt><dd>{text}</dd></div>:null)}</dl>;
 const Container=expanded?'section':'details';
 return <Container className="edu-coach" data-testid="edu-learning-coach">{expanded?<h3>학습 코치 · Luna 판단 → Sol 활동</h3>:<summary>학습 코치 · Luna 판단 → Sol 활동</summary>}
  <p>예측하고 직접 확인한 뒤, 변화의 이유를 내 말로 설명하세요. AI는 학습 안내를 작성하고 수치 채점·실제 검증은 공통 엔진이 담당합니다.</p>
  <div className="edu-coach-roles"><span><b>Luna</b> 학습 상태·다음 활동 판단</span><span><b>Sol</b> 힌트·개념·비교 실험 작성</span></div>
  <label>학습 목표<select value={goal} disabled={locked} onChange={e=>setGoal(e.target.value as Goal)}>{eduAiPolicy.goals.map(g=><option key={g.id} value={g.id}>{g.label}</option>)}</select></label>
  {target.kind==='puzzle'&&<label>내 예측·관찰<textarea value={prediction} disabled={locked} maxLength={2000} rows={2} onChange={e=>setPrediction(e.target.value)} placeholder="어느 노드의 전압·전류가 어떻게 바뀔 것 같나요?"/></label>}
  <label>궁금한 점 (선택)<textarea value={question} disabled={locked} maxLength={800} rows={2} onChange={e=>setQuestion(e.target.value)} placeholder="정답보다 내가 놓친 조건을 알려주세요."/></label>
  {(questionDraft.error||predictionDraft.error)&&<p className="inline-error">질문·예측은 현재 화면에 보관 중입니다. 새로고침 전에 복사해 주세요.</p>}
  {tooLong&&<p role="alert">AI 전송 답안은 2,000자 이내입니다. 원래 답안은 보존되며, 직접 줄인 뒤 준비할 수 있습니다.</p>}
  <button type="button" className="button" disabled={locked||tooLong} onClick={()=>void prepare()}>전송 내용·최대 비용 확인 · 0토큰</button>
  {preview&&<div className="edu-coach-preview"><p><strong>새 호출 최대 {preview.new_provider_calls}회 · US${preview.upper_bound_usd.toFixed(6)}</strong><br/>Luna {preview.cached.judge?'저장 결과 재사용':'판단 요청'} / Sol {preview.cached.executor?'저장 결과 재사용':'판단에 따라 활동 작성'}</p><details><summary>전송할 입력·실행 근거 보기</summary><pre>{JSON.stringify(preview.evidence,null,2)}</pre></details>{preview.blocked_reason&&<p className="inline-error">{preview.blocked_reason} 상한 설정은 문제 은행의 ‘학습 도구 → AI 학습 비용 상한’에서 확인하세요.</p>}{preview.new_provider_calls>0&&<label className="study-consent"><input type="checkbox" checked={approved} disabled={locked||!!preview.blocked_reason} onChange={e=>setApproved(e.target.checked)}/>위 입력과 기존 계산/실행 근거를 OpenAI의 Luna·Sol에 보내며, 표시된 최대 비용을 승인합니다.</label>}<button type="button" className="button primary" disabled={locked||!!preview.blocked_reason||(preview.new_provider_calls>0&&!approved)} onClick={()=>void run()}>{preview.new_provider_calls?'승인한 학습 활동 시작':'저장된 학습 활동 열기 · 0토큰'}</button></div>}
  {busy&&<p role="status">요청 처리 중… 완료 상태와 저장 결과는 응답 후 표시합니다. 승인한 새 AI 활동은 Luna 판단 → Sol 작성 순서입니다.</p>}
  {error&&<p className="inline-error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {record&&<article className="edu-coach-result"><h4>학습 안내 · {statusName[record.status]||record.status}</h4><small>{new Date(record.created_at).toLocaleString()} · {record.purpose==='qa'?'기능 QA':'학생 연습'} · {preview?.evidence_hash===record.evidence_hash?'현재 준비한 조건과 일치':recordInputKey===key?'본 입력으로 만든 활동 · 실행 당시 근거 스냅샷':'이전 입력의 기록 · 현재 조건은 다시 준비해 확인하세요.'}</small>
   <ul aria-label="AI 단계 상태">{(['judge','executor'] as const).map(role=>{const stage=record.stages.find(s=>s.role===role);return <li key={role}>{role==='judge'?'Luna 판단':'Sol 활동'} · {stage?`${statusName[stage.status]||stage.status}${stage.cache_hit?' · 재사용':''} · ${stage.model}`:record.status==='needs_evidence'?'추가 근거 요청으로 생략':'미실행'}</li>;})}</ul>
   {record.error&&<p className="inline-error">{record.error}</p>}
   {record.judgment&&<section><h5>Luna의 학습 판단</h5>{fields(record.judgment)}</section>}
   {record.activity&&<section><h5>{record.activity.title}</h5>{fields(record.activity)}<ul>{record.activity.checklist.map((v,i)=><li key={i}>{v}</li>)}</ul><p><b>내가 설명할 질문</b><br/>{record.activity.learner_question}</p></section>}
   {['completed','needs_evidence'].includes(record.status)&&<><label>내 이유 설명 · 학생 작성<textarea aria-label="내 이유 설명" value={reflection} disabled={locked||!draft.ready} rows={4} maxLength={4000} onChange={e=>draft.setAnswer(e.target.value)} placeholder="관찰한 사실 → 적용한 규칙 → 내 판단 → 다음에 확인할 것"/></label>{record.reflection?.author==='ai_draft'&&<p>저장된 원문은 AI 초안으로 표시되어 있습니다. 학생 설명과 구분하세요.</p>}{draft.error&&<p className="inline-error" role="alert">{draft.error}</p>}<p className="edu-coach-muted">입력은 기기에 임시 보관됩니다. ‘설명 저장’ 후 Edu 학습 기록에서 다시 열 수 있습니다.</p><button type="button" className="button" disabled={locked||!draft.ready||!reflection.trim()} onClick={()=>void save()}>내 이유 설명 저장 · 0토큰</button></>}
  </article>}
  <details className="edu-coach-history"><summary>이 문제의 학습 활동 기록 · {history.length}개</summary><button className="button small" disabled={locked} onClick={()=>void action(async()=>{await readHistory();setNotice('저장된 활동 기록을 읽었습니다. AI 호출 0회');})}>저장 기록 불러오기 · 0토큰</button>{history.map(r=><button type="button" className="button" key={r.id} disabled={locked} onClick={()=>{setRecord(r);setRecordInputKey('');setNotice('저장된 활동과 학생 설명을 열었습니다. AI 호출 0회');}}>{new Date(r.created_at).toLocaleString()} · {statusName[r.status]||r.status}{r.reflection?' · 설명 저장됨':''}</button>)}</details>
  <p className="edu-coach-muted">{eduAiPolicy.scope} · AI가 회로를 수정하거나 시뮬레이션을 실행하지 않습니다. 안내를 받은 문제는 도움받은 학습으로 기록합니다.</p>
 </Container>;
}
