import test from 'node:test';
import assert from 'node:assert/strict';
import {filterStudyQuestions,inspectStudyDraft,readStudyDraft,studyDraftKey,writeStudyDraft,type StudyDraft,type StudyDraftContext} from '../packages/ui/src/study-draft';
const context:StudyDraftContext={store_id:'store-a',question_id:'q-1',question_version:'v1',purpose:'practice'};
const draft=(patch:Partial<StudyDraft>={}):StudyDraft=>({schema_version:1,edition:'edu',draft_only:true,...context,answer:'1 kΩ',updated_at:'2026-10-26T03:00:00Z',...patch});
const storage=()=>{const data=new Map<string,string>();return {data,getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);},removeItem:(k:string)=>{data.delete(k);}};};
test('unsent answers survive reopen and remain separated by question, version, purpose and workspace',()=>{
 const s=storage();assert(writeStudyDraft(s,draft()));assert.equal(readStudyDraft(s,context).draft?.answer,'1 kΩ');
 for(const patch of [{store_id:'store-b'},{question_id:'q-2'},{question_version:'v2'},{purpose:'qa' as const}]){
  const c={...context,...patch};assert.notEqual(studyDraftKey(c),studyDraftKey(context));assert.equal(readStudyDraft(s,c).draft,null);
  assert(writeStudyDraft(s,draft({...patch,answer:'separate'})));assert.equal(readStudyDraft(s,context).draft?.answer,'1 kΩ');
 }
 assert.equal(s.data.size,5);
});
test('tampered identity, future schema and invalid answers never become a current draft',()=>{
 for(const patch of [{edition:'indust'},{schema_version:2},{draft_only:false},{purpose:'qa'},{question_version:'v2'},{store_id:'other'},{answer:42},{answer:'x'.repeat(6001)},{updated_at:'yesterday'}])assert.equal(inspectStudyDraft({...draft(),...patch},context),null);
 const restored=inspectStudyDraft({...draft(),approved:true,score:100,feedback:'fake PASS'},context)!;
 assert.equal(restored.answer,'1 kΩ');assert(!('approved' in restored));assert(!('score' in restored));assert(!('feedback' in restored));
 const s=storage();assert(writeStudyDraft(s,{...draft(),approved:true,score:100} as StudyDraft));assert(!s.getItem(studyDraftKey(context))!.includes('approved'));assert(!s.getItem(studyDraftKey(context))!.includes('score'));
});
test('unreadable or malformed storage is reported without deleting the original or making a grade',()=>{
 const s=storage(),key=studyDraftKey(context);s.setItem(key,'{invalid');assert(readStudyDraft(s,context).error);assert.equal(s.getItem(key),'{invalid');
 const denied={getItem(){throw Error('denied');},setItem(){throw Error('full');},removeItem(){throw Error('denied');}};
 assert(readStudyDraft(denied,context).error);assert.equal(writeStudyDraft(denied,draft()),false);assert.equal(s.data.size,1);
});
test('review filters distinguish ungraded, wrong, untouched, difficulty and topic',()=>{
 const qs=[{id:'a',level:1,topic:'DC',last_attempt:null},{id:'b',level:2,topic:'DC',last_attempt:{score:0}},{id:'c',level:2,topic:'AC',last_attempt:{score:null}},{id:'d',level:2,topic:'DC',last_attempt:{score:100}}];
 const f={topic:'',difficulty:'all',review:'all',recommendedLevel:2};
 assert.deepEqual(filterStudyQuestions(qs,{...f,review:'wrong'}).map(q=>q.id),['b']);
 assert.deepEqual(filterStudyQuestions(qs,{...f,review:'unanswered'}).map(q=>q.id),['a']);
 assert.deepEqual(filterStudyQuestions(qs,{...f,difficulty:'auto',topic:'DC'}).map(q=>q.id),['b','d']);
 assert.deepEqual(filterStudyQuestions(qs,{...f,review:'wrong',difficulty:'1'}),[]);
});
