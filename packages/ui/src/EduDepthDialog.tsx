import {useEffect,useId,useRef,type ReactNode} from 'react';
import './edu-depth-dialog.css';

type Props={open:boolean;title:string;subtitle?:string;step?:{current:number;total:number};onClose:()=>void;onBack?:()=>void;children:ReactNode;footer?:ReactNode};

/** One native top-layer page. Closing preserves children and parent-owned drafts. */
export default function EduDepthDialog({open,title,subtitle,step,onClose,onBack,children,footer}:Props){
 const dialog=useRef<HTMLDialogElement>(null),heading=useRef<HTMLHeadingElement>(null),trigger=useRef<HTMLElement|null>(null);
 const id=useId();
 useEffect(()=>{
  const element=dialog.current;if(!element)return;
  if(open&&!element.open){trigger.current=document.activeElement instanceof HTMLElement?document.activeElement:null;element.showModal();}
  else if(!open&&element.open){element.close();if(trigger.current?.isConnected&&trigger.current.getClientRects().length)trigger.current.focus();}
 },[open]);
 useEffect(()=>{if(!open)return;const frame=requestAnimationFrame(()=>heading.current?.focus({preventScroll:true}));return()=>cancelAnimationFrame(frame);},[open,title,step?.current]);
 return <dialog ref={dialog} className="edu-depth-dialog" role="dialog" aria-modal="true" aria-labelledby={id+'-title'} aria-describedby={subtitle?id+'-subtitle':undefined}
  onCancel={event=>{if(event.target!==event.currentTarget)return;event.preventDefault();event.stopPropagation();(onBack??onClose)();}}
  onClose={()=>{if(open)onClose();}}>
  <header className="edu-depth-heading"><div className="edu-depth-position"><span>RESISTOR EDU</span>{step&&<span aria-label={`전체 ${step.total}단계 중 ${step.current}단계`}>{step.current} / {step.total}</span>}</div>
   <div className="edu-depth-title"><h2 ref={heading} id={id+'-title'} tabIndex={-1}>{title}</h2><button type="button" className="edu-depth-close" aria-label={title+' 닫기'} onClick={onClose}>×</button></div>
   {subtitle&&<p id={id+'-subtitle'}>{subtitle}</p>}
   {step&&<div className="edu-depth-meter" aria-hidden="true"><i style={{width:Math.max(0,Math.min(100,step.current/Math.max(1,step.total)*100))+'%'}}/></div>}
  </header>
  <div className="edu-depth-body">{children}</div>
  <footer className="edu-depth-footer">{onBack?<button type="button" className="button" onClick={onBack}>← 이전</button>:<span className="edu-depth-hint">선택한 내용은 뒤로 가도 유지됩니다.</span>}<div>{footer}</div></footer>
 </dialog>;
}
