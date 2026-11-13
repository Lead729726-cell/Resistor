import {getCalculator, calculateSafe} from '../../packages/calculators/src/index';

// The homepage uses the same deterministic calculator as Edu. No new model or waveform.
const slider = document.querySelector<HTMLInputElement>('[data-divider-r2]');
if (slider) {
  const calculator = getCalculator('voltage-divider')!;
  const show = (selector: string, value: string) => {
    document.querySelectorAll(selector).forEach(element => {element.textContent = value;});
  };
  const update = () => {
    const r2 = Number(slider.value) * 1000;
    const {result, error} = calculateSafe(calculator, {vin:1.8, r1:10000, r2});
    if (!result || error) {show('[data-divider-explanation]', '입력값을 확인해 주세요');return;}
    show('[data-divider-r2-label]', `${r2 / 1000} kΩ`);
    show('[data-divider-voltage]', Number(result.primaryValue).toFixed(2));
    const current = result.secondary?.find(item => item.unit === 'A');
    show('[data-divider-current]', `${(Number(current?.value) * 1e6).toFixed(1)} µA`);
    slider.setAttribute('aria-valuetext', `${r2 / 1000}킬로옴`);
    show('[data-divider-explanation]', r2 === 10000
      ? '저항 두 개가 같으면, 출력은 입력 전압의 절반이에요'
      : r2 > 10000 ? 'R2가 커지면 출력 전압은 올라가고, 전체 전류는 줄어요' : 'R2가 작아지면 출력 전압은 내려가고, 전체 전류는 늘어요');
  };
  slider.addEventListener('input', update);
  document.querySelector('[data-divider-reset]')?.addEventListener('click', () => {slider.value='10';update();});
  update();
}

const more = document.querySelector<HTMLDetailsElement>('.academy-more');
if (more) {
  document.addEventListener('click', event => {if (!more.contains(event.target as Node)) more.open=false;});
  document.addEventListener('keydown', event => {
    if (event.key==='Escape' && more.open) {
      // Close this disclosure before the shared mobile menu handles Escape.
      // Capture makes this independent of deferred/module script load order.
      event.preventDefault();
      event.stopImmediatePropagation();
      more.open=false;
      more.querySelector('summary')?.focus();
    }
  }, {capture:true});
  more.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {more.open=false;}));
}

// Mark the current destination; secondary reference links stay in disclosures.
const route = location.pathname.replace(/\/$/, '') || '/';
document.querySelectorAll<HTMLAnchorElement>('#wb-navigation > a').forEach(link => {
  const target = new URL(link.href).pathname.replace(/\/$/, '') || '/';
  if (target===route) link.setAttribute('aria-current','page');
});
