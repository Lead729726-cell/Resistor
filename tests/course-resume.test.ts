import test from 'node:test';
import assert from 'node:assert/strict';
import {courseMissions,courseRevision,newCourseWorkbook,type CourseWorkbook} from '../packages/education/src/course-workbook';
import {coursePositionKey,parseCoursePositions,readCoursePosition,writeCoursePosition} from '../packages/ui/src/course-resume';

function memoryStore(initial?:string){
 const entries=new Map<string,string>(initial===undefined?[]:[[coursePositionKey,initial]]);
 const source=()=>({getItem:(key:string)=>entries.get(key)??null,setItem:(key:string,value:string)=>{entries.set(key,value);},removeItem:(key:string)=>{entries.delete(key);}});
 return {entries,source};
}
const envelope=(positions:unknown[],overrides:Record<string,unknown>={})=>JSON.stringify({schema_version:1,edition:'edu',course_revision:courseRevision,positions,...overrides});

test('mission positions reopen independently for each Edu project without copying student work',()=>{
 const {entries,source}=memoryStore(),first=newCourseWorkbook('first'),second=newCourseWorkbook('second');
 first.drafts.divider={revision:7,inputs:{vin:'1.8',r1:'10000',r2:'20000'},prediction:'private prediction',explanation:'private explanation',complete:false,runs:[]};
 const original=JSON.stringify(first);
 assert.equal(readCoursePosition(first,source),0);
 assert.equal(writeCoursePosition(first,3,source),true);
 assert.equal(writeCoursePosition(second,6,source),true);
 assert.equal(readCoursePosition(first,source),3);
 assert.equal(readCoursePosition(second,source),6);
 assert.equal(readCoursePosition(newCourseWorkbook('unseen'),source),0);
 assert.equal(JSON.stringify(first),original);
 assert.deepEqual(parseCoursePositions(entries.get(coursePositionKey)!),[{project_id:'second',mission_id:courseMissions[6].id},{project_id:'first',mission_id:courseMissions[3].id}]);
 assert.equal(entries.get(coursePositionKey)!.includes('private'),false);
 assert.equal(entries.get(coursePositionKey)!.includes('inputs'),false);
});

test('malformed, wrong-edition, stale and unknown navigation positions fall back safely',()=>{
 const valid=[{project_id:'p',mission_id:'rc-c'}];
 for(const raw of [null,'{broken','42','null','[]','{}',envelope(valid,{edition:'indust'}),envelope(valid,{schema_version:2}),envelope(valid,{course_revision:'old'}),envelope(valid,{positions:{}}),envelope([{project_id:'p',mission_id:'missing'}]),envelope([{project_id:7,mission_id:'rc-c'}])]){
  assert.deepEqual(parseCoursePositions(raw),[]);
  const {source}=memoryStore(raw??undefined);
  assert.equal(readCoursePosition(newCourseWorkbook('p'),source),0);
 }
 assert.deepEqual(parseCoursePositions(envelope([null,{},...valid,{project_id:'p',mission_id:'series'}])),valid);
});

test('navigation history stays bounded and revisiting updates one project without duplicates',()=>{
 const {entries,source}=memoryStore();
 for(let i=0;i<12;i++)assert.equal(writeCoursePosition(newCourseWorkbook('p'+i),i%8,source),true);
 assert.equal(parseCoursePositions(entries.get(coursePositionKey)!).length,8);
 assert.equal(readCoursePosition(newCourseWorkbook('p3'),source),0);
 assert.equal(writeCoursePosition(newCourseWorkbook('p6'),2,source),true);
 const positions=parseCoursePositions(entries.get(coursePositionKey)!);
 assert.equal(positions.length,8);
 assert.deepEqual(positions[0],{project_id:'p6',mission_id:'series'});
 assert.equal(positions.filter(p=>p.project_id==='p6').length,1);
});

test('invalid targets and non-Edu workbooks cannot overwrite a valid position',()=>{
 const {entries,source}=memoryStore(),workbook=newCourseWorkbook('p');
 writeCoursePosition(workbook,3,source);
 const saved=entries.get(coursePositionKey);
 for(const index of [-1,8,0.5,NaN,Infinity])assert.equal(writeCoursePosition(workbook,index,source),false);
 for(const change of [{edition:'indust'},{course_revision:'old'},{schema_version:2},{project_id:''}]){
  const invalid={...workbook,...change} as CourseWorkbook;
  assert.equal(readCoursePosition(invalid,source),0);
  assert.equal(writeCoursePosition(invalid,0,source),false);
 }
 assert.equal(entries.get(coursePositionKey),saved);
});

test('blocked and full storage do not interrupt navigation or touch workbook and Industry keys',()=>{
 const blocked=()=>{throw new DOMException('Blocked','SecurityError');},workbook=newCourseWorkbook('p');
 assert.equal(readCoursePosition(workbook,blocked),0);
 assert.equal(writeCoursePosition(workbook,3,blocked),false);
 const {entries,source}=memoryStore(envelope([{project_id:'p',mission_id:'series'}]));
 entries.set('resistor.edu.course-workbook.v1','student record');entries.set('resistor.indust.course-position.v1','industry position');
 const full=()=>({...source(),setItem:()=>{throw new DOMException('Full','QuotaExceededError');}});
 assert.equal(writeCoursePosition(workbook,5,full),false);
 assert.equal(readCoursePosition(workbook,source),2);
 assert.equal(entries.get('resistor.edu.course-workbook.v1'),'student record');
 assert.equal(entries.get('resistor.indust.course-position.v1'),'industry position');
});
