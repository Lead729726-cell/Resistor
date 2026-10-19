import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {request} from 'node:http';
import {unzipSync} from 'fflate';
import {validateCourse,plannedCues,buildCourseKit,sha} from '../scripts/course-kit.mjs';
import {createCourseServer} from '../scripts/course-server.mjs';
const course=()=>({schema_version:1,id:'test-course',title:'회로 실습',subtitle:'실제 엔진',audience:'입문자',planned_total_minutes:10,instructor_profile:'직접 작성',price:'미정',platform_reference:{url:'https://inflab-1.gitbook.io/inflearn/lecture-video/format'},lessons:[{id:'01',section:'회로',title:'분압기',planned_minutes:10,demo:'divider',plan:'divider',goal:'단위 읽기',opening:'목표를 봅니다.',explain:['전압을 계산합니다.'],actions:['실제로 실행합니다.'],reading:'OUT',trap:'접지를 확인합니다.',assignment:'값을 계산하세요.',answer:'PRIVATE_ANSWER_0.9V'}]});
test('bounded course schema rejects missing prose, duplicate IDs and timing mismatch',()=>{
  assert.equal(validateCourse(course()).lessons.length,1);
  for(const change of [c=>c.id='../escape',c=>c.lessons.push(c.lessons[0]),c=>c.lessons[0].answer='',c=>c.planned_total_minutes=9,c=>c.lessons[0].demo='constructor',c=>c.lessons[0].plan='invented']){const c=course();change(c);assert.throws(()=>validateCourse(c));}
});
test('planned cues sum exactly and never imply actual recording timestamps',()=>{
  for(const n of [1,6,9,10,12,59.5]){const cues=plannedCues({planned_minutes:n});assert.equal(cues.reduce((a,c)=>a+c.planned_duration_s,0),Math.round(n*60));assert(cues.every(c=>c.timing_kind==='planned-not-recorded'));}
});
test('student archive excludes teacher answers, scripts, credentials and verification inheritance',async()=>{
  const base=await mkdtemp(path.join(os.tmpdir(),'resistor-course-'));await mkdir(path.join(base,'demos'));await writeFile(path.join(base,'demos/divider.register.zip'),'explicit fixture zip');
  const opts={root:process.cwd(),base,course:course(),readiness:{demos:[{id:'divider',project_id:'a'.repeat(32),revision:4,execution_status:'completed',analysis_result:'unknown',run_id:'actual-run-fixture'}]}};
  const {out,manifest}=await buildCourseKit(opts);const zip=unzipSync(await readFile(path.join(out,'student/Student-Kit.zip')));
  assert.equal(Object.keys(zip).filter(p=>p.startsWith('projects/')).length,1);
  for(const [file,bytes]of Object.entries(zip)){assert(!/instructor|answer-key|\.env|worker\.json/.test(file));assert(!Buffer.from(bytes).toString().includes('PRIVATE_ANSWER_0.9V'));}
  assert(Buffer.from(zip['workbook.html']).toString().includes('수강생 실습 자료'));assert(!(await readFile(path.join(out,'student/workbook.html'),'utf8')).includes('강사용'));
  assert((await readFile(path.join(out,'instructor/answer-key.html'),'utf8')).includes('PRIVATE_ANSWER_0.9V'));
  for(const file of manifest.files)assert.equal(sha(await readFile(path.join(out,file.file))),file.sha256);
  await writeFile(path.join(out,'student/accidental-private-answer.txt'),'PRIVATE_ANSWER_0.9V');
  const second=await buildCourseKit(opts);assert(!second.manifest.files.some(f=>f.file==='kit-manifest.json'));
  const rebuilt=unzipSync(await readFile(path.join(out,'student/Student-Kit.zip')));assert(!Object.hasOwn(rebuilt,'accidental-private-answer.txt'));
  const instructor=unzipSync(await readFile(path.join(base,'Resistor-Inflearn-Instructor-Kit.zip')));assert(instructor['student/Student-Kit.zip']&&instructor['kit-manifest.json']);
});
test('private preview accepts only loopback GET/HEAD and blocks parent paths and cross-site requests',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'resistor-course-server-'));await writeFile(path.join(dir,'index.html'),'<h1>course</h1>');await writeFile(path.join(dir,'.env'),'secret');
  const server=await createCourseServer(dir,{port:0});const url='http://127.0.0.1:'+server.address().port;
  try{assert.equal((await fetch(url)).status,200);assert.equal((await fetch(url,{method:'HEAD'})).status,200);
    for(const target of ['/.env','/%2e%2e%5c.env','/%2eprivate','/missing'])assert.notEqual((await fetch(url+target)).status,200);
    for(const init of [{method:'POST'},{headers:{origin:'https://external.invalid'}},{headers:{'sec-fetch-site':'cross-site'}}])assert.equal((await fetch(url,init)).status,403,JSON.stringify(init));
    const hostStatus=await new Promise((resolve,reject)=>{const req=request(url,{headers:{Host:'evil.invalid'}},r=>{r.resume();resolve(r.statusCode);});req.once('error',reject);req.end();});assert.equal(hostStatus,403);
  }finally{await new Promise(r=>server.close(r));}
});
