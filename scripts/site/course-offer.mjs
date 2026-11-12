import {purchaseAction} from '/shop/sales-policy.mjs';
const status=document.getElementById('store-status');
try {
  const response=await fetch('/api/shop?action=catalog',{cache:'no-store'});
  if(!response.ok)throw Error('catalog unavailable');
  const data=await response.json();
  const catalog=data.ok&&data.result;
  const product=catalog?.products?.find(item=>item.id==='resistor.edu.course-bundle');
  if(!product||product.edition!=='edu'||!Number.isSafeInteger(product.price_krw))throw Error('course unavailable');
  const action=purchaseAction(catalog,product);
  document.querySelectorAll('[data-course-price]').forEach(el=>{el.textContent=new Intl.NumberFormat('ko-KR').format(product.price_krw)+'원';});
  document.querySelectorAll('[data-course-action]').forEach(el=>{el.textContent=action.label;el.setAttribute('href',action.url);});
  status.textContent=action.url.startsWith('https://')?'수강 신청과 최종 판매 조건은 인프런에서 확인하세요':'강의 제작 중 · 공개 후 인프런에서 수강 신청을 안내합니다';
} catch {
  status.textContent='현재 판매 상태를 확인하지 못했습니다. 무료 실습은 이용할 수 있으며, 수강 신청은 판매 상태 확인 후 안내합니다.';
  // Fail closed: no stale purchase link when the catalog cannot be checked.
  document.querySelectorAll('[data-course-action]').forEach(el=>{el.textContent='강의 준비 안내';el.setAttribute('href','#inflearn');});
}
