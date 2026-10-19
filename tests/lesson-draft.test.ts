import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectLessonDraft,sameAnswers} from '../packages/ui/src/lesson-draft';
const context={lesson_id:'lesson-a',project_id:'a'.repeat(32),revision:3,base_saved_at:null};
const draft={draft_only:true,project_id:context.project_id,revision:3,base_saved_at:null,explanation:'내 관찰',pre:{},post:{},load:'95'};
test('legacy local drafts migrate without changing SI inputs or making a submission',()=>{
 const result=inspectLessonDraft(draft,context);assert.equal(result.status,'restored');assert.equal(result.draft?.edition,'edu');assert.equal(result.draft?.lesson_id,'lesson-a');assert.equal(result.draft?.load,'95');assert.equal(result.draft?.draft_only,true);assert.equal('schema_version' in draft,false);
});
test('another save or geometry revision preserves a conflict instead of silently restoring stale text',()=>{
 for(const ctx of [{...context,revision:4},{...context,base_saved_at:'2026-10-19T00:00:00Z'}]){const r=inspectLessonDraft(draft,ctx);assert.equal(r.status,'conflict');assert.equal(r.draft?.explanation,'내 관찰');assert.equal(r.draft?.revision,3);}
});
test('foreign edition, project, lesson and malformed answers cannot be restored',()=>{
 assert.equal(inspectLessonDraft(null,context).status,'none');
 for(const patch of [{schema_version:2},{edition:'indust'},{lesson_id:'other'},{project_id:'b'.repeat(32)},{revision:NaN},{revision:-1},{pre:[]},{post:{unknown:'yes'}},{pre:{x:12}},{base_saved_at:'bad date'},{load:5},{explanation:'x'.repeat(8001)}])assert.equal(inspectLessonDraft({...draft,...patch},context).status,'invalid');
});
test('draft answer equality does not depend on object key order',()=>{assert(sameAnswers({a:'1',b:'2'},{b:'2',a:'1'}));assert(!sameAnswers({a:'1'},{a:'2'}));assert(!sameAnswers({a:'1'},{a:'1',b:'2'}));});
