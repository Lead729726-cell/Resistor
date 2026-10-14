import {calculateSafe,getCalculator} from '../../calculators/src/index';
import {assignments,catalogVersion,getAssignment,learningPaths,sources,studentReferences,type Assignment} from './assignment-catalog';
import {geometryReferences,geometryReferenceSvg} from './geometry-references';
import {circuitFixtures} from './circuit-fixtures';

export type Audience='instructor'|'student';
const list=(rows:string[])=>rows.map((s,i)=>`${i+1}. ${s}`).join('\n');
const bullet=(rows:string[])=>rows.map(s=>`- ${s}`).join('\n');
const json=(data:unknown)=>JSON.stringify(data,null,2)+'\n';
function knownResult(a:Assignment){
 if(a.launch.kind!=='calculator')return undefined;
 const c=getCalculator(a.launch.id)!;
 return {source:'shared_deterministic_calculator',inputs:a.launch.inputs,formula:c.formula,reference_equation:c.referenceEquation,...calculateSafe(c,a.launch.inputs),scope:a.scope,engine_verification:false};
}
export function assignmentMarkdown(a:Assignment,audience:Audience):string {
 const known=audience==='instructor'?knownResult(a):undefined;
 return `# Resistor Edu · ${a.title}\n\n`+
 `과제 ID: ${a.id} · ${catalogVersion} · 수준 ${a.level} · 권장 ${a.minutes}분\n\n`+
 `이 문서는 ${audience==='instructor'?'교수자 과제·평가 가이드':'학생용 과제 설명'}입니다. 학생 제출물이 아니며 실행 결과를 포함하지 않습니다.\n\n`+
 `## 목표\n\n${a.goal}\n\n## 사전 지식\n\n${bullet(a.prerequisites)}\n\n## 입력 조건\n\n${bullet(a.conditions)}\n\n`+
 `변경 변수: ${a.variable}\n\n## 수행\n\n${list(a.steps)}\n\n## 관찰\n\n${bullet(a.observations)}\n\n## 사전·사후 개념 질문\n\n${list(a.questions)}\n\n`+
 `같은 질문에 실험 전 예측과 실험 후 근거를 각각 직접 작성합니다. 자동 정답·점수는 없습니다.\n\n## 제출 증거\n\n${bullet(a.deliverables)}\n\n## 평가 기준 · 교수자 수동 검토\n\n`+
 a.rubric.map(r=>`- ${r.points}점 · ${r.criterion}`).join('\n')+`\n\n## 실행·판정 범위\n\n${a.scope}\n\nDRC/LVS/PEX/시뮬레이션은 독립입니다. not_run·unavailable·엔진 오류·검사 불합격·현재/이전 revision을 구분합니다. 제조 승인과 교육 효과는 증명되지 않았습니다.\n\n`+
 `## 기하 참고 그림\n\n${geometryReferences.filter(f=>f.assignment_id===a.id).map(f=>`- [${f.title}](../figures/${f.id}.svg) · ${f.conditions}`).join('\n')||'해당 과제의 기하 fixture 없음'}\n\n## 학생 레퍼런스\n\n${a.reference_ids.map(id=>{const r=studentReferences.find(r=>r.id===id)!;return `- [${r.title}](../references/${id}.md)`;}).join('\n')}\n\n`+
 (audience==='instructor'?`## 교수자 해설\n\n${a.instructor.reasoning}\n\n토론할 오류:\n\n${bullet(a.instructor.pitfalls)}\n\n`+(known?`확인된 수식 기준값 (물리 검증/실제 시뮬레이션 결과 아님):\n\n\`\`\`json\n${json(known)}\`\`\`\n\n`:'고정 성능 정답은 제공하지 않습니다. 실제 학생 프로젝트의 모델·revision·로그로 결과를 검토하세요.\n\n'):'');
}

