import {inverterLesson} from '../../education/src/inverter';

export const lessonStorageKey='resistor.edu.connected.lesson.v1';
export interface LessonDraft {schema_version:1;edition:'edu';lesson_id:string;draft_only:true;project_id:string;revision:number;base_saved_at:string|null;explanation:string;pre:Record<string,string>;post:Record<string,string>;load:string}
export interface DraftContext {lesson_id:string;project_id:string;revision:number;base_saved_at:string|null}
const answers=(v:unknown):v is Record<string,string>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.entries(v).every(([k,a])=>inverterLesson.concepts.some(c=>c.id===k)&&typeof a==='string'&&a.length<=1000);
export function inspectLessonDraft(value:unknown,context:DraftContext):{status:'none'|'invalid'|'restored'|'conflict';draft:LessonDraft|null}{
 if(value===null||value===undefined)return {status:'none',draft:null};
 const v=value as LessonDraft;
 // Legacy drafts have no schema/lesson fields; the existing per-lesson key and project bind them.
 if(!v||typeof v!=='object'||(v.schema_version!==undefined&&v.schema_version!==1)||(v.edition!==undefined&&v.edition!=='edu')||(v.lesson_id!==undefined&&v.lesson_id!==context.lesson_id)||v.draft_only!==true||v.project_id!==context.project_id||!Number.isSafeInteger(v.revision)||v.revision<0||(v.base_saved_at!==null&&(typeof v.base_saved_at!=='string'||!Number.isFinite(Date.parse(v.base_saved_at))))||typeof v.explanation!=='string'||v.explanation.length>8000||!answers(v.pre)||!answers(v.post)||typeof v.load!=='string'||v.load.length>80)return {status:'invalid',draft:null};
 const draft:LessonDraft={schema_version:1,edition:'edu',lesson_id:context.lesson_id,draft_only:true,project_id:context.project_id,revision:v.revision,base_saved_at:v.base_saved_at,explanation:v.explanation,pre:{...v.pre},post:{...v.post},load:v.load};
 return {status:v.base_saved_at===context.base_saved_at&&v.revision===context.revision?'restored':'conflict',draft};
}
export function sameAnswers(a:Record<string,string>,b:Record<string,string>){const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>a[k]===b[k]);}
