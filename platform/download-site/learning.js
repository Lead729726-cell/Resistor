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
 const size=24,rows=[...document.querySelectorAll('[data-entry]')];
 const requested=Number(params.get('page')||1);let page=Number.isSafeInteger(requested)&&requested>0?requested:1;
 const filter=(reset=false)=>{
  if(reset)page=1;
  const q=form.elements.q.value.trim().normalize('NFKC').toLowerCase(),terms=q.split(/\s+/).filter(Boolean),group=form.elements.group.value,kind=form.elements.kind.value;
  const matches=rows.filter(row=>(!group||row.dataset.group===group)&&(!kind||row.dataset.kind===kind)&&terms.every(t=>row.dataset.search.includes(t)));
  const count=matches.length,pages=Math.max(1,Math.ceil(count/size));page=Math.min(page,pages);
  const visible=new Set(matches.slice((page-1)*size,page*size));for(const row of rows)row.hidden=!visible.has(row);
  document.querySelector('[data-filter-count]').textContent=count+'개 실습';document.querySelector('[data-empty]').hidden=count!==0;
  document.querySelector('[data-page-range]').textContent=count?`${(page-1)*size+1}–${Math.min(page*size,count)} / ${count} · ${page}/${pages} 페이지`:'0개 실습';
  document.querySelector('[data-lesson-prev]').disabled=page===1||count===0;document.querySelector('[data-lesson-next]').disabled=page===pages||count===0;
  const url=new URL(location.href);for(const [name,value]of [['q',q],['group',group],['kind',kind],['page',page>1?String(page):'']]){if(value)url.searchParams.set(name,value);else url.searchParams.delete(name);}history.replaceState(null,'',url);
 };
 const turn=delta=>{page+=delta;filter();document.getElementById('catalog-heading').scrollIntoView({block:'start'});};
 document.querySelector('[data-lesson-prev]').addEventListener('click',()=>turn(-1));document.querySelector('[data-lesson-next]').addEventListener('click',()=>turn(1));
 form.addEventListener('submit',e=>{e.preventDefault();filter(true);});form.addEventListener('input',()=>filter(true));form.addEventListener('change',()=>filter(true));form.addEventListener('reset',()=>requestAnimationFrame(()=>filter(true)));
 addEventListener('keydown',e=>{if(e.key==='/'&&!e.ctrlKey&&!e.metaKey&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){e.preventDefault();form.elements.q.focus();}});filter();
})();
