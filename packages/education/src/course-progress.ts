import {courseMissions,courseRevision,type CourseWorkbook,type WorkbookRun} from './course-workbook';
import {isCurrentRun,engineeringValue,resultLabel} from './course-experiments';

export function workbookProgress(workbook:CourseWorkbook){
 const missions=courseMissions.map(m=>{const d=workbook.drafts[m.id],last=d?.runs.at(-1);
  return {id:m.id,title:m.title,revision:d?.revision??1,started:!!d&&(!!d.prediction.trim()||!!d.explanation.trim()||!!d.runs.length||d.complete),self_complete:!!d?.complete,
   prediction:!!d?.prediction.trim(),explanation:!!d?.explanation.trim(),result:!last?'not_run':!isCurrentRun(last,d!)?'stale':last.engine.status};
 });
 return {missions,completed:missions.filter(m=>m.self_complete).length,calculated:missions.filter(m=>m.result==='calculated').length,stale:missions.filter(m=>m.result==='stale').length,
  next:missions.find(m=>!m.self_complete)?.id??null};
}
export const workbookResultLabels:Record<string,string>={not_run:'계산 기록 없음',stale:'이전 조건의 기록',calculated:'수식 계산 기록 있음',unavailable:'워크북 엔진 실행 불가'};
const esc=(value:unknown)=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
function runReport(run:WorkbookRun){
 const primary=run.result?engineeringValue(run.result.primaryValue,run.result.primaryUnit):null;
 return `<article><h4>실행 revision ${run.revision} · ${esc(run.created_at)}</h4><p>${esc(run.engine.id)} · ${esc(run.engine.status)} · ${esc(run.engine.process_id)}</p><p>${esc(run.engine.scope)}</p><pre>${esc(JSON.stringify(run.inputs,null,2))}</pre>${primary?`<p>${esc(resultLabel(run.result!.primaryLabel))}: <b>${esc(primary.value)} ${esc(primary.unit)}</b></p>${(run.result!.secondary??[]).map(s=>{const v=engineeringValue(s.value,s.unit);return `<p>${esc(resultLabel(s.label))}: ${esc(v.value)} ${esc(v.unit)}</p>`;}).join('')}`:'<p>전기적 수치 결과 없음</p>'}</article>`;
}
// Report contains learner-authored text verbatim (HTML escaped), not a generated answer.
export function workbookReport(workbook:CourseWorkbook){
 const progress=workbookProgress(workbook);
 return `<h1>Resistor Edu 실험 보고서</h1><p>edition: edu · schema_version: ${workbook.schema_version}<br>project_id: ${esc(workbook.project_id)}<br>course_revision: ${esc(courseRevision)}</p><p>자기 완료 ${progress.completed}/${courseMissions.length} · 현재 조건 수식 기록 ${progress.calculated}개 · 이전 조건 ${progress.stale}개</p><p>DRC / LVS / PEX / 실제 시뮬레이션: 워크북에서 미실행. 학생 완료 표시와 수식 계산은 엔진 PASS 판정이 아닙니다. 외부 앱 실행에 대한 학생의 메모는 여기서 검증하지 않았습니다.</p>`+
 courseMissions.map(m=>{const d=workbook.drafts[m.id],p=progress.missions.find(p=>p.id===m.id)!;return `<section><h2>${esc(m.title)}</h2><p>현재 revision ${p.revision} · ${esc(workbookResultLabels[p.result])} · 학생 자기 완료: ${p.self_complete?'표시함':'표시하지 않음'}</p><h3>현재 입력 (SI)</h3><pre>${d?esc(JSON.stringify(d.inputs,null,2)):'아직 시작하지 않음'}</pre><h3>학생 예측</h3><p>${esc(d?.prediction||'미작성')}</p><h3>학생 설명</h3><p>${esc(d?.explanation||'미작성')}</p><h3>저장한 계산·실행 시도</h3>${d?.runs.length?d.runs.map(runReport).join(''):'<p>실행 기록 없음</p>'}</section>`;}).join('');
}
