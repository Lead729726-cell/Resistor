const root=document.querySelector('[data-products]');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
try{
 const response=await fetch('/api/shop?action=catalog',{cache:'no-store'});if(!response.ok)throw Error();const data=await response.json();if(!data.ok)throw Error();
 root.innerHTML=data.result.products.map(p=>`<article class="store-product"><p class="eyebrow">EDU ONLY · 기기 ${p.device_limit}대</p><h3>${esc(p.name)}</h3><p class="price">${p.price_krw===null?'가격 준비 중':new Intl.NumberFormat('ko-KR').format(p.price_krw)+'원'}<small>${p.purchasable?'부가세 포함':p.price_krw!==null?'예정 가격 · 부가세 포함 · 현재 결제 불가':'판매 조건 확정 후 안내'}</small></p><ul>${p.includes.map(s=>'<li>'+esc(s)+'</li>').join('')}</ul><p class="muted">미포함: ${esc(p.excludes.join(' · '))}</p><a class="button" href="/checkout/?product=${encodeURIComponent(p.id)}">${p.purchasable?'구매하기':'구성·구매 준비 상태 보기'} →</a></article>`).join('');
 document.getElementById('store-status').textContent=data.result.products.some(p=>p.purchasable)?'구매할 상품을 선택하고 최종 거래조건을 확인하세요.':'자체 판매 준비 중 · 현재 결제·예약금·이메일을 받지 않습니다. 아래 워크북은 지금 무료로 체험할 수 있습니다.';
}catch{document.getElementById('store-status').textContent='상품 서버 연결을 확인하지 못했습니다. 결제를 받지 않습니다. 잠시 후 다시 시도하세요.';}
