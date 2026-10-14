import {getCalculator,calculateSafe,defaultInputs,displayNumber} from '../../packages/calculators/src/index';
const root=document.querySelector<HTMLElement>('[data-calculator]');
if(root){
 const calculator=getCalculator(root.dataset.calculator!);
 if(calculator){
  const form=root.querySelector<HTMLFormElement>('form')!,error=root.querySelector<HTMLElement>('.calc-error')!,result=root.querySelector<HTMLElement>('.calc-result')!;
  const show=()=>{const inputs=Object.fromEntries(calculator.inputs.map(i=>{const input=form.elements.namedItem(i.id) as HTMLInputElement|HTMLSelectElement;return[i.id,i.kind==='select'?input.value:input.value.trim()===''?NaN:Number(input.value)];}));const value=calculateSafe(calculator,inputs);error.hidden=!value.error;error.textContent=value.error||'';result.replaceChildren();if(!value.result)return;const r=value.result,label=document.createElement('p'),primary=document.createElement('strong'),explain=document.createElement('p');label.textContent=r.primaryLabel;primary.textContent=displayNumber(r.primaryValue)+' '+(r.primaryUnit||'');explain.textContent=r.explanation;result.append(label,primary);for(const s of r.secondary||[]){const p=document.createElement('p');p.textContent=s.label+': '+displayNumber(s.value)+' '+(s.unit||'');result.append(p);}result.append(explain);};
  form.addEventListener('submit',e=>{e.preventDefault();show();});
  root.querySelector('[data-calc-example]')?.addEventListener('click',()=>{const inputs={...defaultInputs(calculator),...calculator.examples[0].inputs};for(const [key,value]of Object.entries(inputs))(form.elements.namedItem(key)as HTMLInputElement).value=String(value);show();});
  show();
 }
}
