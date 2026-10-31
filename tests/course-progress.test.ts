import test from 'node:test';
import assert from 'node:assert/strict';
import {newCourseWorkbook,courseMissions,missionDraft} from '../packages/education/src/course-workbook';
import {appendMissionRun} from '../packages/education/src/course-experiments';
import {workbookProgress,workbookReport} from '../packages/education/src/course-progress';
test('learning completion is independent from calculation availability and revision freshness',()=>{
 const w=newCourseWorkbook('progress');assert.equal(workbookProgress(w).next,'divider');assert.equal(Object.keys(w.drafts).length,0);
 const d=w.drafts.divider=missionDraft(courseMissions[0]);d.complete=true;let p=workbookProgress(w);assert.equal(p.completed,1);assert.equal(p.calculated,0);assert.equal(p.missions[0].result,'not_run');assert.equal(p.next,'divider-ratio');
 appendMissionRun(courseMissions[0],d);assert.equal(workbookProgress(w).calculated,1);d.inputs.r2='20000';p=workbookProgress(w);assert.equal(p.stale,1);assert.equal(p.calculated,0);assert.equal(p.completed,1);
 const n=w.drafts.nmos=missionDraft(courseMissions[6]);appendMissionRun(courseMissions[6],n);assert.equal(workbookProgress(w).missions[6].result,'unavailable');
});
test('report preserves learner text, raw conditions and historical revisions while escaping injected HTML',()=>{
 const w=newCourseWorkbook('report-<tag>'),d=w.drafts.divider=missionDraft(courseMissions[0]);d.prediction='<img src=x onerror=alert(1)>\n내 예측';d.explanation='학생의 설명 & 근거';appendMissionRun(courseMissions[0],d);d.inputs.r2='20000';d.revision++;
 const html=workbookReport(w);assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img'));assert.ok(html.includes('학생의 설명 &amp; 근거'));assert.ok(html.includes('현재 revision 2'));assert.ok(html.includes('실행 revision 1'));assert.ok(html.includes('20000'));assert.ok(html.includes('10000'));assert.ok(html.includes('미실행'));assert.ok(html.includes('schema_version: 1'));assert.ok(html.includes('edition: edu'));assert.equal(d.explanation,'학생의 설명 & 근거');
});
