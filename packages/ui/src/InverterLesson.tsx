import {useEffect,useRef,useState} from 'react';
import {rpc,type Project,type Scene,type Doctor} from '@mos/contracts';
import {inverterLesson,linkedObservation,type LearningRecord,compareTrials} from '../../education/src/inverter';
import './inverter-lesson.css';
interface View {schema_version:1;edition:'edu';record:LearningRecord;project:Project;scene:Scene;doctor:Doctor;comparison:ReturnType<typeof compareTrials>;context:LearningRecord['context'];verification:Record<string,{execution_status:string;analysis_result:string;revision:number|null;reason:string}>}
const key='resistor.edu.connected.lesson.v1';
const steps=['실습 시작','연결 관찰','적층 확인','기준 해석','조건 변경','재해석·비교','설명·저장'];
const nano=(value:number|null|undefined)=>value===null||value===undefined?'데이터 없음':(value*1e9).toPrecision(4)+' ns';
const read=(name:string)=>{try{return JSON.parse(localStorage.getItem(name)||'null');}catch{return null;}};
const write=(name:string,value:unknown)=>{try{localStorage.setItem(name,JSON.stringify(value));}catch{/* Server save remains available. */}};
async function openStoredLesson(id:string):Promise<View>{
 for(let attempt=0;;attempt++)try{return await rpc<View>('learning.open',{lesson_id:id});}catch(e){if(attempt>=3||(e as {code?:string}).code!=='LEARNING_BUSY')throw e;await new Promise(resolve=>setTimeout(resolve,300*(attempt+1)));}
}
export default function InverterLesson({project,selectedDeviceId,selectedShapeId,onProject,onView,onInspect,onCourses,disabledReason,currentStep,onStep}:{currentStep?:number;onStep?:(step:number)=>void;selectedDeviceId:string|null;selectedShapeId:string|null;disabledReason?:string;project:Project|null;onProject:(p:Project)=>Promise<void>;onView:(view:'schematic'|'layout2d'|'layout3d'|'simulation'|'section')=>void;onInspect:(deviceId:string,shapeId?:string)=>void;onCourses:()=>void}){
 const [view,setView]=useState<View|null>(null),[records,setRecords]=useState<{id:string;updated_at:string;revision:number;submitted:boolean}[]>([]),[selected,setSelected]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[load,setLoad]=useState('50'),[device,setDevice]=useState(selectedDeviceId||'mn1'),[explanation,setExplanation]=useState(''),[pre,setPre]=useState<Record<string,string>>({}),[post,setPost]=useState<Record<string,string>>({}),[saved,setSaved]=useState(false),[localStep,setLocalStep]=useState(1);
 const step=currentStep??localStep,setStep=(next:number|((value:number)=>number))=>{const value=typeof next==='function'?next(step):next;if(onStep)onStep(value);else setLocalStep(value);};
 const root=useRef<HTMLDivElement>(null),pageTitle=useRef<HTMLHeadingElement>(null),openSequence=useRef(0);
 const list=async()=>{const r=await rpc<{records:typeof records}>('learning.list');setRecords(r.records);};
 const receive=async(v:View,restore=false)=>{
  setView(v);setSelected(v.record.id);try{localStorage.setItem(key,v.record.id);}catch{}
  if(restore){
   const draft=read(key+'.draft.'+v.record.id),baseline=v.record.student.saved_at||v.record.student.submitted_at||null;
   const validDraft=draft?.base_saved_at===baseline&&typeof draft?.explanation==='string'&&draft?.pre&&draft?.post;
   const draftDiffers=validDraft&&(draft.explanation!==v.record.student.explanation||JSON.stringify(draft.pre)!==JSON.stringify(v.record.student.pre_answers)||JSON.stringify(draft.post)!==JSON.stringify(v.record.student.post_answers));
   setExplanation(validDraft?draft.explanation:v.record.student.explanation);setPre(validDraft?draft.pre:v.record.student.pre_answers);setPost(validDraft?draft.post:v.record.student.post_answers);setLoad(validDraft&&typeof draft.load==='string'?draft.load:'50');setSaved(!!baseline&&!draftDiffers);
   const position=read(key+'.page.'+v.record.id);if(currentStep===undefined&&!onStep)setStep(Number.isInteger(position)&&position>=1&&position<=7?position:1);
  }
  await onProject(v.project);
 };
 const act=async(method:string,params:Record<string,unknown>,restore=false)=>{openSequence.current++;setBusy(true);setError('');try{await receive(await rpc<View>(method,params),restore);await list();return true;}catch(e){setError(e instanceof Error?e.message:String(e));return false;}finally{setBusy(false);}};
 useEffect(()=>{if(disabledReason)return;let alive=true;const sequence=openSequence.current;void(async()=>{try{await list();const id=localStorage.getItem(key);if(id&&alive&&sequence===openSequence.current){const next=await openStoredLesson(id);if(alive&&sequence===openSequence.current)await receive(next,true);}}catch(e){if(alive&&sequence===openSequence.current)setError(e instanceof Error?e.message:String(e));}})();return()=>{alive=false;};},[]);
 useEffect(()=>{if(!view?.record.trials.some(t=>['queued','running'].includes(t.execution_status)))return;let active=true,inFlight=false;const timer=setInterval(()=>{if(inFlight)return;inFlight=true;void rpc<View>('learning.refresh',{lesson_id:view.record.id}).then(async v=>{if(active)await receive(v);}).catch(e=>{if(active)setError(e instanceof Error?e.message:String(e));}).finally(()=>{inFlight=false;});},800);return()=>{active=false;clearInterval(timer);};},[view?.record.id,view?.record.trials.map(t=>t.execution_status).join(',')]);
 const record=view?.record,base=record?.trials.find(t=>t.slot==='before'&&t.metrics),pending=record?.trials.some(t=>['queued','running'].includes(t.execution_status)),comparison=view?.comparison,observation=view?linkedObservation(view.project,view.scene,device,null):null;
 useEffect(()=>{if(record)write(key+'.page.'+record.id,step);pageTitle.current?.focus({preventScroll:true});root.current?.querySelector('[data-testid="edu-step-page"]')?.scrollTo(0,0);},[step,record?.id]);
 useEffect(()=>{if(!record)return;write(key+'.draft.'+record.id,{draft_only:true,project_id:record.project_id,revision:view!.project.revision,base_saved_at:record.student.saved_at||record.student.submitted_at||null,explanation,pre,post,load});},[record?.id,record?.student.saved_at,record?.student.submitted_at,view?.project.revision,explanation,pre,post,load]);
 const openView=async(target:Parameters<typeof onView>[0],shapeId?:string)=>{if(!record)return;try{await receive(await rpc<View>('learning.observe',{lesson_id:record.id,view:target}));onInspect(device,shapeId??selectedShapeId??undefined);onView(target);}catch(e){setError(e instanceof Error?e.message:String(e));}};
 const questions=(answers:Record<string,string>,setAnswers:(value:Record<string,string>)=>void,phase:string)=><div className="edu-concepts">{inverterLesson.concepts.map(c=><label key={c.id}>{c.question}<select aria-label={phase+' '+c.id} value={answers[c.id]||''} onChange={e=>{setAnswers({...answers,[c.id]:e.target.value});setSaved(false);}}><option value="">직접 답변 선택</option>{c.options.map(option=><option key={option}>{option}</option>)}</select></label>)}</div>;
 const trials=<div className="edu-trials">{record?.trials.map((t,i)=><p key={i} data-testid="edu-trial">{t.slot==='before'?'변경 전':'변경 후'} · {(Number(t.conditions.load_F)*1e15).toPrecision(4)} fF · r{t.revision} · {t.execution_status} / {t.analysis_result} · {t.revision===view!.project.revision&&t.freshness==='current'?'현재 revision':'이전 revision / 의존성'}<br/><small>{t.run_id||'실행 없음'} · {t.message}</small></p>)}</div>;
 const verification=<div className="edu-verification">{view&&Object.entries(view.verification).map(([kind,state])=><span key={kind}>{kind.toUpperCase()}: {state.execution_status} / {state.analysis_result} <small>{state.reason}</small></span>)}</div>;
 if(disabledReason)return <div className="inverter-lesson"><h3>Resistor Edu · CMOS inverter</h3><p className="edu-caution">{disabledReason}</p></div>;
 return <div ref={root} className="inverter-lesson" data-testid="inverter-lesson" data-step={step}>
  <div className="edu-identity"><strong>Resistor Edu</strong><span>실제 엔진 연결 실습 · 평가 미실시</span><button className="button small" onClick={onCourses}>다른 과정</button></div>
  <h3>{inverterLesson.title}</h3><p>{inverterLesson.goal}</p>
  <nav className="edu-step-nav" aria-label="설계 실습 단계">{steps.map((label,i)=><button key={label} aria-current={step===i+1?'step':undefined} disabled={i>0&&!record} onClick={()=>setStep(i+1)}><b>{i+1}</b><span>{label}</span></button>)}</nav>
  <p className="edu-step-hint">{step} / 7 · 단계 이동은 학습 화면만 바꿉니다. 실제 해석은 실행 버튼으로 시작합니다.</p>
  {record&&<p className="edu-context" data-testid="edu-project-context">edition edu · schema {record.schema_version} · project {record.project_id} · 현재 r{view!.project.revision}<br/>엔진 {view!.context.engine.id||'알 수 없음'} · 공정 {view!.context.process.id} · {view!.context.process.version||'버전 미확인'}</p>}
  <section className="edu-step-page" data-testid="edu-step-page" data-step={step} aria-labelledby="edu-step-title">
   <h4 id="edu-step-title" ref={pageTitle} tabIndex={-1}>{step}. {steps[step-1]}</h4>
   {step>1&&!view&&<p role="status">실습 기록을 불러오거나 1단계에서 새 실습을 시작하세요. 실행 결과를 임의로 생성하지 않습니다.</p>}
   {step===1&&<>
    <p>새 실습은 별도 프로젝트 사본을 만듭니다. 기존 설계와 학생 기록을 덮어쓰지 않습니다.</p>
    <div className="education-actions"><button data-testid="edu-create-inverter" className="button primary" disabled={busy} onClick={()=>void act('learning.create',{command_id:crypto.randomUUID()},true).then(ok=>{if(ok)setStep(2);})}>새 인버터 실습 시작</button>{project?.example==='inverter'&&<button className="button" disabled={busy} onClick={()=>void act('learning.create',{command_id:crypto.randomUUID(),source_project_id:project.id},true).then(ok=>{if(ok)setStep(2);})}>현재 인버터의 사본으로 시작</button>}</div>
    <div className="edu-reopen"><label>저장된 실습<select aria-label="저장된 연결 실습" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">실습 선택</option>{records.map(r=><option value={r.id} key={r.id}>{new Date(r.updated_at).toLocaleString()} · r{r.revision} · {r.submitted?'설명 저장됨':'진행 중'} · {r.id.slice(0,6)}</option>)}</select></label><button className="button" disabled={!selected||busy} onClick={()=>void act('learning.open',{lesson_id:selected},true)}>기록 다시 열기</button></div>
    {record?.purpose==='qa'&&<p className="edu-caution">검증용 QA 기록 · 학생 제출물이나 교육 효과 평가 자료가 아닙니다.</p>}
    <details><summary>사전 지식·입력 조건·관찰 질문</summary><ul>{inverterLesson.prerequisites.map(s=><li key={s}>{s}</li>)}</ul><p>{inverterLesson.conditions}</p><ul>{inverterLesson.observations.map(s=><li key={s}>{s}</li>)}</ul><ol>{inverterLesson.questions.map(s=><li key={s}>{s}</li>)}</ol></details>
    <details><summary>사전 개념 문항</summary>{questions(pre,setPre,'사전')}</details>
   </>}
   {view&&record&&step===2&&<>
    <p>같은 소자의 핀과 net을 회로도에서 읽고, 레이아웃에서 대응 근거를 확인하세요.</p>
    <div className="education-actions">{view.project.schematic.devices.filter(d=>['nmos','pmos'].includes(d.kind)).map(d=><button className="button small" aria-pressed={device===d.id} key={d.id} onClick={()=>{setDevice(d.id);onInspect(d.id);}}>{d.name} · {d.kind}</button>)}<button className="button small" onClick={()=>void openView('schematic')}>회로도 열기</button><button className="button small" onClick={()=>void openView('layout2d')}>레이아웃 열기</button></div>
    <p>{observation?.device&&Object.entries(observation.device.pins).map(([pin,net])=>`${pin}→${net}`).join(' · ')}</p><p className="edu-caution">원본 device_id 주석이 없는 공개 셀에서는 MOS 도형 대응이 불명입니다. 같은 net 주석은 관찰 후보이며 LVS 통과를 뜻하지 않습니다.</p>
    <div className="edu-pin-candidates">{observation?.candidates.slice(0,8).map(c=><button className="button small" key={c.id} onClick={()=>void openView('layout2d',c.id)}>{c.net||'주석'} · {c.layer_id} · {c.status==='device_annotation'?'소자 주석':'net 후보'}</button>)}</div>{!observation?.candidates.length&&<p>현재 선택의 대응 도형: 연결 불명. 원본 pin 라벨과 회로 단자를 따로 관찰하세요.</p>}
   </>}
   {view&&step===3&&<>
    <div className="education-actions"><button className="button" onClick={()=>void openView('layout3d')}>표시 적층 3D</button><button className="button" onClick={()=>void openView('section')}>표시 적층 절단</button></div>
    <p className="edu-caution">Z축 추가 배율 1× · 단순 레이어 돌출/절단 표현. GDS에는 공정 두께가 없으며 이 화면을 실제 공정 시뮬레이션으로 해석하지 않습니다. 공정 입력값과 교육용 표시값은 아래에서 구분합니다.</p>
    <details open><summary>현재 layer mapping과 높이 입력</summary><div className="edu-table-scroll"><table><thead><tr><th>Layer / GDS</th><th>출처</th><th>표시 Z / 두께 µm</th><th>공정 Z / 두께 µm</th></tr></thead><tbody>{view.scene.layers.map(l=><tr key={l.id}><td>{l.name} · {l.gds.join('/')}</td><td>{l.source}</td><td>{l.z_display_um} / {l.thickness_display_um}</td><td>{l.physical_z_um??'미입력'} / {l.physical_thickness_um??'미입력'}</td></tr>)}</tbody></table></div></details>
   </>}
   {view&&record&&step===4&&<>
    <p>먼저 출력 부하 5 fF의 기준 조건을 실제 엔진으로 해석합니다. 실행할 수 없으면 구체적인 엔진·모델 오류를 확인하세요.</p>
    <button data-testid="edu-run-before" className="button primary" disabled={busy||pending||!!base} onClick={()=>void act('learning.run',{lesson_id:record.id,slot:'before',expected_revision:view.project.revision})}>변경 전 실제 해석</button>{trials}{verification}<button className="button small" onClick={()=>void openView('simulation')}>실제 파형과 로그 열기</button>
   </>}
   {view&&record&&step===5&&<>
    <p>동일한 입력·MOS 모델·마스크에서 외부 ideal CLOAD 하나만 바꿉니다. 부하값은 추출된 배선 기생이 아닙니다.</p>
    <p>기준 결과: {base?`r${base.revision} · ${(Number(base.conditions.load_F)*1e15).toPrecision(4)} fF`:'기준 해석 결과 없음 — 4단계에서 먼저 실행하세요.'} · 현재 부하 {(Number(view.project.testbench?.load_F)*1e15).toPrecision(4)} fF</p>
    <div className="education-actions"><label>출력 부하 (fF)<input aria-label="실습 출력 부하 fF" inputMode="decimal" type="number" min="1" max="1000" value={load} onChange={e=>setLoad(e.target.value)}/></label><button data-testid="edu-change-load" className="button primary" disabled={busy||pending||!base||load.trim()===''||!Number.isFinite(Number(load))||Number(load)<1||Number(load)>1000} onClick={()=>void act('learning.change',{lesson_id:record.id,expected_revision:view.project.revision,load_fF:Number(load)})}>부하 변경 적용</button></div><p>변경을 적용하면 project revision이 바뀝니다. 이전 결과는 이전 조건의 결과로 남습니다.</p>
   </>}
   {view&&record&&step===6&&<>
    <button data-testid="edu-run-after" className="button primary" disabled={busy||pending||!base||base.conditions.load_F===view.project.testbench?.load_F} onClick={()=>void act('learning.run',{lesson_id:record.id,slot:'after',expected_revision:view.project.revision})}>변경 후 실제 해석</button>{trials}{verification}<button className="button small" onClick={()=>void openView('simulation')}>실제 파형과 로그 열기</button>
    <p data-testid="edu-comparison-state">{comparison?.reason} {comparison?.current_relevance==='historical'?'현재 설계 또는 해석 의존성이 변경되었거나 현재성 확인이 없습니다. 이 비교는 저장된 이전 조건의 결과입니다.':''}</p>
    {comparison?.available&&<div className="edu-table-scroll"><table data-testid="edu-comparison"><thead><tr><th>실제 측정</th><th>변경 전</th><th>변경 후</th><th>차이</th></tr></thead><tbody>{(['rise_s','fall_s','tphl_s','tplh_s'] as const).map(metric=><tr key={metric}><td>{({rise_s:'Y 상승 10–90%',fall_s:'Y 하강 90–10%',tphl_s:'A↑ → Y↓ 50%',tplh_s:'A↓ → Y↑ 50%'})[metric]}</td><td>{nano(comparison.before?.metrics?.[metric])}</td><td>{nano(comparison.after?.metrics?.[metric])}</td><td>{nano(comparison.delta?.[metric])}</td></tr>)}</tbody></table></div>}
    <details><summary>관찰 사실 → 모델 → 판단 근거 → 다음 실험</summary><p><strong>관찰 사실:</strong> {comparison?.available?`${Number(comparison.before!.conditions.load_F)*1e15} fF와 ${Number(comparison.after!.conditions.load_F)*1e15} fF의 실제 run을 비교합니다. Y 상승 차이 ${nano(comparison.delta?.rise_s)}.`:'변경 전후 실제 완료 수치가 모두 있어야 변화 방향을 말할 수 있습니다. 현재는 알 수 없습니다.'}</p><p><strong>모델:</strong> 이상 커패시터의 Q=C·ΔV. C는 F, 전압은 V, 전하는 C입니다. 이번 입력 범위는 TT·27°C·1.8V이며 CLOAD는 추출 기생이 아닙니다.</p><p><strong>판단 근거:</strong> MOS의 출력 전류와 부하의 충방전이 전이에 영향을 줍니다. 크기와 방향은 위 실제 표본으로 확인하며 전체 PVT·잡음·타이밍 보장은 하지 않습니다.</p><p><strong>다음 실험:</strong> 동일한 조건에서 20fF 또는 100fF로 재실행하고 차이를 설명하세요. 배선 영향 평가에는 실제 PEX와 해당 모델이 추가로 필요합니다.</p><p>외부 AI는 엔진 관찰의 근거를 설명할 수 있으며 수치·PASS를 만들지 않습니다.</p></details>
   </>}
   {record&&step===7&&<>
    <details><summary>사전 개념 문항</summary>{questions(pre,setPre,'사전')}</details><details open><summary>사후 개념 문항</summary>{questions(post,setPost,'사후')}</details>
    <label className="edu-explanation-label">학생 설명<textarea data-testid="edu-explanation" aria-label="변화의 이유와 다음 실험" maxLength={8000} rows={5} value={explanation} onChange={e=>{setExplanation(e.target.value);setSaved(false);}} placeholder="관찰한 사실 → 사용한 모델/규칙 → 판단 근거 → 다음 실험. 모르는 부분은 필요한 데이터를 적으세요."/></label>
    <button data-testid="edu-save-learning" className="button primary" disabled={busy||pending} onClick={()=>void act('learning.save',{lesson_id:record.id,expected_version:record.version,explanation,pre_answers:pre,post_answers:post}).then(ok=>{if(ok)setSaved(true);})}>학생 설명·조건·결과 저장</button><p data-testid="edu-save-state">{saved?'저장된 설명을 다시 열 수 있습니다.':'입력 초안은 이 기기에 임시 보관합니다. 학생 설명은 저장 버튼으로 확정하세요.'} 설명 정확성: 교수자 검토 대기 · 교육 효과: 평가 미실시</p>
    <details><summary>설계 고려 사항과 지원 범위</summary><p>아날로그의 대칭·간격·소자 방향은 기하로 관찰할 수 있습니다. 매칭·주변 환경·기생 영향에는 공정·소자 모델·추출·통계가 더 필요합니다. common-centroid와 더미는 경사·가장자리 영향을 줄이는 조건부 기법이며 항상 최적이라고 판단하지 않습니다.</p><p>디지털 표준 셀 라이브러리와 P&amp;R은 다릅니다. P&amp;R에는 배치와 배선이 포함되며 실제 흐름에는 타이밍·전력·면적 최적화가 연결됩니다. 이번 예제는 기존 셀을 읽고 학습하는 흐름이며 독자 P&amp;R을 실행하지 않습니다.</p><p>{inverterLesson.limits}</p><ul>{inverterLesson.references.map(r=><li key={r.url}><a href={r.url} target="_blank" rel="noreferrer">{r.title}</a></li>)}</ul></details>
   </>}
  </section>
  {busy&&<p role="status">실제 작업을 진행 중입니다.</p>}{error&&<p className="inline-error" role="alert">{error}</p>}
  <footer className="edu-step-footer"><button data-testid="edu-step-prev" className="button" disabled={step===1} onClick={()=>setStep(s=>Math.max(1,s-1))}>← 이전</button><span>{step} / 7 · {steps[step-1]}</span><button data-testid="edu-step-next" className="button primary" disabled={step===7||!record} onClick={()=>setStep(s=>Math.min(7,s+1))}>다음 →</button></footer>
 </div>;
}
