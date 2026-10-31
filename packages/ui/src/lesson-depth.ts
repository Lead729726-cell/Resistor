export type LessonDepth='stage'|'source'|'records'|'context'|'conditions'|'concepts'|'mapping'|'candidates'|'trials'|'verification'|'reasoning'|'limits'|'conflict';
type Cursor={page:LessonDepth;index:number};
export type LessonDepthState=Cursor&{trail:Cursor[]};
export type LessonDepthAction=
 |{type:'enter';page:LessonDepth;fresh?:boolean}
 |{type:'previous'}
 |{type:'advance';count:number}
 |{type:'select';index:number;count:number}
 |{type:'stage'};
export const initialLessonDepth=():LessonDepthState=>({page:'stage',index:0,trail:[]});

/** UI navigation only. It contains no project, answer, revision, or engine state. */
export function lessonDepthReducer(state:LessonDepthState,action:LessonDepthAction):LessonDepthState{
 if(action.type==='stage')return initialLessonDepth();
 if(action.type==='enter'){
  if(action.page==='stage')return initialLessonDepth();
  const start=action.fresh?initialLessonDepth():state;
  if(start.page===action.page)return start;
  return {page:action.page,index:0,trail:[...start.trail,{page:start.page,index:start.index}]};
 }
 if(action.type==='previous'){
  if(state.index>0)return {...state,index:state.index-1};
  const parent=state.trail.at(-1);
  return parent?{...parent,trail:state.trail.slice(0,-1)}:initialLessonDepth();
 }
 const count=Number.isSafeInteger(action.count)&&action.count>0?action.count:0;
 if(action.type==='advance')return count>0&&state.index+1<count?{...state,index:state.index+1}:initialLessonDepth();
 const index=Number.isSafeInteger(action.index)?Math.max(0,Math.min(Math.max(0,count-1),action.index)):0;
 return {...state,index};
}
