import {newCourseWorkbook,readCourseWorkbook,type CourseWorkbook} from './course-workbook';

export const workbookStorageKey='resistor.edu.course-workbook.v1';
export type WorkbookStorage=Pick<Storage,'getItem'|'setItem'>;
export type WorkbookSaveState='unsaved'|'saved'|'conflict'|'invalid'|'unavailable';
export class CourseWorkbookStore {
 workbook:CourseWorkbook;
 state:WorkbookSaveState='unsaved';
 message='입력 내용은 이 브라우저에 보관합니다. 중요한 기록은 JSON으로 내려받으세요.';
 private expected:string|null=null;
 private invalidOriginal=false;
 readonly journalKey:string;
 constructor(private storage:()=>WorkbookStorage,private id:()=>string){
  this.workbook=newCourseWorkbook(id());
  this.journalKey=workbookStorageKey+'.draft.'+id();
  try{this.expected=storage().getItem(workbookStorageKey);if(this.expected!==null){try{this.workbook=readCourseWorkbook(this.expected);this.state='saved';}catch{this.invalidOriginal=true;this.state='invalid';this.message='이전 기록을 읽을 수 없어 자동 저장을 멈췄습니다. 원본을 보관한 뒤 다른 기록을 열 수 있습니다.';}}}
  catch{this.state='unavailable';this.message='브라우저 저장소에 접근하지 못했습니다. 현재 입력은 유지되며 JSON으로 보관할 수 있습니다.';}
 }
 inspectExternalChange(){
  try{if(this.storage().getItem(workbookStorageKey)!==this.expected){this.state='conflict';this.message='다른 탭에서 기록이 바뀌었습니다. 현재 작성 내용은 유지합니다. JSON으로 보관한 뒤 새로 열어 비교하세요.';return true;}}
  catch{this.state='unavailable';this.message='저장소에 접근할 수 없습니다. 현재 입력을 JSON으로 보관하세요.';return true;}
  return false;
 }
 save(){
  if(this.invalidOriginal){this.state='invalid';this.message='기존 원본을 먼저 백업해야 합니다. 자동 저장으로 덮어쓰지 않습니다.';return false;}
  if(this.state==='conflict')return false;
  try{if(this.inspectExternalChange())return false;const raw=JSON.stringify(this.workbook),storage=this.storage();
   storage.setItem(this.journalKey,raw);if(storage.getItem(this.journalKey)!==raw)throw Error('Draft not persisted');
   if(this.inspectExternalChange())return false;
   storage.setItem(workbookStorageKey,raw);this.expected=raw;
   if(this.inspectExternalChange())return false;
   this.state='saved';this.message='이 브라우저에 저장됨 · 서버로 전송하지 않습니다.';return true;}
  catch{this.state='unavailable';this.message='브라우저 저장 실패 · 현재 입력은 유지됩니다. JSON 보관 또는 저장 재시도를 선택하세요.';return false;}
 }
 // Save and verify both the original bytes and current in-memory work before
 // replacing anything. A download click is not proof that a backup was saved.
 replace(candidate:CourseWorkbook){
  const next=readCourseWorkbook(JSON.stringify(candidate));
  try{
   const storage=this.storage(),original=storage.getItem(workbookStorageKey);
   if(original!==this.expected){this.state='conflict';this.message='다른 탭에서 기록이 바뀌어 전환하지 않았습니다. 현재 내용을 JSON으로 보관하세요.';return false;}
   const backupKey=workbookStorageKey+'.backup.'+this.id(),backup=JSON.stringify({schema_version:1,original_raw:original,current:this.workbook});
   storage.setItem(backupKey,backup);if(storage.getItem(backupKey)!==backup)throw Error('Backup not persisted');
   if(storage.getItem(workbookStorageKey)!==original){this.state='conflict';this.message='백업 중 다른 탭의 기록 변경을 발견해 전환하지 않았습니다.';return false;}
   const raw=JSON.stringify(next);storage.setItem(workbookStorageKey,raw);
   this.expected=raw;this.workbook=next;this.invalidOriginal=false;this.state='saved';this.message='원본과 이전 작성 내용을 브라우저 백업에 보관하고 기록을 열었습니다.';return true;
  }catch{this.state='unavailable';this.message='원본·작성 내용의 백업 또는 저장을 확인하지 못해 전환하지 않았습니다. 현재 기록을 JSON으로 보관하고 다시 시도하세요.';return false;}
 }
}
