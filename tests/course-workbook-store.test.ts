import test from 'node:test';
import assert from 'node:assert/strict';
import {CourseWorkbookStore,workbookStorageKey} from '../packages/education/src/course-workbook-store';
import {courseMissions,missionDraft,newCourseWorkbook,calculateMission,readCourseWorkbook} from '../packages/education/src/course-workbook';
class StorageFixture {
 data=new Map<string,string>();failed=false;
 getItem(key:string){return this.data.get(key)??null;}
 setItem(key:string,value:string){if(this.failed)throw Error('quota');this.data.set(key,value);}
}
let sequence=0;
const session=(storage:StorageFixture)=>{let n=0;const scope=++sequence;return new CourseWorkbookStore(()=>storage,()=>`fixture-${scope}-${++n}`);};
test('saving and reopening retains student prediction, explanation and revision-bound results',()=>{
 const storage=new StorageFixture(),store=session(storage),m=courseMissions[0],d=missionDraft(m);d.prediction='내 예측';d.explanation='학생 설명';d.runs.push(calculateMission(m,d));store.workbook.drafts[m.id]=d;
 assert.equal(store.save(),true);assert.deepEqual(session(storage).workbook,store.workbook);assert.equal(storage.getItem(store.journalKey),JSON.stringify(store.workbook));
});
test('storage outage retains in-memory work and allows an explicit safe retry',()=>{
 const storage=new StorageFixture(),store=session(storage);store.workbook.drafts.divider=missionDraft(courseMissions[0]);store.workbook.drafts.divider.explanation='사라지면 안 되는 설명';storage.failed=true;
 assert.equal(store.save(),false);assert.equal(store.state,'unavailable');assert.equal(store.workbook.drafts.divider.explanation,'사라지면 안 되는 설명');storage.failed=false;assert.equal(store.save(),true);assert.equal(session(storage).workbook.drafts.divider.explanation,'사라지면 안 되는 설명');
});
test('a different tab cannot silently overwrite a newer active record',()=>{
 const storage=new StorageFixture(),a=session(storage);assert.equal(a.save(),true);const b=session(storage);b.workbook.drafts.report=missionDraft(courseMissions[7]);b.workbook.drafts.report.explanation='두 번째 탭';assert.equal(b.save(),true);
 a.workbook.drafts.report=missionDraft(courseMissions[7]);a.workbook.drafts.report.explanation='첫 번째 탭의 미저장 설명';assert.equal(a.save(),false);assert.equal(a.state,'conflict');assert.equal(readCourseWorkbook(storage.getItem(workbookStorageKey)!).drafts.report.explanation,'두 번째 탭');assert.equal(a.workbook.drafts.report.explanation,'첫 번째 탭의 미저장 설명');
});
test('corrupt original is archived byte-for-byte before opening a valid imported record',()=>{
 const storage=new StorageFixture();storage.setItem(workbookStorageKey,'{broken 원본');const store=session(storage);assert.equal(store.state,'invalid');assert.equal(store.save(),false);
 store.workbook.drafts.report=missionDraft(courseMissions[7]);store.workbook.drafts.report.explanation='복구 중 작성한 설명';const imported=newCourseWorkbook('imported');assert.equal(store.replace(imported),true);
 const backup=[...storage.data].find(([k])=>k.includes('.backup.'))!;const p=JSON.parse(backup[1]);assert.equal(p.original_raw,'{broken 원본');assert.equal(p.current.drafts.report.explanation,'복구 중 작성한 설명');assert.equal(store.workbook.project_id,'imported');
});
test('failed import backup never discards current memory or corrupt original, including retry',()=>{
 const storage=new StorageFixture();storage.setItem(workbookStorageKey,'broken');const store=session(storage),old=store.workbook;storage.failed=true;assert.equal(store.replace(newCourseWorkbook('candidate')),false);assert.equal(store.workbook,old);assert.equal(storage.getItem(workbookStorageKey),'broken');storage.failed=false;assert.equal(store.save(),false);assert.equal(storage.getItem(workbookStorageKey),'broken');
});
test('tampered imports are rejected and harmless JSON property order is accepted',()=>{
 const m=courseMissions[0],w=newCourseWorkbook('ordered'),d=missionDraft(m);d.runs.push(calculateMission(m,d));w.drafts[m.id]=d;
 const reorder=(value:unknown):unknown=>Array.isArray(value)?value.map(reorder):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).reverse().map(([k,v])=>[k,reorder(v)])):value;
 assert.deepEqual(readCourseWorkbook(JSON.stringify(reorder(w))),w);
 d.runs[0].result!.primaryValue=999;const storage=new StorageFixture(),store=session(storage);assert.throws(()=>store.replace(w));assert.equal(storage.getItem(workbookStorageKey),null);
});
