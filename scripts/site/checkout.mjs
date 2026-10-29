import {purchaseAction,purchaseChannel} from './sales-policy.mjs';
const $=id=>document.getElementById(id),params=new URLSearchParams(location.search),status=s=>$('checkout-status').textContent=s;
async function api(action,body){const r=await fetch('/api/shop?action='+action,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store'}),data=await r.json();if(!r.ok||!data.ok)throw Error(data.error?.message||'연결을 확인하지 못했습니다.');return data.result;}
let orderId=params.get('orderId'),catalog,product;
const ready=result=>{orderId=result.order_id;status(`주문 ${result.order_id} · ${result.state} · ${result.payment_mode==='test'?'테스트 결제 · 실제 과금 아님':'결제 상태'}`);$('order-info').textContent=result.message||'서버에서 확인한 주문 상태입니다.';$('reconcile').hidden=false;if(result.state==='fulfilled'){$('serial').textContent=result.serial;$('fulfillment').hidden=false;$('order-info').textContent='Edu 전용 · 개인 기기 2대. 시리얼은 공개하지 마세요. 강의 수강 경로는 구매 시 안내된 별도 전달 조건을 확인하세요.';}};
try{
 if(params.has('paymentKey')&&orderId){
  const paymentKey=params.get('paymentKey'),amount=Number(params.get('amount'));
  history.replaceState(null,'','/checkout/?orderId='+encodeURIComponent(orderId));
  status('결제 인증을 확인하고 있습니다. 이 화면 이동만으로 결제 완료가 되지는 않습니다.');
  ready(await api('confirm',{order_id:orderId,payment_key:paymentKey,amount}));
 }else if(orderId){ready(await api('status',{order_id:orderId}));}
 else{
  catalog=await api('catalog');product=catalog.products.find(p=>p.id===params.get('product'));
  if(!product)throw Error('상품을 선택해 주세요.');
  const a=purchaseAction(catalog,product),channel=purchaseChannel(product);
  $('checkout-title').textContent=product.name;$('product-price').textContent=product.price_krw===null?'자체 판매 보류':new Intl.NumberFormat('ko-KR').format(product.price_krw)+'원 · '+a.price_label;
  if(channel==='inflearn'||channel==='deferred'){$('closed-explanation').textContent=a.notice;const link=$('sales-channel-action');link.href=a.url;link.textContent=a.label+' →';link.hidden=false;}
  const blockers=$('blockers');for(const b of product.blockers){const li=document.createElement('li');li.textContent=b;blockers.append(li);}
  if(product.purchasable){status('구매 정보를 확인하고 결제하세요.');$('purchase-form').hidden=false;$('closed-notice').hidden=true;}
  else status(channel==='inflearn'?'인프런 우선 판매 · 자체 결제 보류':channel==='deferred'?'Edu 단품 자체 판매 보류':'판매 준비 중 · 결제 불가');
 }
}catch(e){status(e.message);if(orderId)$('reconcile').hidden=false;}
$('reconcile').addEventListener('click',async()=>{try{ready(await api('reconcile',{order_id:orderId}));}catch(e){status(e.message);}});
$('purchase-form').addEventListener('submit',async event=>{
 event.preventDefault();const button=$('pay');button.disabled=true;
 try{
  if(!product?.purchasable||!$('consent').checked)throw Error('현재 거래조건 확인이 필요합니다.');
  const order=await api('create',{product_id:product.id,email:$('buyer-email').value,consent:true,terms_version:catalog.terms_version});orderId=order.order_id;
  if(!window.TossPayments){await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://js.tosspayments.com/v2/standard';script.onload=resolve;script.onerror=reject;document.head.append(script);});}
  const payment=window.TossPayments(order.client_key).payment({customerKey:window.TossPayments.ANONYMOUS});
  status(order.payment_mode==='test'?'테스트 결제창 · 실제 과금이 없습니다.':'결제창을 엽니다.');
  await payment.requestPayment({method:'CARD',amount:{currency:'KRW',value:order.amount},orderId:order.order_id,orderName:order.order_name,successUrl:location.origin+'/checkout/',failUrl:location.origin+'/checkout/?orderId='+encodeURIComponent(order.order_id)});
 }catch(e){status(e instanceof Error?e.message:'결제창을 열지 못했습니다. 주문이 있다면 상태를 조회하세요.');if(orderId){$('reconcile').hidden=false;history.replaceState(null,'','/checkout/?orderId='+encodeURIComponent(orderId));}}finally{button.disabled=false;}
});
