import type {Doctor,Project,Run} from '../../contracts/src/index';
import {catalogVersion,getAssignment} from './assignment-catalog';
import {calculateSafe,getCalculator,type CalculatorResult} from '../../calculators/src/index';

export interface AssignmentRecord {
 schema_version:1; edition:'edu'; product_id:'resistor.edu'; catalog_version:string;
 artifact_kind:'student_authored_record'; id:string; assignment_id:string;
 purpose:'practice'|'qa'; created_at:string; saved_at:string|null;
 student:{prediction:string;explanation:string;limitations:string;pre_answers:string[];post_answers:string[];completed:boolean};
 calculations:{calculator_id:string;inputs:Record<string,number|string>;result:CalculatorResult;formula:string;source:'shared_deterministic_calculator';saved_at:string;engine_verification:false}[];
 evidence:null|{
  schema_version:1;edition:'edu';project_id:string;data_revision:number;
  engine:{id:string|null;tools:{name:string;version:string|null;available:boolean}[]};
  process:{id:string;version:string|null}; inputs:Record<string,unknown>;
  runs:{id:string;project_id:string;revision:number;kind:string;tool:string|null;execution_status:string;analysis_result:string;freshness:string;message:string|null}[];
  source:'explicit_native_snapshot'; saved_at:string;
 };
 teacher_review:'pending'; grade:null; education_effect_proven:false;
 learning_completion_is_engine_verification:false;
}
export function newAssignmentRecord(assignment_id:string,id:string,now:string,purpose:'practice'|'qa'='practice'):AssignmentRecord {
 const a=getAssignment(assignment_id);if(!a)throw Error('알 수 없는 과제입니다.');
 return {schema_version:1,edition:'edu',product_id:'resistor.edu',catalog_version:catalogVersion,artifact_kind:'student_authored_record',id,assignment_id,purpose,created_at:now,saved_at:null,
   student:{prediction:'',explanation:'',limitations:'',pre_answers:a.questions.map(()=>''),post_answers:a.questions.map(()=>''),completed:false},calculations:[],evidence:null,teacher_review:'pending',grade:null,education_effect_proven:false,learning_completion_is_engine_verification:false};
}
export function captureAssignmentEvidence(project:Project,runs:Run[],doctor:Doctor|null,now:string):NonNullable<AssignmentRecord['evidence']> {
 return {schema_version:1,edition:'edu',project_id:project.id,data_revision:project.revision,
   engine:{id:doctor?.runner??null,tools:doctor?.tools.map(({name,version,available})=>({name,version,available}))??[]},
   process:{id:project.pdk_id,version:doctor?.pdk.id===project.pdk_id?doctor.pdk.version??null:null},
   inputs:structuredClone({...project.testbench}),runs:runs.filter(r=>r.project_id===project.id).map(r=>({id:r.id,project_id:r.project_id,revision:r.revision,kind:r.kind,tool:r.tool??null,execution_status:r.execution_status,analysis_result:r.analysis_result,freshness:r.freshness,message:r.message??null})),
   source:'explicit_native_snapshot',saved_at:now};
}
const boundedString=(v:unknown,max:number)=>typeof v==='string'&&v.length<=max;
const date=(v:unknown)=>boundedString(v,40)&&Number.isFinite(Date.parse(v as string));
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const projectId=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{32}$/.test(v);
// Imported evidence is a student attachment, never a trusted engine response.
export function parseAssignmentRecord(text:string):AssignmentRecord {
 if(new TextEncoder().encode(text).byteLength>1024*1024)throw Error('학생 기록은 1MiB 이하 JSON입니다.');
 let v:AssignmentRecord;try{v=JSON.parse(text);}catch{throw Error('JSON 기록을 읽을 수 없습니다.');}
 const a=v&&getAssignment(v.assignment_id);
 if(!a||v.schema_version!==1||v.edition!=='edu'||v.product_id!=='resistor.edu'||v.catalog_version!==catalogVersion||v.artifact_kind!=='student_authored_record'||!uuid(v.id)||!['practice','qa'].includes(v.purpose)||!date(v.created_at)||v.saved_at!==null&&!date(v.saved_at))throw Error('현재 Resistor Edu 과제 기록 형식/버전이 아닙니다. 다른 제품 기록은 덮어쓰지 않습니다.');
 if(v.grade!==null||v.teacher_review!=='pending'||v.education_effect_proven!==false||v.learning_completion_is_engine_verification!==false)throw Error('자동 점수·효과·엔진 PASS를 학습 기록으로 가져오지 않습니다.');
 const s=v.student;
 if(!s||typeof s.completed!=='boolean'||!['prediction','explanation','limitations'].every(k=>boundedString(s[k as keyof typeof s],8000))||![s.pre_answers,s.post_answers].every(rows=>Array.isArray(rows)&&rows.length===a.questions.length&&rows.every(t=>boundedString(t,2000))))throw Error('학생 설명·개념 답변 형식이 올바르지 않습니다.');
 const calculations=v.calculations??[]; // additive v1 migration: old records had no calculator snapshots
 if(!Array.isArray(calculations)||calculations.length>16)throw Error('계산 기록은 최대 16개입니다.');
 for(const snapshot of calculations){
  if(a.launch.kind!=='calculator'||snapshot.calculator_id!==a.launch.id||snapshot.source!=='shared_deterministic_calculator'||snapshot.engine_verification!==false||!date(snapshot.saved_at)||!snapshot.inputs||typeof snapshot.inputs!=='object'||Array.isArray(snapshot.inputs))throw Error('계산 기록 형식이 올바르지 않습니다.');
  const calculator=getCalculator(snapshot.calculator_id)!;
  if(snapshot.formula!==calculator.formula||Object.keys(snapshot.inputs).some(k=>!calculator.inputs.some(i=>i.id===k))||Object.values(snapshot.inputs).some(x=>typeof x!=='string'&&!(typeof x==='number'&&Number.isFinite(x))))throw Error('계산 입력·수식이 현재 공통 모듈과 다릅니다.');
  const computed=calculateSafe(calculator,snapshot.inputs);if(!computed.result||JSON.stringify(computed.result)!==JSON.stringify(snapshot.result))throw Error('기록의 계산 결과가 실제 공통 수식 결과와 다릅니다.');
 }
 const e=v.evidence;
 if(e){
  if(e.schema_version!==1||e.edition!=='edu'||!projectId(e.project_id)||!Number.isSafeInteger(e.data_revision)||e.data_revision<1||e.source!=='explicit_native_snapshot'||!date(e.saved_at)||!e.engine||e.engine.id!==null&&!boundedString(e.engine.id,256)||!Array.isArray(e.engine.tools)||e.engine.tools.length>24||e.engine.tools.some(t=>!boundedString(t.name,128)||t.version!==null&&!boundedString(t.version,4000)||typeof t.available!=='boolean')||!e.process||!boundedString(e.process.id,128)||e.process.version!==null&&!boundedString(e.process.version,128)||!e.inputs||typeof e.inputs!=='object'||Array.isArray(e.inputs))throw Error('프로젝트·엔진·공정 증거 형식이 올바르지 않습니다.');
  if(!Array.isArray(e.runs)||e.runs.length>2000||e.runs.some(r=>!projectId(r.id)||r.project_id!==e.project_id||!Number.isSafeInteger(r.revision)||r.revision<1||!boundedString(r.kind,128)||r.tool!==null&&!boundedString(r.tool,128)||r.message!==null&&!boundedString(r.message,10000)||!['queued','running','completed','failed','canceled'].includes(r.execution_status)||!['pass','fail','unsupported','unknown'].includes(r.analysis_result)||!['current','stale'].includes(r.freshness)))throw Error('실제 run 참조 형식이 올바르지 않습니다.');
 }
 // Allow-list fields; attachment extensions cannot become state or instructor answers.
 return {schema_version:1,edition:'edu',product_id:'resistor.edu',catalog_version:catalogVersion,artifact_kind:'student_authored_record',id:v.id,assignment_id:v.assignment_id,purpose:v.purpose,created_at:v.created_at,saved_at:v.saved_at,student:{prediction:s.prediction,explanation:s.explanation,limitations:s.limitations,pre_answers:[...s.pre_answers],post_answers:[...s.post_answers],completed:s.completed},calculations:structuredClone(calculations),evidence:e?structuredClone(e):null,teacher_review:'pending',grade:null,education_effect_proven:false,learning_completion_is_engine_verification:false};
}
