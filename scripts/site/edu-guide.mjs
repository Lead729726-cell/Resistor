export function readEduRoute(hash=''){
 const match=/^#design\/([1-7])$/.exec(hash);
 return match?{mode:'design',step:Number(match[1])}:{mode:'quiz',step:1};
}
export function eduRoute(mode,step=1){return mode==='design'?'#design/'+Math.min(7,Math.max(1,Number.isInteger(step)?step:1)):'#quiz';}
if(typeof document!=='undefined'){
 const root=document.querySelector('.edu-guide');
 if(root){
  let current=readEduRoute(location.hash);
  const render=()=>{
   current=readEduRoute(location.hash);
   for(const p of root.querySelectorAll('[data-edu-panel]'))p.hidden=p.dataset.eduPanel!==current.mode;
   for(const link of root.querySelectorAll('[data-edu-mode]')){if(link.dataset.eduMode===current.mode)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');}
   for(const p of root.querySelectorAll('[data-edu-step]'))p.hidden=Number(p.dataset.eduStep)!==current.step;
   for(const link of root.querySelectorAll('[data-edu-page]')){if(Number(link.dataset.eduPage)===current.step)link.setAttribute('aria-current','step');else link.removeAttribute('aria-current');}
   root.querySelector('[data-edu-prev]').disabled=current.step===1;root.querySelector('[data-edu-next]').disabled=current.step===7;
   root.querySelector('[data-edu-current]').textContent=current.step+' / 7';
   root.querySelector('[data-edu-position]').textContent=current.step+' / 7 · '+root.querySelector('[data-edu-page="'+current.step+'"] span').textContent;
   const area=root.querySelector('.edu-guide-page');area.scrollTop=0;
  };
  const move=(mode,step)=>{const hash=eduRoute(mode,step);if(location.hash!==hash)history.pushState(null,'',hash);render();};
  root.querySelector('[data-edu-prev]').addEventListener('click',()=>move('design',current.step-1));
  root.querySelector('[data-edu-next]').addEventListener('click',()=>move('design',current.step+1));
  root.addEventListener('click',e=>{const a=e.target.closest?.('a[data-edu-mode],a[data-edu-page]');if(!a||e.ctrlKey||e.metaKey||e.altKey||e.shiftKey)return;e.preventDefault();const next=readEduRoute(a.hash);move(next.mode,next.step);});
  window.addEventListener('popstate',render);window.addEventListener('hashchange',render);render();
 }
}
