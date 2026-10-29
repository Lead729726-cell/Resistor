import {calculators} from '../../packages/calculators/src/index';
import {courseMissions,courseRevision,newCourseWorkbook,missionDraft,calculateMission,readCourseWorkbook,type WorkbookRun} from '../../packages/education/src/course-workbook';
import {CourseWorkbookStore,workbookStorageKey} from '../../packages/education/src/course-workbook-store';
const el=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const esc=(s:unknown)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const store=new CourseWorkbookStore(()=>localStorage,()=>crypto.randomUUID());
let workbook=store.workbook;
const notice=(s:string)=>{el('save-status').textContent=s;};
notice(store.message);
function save(){store.save();notice(store.message);}
el('retry-save').addEventListener('click',save);
window.addEventListener('storage',event=>{if(event.key===workbookStorageKey){store.inspectExternalChange();notice(store.message);}});
const current=()=>courseMissions.find(m=>m.id===location.hash.slice(1))??courseMissions[0];
const draft=()=>{const m=current();return workbook.drafts[m.id]??=missionDraft(m);};
function result(run:WorkbookRun){return `<article class="result-card"><p class="eyebrow">revision ${run.revision} · ${esc(run.engine.status)}</p>${run.result?`<strong class="result-value">${esc(run.result.primaryValue)} <small>${esc(run.result.primaryUnit??'')}</small></strong><p>${esc(run.result.primaryLabel)}</p>${run.result.secondary?.map(s=>`<p>${esc(s.label)} <b>${esc(s.value)} ${esc(s.unit??'')}</b></p>`).join('')??''}`:'<p>웹에서 실행할 수 없습니다. Edu 앱에서 엔진·모델을 연결하세요.</p>'}<p class="muted">${esc(run.engine.scope)}</p><details><summary>이 실행의 입력 조건</summary><pre>${esc(JSON.stringify(run.inputs,null,2))}</pre></details></article>`;}
function renderResults(){const d=draft(),m=current(),first=d.runs[0],last=d.runs.at(-1);el('comparison').innerHTML=first?`<p>${last!.revision===d.revision?'현재 revision의 기록입니다.':'입력이 변경되었습니다. 아래는 이전 revision의 기록입니다. 다시 계산하세요.'}</p><div class="two-columns">${result(first)}${d.runs.length>1?result(last!):'<p class="muted">입력 하나를 바꾸고 다시 계산하면 변경 전후를 비교할 수 있습니다.</p>'}</div>`:'<p class="muted">먼저 결과를 예측한 뒤 계산 기록을 남겨보세요. 저장된 샘플 결과는 없습니다.</p>';
 el('progress').textContent=`${courseMissions.filter(m=>workbook.drafts[m.id]?.complete).length} / 8개 · 학생이 표시한 완료 상태`;el('project-meta').textContent=`Resistor Edu · ${workbook.project_id} · ${courseRevision} · revision ${d.revision}`;
 el('formula').textContent=calculators.find(c=>c.id===m.calculator)?.formula??'실제 엔진·공정 모델이 있어야 전기적 결과를 알 수 있습니다.';
}
function render(){const m=current(),d=draft(),index=courseMissions.indexOf(m);
 el('mission-nav').innerHTML=courseMissions.map(item=>`<a href="#${item.id}" ${item.id===m.id?'aria-current="step"':''}>${esc(item.title)}</a>`).join('');
 el('mission-title').textContent=m.title;el('goal').textContent=m.goal;el('question').textContent=m.question;el('diagnosis').textContent=m.diagnosis;
 el('input-fields').innerHTML=m.inputs.map(i=>`<label>${esc(i.label)} <span>${esc(i.unit)}</span><input type="number" step="any" required data-input="${i.id}" value="${esc(d.inputs[i.id])}"></label>`).join('');
 el<HTMLTextAreaElement>('prediction').value=d.prediction;el<HTMLTextAreaElement>('explanation').value=d.explanation;el<HTMLInputElement>('complete').checked=d.complete;
 el<HTMLButtonElement>('calculate').textContent=m.calculator?'조건 계산·기록':'웹 실행 불가 사유 기록';
 el<HTMLAnchorElement>('app-guide').href=m.app;
 el<HTMLButtonElement>('previous').disabled=index===0;el<HTMLButtonElement>('next').disabled=index===courseMissions.length-1;
 const div=m.calculator==='voltage-divider';el('circuit-diagram').hidden=!div;
 renderResults();
}
el('input-fields').addEventListener('input',event=>{const target=event.target as HTMLInputElement;if(!target.dataset.input)return;const d=draft();d.inputs[target.dataset.input]=target.value;d.revision++;save();renderResults();});
for(const field of ['prediction','explanation'])el(field).addEventListener('input',()=>{draft()[field as 'prediction'|'explanation']=el<HTMLTextAreaElement>(field).value;save();});
el('complete').addEventListener('change',()=>{draft().complete=el<HTMLInputElement>('complete').checked;save();renderResults();});
el('calculate').addEventListener('click',()=>{try{const d=draft();d.runs.push(calculateMission(current(),d));save();renderResults();el('calculation-error').textContent='';}catch(e){el('calculation-error').textContent=(e as Error).message;}});
for(const [name,direction]of [['previous',-1],['next',1]] as const)el(name).addEventListener('click',()=>{const i=courseMissions.indexOf(current());location.hash=courseMissions[i+direction].id;});
function download(text:string,filename:string){const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
el('export-record').addEventListener('click',()=>download(JSON.stringify(workbook,null,2),'Resistor-Edu-'+workbook.project_id+'.json'));
el('print-record').addEventListener('click',()=>{el('print-report').innerHTML=`<h1>Resistor Edu 실험 보고서</h1><p>${esc(workbook.project_id)} · ${esc(courseRevision)}</p>`+courseMissions.map(m=>{const d=workbook.drafts[m.id];return `<section><h2>${esc(m.title)}</h2><p>학생 예측: ${esc(d?.prediction??'미작성')}</p><p>학생 설명: ${esc(d?.explanation??'미작성')}</p><p>학생 완료 표시: ${d?.complete?'완료':'미완료'} · 엔진 합격 판정 아님</p>${d?.runs.map(result).join('')??'<p>실행 기록 없음</p>'}</section>`;}).join('');window.print();});
let imported:ReturnType<typeof readCourseWorkbook>|undefined;
let importSequence=0;
el('import-record').addEventListener('change',async event=>{const sequence=++importSequence;imported=undefined;el('import-confirm').hidden=true;const f=(event.target as HTMLInputElement).files?.[0];if(!f)return;try{if(f.size>2e6)throw Error('2 MB 이하 기록을 선택하세요.');const candidate=readCourseWorkbook(await f.text());if(sequence!==importSequence)return;imported=candidate;el('import-confirm').hidden=false;el('import-status').textContent='호환 기록입니다. 원본·현재 작성 내용이 백업된 경우에만 선택한 기록으로 전환합니다.';}catch(e){if(sequence===importSequence)el('import-status').textContent=(e as Error).message;}});
el('confirm-import').addEventListener('click',()=>{if(!imported)return;if(!store.replace(imported)){notice(store.message);return;}workbook=store.workbook;imported=undefined;notice(store.message);render();el('import-confirm').hidden=true;});
window.addEventListener('hashchange',()=>{render();const title=el('mission-title');title.tabIndex=-1;title.scrollIntoView({block:'start'});title.focus({preventScroll:true});});render();
