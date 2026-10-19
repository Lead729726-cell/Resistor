import type {Project,Testbench,Doctor} from '../../contracts/src/index.ts';
import type {LearningRecord} from './inverter.ts';

export type DashboardCheck={execution_status:string;analysis_result:string;revision:number|null;freshness:string;run_id:string|null;reason:string};
export interface LearningSummary {
 schema_version:1;edition:'edu';product_id:'resistor.edu';id:string;project_id:string;course_id:string;purpose:'practice'|'qa'|'unspecified';
 name:string;updated_at:string;version:number;recorded_revision:number;current_revision:number|null;
 connection:{status:'current'|'unavailable';reason:string};engine:LearningRecord['context']['engine'];process:LearningRecord['context']['process'];
 inputs:{source:'project_snapshot'|'recorded_trial'|'none';revision:number|null;conditions:Testbench|null};
 student:{saved_at:string|null;written_for_revision:number|null;explanation_saved:boolean};
 trials:{slot:'before'|'after';run_id:string|null;revision:number;execution_status:string;analysis_result:string;freshness:string;metrics_available:boolean;source:'project_snapshot'|'learning_record'}[];
 verification:Record<'drc'|'lvs'|'pex',DashboardCheck>;suggested_step:number;
}
export function summarizeLearning(record:LearningRecord,project:Project|null,reason='',doctor:Pick<Doctor,'tools'>|null=null):LearningSummary{
 if(project&&project.id!==record.project_id)throw Error('Dashboard project identity mismatch');
 const runs=project?.runs||[],trials=record.trials.map(t=>{
  const run=runs.find(r=>r.id===t.run_id&&r.project_id===record.project_id&&r.revision===t.revision);
  return {slot:t.slot,run_id:t.run_id,revision:t.revision,execution_status:run?.execution_status??t.execution_status,analysis_result:run?.analysis_result??t.analysis_result,
   freshness:project&&run?(run.revision===project.revision?run.freshness||'unknown':'stale'):'unknown',metrics_available:!!t.metrics&&t.execution_status==='completed',source:run?'project_snapshot' as const:'learning_record' as const};
 });
 const before=record.trials.find(t=>t.slot==='before'&&t.metrics),after=[...record.trials].reverse().find(t=>t.slot==='after'&&t.metrics);
 const verification=Object.fromEntries((['drc','lvs','pex'] as const).map(kind=>{
  const run=[...runs].reverse().find(r=>r.kind===kind&&r.project_id===record.project_id);
  const missing=(kind==='lvs'?['magic','netgen']:['magic']).filter(name=>doctor&&!doctor.tools.some(t=>t.name.toLowerCase()===name&&t.available));
  return [kind,run?{execution_status:run.execution_status,analysis_result:run.analysis_result,revision:run.revision,freshness:run.revision===project!.revision?run.freshness||'unknown':'stale',run_id:run.id,reason:'개별 실제 실행 기록'}:{execution_status:project&&!missing.length?'not_run':'unavailable',analysis_result:'unknown',revision:null,freshness:'unknown',run_id:null,reason:!project?'현재 설계 조회 불가':missing.length?'미설치 도구: '+missing.join(', '):doctor?'실제 실행 없음':'실행 없음 · 도구 준비 상태 미확인'}];
 })) as LearningSummary['verification'];
 const conditions=project?.testbench??record.trials.at(-1)?.conditions??null;
 const suggested_step=!before?(record.progress?.observed_views?.length?4:2):project&&before.conditions.load_F===project.testbench?.load_F?5:after&&trials.some(t=>t.run_id===after.run_id&&t.freshness==='current')?7:6;
 return {schema_version:1,edition:'edu',product_id:'resistor.edu',id:record.id,project_id:record.project_id,course_id:record.course_id,purpose:record.purpose||'unspecified',name:project?.name||'CMOS inverter 연결 실습',updated_at:record.updated_at,version:record.version,recorded_revision:record.context.data_revision,current_revision:project?.revision??null,
  connection:{status:project?'current':'unavailable',reason:project?'현재 프로젝트를 조회했습니다.':reason||'엔진 연결을 확인하지 못했습니다.'},engine:record.context.engine,process:record.context.process,
  inputs:{source:project?'project_snapshot':conditions?'recorded_trial':'none',revision:project?.revision??record.trials.at(-1)?.revision??null,conditions},
  student:{saved_at:record.student.saved_at||record.student.submitted_at||null,written_for_revision:record.student.written_for_revision??null,explanation_saved:!!record.student.explanation?.trim()},trials,verification,suggested_step};
}
