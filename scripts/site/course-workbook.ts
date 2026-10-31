import {calculators} from '../../packages/calculators/src/index';
import {courseMissions,courseRevision,newCourseWorkbook,missionDraft,readCourseWorkbook,type WorkbookRun} from '../../packages/education/src/course-workbook';
import {CourseWorkbookStore,workbookStorageKey} from '../../packages/education/src/course-workbook-store';
import {appendMissionRun,compareMissionRuns,engineeringValue,isCurrentRun,resultLabel,suggestedExperiment} from '../../packages/education/src/course-experiments';
import {workbookProgress,workbookReport,workbookResultLabels} from '../../packages/education/src/course-progress';
const el=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const esc=(s:unknown)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const store=new CourseWorkbookStore(()=>localStorage,()=>crypto.randomUUID());
let workbook=store.workbook;
const notice=(s:string)=>{el('save-status').textContent=s;};
notice(store.message);
function save(){store.save();notice(store.message);renderDashboard();}
el('retry-save').addEventListener('click',save);
window.addEventListener('storage',event=>{if(event.key===workbookStorageKey){store.inspectExternalChange();notice(store.message);}});
const current=()=>courseMissions.find(m=>m.id===location.hash.slice(1))??courseMissions[0];
const draft=()=>{const m=current();return workbook.drafts[m.id]??=missionDraft(m);};
function renderDashboard(){const p=workbookProgress(workbook);el('learning-dashboard').innerHTML=`<h2>내 학습 현황</h2><p>자기 완료 ${p.completed}/${courseMissions.length} · 현재 수식 기록 ${p.calculated}개 · 재계산 필요한 기록 ${p.stale}개</p><p class="muted">이 브라우저의 프로젝트만 표시합니다. 완료 표시는 학생의 자기 점검이며 실제 엔진 검증과 별개입니다.</p><div class="mission-status-list">${p.missions.map(m=>`<a href="#${m.id}"><span>${esc(m.title)}</span><small>${m.self_complete?'자기 완료 표시':m.started?'진행 중':'시작 전'} · ${esc(workbookResultLabels[m.result])}</small></a>`).join('')}</div>${p.next?`<p><a class="secondary-button" href="#${p.next}">다음 학습 이어서 →</a></p>`:'<p>모든 미션에 자기 완료를 표시했습니다. 각 실험의 근거와 미확인 범위도 다시 읽어보세요.</p>'}`;}
function result(run:WorkbookRun,reference?:number){const primary=run.result?engineeringValue(run.result.primaryValue,run.result.primaryUnit,reference):null;return `<article class="result-card"><p class="eyebrow">revision ${run.revision} · ${run.engine.status==='calculated'?'수식 계산':'웹 실행 불가'}</p>${primary?`<strong class="result-value">${esc(primary.value)} <small>${esc(primary.unit)}</small></strong><p>${esc(resultLabel(run.result!.primaryLabel))}</p>${run.result!.secondary?.map(s=>{const v=engineeringValue(s.value,s.unit);return `<p>${esc(resultLabel(s.label))} <b>${esc(v.value)} ${esc(v.unit)}</b></p>`;}).join('')??''}`:'<p>웹에서 실행할 수 없습니다. Edu 앱에서 엔진·모델을 연결하세요.</p>'}<p class="muted">${esc(run.engine.scope)}</p><details><summary>이 실행의 입력 조건 · 원본 SI 수치</summary><pre>${esc(JSON.stringify(run.inputs,null,2))}</pre></details></article>`;}
function renderResults(){const d=draft(),m=current(),first=d.runs[0],last=d.runs.at(-1),reference=Math.max(Math.abs(Number(first?.result?.primaryValue??0)),Math.abs(Number(last?.result?.primaryValue??0)));el('comparison').innerHTML=first?`<p>${isCurrentRun(last!,d)?'현재 revision의 기록입니다.':'입력이 변경되었습니다. 아래는 이전 revision의 기록입니다. 다시 계산하세요.'}</p><div class="two-columns">${result(first,reference)}${d.runs.length>1?result(last!,reference):'<p class="muted">입력 하나를 바꾸고 다시 계산하면 변경 전후를 비교할 수 있습니다.</p>'}</div>`:'<p class="muted">먼저 결과를 예측한 뒤 계산 기록을 남겨보세요. 저장된 샘플 결과는 없습니다.</p>';
 el('progress').textContent=`${courseMissions.filter(m=>workbook.drafts[m.id]?.complete).length} / 8개 · 학생이 표시한 완료 상태`;el('project-meta').textContent=`Resistor Edu · ${workbook.project_id} · ${courseRevision} · revision ${d.revision}`;
 el('formula').textContent=calculators.find(c=>c.id===m.calculator)?.formula??'실제 엔진·공정 모델이 있어야 전기적 결과를 알 수 있습니다.';
 const comparison=compareMissionRuns(m,d);
 el('experiment-feedback').innerHTML=`<h3>비교를 설명하는 순서</h3><p><b>관찰한 사실</b> · ${esc(comparison.observed)}</p><p><b>적용 모델</b> · ${esc(comparison.model)}</p><p><b>판단 근거</b> · ${esc(comparison.reason)}</p><p><b>다음 실험</b> · ${esc(comparison.next_experiment)}</p>${comparison.changes.length?'<ul>'+comparison.changes.map(c=>`<li>${esc(c.label)}: ${esc(c.before)} → ${esc(c.after)} ${esc(c.unit)}</li>`).join('')+'</ul>':''}<p class="muted">정해진 규칙에 따른 안내 · AI 호출 없음 · 학생 설명을 대신 작성하지 않습니다.</p>`;
}
function render(){const m=current(),d=draft(),index=courseMissions.indexOf(m);
 el('mission-nav').innerHTML=courseMissions.map(item=>`<a href="#${item.id}" ${item.id===m.id?'aria-current="step"':''}>${esc(item.title)}</a>`).join('');
 el('mission-title').textContent=m.title;el('goal').textContent=m.goal;el('question').textContent=m.question;el('diagnosis').textContent=m.diagnosis;
 el('input-fields').innerHTML=m.inputs.map(i=>`<label>${esc(i.label)} <span>${esc(i.unit)}</span><input type="number" step="any" required data-input="${i.id}" value="${esc(d.inputs[i.id])}"></label>`).join('');
 el<HTMLTextAreaElement>('prediction').value=d.prediction;el<HTMLTextAreaElement>('explanation').value=d.explanation;el<HTMLInputElement>('complete').checked=d.complete;
 el<HTMLButtonElement>('calculate').textContent=m.calculator?'조건 계산·기록':'웹 실행 불가 사유 기록';
 el('suggest-change').hidden=!m.inputs.some(i=>i.changed!==undefined);
 el('calculation-error').textContent='';
 el<HTMLAnchorElement>('app-guide').href=m.app;
 el<HTMLButtonElement>('previous').disabled=index===0;el<HTMLButtonElement>('next').disabled=index===courseMissions.length-1;
 const div=m.calculator==='voltage-divider';el('circuit-diagram').hidden=!div;
 renderResults();renderDashboard();
}
el('input-fields').addEventListener('input',event=>{const target=event.target as HTMLInputElement;if(!target.dataset.input)return;const d=draft();d.inputs[target.dataset.input]=target.value;d.revision++;save();renderResults();});
for(const field of ['prediction','explanation'])el(field).addEventListener('input',()=>{draft()[field as 'prediction'|'explanation']=el<HTMLTextAreaElement>(field).value;save();});
el('complete').addEventListener('change',()=>{draft().complete=el<HTMLInputElement>('complete').checked;save();renderResults();});
el('calculate').addEventListener('click',()=>{try{const recorded=appendMissionRun(current(),draft());save();renderResults();el('calculation-error').textContent='';el('calculation-status').textContent=recorded.added?'새 조건의 기록을 추가했습니다.':'같은 revision의 기록이 있어 중복 기록을 만들지 않았습니다.';}catch(e){el('calculation-status').textContent='';el('calculation-error').textContent=(e as Error).message;}});
el('suggest-change').addEventListener('click',()=>{const change=suggestedExperiment(current(),draft());save();render();el('calculation-status').textContent=change.message;});
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'&&!event.repeat){event.preventDefault();el('calculate').click();}});
for(const [name,direction]of [['previous',-1],['next',1]] as const)el(name).addEventListener('click',()=>{const i=courseMissions.indexOf(current());location.hash=courseMissions[i+direction].id;});
function download(text:string,filename:string){const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
el('export-record').addEventListener('click',()=>download(JSON.stringify(workbook,null,2),'Resistor-Edu-'+workbook.project_id+'.json'));
function report(){el('print-report').innerHTML=workbookReport(workbook);}
el('preview-report').addEventListener('click',()=>{report();el('print-report').classList.toggle('report-visible');const visible=el('print-report').classList.contains('report-visible');el('preview-report').setAttribute('aria-expanded',String(visible));if(visible){el('print-report').tabIndex=-1;el('print-report').focus();el('print-report').scrollIntoView({block:'start'});}});
el('print-record').addEventListener('click',()=>{report();window.print();});
el('new-workbook').addEventListener('click',()=>{if(store.replace(newCourseWorkbook(crypto.randomUUID()))){workbook=store.workbook;location.hash=courseMissions[0].id;render();}notice(store.message);});
let recoveries:ReturnType<CourseWorkbookStore['recoveryRecords']>=[];
el('find-backups').addEventListener('click',()=>{try{recoveries=store.recoveryRecords();el('backup-select').innerHTML='<option value="">복구할 기록 선택</option>'+recoveries.map((r,i)=>`<option value="${i}">${esc(r.source)} · ${esc(r.workbook?.project_id??'원본 보관만 가능')} · ${i+1}</option>`).join('');el('backup-status').textContent=`${recoveries.length}개 후보. 내용을 확인한 뒤 열거나 원본을 내려받으세요. 다른 탭의 기록은 자동으로 합치지 않습니다.`;backupPreview();}catch{el('backup-status').textContent='백업 목록을 읽지 못했습니다. 현재 입력은 유지됩니다.';}});
const selectedBackup=()=>{const value=el<HTMLSelectElement>('backup-select').value;return value===''?undefined:recoveries[Number(value)];};
function backupPreview(){const r=selectedBackup();el('backup-preview').textContent=r?r.raw:'선택한 후보의 원본이 여기에 표시됩니다.';el<HTMLButtonElement>('restore-backup').disabled=!r?.workbook;el<HTMLButtonElement>('export-backup').disabled=!r;}
el('backup-select').addEventListener('change',backupPreview);
el('export-backup').addEventListener('click',()=>{const r=selectedBackup();if(r)download(r.raw,'Resistor-Edu-recovery-original.json');});
el('restore-backup').addEventListener('click',()=>{const r=selectedBackup();if(!r?.workbook)return;if(store.replace(r.workbook)){workbook=store.workbook;render();}notice(store.message);});
let imported:ReturnType<typeof readCourseWorkbook>|undefined;
let importSequence=0;
el('import-record').addEventListener('change',async event=>{const sequence=++importSequence;imported=undefined;el('import-confirm').hidden=true;const f=(event.target as HTMLInputElement).files?.[0];if(!f)return;try{if(f.size>2e6)throw Error('2 MB 이하 기록을 선택하세요.');const candidate=readCourseWorkbook(await f.text());if(sequence!==importSequence)return;imported=candidate;el('import-confirm').hidden=false;el('import-status').textContent='호환 기록입니다. 원본·현재 작성 내용이 백업된 경우에만 선택한 기록으로 전환합니다.';}catch(e){if(sequence===importSequence)el('import-status').textContent=(e as Error).message;}});
el('confirm-import').addEventListener('click',()=>{if(!imported)return;if(!store.replace(imported)){notice(store.message);return;}workbook=store.workbook;imported=undefined;notice(store.message);render();el('import-confirm').hidden=true;});
window.addEventListener('hashchange',()=>{render();const title=el('mission-title');title.tabIndex=-1;title.scrollIntoView({block:'start'});title.focus({preventScroll:true});});render();
