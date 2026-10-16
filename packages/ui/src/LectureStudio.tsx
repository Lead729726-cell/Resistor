import {useEffect,useRef,useState} from 'react';
import type {Project,Run} from '@mos/contracts';
import {productEdition,editionStorageKey} from './product-edition';
import {useDialogFocus} from './useDialogFocus';
import {lecturePlans,lectureTime,chapterText,lectureHandout,lectureEvidence,type LecturePlan,type LectureMarker,type LectureView} from './lecture-model';
import {LectureRecorder,type LectureRecording,type CaptureState} from './lecture-recorder';
import './lecture-studio.css';

const KEY=editionStorageKey('resistor.lecture.v1');
function savedSettings(){try{const p=JSON.parse(localStorage.getItem(KEY)||'{}');return {plan:lecturePlans.some(c=>c.id===p.plan)?p.plan:'rc',notes:typeof p.notes==='string'?p.notes.slice(0,12000):'',large:p.large===true};}catch{return {plan:'rc',notes:'',large:false};}}
function download(data:Blob|string,name:string,type='text/plain;charset=utf-8'){
  const url=URL.createObjectURL(typeof data==='string'?new Blob([data],{type}):data),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
export default function LectureStudio({open,onClose,onOpen,focus,onFocus,onLarge,project,runs,busy,disabledReason,onCreate,onView,onProtect}:{
  open:boolean;onClose:()=>void;onOpen:()=>void;focus:boolean;onFocus:(v:boolean)=>void;onLarge:(v:boolean)=>void;
  project:Project|null;runs:Run[];busy:boolean;disabledReason?:string;onCreate:(p:LecturePlan)=>Promise<void>;onView:(v:LectureView)=>void;onProtect:(v:boolean)=>void;
}){
  const initial=useRef(savedSettings()).current;
  const [planId,setPlanId]=useState(initial.plan),[notes,setNotes]=useState(initial.notes),[large,setLarge]=useState(initial.large);
  const [enabled,setEnabled]=useState(false),[step,setStep]=useState(0),[error,setError]=useState(''),[microphone,setMicrophone]=useState(false);
  const [state,setState]=useState<CaptureState>('idle'),[recording,setRecording]=useState<LectureRecording|null>(null),[videoSaved,setVideoSaved]=useState(false);
  const [markers,setMarkers]=useState<LectureMarker[]>([]),[elapsed,setElapsed]=useState(0),[previewUrl,setPreviewUrl]=useState('');
  const plan=lecturePlans.find(p=>p.id===planId)!,current=plan.steps[step]||plan.steps[0];
  const started=useRef(0),notesWindow=useRef<Window|null>(null),latest=useRef({plan,step,project});latest.current={plan,step,project};
  const recorder=useRef<LectureRecorder|null>(null),dialog=useRef<HTMLDivElement>(null);
  const capturing=state==='requesting'||state==='recording'||state==='stopping';
  const protect=capturing||!!recording&&!videoSaved;
  const canCapture=!window.mos&&!!navigator.mediaDevices?.getDisplayMedia&&typeof MediaRecorder!=='undefined';
  useDialogFocus(dialog,open?'lecture':null);
  useEffect(()=>{
    recorder.current=new LectureRecorder(s=>{setState(s);if(s==='recording'){started.current=performance.now();setElapsed(0);const v=latest.current;setMarkers([{seconds:0,title:v.plan.steps[v.step].title,project_id:v.project?.id||null,revision:v.project?.revision??null,view:v.plan.steps[v.step].view}]);}},r=>{setRecording(r);setVideoSaved(false);setElapsed(r.duration_s);},setError);
    return()=>recorder.current?.dispose();
  },[]);
  useEffect(()=>{onProtect(protect);return()=>onProtect(false);},[protect,onProtect]);
  useEffect(()=>{if(!protect)return;const guard=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);},[protect]);
  useEffect(()=>{onLarge(large);try{localStorage.setItem(KEY,JSON.stringify({plan:planId,notes,large}));}catch{/* Export remains available in private browsing. */}},[planId,notes,large,onLarge]);
  useEffect(()=>{if(state!=='recording')return;const id=setInterval(()=>setElapsed((performance.now()-started.current)/1000),250);return()=>clearInterval(id);},[state]);
  useEffect(()=>{if(!recording){setPreviewUrl('');return;}const url=URL.createObjectURL(recording.blob);setPreviewUrl(url);return()=>URL.revokeObjectURL(url);},[recording]);
  const writeNotes=()=>{
    const w=notesWindow.current;if(!w||w.closed)return;
    try{
    w.document.title=productEdition.name+' · 강사 메모';
    w.document.body.replaceChildren();const pre=w.document.createElement('pre');pre.style.cssText='white-space:pre-wrap;font:18px/1.8 system-ui;max-width:760px;margin:40px auto;padding:0 24px';
    pre.textContent=`강사용 · 이 창은 캡처에서 제외하세요\n\n${plan.title}\n${step+1}/${plan.steps.length} · ${current.title}\n\n조작\n${current.action}\n\n설명\n${current.notes}\n\n관찰·한계\n${current.observe}\n\n내 메모\n${notes}`;
    w.document.body.style.cssText='background:#f6f7f8;color:#17212b';w.document.body.append(pre);
    }catch{notesWindow.current=null;setError('강사 메모 창에 접근할 수 없습니다. 별도 메모 창을 다시 열거나 진행안을 저장하세요.');}
  };
  useEffect(writeNotes,[planId,step,notes]);
  const move=(index:number)=>{const next=Math.max(0,Math.min(plan.steps.length-1,index));setStep(next);onView(plan.steps[next].view);if(state==='recording')setMarkers(ms=>[...ms,{seconds:(performance.now()-started.current)/1000,title:plan.steps[next].title,project_id:project?.id||null,revision:project?.revision??null,view:plan.steps[next].view}]);};
  const session=()=>({schema_version:1,product_id:productEdition.id,plan_id:plan.id,title:plan.title,step:step+1,exported_at:new Date().toISOString(),recording:recording?{mime:recording.mime,bytes:recording.bytes,duration_s:recording.duration_s,started_at:recording.started_at,video:recording.video,microphone:recording.microphone,stop_reason:recording.stop_reason}:null,chapters:markers,...lectureEvidence(project,runs)});
  return <>
    {(enabled||capturing||recording)&&<section className="lecture-rail" aria-label="강의 진행" data-testid="lecture-rail">
      <div className="lecture-caption"><small>{state==='recording'?'● 녹화 중':capturing?'녹화 준비 중':recording?'녹화 완료 · 파일 보관':'강의 진행'}</small><strong>{step+1}/{plan.steps.length} · {current.title}</strong></div>
      <button className="button small" aria-label="이전 강의 단계" disabled={step===0||state==='requesting'} onClick={()=>move(step-1)}>←</button><button className="button small" aria-label="다음 강의 단계" disabled={step===plan.steps.length-1||state==='requesting'} onClick={()=>move(step+1)}>다음 →</button>
      <button className="button small" aria-pressed={focus} onClick={()=>onFocus(!focus)}>작업 화면 집중 · F8</button><span className="lecture-timer">{lectureTime(elapsed)}</span>
      {state==='recording'&&<button className="button small danger" data-testid="lecture-stop" onClick={()=>recorder.current?.stop()}>녹화 종료</button>}
      <button className="button small" onClick={onOpen}>강의 스튜디오</button>
    </section>}
    {open&&<div className="modal-overlay" onPointerDown={e=>{if(e.target===e.currentTarget)onClose();}}><div className="modal lecture-modal" role="dialog" aria-modal="true" aria-labelledby="lecture-heading" tabIndex={-1} ref={dialog} data-testid="lecture-studio">
      <div className="modal-title"><h2 id="lecture-heading">강의 스튜디오</h2><button className="icon-button" aria-label="강의 스튜디오 닫기" onClick={onClose}>×</button></div>
      <p className="lecture-intro">{productEdition.name}에서 직접 설명하고 촬영하세요. 진행안·강사 메모·녹화 자료를 한곳에서 준비합니다.</p>
      <div className="lecture-columns"><section>
        <label className="lecture-field">강의 진행안<select data-testid="lecture-plan" value={planId} disabled={capturing||!!recording} onChange={e=>{setPlanId(e.target.value);setStep(0);setError('');}}>{lecturePlans.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
        <p>{plan.requirements} · 목표 {plan.steps.reduce((n,s)=>n+s.minutes,0)}분</p>
        <div className="lecture-actions"><button className="button primary" data-testid="lecture-create-demo" disabled={busy||!!disabledReason||capturing} title={disabledReason} onClick={()=>void onCreate(plan).then(()=>{setStep(0);setEnabled(true);setError('');}).catch(e=>setError(e instanceof Error?e.message:String(e)))}>새 강의 데모 만들기</button><button className="button" data-testid="lecture-present" onClick={()=>{setEnabled(true);onFocus(true);onView(current.view);onClose();}}>현재 프로젝트로 강의 화면 열기</button></div>
        <p className="lecture-hint">새 데모는 기존 설계와 별도로 만듭니다. 단계 이동은 화면만 바꾸며 해석은 Simulate로 직접 실행합니다.{disabledReason&&' '+disabledReason}</p>
        <ol className="lecture-steps">{plan.steps.map((s,i)=><li key={s.title}><button aria-current={i===step?'step':undefined} disabled={state==='requesting'} onClick={()=>move(i)}><span>{i+1}</span><strong>{s.title}</strong><small>{s.minutes}분</small></button>{i===step&&<div><p>{s.action}</p><p className="lecture-hint">{s.observe}</p></div>}</li>)}</ol>
        <label className="lecture-field">내 강의 메모<textarea aria-label="내 강의 메모" rows={3} maxLength={12000} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="설명 순서·수강생 질문·강조할 내용을 적어 두세요."/></label>
        <div className="lecture-actions"><button className="button" data-testid="lecture-notes-window" onClick={()=>{notesWindow.current=window.open('about:blank','resistor-lecture-notes-'+productEdition.edition,'popup,width=860,height=850');if(notesWindow.current)writeNotes();else setError('강사 메모 창이 차단되었습니다. 팝업을 허용하거나 진행안을 내려받으세요.');}}>별도 강사 메모 창</button><button className="button" data-testid="lecture-handout" onClick={()=>download(lectureHandout(plan,productEdition.name,notes),`Resistor-${plan.id}-lecture.md`)}>대본·진행안 저장</button></div>
      </section><section>
        <h3>촬영 화면</h3><label className="lecture-check"><input type="checkbox" checked={large} onChange={e=>setLarge(e.target.checked)}/>강의용 글자 크게 · 편집기 도구와 결과 표</label>
        <label className="lecture-check"><input type="checkbox" checked={focus} onChange={e=>onFocus(e.target.checked)}/>작업 화면 집중 · F8로 전환</label>
        <p className="lecture-hint">탐색·속성·하단 로그를 잠시 접습니다. 해제하면 원래 표시 설정으로 돌아갑니다. 오류·프로젝트·revision은 계속 보입니다.</p>
        <details className="lecture-obs" open><summary>OBS / 데스크톱 녹화 설정</summary><ol><li>캔버스와 출력: 1920×1080 · 30fps</li><li>창 캡처에서 Resistor 선택 → 화면에 맞춤</li><li>마이크 입력 선택 후 짧은 테스트로 음성·글자 확인</li><li>메모 창은 다른 모니터에 놓고 앱 창만 녹화</li><li>MKV로 녹화 후 OBS에서 MP4로 remux 가능</li></ol><p>큰 글자는 브라우저/Electron의 확대도 함께 조절하세요. 모니터·소스가 1080p인지 직접 확인합니다.</p></details>
        <h3>브라우저에서 바로 녹화</h3>
        {canCapture?<><p className="lecture-hint">선택한 화면과 선택한 마이크만 녹화합니다. 시스템 소리는 포함하지 않습니다. 1080p·30fps를 요청하며 실제 크기는 결과에 표시합니다. 30분 또는 약 512MB에서 자동 종료합니다. 서버로 업로드하지 않습니다.</p><label className="lecture-check"><input type="checkbox" data-testid="lecture-microphone" checked={microphone} disabled={capturing} onChange={e=>setMicrophone(e.target.checked)}/>내 마이크 포함 · 별도 권한 요청</label><div className="lecture-actions"><button className="button primary" data-testid="lecture-record" disabled={capturing||!!recording} onClick={()=>{setError('');setEnabled(true);void recorder.current?.start(microphone);}}>{state==='requesting'?'화면·마이크 선택 중…':'화면 선택 후 녹화 시작'}</button>{state==='recording'&&<button className="button danger" onClick={()=>recorder.current?.stop()}>녹화 종료</button>}</div><p data-testid="lecture-capture-state" role="status">{state==='recording'?`● 실제 녹화 중 · ${lectureTime(elapsed)}`:state==='stopping'?'영상 마무리 중…':state==='requesting'?'권한 창에서 촬영할 화면을 선택하세요.':recording?'완료 · 아래에서 재생하고 저장하세요.':'대기 · 녹화하지 않음'}</p></>:<p className="lecture-hint">이 앱 환경에서는 OBS로 녹화하세요. 내장 녹화는 화면 캡처를 지원하는 보안 연결 또는 localhost 브라우저에서 사용할 수 있습니다.</p>}
        {recording&&<div className="lecture-recording" data-testid="lecture-recording"><video controls src={previewUrl} preload="metadata"/><p>{recording.video.width||'?'}×{recording.video.height||'?'} · {recording.video.frameRate?.toFixed(1)||'?'}fps · {lectureTime(recording.duration_s)} · {(recording.bytes/1024/1024).toFixed(1)}MB · 마이크 {recording.microphone?'포함':'없음'}</p><p>종료: {recording.stop_reason} · 새로고침 전에 저장하고 파일 재생을 확인하세요.</p><div className="lecture-actions"><button className="button primary" data-testid="lecture-save-video" onClick={()=>{download(recording.blob,`Resistor-lecture-${plan.id}.${recording.mime.includes('mp4')?'mp4':'webm'}`);setVideoSaved(true);}}>영상 내려받기</button><button className="button" disabled={!videoSaved} onClick={()=>{setRecording(null);recorder.current?.reset();}}>내려받은 영상 비우기</button></div></div>}
        <h3>강의 기록과 재현</h3><p data-testid="lecture-project">{project?`${project.name} · r${project.revision}`:'현재 프로젝트 없음'}</p><p className="lecture-hint">챕터는 이 브라우저의 녹화 시작 시각 기준입니다. OBS로 찍은 영상의 시간과는 별도로 맞춰 편집하세요. 엔진 결과는 원래 상태로 기록합니다.</p><div className="lecture-actions"><button className="button" data-testid="lecture-save-session" onClick={()=>download(JSON.stringify(session(),null,2)+'\n',`Resistor-${plan.id}-lecture-session.json`,'application/json')}>프로젝트·엔진·녹화 기록</button><button className="button" disabled={!markers.length} data-testid="lecture-save-chapters" onClick={()=>download(chapterText(markers),`Resistor-${plan.id}-chapters.txt`)}>실제 녹화 챕터</button></div>
        {error&&<p role="alert" className="inline-error" data-testid="lecture-error">{error}</p>}
      </section></div><div className="lecture-footer"><span>단계 이동 ≠ 엔진 검증 · 저장 전 영상은 이 창 메모리에 보관</span><button className="button" disabled={capturing||!!recording} onClick={()=>{setEnabled(false);onFocus(false);onClose();}}>강의 화면 종료</button><button className="button" onClick={onClose}>작업 화면으로</button></div>
    </div></div>}
  </>;
}
