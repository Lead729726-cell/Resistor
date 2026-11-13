import {useEffect,useRef,useState,type ReactNode} from 'react';
import {ONLINE_ACCESS_POLICY_VERSION,acknowledgeOnlineAccess,registerOnlineAccessPrompt} from '../../contracts/src/online-access';
import './online-access.css';

/** Local work mounts immediately. Only an explicit, still-unsent online action waits here. */
export default function OnlineAccessBoundary({children,enabled=true}:{children:ReactNode;enabled?:boolean}){
 const [open,setOpen]=useState(false),[checked,setChecked]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const finish=useRef<((confirmed:boolean)=>void)|null>(null),dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLElement|null>(null);
 useEffect(()=>{
  if(!enabled)return;
  const unregister=registerOnlineAccessPrompt((done,origin)=>{finish.current=done;trigger.current=origin;setChecked(false);setBusy(false);setError('');setOpen(true);});
  return()=>{finish.current=null;unregister();};
 },[enabled]);
 useEffect(()=>{
  const element=dialog.current;if(!element)return;
  if(open&&!element.open){element.showModal();}
  else if(!open&&element.open){
   element.close();
   // A caller may still be re-reading host state in its catch/finally path. Wait
   // briefly for its original button, but abandon restoration after user focus.
   const target=trigger.current;if(!target)return;
   let frame=0,stopped=false;
   const neutralFocus=()=>{const active=document.activeElement;return !active||active===target||active===document.body||active===element||active.tagName==='DIALOG'&&active.contains(target);};
   const stop=()=>{if(stopped)return;stopped=true;cancelAnimationFrame(frame);observer.disconnect();clearTimeout(deadline);document.removeEventListener('focusin',focusChanged,true);};
   const attempt=()=>{
    frame=0;if(stopped)return;
    if(element.open||!target.isConnected||!target.getClientRects().length||!neutralFocus()||Array.from(document.querySelectorAll('dialog[open]')).some(other=>other!==element&&!other.contains(target))){stop();return;}
    if(target.matches(':disabled,[aria-disabled="true"]'))return;
    if(document.activeElement===target){stop();return;}
    stop();target.focus();
   };
   const schedule=()=>{if(!stopped&&!frame)frame=requestAnimationFrame(attempt);};
   const focusChanged=()=>{if(!neutralFocus())stop();};
   const observer=new MutationObserver(schedule);
   const deadline=setTimeout(stop,2000);
   observer.observe(target,{attributes:true,attributeFilter:['disabled','aria-disabled','hidden','style','class']});
   document.addEventListener('focusin',focusChanged,true);schedule();
   return stop;
  }
 },[open]);
 const cancel=()=>{if(busy)return;const done=finish.current;finish.current=null;setOpen(false);done?.(false);};
 const confirm=async()=>{
  const done=finish.current;if(!checked||busy||!done)return;setBusy(true);setError('');
  try{
   await acknowledgeOnlineAccess({age_14_or_over:true,policy_version:ONLINE_ACCESS_POLICY_VERSION});
   if(finish.current!==done)return;
   finish.current=null;setOpen(false);done(true);
  }catch(cause){if(finish.current===done)setError(cause instanceof Error?cause.message:'확인을 저장하지 못했습니다. 요청은 보내지 않았습니다.');}
  finally{if(finish.current===done||finish.current===null)setBusy(false);}
 };
 return <>{children}{enabled&&<dialog ref={dialog} className="online-access-dialog" role="dialog" aria-modal="true" aria-labelledby="online-access-title" aria-describedby="online-access-description"
  onCancel={event=>{event.preventDefault();event.stopPropagation();cancel();}}
  onClose={event=>{if(open&&!event.currentTarget.open)cancel();}}>
  <h2 id="online-access-title">온라인 연결 전에 한 번만 확인해 주세요</h2>
  <p id="online-access-description">인증·리그·외부 AI·공동 설계는 만 14세 이상부터 사용할 수 있습니다.</p>
  <label><input type="checkbox" checked={checked} onChange={event=>setChecked(event.target.checked)} disabled={busy}/>저는 만 14세 이상입니다.</label>
  <p className="online-access-note">생년월일은 받지 않습니다. 자기 확인이며 본인 인증이나 일괄 동의가 아닙니다. AI 전송·비용 선택은 별도로 유지됩니다.</p>
  {error&&<p role="alert">{error}</p>}
  <footer><a href="https://resistor.kr/privacy/" target="_blank" rel="noreferrer">개인정보 안내</a><div><button type="button" onClick={cancel} disabled={busy}>취소</button><button type="button" className="online-access-confirm" onClick={()=>void confirm()} disabled={!checked||busy}>{busy?'확인 저장 중…':'확인하고 계속'}</button></div></footer>
 </dialog>}</>;
}
