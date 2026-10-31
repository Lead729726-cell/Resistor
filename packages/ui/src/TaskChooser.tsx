import {Children,Fragment,isValidElement,useEffect,useRef,useState,type ReactNode} from 'react';
export type TaskGroup={id:string;title:string;description:string;content:ReactNode};
function choices(node:ReactNode):ReactNode[]{return Children.toArray(node).flatMap(child=>isValidElement<{children?:ReactNode}>(child)&&child.type===Fragment?choices(child.props.children):[child]);}
export default function TaskChooser({groups,group,onGroup}:{groups:TaskGroup[];group:string|null;onGroup:(id:string|null)=>void}){
 const [page,setPage]=useState(0),selected=groups.find(g=>g.id===group),items=selected?choices(selected.content):[];
 const heading=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{heading.current?.focus();},[group,page]);
 return <div className="task-chooser" data-testid="task-chooser">
  <div className="guided-progress"><span>{selected?'02 · 도구 선택':'01 · 작업 선택'}</span><span>{selected?selected.title:'작업대'}</span></div>
  <h3 ref={heading} tabIndex={-1}>{selected?'어떤 작업을 할까요?':'지금 할 작업에 집중하세요'}</h3><p className="guided-description">{selected?.description||'필요한 도구를 연 뒤, 한 화면에서 한 단계씩 진행합니다.'}</p>
  <div className="task-choices">{selected?items.slice(page*4,page*4+4):groups.map(g=><button type="button" data-testid={'guided-category-'+g.id} key={g.id} onClick={()=>{setPage(0);onGroup(g.id);}}><strong>{g.title}</strong><span>{g.description}</span><i aria-hidden="true">→</i></button>)}</div>
  {selected&&<div className="guided-navigation"><button className="button" data-testid="guided-category-back" onClick={()=>onGroup(null)}>← 작업 선택</button>{items.length>4&&<><button className="button" disabled={!page} onClick={()=>setPage(n=>n-1)}>이전 도구</button><span>{page+1} / {Math.ceil(items.length/4)}</span><button className="button" disabled={(page+1)*4>=items.length} onClick={()=>setPage(n=>n+1)}>다음 도구 →</button></>}</div>}
 </div>;
}
