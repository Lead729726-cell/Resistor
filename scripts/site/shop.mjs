import {purchaseAction} from './sales-policy.mjs';
const root=document.querySelector('[data-products]');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
try{
 const response=await fetch('/api/shop?action=catalog',{cache:'no-store'});if(!response.ok)throw Error();const data=await response.json();if(!data.ok)throw Error();
 root.innerHTML=data.result.products.map(p=>{const a=purchaseAction(data.result,p);return `<article class="store-product"><p class="eyebrow">EDU ONLY · 기기 ${p.device_limit}대</p><h3>${esc(p.name)}</h3><p class="price">${p.price_krw===null?'판매 보류':new Intl.NumberFormat('ko-KR').format(p.price_krw)+'원'}<small>${esc(a.price_label)}</small></p><ul>${p.includes.map(s=>'<li>'+esc(s)+'</li>').join('')}</ul><p class="muted">${esc(a.notice)}</p><p class="muted">미포함: ${esc(p.excludes.join(' · '))}</p><a class="button" href="${esc(a.url)}">${esc(a.label)} →</a></article>`;}).join('');
 document.getElementById('store-status').textContent=data.result.primary_sales_channel==='inflearn'?'인프런 우선 판매 · 자체 결제는 보류했습니다. 무료 실험 워크북은 지금 이용할 수 있습니다.':data.result.products.some(p=>p.purchasable)?'구매할 상품을 선택하고 최종 거래조건을 확인하세요.':'현재 결제·예약금·이메일을 받지 않습니다. 무료 워크북을 체험할 수 있습니다.';
}catch{document.getElementById('store-status').textContent='상품 서버 연결을 확인하지 못했습니다. 결제를 받지 않습니다. 잠시 후 다시 시도하세요.';}
