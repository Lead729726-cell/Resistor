import {useEffect,useRef,useState} from 'react';
import {localRpc,type Project,type AssistantContext,type AssistantReference,type AssistantFinding,type AssistantEvidence,type AssistantDiagnosis,type AssistantProviderStatus,type AssistantReviewReceipt,type AssistantConversation,type AssistantConversationSummary} from '@mos/contracts';
import AssistantWorkflow from './AssistantWorkflow';
import AutoDesign from './AutoDesign';
import GuidedPages from './GuidedPages';
import './design-assistant.css';

const prompts=['선택한 소자의 역할과 핀 연결을 설명해줘.','실패하거나 미실행인 검사를 우선순위로 정리해줘.','전압 강하·전류의 실제 수치와 부족한 근거를 설명해줘.','어떤 개선 가설을 어떤 시뮬레이션으로 비교하면 좋을까?'];
const errors:Record<string,string>={STALE_AI_EVIDENCE:'설계나 실행 근거가 바뀌었습니다. 근거를 다시 읽고 새 대화를 시작하세요.',REVISION_CONFLICT:'설계가 변경됐습니다. 최신 근거를 다시 읽으세요.',AI_BUDGET:'API 호출 예산이 없거나 예약 한도를 넘었습니다.',AI_SESSION_BUSY:'이 대화에서 이전 질문을 처리하고 있습니다.',AI_TURN_CONFLICT:'저장된 대화가 변경됐습니다. 대화를 다시 불러오세요.',AI_TURN_LIMIT:'12개 질문에 도달했습니다. 새 대화를 시작하세요.',AI_SECRET_INPUT:'키로 보이는 값이 있어 전송하지 않았습니다. 질문이나 설계 정보에서 해당 값을 제거하세요.',AI_INCOMPLETE:'모델이 답변을 완료하지 못했거나 거절했습니다. 자동으로 재호출하지 않습니다.',AI_PROVIDER_UNAVAILABLE:'모델 연결이 중단되거나 시간이 초과됐습니다. 자동으로 재호출하지 않습니다.',AI_MODEL_MISSING:'선택한 로컬 모델이 설치돼 있지 않습니다.',AI_SELECTION:'현재 셀에서 선택 소자를 찾지 못했습니다. 계층과 선택을 확인하세요.'};
const severityLabel={info:'안내',warning:'확인 필요',error:'오류'};

