(()=>{const key='resistor.instructor.course.preparation.v1';let saved={};try{saved=JSON.parse(localStorage.getItem(key)||'{}');}catch{}
for(const box of document.querySelectorAll('[data-human-check]')){box.checked=saved[box.dataset.humanCheck]===true;box.addEventListener('change',()=>{saved[box.dataset.humanCheck]=box.checked;try{localStorage.setItem(key,JSON.stringify(saved));}catch{}});}
document.querySelector('[data-prompter]')?.addEventListener('click',()=>document.body.classList.toggle('prompter'));
document.querySelector('[data-print]')?.addEventListener('click',()=>window.print());
})();
