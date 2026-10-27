import {useEffect,useRef,useState} from 'react';
import {readStudyDraft,studyDraftKey,writeStudyDraft,type StudyDraftContext} from './study-draft';
type Slot={hasDraft:boolean;answer:string;restored:boolean;saved:boolean;error:string;protected:boolean};
// Save on input, not in an effect: a question switch can never write the previous answer to the next key.
export function useStudyDraft(context:StudyDraftContext|null){
 const memory=useRef(new Map<string,Slot>());
 const key=context?studyDraftKey(context):'';
 const [current,setCurrent]=useState<{key:string;slot:Slot}|null>(null);
 useEffect(()=>{
  if(!context)return;
  let slot=memory.current.get(key);
  if(!slot){
   let read:ReturnType<typeof readStudyDraft>;
   try{read=readStudyDraft(window.localStorage,context);}catch{read={draft:null,error:'이 기기의 임시 저장소에 접근하지 못했습니다.'};}
   slot={hasDraft:!!read.draft,answer:read.draft?.answer||'',restored:!!read.draft,saved:!!read.draft,error:read.error,protected:!!read.error};memory.current.set(key,slot);
  }
  setCurrent({key,slot});
 },[key]);
 const slot=current?.key===key?current.slot:null;
 const setAnswer=(answer:string)=>{
  if(!context||!slot)return;
  const draft={schema_version:1 as const,edition:'edu' as const,draft_only:true as const,...context,answer,updated_at:new Date().toISOString()};
  let saved=false;try{if(!slot.protected)saved=writeStudyDraft(window.localStorage,draft);}catch{/* Access can be denied before the storage helper is entered. */}
  const next={hasDraft:true,answer,restored:false,saved,protected:slot.protected,error:saved?'':'임시 답안은 현재 화면에만 보관 중입니다. 새로고침 전에 답안을 복사하거나 제출해 저장하세요.'};
  memory.current.set(key,next);setCurrent({key,slot:next});
 };
 return {key,hasDraft:slot?.hasDraft||false,answer:slot?.answer||'',ready:!!slot,setAnswer,restored:slot?.restored||false,saved:slot?.saved||false,error:slot?.error||''};
}