export default function DesignAssistant({project,context={},shared=false,readOnly=false,onRefresh,onOpenProject,onCheck,onLocate}:{project:Project|null;context?:AssistantContext;shared?:boolean;readOnly?:boolean;onRefresh?:()=>Promise<void>;onOpenProject?:(project:Project,runId?:string)=>Promise<void>;onCheck:(target:string)=>void;onLocate?:(reference:AssistantReference)=>void}){
  const [status,setStatus]=useState<AssistantProviderStatus>(),[evidence,setEvidence]=useState<AssistantEvidence>(),[diagnosis,setDiagnosis]=useState<AssistantDiagnosis>();
  const [result,setResult]=useState<AssistantReviewReceipt>(),[reviews,setReviews]=useState<AssistantReviewReceipt[]>([]),[conversation,setConversation]=useState<AssistantConversation>(),[sessions,setSessions]=useState<AssistantConversationSummary[]>([]);
  const [provider,setProvider]=useState<'ollama'|'openai'>('ollama'),[model,setModel]=useState(''),[approved,setApproved]=useState(false),[busy,setBusy]=useState(''),[error,setError]=useState(''),[question,setQuestion]=useState(''),[mode,setMode]=useState<'chat'|'review'|'workflow'|'auto'>('chat');
  const [page,setPage]=useState(0),[depth,setDepth]=useState<'main'|'rules'|'measurements'|'raw'>('main');
  const navigate=(next:number)=>{setApproved(false);setPage(next);};
  const generation=useRef(0),inFlight=useRef(false),mounted=useRef(true),latest=useRef<HTMLDivElement>(null);
  const contextKey=JSON.stringify(context),runKey=JSON.stringify(project?.runs?.map(r=>[r.id,r.revision,r.execution_status,r.analysis_result,r.freshness,r.measurements,r.parasitics]));
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current++;};},[]);
  useEffect(()=>{generation.current++;setEvidence(undefined);setDiagnosis(undefined);setResult(undefined);setReviews([]);setConversation(undefined);setSessions([]);setApproved(false);setError('');setBusy(inFlight.current?'이전 요청 완료를 기다리는 중':'');},[project?.id,project?.revision,contextKey,runKey,shared]);
  useEffect(()=>{const log=latest.current?.parentElement;if(log)log.scrollTop=log.scrollHeight;},[conversation?.turns.length]);
  const execute=async(label:string,fn:(version:number)=>Promise<void>)=>{if(inFlight.current)return;const version=generation.current;inFlight.current=true;setBusy(label);setError('');try{await fn(version);}catch(e){if(mounted.current&&generation.current===version){const cause=e as Error&{code?:string};setError(errors[cause.code||'']||cause.message||'요청을 완료하지 못했습니다.');}}finally{inFlight.current=false;if(mounted.current)setBusy('');}};
  const params=()=>({project_id:project!.id,expected_revision:project!.revision,context});
  const current=!!project&&evidence?.project.id===project.id&&evidence.project.revision===project.revision;
  const ready=provider==='openai'?status?.openai.configured&&status.openai.remaining_usd>0:status?.ollama.available&&!!model;
  const measured=evidence?.runs.filter(r=>r.kind==='simulation'&&r.revision===project?.revision&&r.freshness==='current'&&r.execution_status==='completed').at(-1);
  const number=(value:number|undefined)=>value===undefined?'—':new Intl.NumberFormat('en',{notation:'engineering',maximumSignificantDigits:6}).format(value);
  const chatCurrent=!conversation||conversation.freshness==='current'&&conversation.evidence_hash===evidence?.fingerprint;
  const preview=(withProvider:boolean)=>void execute('설계 근거를 읽는 중',async version=>{
    const [next,s]=await Promise.all([localRpc<AssistantDiagnosis>('assistant.diagnose',params()),withProvider?localRpc<AssistantProviderStatus>('assistant.status'):Promise.resolve(undefined)]);
    if(generation.current!==version)return;setEvidence(next.evidence);setDiagnosis(next);setResult(undefined);setApproved(false);
    if(s){setStatus(s);setModel(s.ollama.selected_model||'');if(!s.ollama.available&&s.openai.configured)setProvider('openai');}
  });
  const refs=(ids:string[],source:AssistantEvidence|undefined,enabled:boolean)=><div className="assistant-references" aria-label="답변 근거">{ids.map(id=>{const ref=source?.references?.find(r=>r.id===id),canLocate=ref&&['device','shape','net','run','connectivity'].includes(ref.kind);return <button key={id} disabled={!enabled||!canLocate||!onLocate||!!busy} title={id} onClick={()=>ref&&onLocate?.(ref)}>{ref?.label||id}</button>;})}</div>;
  const findings=(items:AssistantFinding[],source:AssistantEvidence|undefined,enabled:boolean)=><div className="assistant-findings">{items.map((f,i)=><article key={i} data-severity={f.severity}><small>{severityLabel[f.severity]}</small><strong>{f.title}</strong><p>{f.explanation}</p>{refs(f.evidence_ids,source,enabled)}<button disabled={!!busy||!enabled} onClick={()=>onCheck(f.suggested_check)}>확인 화면 열기</button></article>)}</div>;
  const download=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({product:evidence?.product,evidence,diagnosis,result,conversation},null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=`${project?.cell||'design'}-assistant.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  const send=()=>void execute('질문을 분석하는 중 · 자동 재호출 없음',async version=>{
    if(!evidence||!question.trim()||!approved)return;setApproved(false);
    const next=await localRpc<AssistantConversation>('assistant.chat',{...params(),provider,...(provider==='ollama'?{model}:{}),evidence_hash:evidence.fingerprint,approved:true,question:question.trim(),...(conversation?{session_id:conversation.id,expected_turn:conversation.turns.length}:{expected_turn:0})});
    if(generation.current!==version)return;setConversation(next);setQuestion('');
    try{const s=await localRpc<AssistantProviderStatus>('assistant.status');if(generation.current===version)setStatus(s);}catch{/* Keep the saved answer visible if status refresh fails. */}
  });
  const loadSession=(id:string)=>void execute('저장된 대화를 읽는 중',async version=>{const next=await localRpc<AssistantConversation>('assistant.chat_get',{...params(),session_id:id});if(generation.current===version){setConversation(next);if(next.freshness==='current')setEvidence(next.evidence);setApproved(false);}});
  return <section className="design-assistant" data-testid="design-assistant" data-step={page} data-depth={depth} aria-busy={!!busy}>
    <header><span>DESIGN ASSISTANT · {evidence?.product.name||'RESISTOR'}</span><h3>설계를 보면서 질문하고, 근거까지 확인하세요</h3><p>{project?.name||'프로젝트 없음'} · {context.cell_name||project?.cell||'—'} · r{project?.revision??'—'}{context.device_ids?.length?` · 선택 소자 ${context.device_ids.length}개`:''}{context.shape_ids?.length?` · 선택 도형 ${context.shape_ids.length}개`:''}</p></header>
    {shared&&<p role="status">AI 연결과 저장된 대화는 로컬 작업공간에서 사용합니다. 공동 작업 서버에는 로컬 키와 대화를 공유하지 않습니다.</p>}
    {((context.device_ids?.length||0)>=32||(context.shape_ids?.length||0)>=64)&&<p className="assistant-limit">선택 근거는 소자 최대 32개·도형 최대 64개를 포함합니다. 큰 선택은 일부만 검토합니다.</p>}
    {error&&<p role="alert" className="assistant-error">{error}</p>}
    <div className="assistant-progress" role="status">{busy}</div>
    <div hidden={depth!=='main'} inert={depth!=='main'}><GuidedPages id="assistant-guided-flow" step={page} onStep={navigate} pages={[
      {title:'어떤 도움이 필요한가요?',description:'도움 방식을 선택한 뒤 근거와 실행 조건을 확인합니다.',content:<div className="assistant-mode-choices">{([
        ['chat','설계 대화','회로와 실제 결과를 질문하고 답변의 근거로 이동합니다.'],
        ['review','한 번 검토','현재 근거로 개선 제안을 한 번 요청합니다.'],
        ['workflow','Luna 판단 · Sol 실행','현재 회로의 변경 계획을 검토하고 따로 승인합니다.'],
        ['auto','AI 오토 설계','새 후보를 만들고 실제 해석으로 목표를 비교합니다.']
      ] as const).map(([key,label,description])=><button key={key} data-testid={'assistant-mode-'+key} aria-pressed={mode===key} onClick={()=>{setMode(key);navigate(1);}}><strong>{label}</strong><span>{description}</span></button>)}</div>},
      {title:'근거와 연결을 확인하세요',description:'읽기 버튼으로 현재 설계와 연결 상태를 확인합니다. 단계 이동은 모델을 호출하지 않습니다.',content:<>
    <div className="assistant-actions">
      <button data-testid="assistant-preview" disabled={!project||shared||!!busy} onClick={()=>preview(true)}>설계 근거·연결 상태 읽기</button>
      <button data-testid="assistant-diagnose" disabled={!project||shared||!!busy} onClick={()=>preview(false)}>빠른 점검 · 모델 호출 없음</button>
</div>
    {status&&<fieldset disabled={!!busy||shared}><legend>AI 제공자</legend><label>실행 위치<select aria-label="AI 제공자" value={provider} onChange={e=>{setProvider(e.target.value as typeof provider);setApproved(false);}}><option value="ollama">로컬 Ollama</option><option value="openai">OpenAI API</option></select></label>{provider==='ollama'?<><label>설치된 모델<select aria-label="Ollama 모델" value={model} onChange={e=>{setModel(e.target.value);setApproved(false);}}><option value="">모델 선택</option>{status.ollama.models.map(name=><option key={name}>{name}</option>)}</select></label><p>{status.ollama.available?'로컬 서버 연결됨':'로컬 서버·모델 미연결 · 빠른 점검은 사용 가능'}</p></>:<p>{status.openai.configured?'로컬 키 설정됨':'키 미설정'} · {status.openai.model}<br/>호출 예약 잔여 US${status.openai.remaining_usd.toFixed(6)} / 승인 한도 US${status.openai.budget_usd}</p>}</fieldset>}
    {evidence&&<>      <div className="assistant-scope"><strong>{evidence.connectivity.scope}</strong><span>소자 {evidence.connectivity.device_count}개 · 넷 {evidence.connectivity.net_count}개{evidence.connectivity.truncated?' · 일부 입력':''}</span><code title={evidence.fingerprint}>{evidence.fingerprint.slice(0,12)}</code></div>
<div className="assistant-depth-actions"><button data-testid="assistant-open-rules" onClick={()=>setDepth('rules')}>빠른 점검 결과 →</button><button data-testid="assistant-open-measurements" disabled={!measured} onClick={()=>setDepth('measurements')}>실제 전압·전류 →</button><button data-testid="assistant-open-evidence" onClick={()=>setDepth('raw')}>전달할 근거·실행 상태 →</button></div></>}
    {!current&&<p className="assistant-limit">현재 근거를 먼저 읽으세요. 프로젝트·선택·실행 상태가 바뀌면 전송 승인이 해제됩니다.</p>}
      </>},
      {title:mode==='chat'?'설계 질문':mode==='review'?'검토 요청':mode==='workflow'?'변경 계획과 실행':'자동 설계',description:'모델 전송과 설계 적용은 각각 명시적인 승인이 필요합니다.',content:<>
    <div hidden={mode!=='chat'} role="tabpanel" aria-label="설계 대화">
      <div className="assistant-chat-tools">      <button data-testid="assistant-chat-history" disabled={!project||shared||!!busy} onClick={()=>void execute('대화 목록을 읽는 중',async version=>{const next=await localRpc<AssistantConversationSummary[]>('assistant.chat_history',params());if(generation.current===version){setSessions(next);setMode('chat');if(!next.length)setError('이 프로젝트에 저장된 대화가 없습니다.');}})}>저장된 대화</button>
<button data-testid="assistant-new-chat" disabled={!!busy} onClick={()=>{setConversation(undefined);setQuestion('');setApproved(false);setError('');}}>새 대화</button>{sessions.length>0&&<label>저장된 대화<select aria-label="저장된 설계 대화" value={conversation?.id||''} onChange={e=>e.target.value&&loadSession(e.target.value)} disabled={!!busy}><option value="">대화 선택</option>{sessions.map(s=><option key={s.id} value={s.id}>r{s.revision} · {s.freshness==='current'?'현재 근거':'이전 근거'} · {s.turn_count}개 질문 · {s.last_question.slice(0,48)}</option>)}</select></label>}</div>
      {!chatCurrent&&<p role="status" className="assistant-stale">이전 근거에 대한 대화입니다. 현재 설계 판단에 사용하지 말고 근거를 다시 읽은 뒤 새 대화를 시작하세요.</p>}
      <div className="assistant-chat-log" role="log" aria-label="설계 대화 내용" aria-live="polite" data-testid="assistant-chat-log">
        {!conversation?.turns.length&&<p className="assistant-empty">예: “선택한 소자가 왜 필요한지”, “전류가 얼마나 흐르는지” 질문하세요. 먼저 근거를 읽으면 현재 셀과 선택 항목을 함께 검토합니다.</p>}
        {conversation?.turns.map(turn=><article className="assistant-chat-turn" key={turn.id}><div className="assistant-user"><small>내 질문</small><p>{turn.question}</p></div><div className="assistant-answer"><small>{turn.provider} · {turn.model} · {chatCurrent?'현재 근거의 검토 제안':'이전 근거의 검토 제안'}</small><p>{turn.reply.answer}</p>{refs(turn.reply.evidence_ids,conversation.evidence,chatCurrent&&current)}{findings(turn.reply.findings,conversation.evidence,chatCurrent&&current)}{turn.reply.limitations.map((limit,i)=><p key={i} className="assistant-limit">{limit}</p>)}{turn.budget_reservation&&<small>비용 예약 US${turn.budget_reservation.reserved_usd.toFixed(6)} · 최종 청구액과 구분</small>}</div></article>)}<div ref={latest}/>
      </div>
      <div className="assistant-prompts" aria-label="추천 질문">{(conversation?.turns.at(-1)?.reply.follow_up_questions.length?conversation.turns.at(-1)!.reply.follow_up_questions:prompts).map(prompt=><button key={prompt} disabled={!!busy||shared} onClick={()=>{setQuestion(prompt);setApproved(false);}}>{prompt}</button>)}</div>
      <form className="assistant-composer" onSubmit={e=>{e.preventDefault();if(approved&&ready&&current&&chatCurrent&&question.trim()&&!busy)send();}}>
        <label htmlFor="assistant-question">설계 질문 <span>{question.length}/3000</span></label><textarea id="assistant-question" data-testid="assistant-question" maxLength={3000} value={question} rows={3} placeholder="회로·레이아웃·실행 결과에 대해 질문하세요. 키나 암호는 입력하지 마세요." disabled={!!busy||shared} onChange={e=>{setQuestion(e.target.value);setApproved(false);}}/>
        <label className="assistant-consent"><input data-testid="assistant-chat-approve" type="checkbox" checked={mode==='chat'&&approved} disabled={!!busy||!current||!ready||!chatCurrent||!question.trim()||shared} onChange={e=>setApproved(e.target.checked)}/>{provider==='openai'?'근거·질문·최근 대화를 OpenAI로 보내고, 승인된 예산 안에서 이 질문을 처리합니다.':'근거·질문·최근 대화를 선택한 로컬 모델에 한 번 전달합니다.'}</label>
        <div className="assistant-send-row"><small>{conversation?`${conversation.turns.length}/12 질문 · 최근 최대 4개 대화가 모델에 전달됩니다.`:'대화는 이 작업공간에 저장됩니다. 엔진 검증과 별개입니다.'}</small><button type="submit" className="primary" data-testid="assistant-chat-send" disabled={!!busy||!current||!ready||!approved||!question.trim()||!chatCurrent||shared||(conversation?.turns.length||0)>=12}>질문 보내기</button></div>
      </form>
    </div>
    <div hidden={mode!=='auto'} role="tabpanel" aria-label="AI 오토 설계"><AutoDesign disabled={shared||readOnly||!!busy} onOpenProject={onOpenProject}/></div>
    <div hidden={mode!=='workflow'} role="tabpanel" aria-label="Luna 판단 Sol 실행"><AssistantWorkflow project={project} context={context} evidence={evidence} status={status} disabled={shared||readOnly||!!busy} onRefresh={onRefresh} onStatus={setStatus}/></div>
    <div hidden={mode!=='review'} role="tabpanel" aria-label="한 번 검토">      <button data-testid="assistant-history" disabled={!project||shared||!!busy} onClick={()=>void execute('저장된 검토 읽는 중',async version=>{const next=await localRpc<AssistantReviewReceipt[]>('assistant.history',params());if(generation.current===version){setReviews(next);setResult(next[0]);setMode('review');}})}>저장된 검토 읽기 · API 호출 없음</button>

      {reviews.length>0&&<label>이전 검토<select aria-label="저장된 AI 검토" value={result?.id||''} onChange={e=>setResult(reviews.find(r=>r.id===e.target.value))}>{reviews.map(r=><option key={r.id} value={r.id}>{r.provider} · r{r.revision} · {r.freshness}</option>)}</select></label>}
      <label className="assistant-consent"><input data-testid="assistant-approve" type="checkbox" checked={mode==='review'&&approved} disabled={!!busy||!current||!ready||shared} onChange={e=>setApproved(e.target.checked)}/>{provider==='openai'?'위 설계 근거를 OpenAI로 보내고 승인된 예산 안에서 한 번 검토합니다.':'위 설계 근거를 선택한 로컬 모델로 한 번 검토합니다.'}</label>
      <button className="primary" data-testid="assistant-run" disabled={!!busy||!current||!approved||!ready||shared} onClick={()=>void execute('AI 검토 중',async version=>{setApproved(false);const next=await localRpc<AssistantReviewReceipt>('assistant.review',{...params(),provider,...(provider==='ollama'?{model}:{}),evidence_hash:evidence!.fingerprint,approved:true});if(generation.current!==version)return;setResult(next);try{const s=await localRpc<AssistantProviderStatus>('assistant.status');if(generation.current===version)setStatus(s);}catch{/* Keep the saved review visible. */}})}>AI 설계 검토 실행</button>
      {result&&<div className="assistant-result" data-testid="assistant-result"><header><strong>{result.provider} · {result.model} · {result.freshness==='current'?'현재 근거':'이전 근거'} · 검토 제안</strong></header><p>{result.review.summary}</p>{result.budget_reservation&&<small>이번 호출 비용 예약 US${result.budget_reservation.reserved_usd.toFixed(6)} · 최종 청구액과 구분</small>}{findings(result.review.findings,evidence,result.freshness==='current'&&current)}{result.review.limitations.map((limit,i)=><p key={i} className="assistant-limit">{limit}</p>)}</div>}
    </div>
      {(evidence||conversation||result)&&<button onClick={download}>근거·대화 저장</button>}
      </>}
    ]}/></div>
    <section hidden={depth==='main'} inert={depth==='main'} className="assistant-evidence-depth" data-testid="assistant-evidence-depth" data-depth={depth}>
      <button data-testid="assistant-depth-back" onClick={()=>setDepth('main')}>← 근거 설정으로</button>
      <div hidden={depth!=='rules'}>{diagnosis&&<GuidedPages id="assistant-rules-flow" pages={[
        {title:'빠른 점검 · 규칙 기반 안내',content:<><p>{diagnosis.review.summary}</p><p>{diagnosis.review.findings.length}개 항목 · 모델 호출 없음</p></>},
        ...diagnosis.review.findings.map((finding,index)=>({title:`점검 ${index+1} · ${finding.title}`,content:findings([finding],evidence,current)}))
      ]}/>}</div>
      <div hidden={depth!=='measurements'}>      {measured&&<details className="assistant-evidence" open><summary>실제 전압·전류·전압 강하 요약 · r{measured.revision}</summary><div className="assistant-measurements"><table><thead><tr><th>신호 / 기준 노드</th><th>최소</th><th>최대</th><th>마지막 샘플</th></tr></thead><tbody>{measured.waveform_summary.filter(w=>w.available).map((w,i)=><tr key={'w'+i}><th>{w.name} ({w.unit})</th><td>{number(w.min)}</td><td>{number(w.max)}</td><td>{number(w.last)}</td></tr>)}{measured.current_flow_summary?.branches?.flatMap((b,i)=>[b.current.available&&<tr key={'i'+i}><th>{b.name} · {b.from_net} → {b.to_net} (A)</th><td>{number(b.current.min)}</td><td>{number(b.current.max)}</td><td>{number(b.current.last)}</td></tr>,b.voltage_drop.available&&<tr key={'v'+i}><th>{b.from_net} − {b.to_net} (V)</th><td>{number(b.voltage_drop.min)}</td><td>{number(b.voltage_drop.max)}</td><td>{number(b.voltage_drop.last)}</td></tr>])}</tbody></table></div><p>전류 부호는 저장된 기준 노드에 따릅니다. 전압 강하는 같은 샘플의 두 노드 차이입니다. 물리 레이아웃의 전기적 대응 검증과 구분하세요.</p></details>}
</div>
      <div hidden={depth!=='raw'}>{evidence&&<>      <details className="assistant-evidence" open><summary>전달할 근거와 실제 실행 상태 보기</summary><p>마스크 bbox·레이어·net 표시는 전기적 추출 검증을 의미하지 않습니다. 파형 통계는 저장된 부호·단위를 유지합니다.</p><div className="assistant-run-list">{evidence.runs.map(r=><div key={r.id}><strong>{r.kind} · r{r.revision}</strong><span>{r.execution_status} / {r.analysis_result} · {r.tool||'도구 미지정'}</span></div>)}</div><pre>{JSON.stringify(evidence,null,2)}</pre></details>
</>}</div>
    </section>
  </section>;
}
