import test from 'node:test';
import assert from 'node:assert/strict';
import {getCalculator} from '../packages/calculators/src/index';
import {recordingCourse,recordingLessons,courseQuestions} from '../packages/education/src/recording-course';
const calculate=(id:string,inputs:Record<string,number|string>)=>getCalculator(id)!.calculate(inputs);
const answer=(id:string)=>courseQuestions.find(q=>q.id===id)!.expected!;
test('recording plan preserves 12 core lessons, isolates 4 proposed clinics and links all 40 questions',()=>{
 const core=recordingLessons.filter(l=>l.kind==='core'),clinics=recordingLessons.filter(l=>l.kind==='clinic');assert.equal(core.length,12);assert.equal(clinics.length,4);assert.equal(core.reduce((n,l)=>n+l.minutes,0),recordingCourse.core_minutes);assert.equal(clinics.reduce((n,l)=>n+l.minutes,0),recordingCourse.clinic_minutes);
 const ids=recordingLessons.flatMap(l=>l.question_ids);assert.equal(new Set(ids).size,40);assert.deepEqual([...ids].sort(),courseQuestions.map(q=>q.id).sort());assert.equal(new Set(courseQuestions.map(q=>q.id)).size,40);assert.equal(recordingCourse.edition,'edu');assert.equal(recordingCourse.price_krw,250000);assert.equal(recordingCourse.recording_status,'not_recorded');
});
test('teacher divider, loaded output and low-current answers agree with the shared calculators',()=>{
 const before=calculate('voltage-divider',{vin:1.8,r1:10000,r2:10000}),after=calculate('voltage-divider',{vin:1.8,r1:10000,r2:20000});assert.equal(before.primaryValue,answer('Q11'));assert.equal(Number(before.secondary!.find(s=>s.label==='Divider current')!.value)*1e6,answer('Q12'));assert.equal(after.primaryValue,answer('Q13'));assert.equal(Number(after.secondary!.find(s=>s.label==='Divider current')!.value)*1e6,answer('Q14'));
 const parallel=calculate('parallel-resistor',{r1:10000,r2:10000,r3:0,r4:0});assert.equal(parallel.primaryValue,answer('Q33'));assert.equal(calculate('voltage-divider',{vin:1.8,r1:10000,r2:Number(parallel.primaryValue)}).primaryValue,answer('Q34'));
 const low=calculate('voltage-divider',{vin:1.8,r1:100000,r2:100000});const current=Number(low.secondary!.find(s=>s.label==='Divider current')!.value);assert.equal(current*1e6,answer('Q35'));assert(Math.abs(1.8*current*1e6-answer('Q36'))<1e-10);
});
test('RC workbook and actual puzzle conditions remain distinct and step limits are explicit',()=>{
 for(const [r,c,id]of [[10000,1e-9,'Q17'],[10000,5e-9,'Q18'],[1000,1e-9,'Q19']] as const)assert.equal(Number(calculate('rc-time-constant',{resistance:r,capacitance:c}).primaryValue)*1e6,answer(id));
 assert(Math.abs((1-Math.exp(-5))*100-answer('Q22'))<.001);assert(Math.abs(-Math.log(.1)*10-answer('Q37'))<.001);
 assert.match(recordingLessons.find(l=>l.id==='07')!.script.join(''),/1킬로옴/);assert.match(recordingLessons.find(l=>l.id==='08')!.script.join(''),/상승 시간/);
});
