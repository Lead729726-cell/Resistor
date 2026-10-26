export type StudyPurpose='practice'|'qa';
export interface StudyDraftContext {store_id:string;question_id:string;question_version:string;purpose:StudyPurpose}
export interface StudyDraft extends StudyDraftContext {schema_version:1;edition:'edu';draft_only:true;answer:string;updated_at:string}
export interface DraftStorage {getItem(key:string):string|null;setItem(key:string,value:string):void;removeItem(key:string):void}
export const studyDraftKey=(c:StudyDraftContext)=>'resistor.edu.study.answer.v1.'+encodeURIComponent(JSON.stringify([c.store_id,c.purpose,c.question_id,c.question_version]));
export function inspectStudyDraft(value:unknown,c:StudyDraftContext):StudyDraft|null{
 if(!value||typeof value!=='object'||![c.store_id,c.question_id,c.question_version].every(v=>typeof v==='string'&&v.length>0&&v.length<=512)||!['practice','qa'].includes(c.purpose))return null;
 const d=value as StudyDraft;
 if(d.schema_version!==1||d.edition!=='edu'||d.draft_only!==true||d.store_id!==c.store_id||d.question_id!==c.question_id||d.question_version!==c.question_version||d.purpose!==c.purpose||typeof d.answer!=='string'||d.answer.length>6000||typeof d.updated_at!=='string'||!Number.isFinite(Date.parse(d.updated_at)))return null;
 // Do not restore provider approval, grades or arbitrary fields from browser storage.
 return {schema_version:1,edition:'edu',draft_only:true,store_id:c.store_id,question_id:c.question_id,question_version:c.question_version,purpose:c.purpose,answer:d.answer,updated_at:d.updated_at};
}
export function readStudyDraft(storage:DraftStorage,c:StudyDraftContext):{draft:StudyDraft|null;error:string}{
 try{const raw=storage.getItem(studyDraftKey(c));if(raw===null)return {draft:null,error:''};const draft=inspectStudyDraft(JSON.parse(raw),c);return {draft,error:draft?'':'저장된 임시 답안 형식을 확인할 수 없습니다. 원본은 보존했습니다.'};}
 catch{return {draft:null,error:'이 기기의 임시 답안을 읽지 못했습니다. 저장된 제출 기록은 별도로 확인하세요.'};}
}
export function writeStudyDraft(storage:DraftStorage,draft:StudyDraft):boolean{
 const clean=inspectStudyDraft(draft,draft);if(!clean)return false;
 try{storage.setItem(studyDraftKey(clean),JSON.stringify(clean));return true;}catch{return false;}
}
type FilterQuestion={id:string;level:number;topic:string;last_attempt?:{score:number|null}|null};
export type StudyFilters={topic:string;difficulty:string;review:string;recommendedLevel:number};
export function filterStudyQuestions<T extends FilterQuestion>(questions:T[],f:StudyFilters):T[]{
 return questions.filter(q=>(!f.topic||q.topic===f.topic)&&(f.difficulty==='all'||q.level===(f.difficulty==='auto'?f.recommendedLevel:Number(f.difficulty)))&&(f.review==='all'||f.review==='wrong'&&q.last_attempt?.score!==null&&q.last_attempt?.score!==undefined&&q.last_attempt.score<100||f.review==='unanswered'&&!q.last_attempt));
}