export function buildCoursePackage(audience:Audience,ids:string[]=assignments.map(a=>a.id),title='Resistor Edu 과제 모음') {
 if(!['instructor','student'].includes(audience)||typeof title!=='string'||!title.trim()||title.length>120)throw Error('패키지 역할·이름이 올바르지 않습니다.');
 if(!ids.length||ids.length>assignments.length||new Set(ids).size!==ids.length||ids.some(id=>!getAssignment(id)))throw Error('유효한 중복 없는 과제를 선택하세요.');
 const selected=ids.map(id=>getAssignment(id)!);
 const refs=studentReferences.filter(r=>selected.some(a=>a.reference_ids.includes(r.id)));
 // Full collections also include supplementary reference cards.
 const includedRefs=ids.length===assignments.length?studentReferences:refs;
 const neededSources=sources.filter(s=>includedRefs.some(r=>r.source_ids.includes(s.id)));
 const packageAssignments=selected.map(a=>audience==='instructor'?{...a,known_result:knownResult(a)}:(({instructor,...student})=>student)(a));
 const files:Record<string,string>={};
 files['manifest.json']=json({schema_version:1,edition:'edu',product_id:'resistor.edu',catalog_version:catalogVersion,audience,title,project_id:null,data_revision:null,engine:{id:'shared-native-engine',execution:'not_run'},process:{id:null,version:null},assignment_ids:ids,assignment_count:selected.length,reference_count:includedRefs.length,student_submissions_included:false,answer_guidance_is_student_submission:false,education_effect_proven:false,foundry_signoff:false,license:'MIT for authored content/code; external PDK/tool/model licenses separate',package_contents:'Authored tasks, references and ideal SPICE fixtures. No PDK, secrets, native binaries or user projects.'});
 files['catalog.json']=json({schema_version:1,edition:'edu',catalog_version:catalogVersion,assignments:packageAssignments,references:includedRefs,sources:neededSources,paths:learningPaths.filter(p=>p.assignment_ids.every(id=>ids.includes(id)))});
 files['README.md']=`# ${title}\n\nResistor Edu · ${audience==='instructor'?'교수자':'학생'} 패키지 · ${catalogVersion}\n\n${selected.length}개 과제와 ${includedRefs.length}개 레퍼런스. MIT로 작성된 원본 교육 자료이며 원본 외부 문서/PDK/도구 라이선스는 별도입니다.\n\n## 시작\n\n1. 앱에서 **다른 과정 → 과제·레퍼런스**를 열거나 이 폴더의 catalog.json과 과제 문서를 읽습니다.\n2. 각 과제의 지원 모델·입력·미지원 범위를 읽고 새 프로젝트 사본을 시작합니다.\n3. 실제 결과 ID·revision과 자신의 설명을 저장합니다.\n4. 제출은 templates/student-submission.json 또는 앱에서 내보낸 학생 기록을 사용합니다.\n\nstandalone SPICE: ngspice -b fixtures/<id>.cir. 이 deck들은 이상 선형 회로만 포함합니다. 실행할 도구가 없으면 unavailable이며 샘플 결과로 대체하지 않습니다.\n\n실습 체크·계산·형상 생성은 DRC/LVS/PEX PASS가 아닙니다. 기록된 시간은 경과 시간이며 실제 학습 집중 시간을 측정하지 않습니다. 설명 정확도·완료율·교육 효과는 교수자/사용자 평가가 필요합니다.\n\n## 과제\n\n${selected.map(a=>`- [${a.title}](assignments/${a.id}.md) · ${a.category} · L${a.level}`).join('\n')}\n`;
 files['LICENSE.txt']='Authored Resistor Edu course content and fixture code: MIT License. Copyright (c) Resistor contributors.\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.\n\nNo external PDK, copyrighted reference text, private models, keys, user submissions or tool binaries are included. External links retain their original licenses.\n';
 files['sources.json']=json(neededSources);
 for(const f of geometryReferences.filter(f=>ids.length===assignments.length||ids.includes(f.assignment_id))){files['figures/'+f.id+'.svg']=geometryReferenceSvg(f);files['figures/'+f.id+'.json']=json(f);}
 selected.forEach(a=>{files[`assignments/${a.id}.md`]=assignmentMarkdown(a,audience);});
 includedRefs.forEach(r=>{files[`references/${r.id}.md`]=`# ${r.title}\n\nResistor Edu · ${r.id}\n\n${r.summary}\n\n${r.equation?`수식: ${r.equation}\n\n`:''}${r.units?`단위: ${r.units}\n\n`:''}조건: ${r.assumptions}\n\n주의할 해석: ${r.pitfall}\n\n다음 실험: ${r.next_experiment}\n\n${r.source_ids.map(id=>{const s=sources.find(s=>s.id===id)!;return `[${s.title}](${s.url}) · ${s.license}`;}).join('\n\n')}\n`;});
 files['templates/student-submission.json']=json({schema_version:1,edition:'edu',catalog_version:catalogVersion,assignment_id:ids[0],artifact_kind:'blank_student_template',project_id:null,data_revision:null,engine:null,process:null,inputs:{},run_evidence:[],before_prediction:'',after_explanation:'',limitations:'',pre_answers:{},post_answers:{},teacher_review:'pending',grade:null,education_effect_proven:false});
 files['templates/assessment.csv']='assignment_id,learner_alias,started_at,saved_at,elapsed_seconds,completed_by_student,pre_concept,post_concept,explanation_accuracy_teacher,teacher_points,teacher_feedback\n';
 const fixtures=circuitFixtures.filter(f=>ids.length===assignments.length||selected.some(a=>(a.launch.kind==='circuit'||a.launch.kind==='fixture')&&a.launch.id===f.id||a.id==='circuit-rc-charge'&&f.id==='rc-charge'||a.id==='circuit-rc-ac'&&f.id==='rc-ac'));
 fixtures.forEach(f=>{files[`fixtures/${f.id}.cir`]=f.deck;});
 if(audience==='instructor')files['fixtures/known-values.json']=json(fixtures.map(({id,scope,checks})=>({id,scope,checks,source:'analytic_known_value',executed:false})));
 if(audience==='instructor')files['instructor-guide.md']='# 교수자 운영 안내\n\n교수자는 catalog.json의 루브릭(과제별 총 100점)을 현장 평가에 맞게 수정할 수 있습니다. 숫자 grade는 수동 평가 전 null입니다.\n\n- 사전/사후 같은 개념 문항의 원본 답변을 보존합니다.\n- 학생 완료 선언은 엔진 판정과 별도로 집계합니다.\n- 경과 시간은 started_at~saved_at로 계산하며 집중 시간 추적이 아닙니다.\n- 설명 정확도는 관찰 사실·모델·근거·한계의 정확성을 교수자가 검토합니다.\n- unavailable/엔진 오류일 때 원인 진단을 제출하면 과제 목표에 맞춰 평가합니다. 미실행을 FAIL 또는 PASS로 변환하지 않습니다.\n- auto guide·QA 기록·실제 학생 제출물을 분리합니다. 학습 효과는 평가를 실시하기 전 미입증입니다.\n';
 return files;
}
