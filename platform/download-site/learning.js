(()=>{
 const key='resistor.learning.completed.v1';let completed=[];
 try{const value=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(value))completed=value.filter(v=>typeof v==='string'&&/^[a-z0-9-]+$/.test(v));}catch{}
 const render=()=>{for(const el of document.querySelectorAll('[data-progress-id]')){const yes=completed.includes(el.dataset.progressId);el.textContent=yes?'학습 체크':'미체크';el.dataset.complete=String(yes);}const main=document.querySelector('[data-lesson]'),button=document.querySelector('[data-learn-complete]');if(main&&button){const yes=completed.includes(main.dataset.lesson);button.setAttribute('aria-pressed',String(yes));button.textContent=yes?'학습 체크 해제':'읽음·실습 완료 표시';}};
 const save=()=>{try{localStorage.setItem(key,JSON.stringify(completed));}catch{}render();};render();
 document.querySelector('[data-learn-complete]')?.addEventListener('click',()=>{const id=document.querySelector('[data-lesson]').dataset.lesson;completed=completed.includes(id)?completed.filter(v=>v!==id):[...completed,id];save();});
 document.querySelector('[data-clear-progress]')?.addEventListener('click',()=>{completed=[];save();});
 document.querySelector('[data-print]')?.addEventListener('click',()=>{for(const d of document.querySelectorAll('details.record'))d.open=true;window.print();});
 const form=document.querySelector('.lesson-filters');if(!form)return;
 const params=new URLSearchParams(location.search);for(const name of ['q','group','kind'])if(params.has(name))form.elements[name].value=params.get(name);
 const filter=()=>{const q=form.elements.q.value.trim().normalize('NFKC').toLowerCase(),terms=q.split(/\s+/).filter(Boolean),group=form.elements.group.value,kind=form.elements.kind.value;let count=0;for(const row of document.querySelectorAll('[data-entry]')){const visible=(!group||row.dataset.group===group)&&(!kind||row.dataset.kind===kind)&&terms.every(t=>row.dataset.search.includes(t));row.hidden=!visible;if(visible)count++;}document.querySelector('[data-filter-count]').textContent=count+'개 실습';document.querySelector('[data-empty]').hidden=count!==0;const url=new URL(location.href);for(const [name,value]of [['q',q],['group',group],['kind',kind]]){if(value)url.searchParams.set(name,value);else url.searchParams.delete(name);}history.replaceState(null,'',url);};
 form.addEventListener('submit',e=>{e.preventDefault();filter();});form.addEventListener('input',filter);form.addEventListener('change',filter);form.addEventListener('reset',()=>requestAnimationFrame(filter));
 addEventListener('keydown',e=>{if(e.key==='/'&&!e.ctrlKey&&!e.metaKey&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){e.preventDefault();form.elements.q.focus();}});filter();
})();
