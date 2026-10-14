import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {unzipSync,strFromU8,strToU8,zipSync} from 'fflate';
import {assignments,categories,catalogVersion,learningPaths,sources,studentReferences} from '../packages/education/src/assignment-catalog';
import {buildCoursePackage} from '../packages/education/src/course-package';
import {circuitFixtures} from '../packages/education/src/circuit-fixtures';
import {geometryReferences,geometryReferenceSvg} from '../packages/education/src/geometry-references';
import {captureAssignmentEvidence,newAssignmentRecord,parseAssignmentRecord} from '../packages/education/src/assignment-record';
import {launchAssignment} from '../packages/ui/src/assignment-launch';
import {calculateSafe,calculators,getCalculator} from '../packages/calculators/src';
import type {Project,Run} from '../packages/contracts/src';
const now='2026-10-14T00:00:00.000Z',id='11111111-1111-4111-8111-111111111111';
test('72 authored tasks, 40 references, 10 nonempty paths: IDs, sources, rubric and real launch contracts',()=>{
 assert.equal(assignments.length,72);assert.equal(studentReferences.length,40);assert.equal(learningPaths.length,10);
 assert.equal(new Set(assignments.map(a=>a.id)).size,assignments.length);
 assert.equal(new Set(studentReferences.map(r=>r.id)).size,studentReferences.length);
 for(const category of categories)assert(assignments.some(a=>a.category===category));
 for(const a of assignments){assert(a.goal&&a.scope&&a.variable);assert(a.conditions.length>=2);assert(a.questions.length>=2);assert(a.steps.length>=5);assert.equal(a.rubric.reduce((n,r)=>n+r.points,0),100);for(const id of a.reference_ids)assert(studentReferences.some(r=>r.id===id),a.id+' missing '+id);if(a.launch.kind==='calculator')assert(getCalculator(a.launch.id));if(['circuit','fixture'].includes(a.launch.kind))assert(circuitFixtures.some(f=>f.id===('id' in a.launch?a.launch.id:'')));}
 for(const r of studentReferences)for(const id of r.source_ids)assert(sources.some(s=>s.id===id),r.id+' missing source '+id);
 for(const s of sources){assert.equal(new URL(s.url).protocol,'https:');if('local' in s)assert(existsSync(s.local!),s.id+' local source missing');}
 for(const p of learningPaths){assert(p.assignment_ids.length>0);assert.equal(new Set(p.assignment_ids).size,p.assignment_ids.length);for(const id of p.assignment_ids)assert(assignments.some(a=>a.id===id));}
});
test('All 18 classroom calculator cases use the shared implementation; no educational math fork',()=>{
 const calc=assignments.filter(a=>a.launch.kind==='calculator');assert.equal(calc.length,calculators.length);
 for(const a of calc){if(a.launch.kind!=='calculator')continue;const c=getCalculator(a.launch.id)!;assert(calculateSafe(c,a.launch.inputs).result,a.id);const files=buildCoursePackage('instructor',[a.id]);const exported=JSON.parse(files['catalog.json']).assignments[0].known_result;assert.deepEqual(exported.result,calculateSafe(c,a.launch.inputs).result);assert.equal(exported.engine_verification,false);}
 const divider=getCalculator('voltage-divider')!;const result=calculateSafe(divider,{vin:1.8,r1:10000,r2:10000}).result!;assert.equal(result.primaryValue,.9);
 const sarRef=studentReferences.find(r=>r.id==='adc-code-definitions')!;assert.match(sarRef.equation!,/2\^N−1/);assert.match(sarRef.equation!,/Vref\/2\^N/);
});
test('Student archives contain no instructor solutions or submitted answers; teacher rubric is separate',()=>{
 for(const audience of ['instructor','student'] as const){const files=buildCoursePackage(audience);const bytes=zipSync(Object.fromEntries(Object.entries(files).map(([name,data])=>[name,strToU8(data)])));const decoded=unzipSync(bytes);assert.equal(Object.keys(files).length,Object.keys(decoded).length);const catalog=JSON.parse(strFromU8(decoded['catalog.json']));const manifest=JSON.parse(strFromU8(decoded['manifest.json']));assert.equal(manifest.assignment_count,72);assert.equal(manifest.reference_count,40);assert.equal(manifest.student_submissions_included,false);assert.equal(manifest.engine.execution,'not_run');assert.equal(manifest.project_id,null);assert.equal(manifest.edition,'edu');assert.equal(manifest.catalog_version,catalogVersion);if(audience==='student'){assert(catalog.assignments.every((a:any)=>!a.instructor&&!a.known_result));assert(!decoded['instructor-guide.md']);assert(!decoded['fixtures/known-values.json']);assert(!strFromU8(decoded['assignments/calc-voltage-divider.md']).includes('교수자 해설'));}else assert(decoded['instructor-guide.md']);}
 assert.throws(()=>buildCoursePackage('student',[]));assert.throws(()=>buildCoursePackage('student',['unknown']));assert.throws(()=>buildCoursePackage('instructor',['circuit-divider','circuit-divider']));
});
test('Subset ZIP links are complete; only public authored fixtures and sources are bundled',()=>{
 for(const p of learningPaths){const files=buildCoursePackage('student',p.assignment_ids,p.title);const c=JSON.parse(files['catalog.json']);assert.equal(c.assignments.length,p.assignment_ids.length);for(const a of c.assignments)for(const r of a.reference_ids)assert(files[`references/${r}.md`]);for(const r of c.references)for(const id of r.source_ids)assert(c.sources.some((s:any)=>s.id===id));assert(Object.keys(files).every(p=>!p.includes('..')&&!p.startsWith('/')&&!p.includes('.env')));}
 assert.equal(circuitFixtures.length,8);assert(circuitFixtures.every(f=>f.deck.includes('.end')&&!f.deck.includes('.include')&&!f.deck.includes('.lib')));
});
test('Abstract ABAB/ABBA references have the stated centroids and units without implying physical matching',()=>{
 const centroid=(id:string,label:string)=>{const units=geometryReferences.find(f=>f.id===id)!.units.filter(u=>u.label===label);return units.reduce((s,u)=>s+u.x_um,0)/units.length;};assert.equal(centroid('abab','A'),-1.5);assert.equal(centroid('abab','B'),1.5);assert.equal(centroid('abba','A'),0);assert.equal(centroid('abba','B'),0);
 for(const f of geometryReferences){assert.equal(f.electrical_matching_verified,false);assert.equal(f.layer_mapping,null);assert.equal(f.process_stack,null);assert.equal(f.is_physical_device,false);assert.deepEqual(f.unit_size_um,[2,2]);assert.match(geometryReferenceSvg(f),/실제 소자\/마스크 아님/);}
 const files=buildCoursePackage('student',['layout-centroid']);assert(files['figures/abab.svg']);assert(files['figures/abba.svg']);assert.match(files['assignments/layout-centroid.md'],/figures\/abba.svg/);
});
test('Student record save/reopen preserves raw answers; invalid editions, grades and imported cross-project evidence are rejected',()=>{
 const r=newAssignmentRecord('circuit-divider',id,now,'qa');r.saved_at=now;r.student.explanation='[QA, not a student submission] ΔV and signed current.';r.student.pre_answers[0]='My raw prediction';const opened=parseAssignmentRecord(JSON.stringify(r));assert.deepEqual(opened,r);assert.equal(opened.grade,null);assert.equal(opened.education_effect_proven,false);
 for(const patch of [{edition:'indust'},{schema_version:2},{grade:100},{education_effect_proven:true},{student:{...r.student,pre_answers:[]}}])assert.throws(()=>parseAssignmentRecord(JSON.stringify({...r,...patch})));
 assert.throws(()=>parseAssignmentRecord('x'.repeat(1024*1024+1)));
});
test('Calculator comparisons preserve actual shared inputs/results; additive v1 migration and tamper checks',()=>{
 const r=newAssignmentRecord('calc-voltage-divider',id,now),calculator=getCalculator('voltage-divider')!;
 for(const r2 of [10000,5000]){const inputs={vin:1.8,r1:10000,r2};r.calculations.push({calculator_id:calculator.id,inputs,result:calculateSafe(calculator,inputs).result!,formula:calculator.formula,source:'shared_deterministic_calculator',saved_at:now,engine_verification:false});}
 const roundtrip=parseAssignmentRecord(JSON.stringify(r));assert.deepEqual(roundtrip.calculations.map(c=>c.result.primaryValue),[.9,.6]);assert.deepEqual(roundtrip.calculations.map(c=>c.inputs.r2),[10000,5000]);
 const modified=structuredClone(r);modified.calculations[0].result.primaryValue=999;assert.throws(()=>parseAssignmentRecord(JSON.stringify(modified)),/수식 결과/);
 const {calculations,...legacy}=r;assert.deepEqual(parseAssignmentRecord(JSON.stringify(legacy)).calculations,[]);
});
test('Captured evidence pins independent runs, original input and historical revision without manufacturing PASS',()=>{
 const p={id:'a'.repeat(32),revision:2,pdk_id:'sky130A',testbench:{supply_V:1.8}} as Project;
 const runs=[{id:'b'.repeat(32),project_id:p.id,revision:1,kind:'drc',tool:'Magic',execution_status:'completed',analysis_result:'fail',freshness:'stale',message:'actual violation'},{id:'c'.repeat(32),project_id:'d'.repeat(32),revision:2,kind:'lvs',execution_status:'completed',analysis_result:'pass',freshness:'current'}] as Run[];
 const r=newAssignmentRecord('verify-drc',id,now);r.evidence=captureAssignmentEvidence(p,runs,null,now);assert.equal(r.evidence.runs.length,1);assert.equal(r.evidence.runs[0].analysis_result,'fail');assert.equal(r.evidence.runs[0].revision,1);assert.equal(r.evidence.engine.id,null);p.testbench.supply_V=1.5;assert.equal(r.evidence.inputs.supply_V,1.8);parseAssignmentRecord(JSON.stringify(r));
 assert.throws(()=>parseAssignmentRecord(JSON.stringify({...r,evidence:{...r.evidence,runs:[{...r.evidence!.runs[0],project_id:'d'.repeat(32)}]}})));
});
test('Basic circuit launch issues real commands and oriented wires, never simulation or physical PASS',async()=>{
 const a=assignments.find(a=>a.id==='circuit-divider')!,calls:{method:string;params:any}[]=[];let p={id:'a'.repeat(32),revision:1,schematic:{devices:[],wires:[]},runs:[]} as unknown as Project;
 const fake=async<T>(method:string,params:Record<string,unknown>):Promise<T>=>{calls.push({method,params});if(method==='schematic.apply_command'){p={...p,revision:p.revision+1};const c=params.command as any;if(c.type==='add_device')p.schematic.devices.push(c.device);if(c.type==='add_wire')p.schematic.wires.push(c.wire);}return p as T;};
 await launchAssignment(a,fake,id);assert.equal(calls[0].params.example,'schematic');assert.equal(p.schematic.devices.length,4);assert(p.schematic.wires.length>=3);assert(calls.every(c=>['project.create','schematic.apply_command'].includes(c.method)));assert(calls.filter(c=>c.method==='schematic.apply_command').every(c=>c.params.expected_revision>=1));for(const w of p.schematic.wires)for(let i=1;i<w.points.length;i++)assert(w.points[i][0]===w.points[i-1][0]||w.points[i][1]===w.points[i-1][1]);
 await assert.rejects(()=>launchAssignment(assignments.find(a=>a.id==='digital-pnr')!,fake,id),/자동 생성/);
});
test('Published package filenames resolve and hashes cover all 38 archives',()=>{
 const c=JSON.parse(readFileSync('public/edu-packages/catalog.json','utf8'));assert.equal(c.bundles.length,38);assert.equal(new Set(c.bundles.map((b:any)=>b.file)).size,38);for(const b of c.bundles){assert(existsSync('public/edu-packages/'+b.file));const bytes=readFileSync('public/edu-packages/'+b.file),archive=unzipSync(bytes),manifest=JSON.parse(strFromU8(archive['manifest.json']));assert.equal(createHash('sha256').update(bytes).digest('hex'),b.sha256);assert.equal(bytes.length,b.bytes);assert.equal(manifest.assignment_count,b.assignment_count);assert.equal(manifest.audience,b.audience);const expected=buildCoursePackage(b.audience,manifest.assignment_ids,b.title);assert.deepEqual(Object.keys(archive).sort(),Object.keys(expected).sort());for(const [name,text]of Object.entries(expected))assert.equal(strFromU8(archive[name]),text,b.file+' out of date '+name);}
});
