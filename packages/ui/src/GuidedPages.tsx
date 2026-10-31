import {useEffect,useRef,useState,type ReactNode} from 'react';
import './guided-workbench.css';

export interface GuidedPage {title:string;description?:string;content:ReactNode;}
/** Navigation only: hidden pages stay mounted so unsubmitted inputs survive. */
export default function GuidedPages({pages,id='guided',nextDisabled=false,step,onStep}:{pages:GuidedPage[];id?:string;nextDisabled?:boolean;step?:number;onStep?:(step:number)=>void}){
 const [localIndex,setLocalIndex]=useState(0),heading=useRef<HTMLHeadingElement>(null);
 const index=step??localIndex;
 const setIndex=(change:(value:number)=>number)=>{const next=change(index);if(onStep)onStep(next);else setLocalIndex(next);};
 const page=Math.min(index,pages.length-1);
 useEffect(()=>{if(index>0)heading.current?.focus();},[index]);
 return <div className="guided-pages" data-testid={id}>
  <div className="guided-progress"><span>한 단계씩 설정</span><span>{page+1} / {pages.length}</span></div>
  <h3 ref={heading} tabIndex={-1}>{pages[page]?.title}</h3>
  {pages[page]?.description&&<p className="guided-description">{pages[page].description}</p>}
  {pages.map((item,i)=><section key={i} hidden={i!==page} inert={i!==page} className="guided-page" data-testid="guided-page" data-step={i}>{item.content}</section>)}
  <div className="guided-navigation"><button type="button" className="button" data-testid="guided-back" disabled={page===0} onClick={()=>setIndex(n=>Math.max(0,n-1))}>← 이전</button><span>입력은 단계 이동 중 유지됩니다</span>{page<pages.length-1&&<button type="button" className="button primary" data-testid="guided-next" disabled={nextDisabled} onClick={()=>setIndex(n=>Math.min(pages.length-1,n+1))}>다음 →</button>}</div>
 </div>;
}
