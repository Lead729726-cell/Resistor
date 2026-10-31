import {useEffect,useRef,type RefObject} from 'react';

/** Keep keyboard navigation inside the visible dialog and restore its trigger. */
export function useDialogFocus(ref:RefObject<HTMLElement|null>,key:string|null,outsideSelector?:string){
 const outside=useRef<HTMLElement|null>(document.activeElement instanceof HTMLElement?document.activeElement:null);
 useEffect(()=>{const track=(event:FocusEvent)=>{if(event.target instanceof HTMLElement&&!event.target.closest('dialog,[role="dialog"]'))outside.current=event.target;};document.addEventListener('focusin',track);return()=>document.removeEventListener('focusin',track);},[]);
 useEffect(()=>{
  if(!key)return;const trigger=outside.current;
  const items=()=>Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled):not([type="hidden"]),select:not(:disabled),textarea:not(:disabled),a[href],summary,[tabindex]:not([tabindex="-1"])')||[]).filter(el=>el.getClientRects().length>0&&!el.closest('[inert]'));
  // Native showModal() owns the top layer and its focus loop; legacy traps must defer.
  const frame=requestAnimationFrame(()=>{if(!document.querySelector('dialog[open]')&&ref.current&&!ref.current.contains(document.activeElement))(items()[0]||ref.current).focus();});
  const trap=(event:KeyboardEvent)=>{if(event.key!=='Tab'||document.querySelector('dialog[open]')||!ref.current||outsideSelector&&event.target instanceof Element&&event.target.closest(outsideSelector))return;const list=items(),first=list[0],last=list.at(-1);if(!first){event.preventDefault();ref.current.focus();return;}if(!ref.current.contains(document.activeElement)||event.shiftKey&&document.activeElement===first){event.preventDefault();(event.shiftKey?last:first)?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}};
  document.addEventListener('keydown',trap,true);
  return()=>{cancelAnimationFrame(frame);document.removeEventListener('keydown',trap,true);if(!document.querySelector('dialog[open]')&&trigger?.isConnected&&!ref.current?.contains(trigger)){const target=trigger.getClientRects().length?trigger:trigger.closest('details')?.querySelector<HTMLElement>('summary');target?.focus();}};
 },[ref,key,outsideSelector]);
}
