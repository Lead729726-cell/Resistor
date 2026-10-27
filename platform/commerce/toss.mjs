import {commerceError} from './catalog.mjs';
// API individual-integration keys. No demo merchant or public sample key fallback.
export function createTossProvider({secretKey,clientKey,fetchImpl=fetch}={}){
 if(!secretKey&&!clientKey)return undefined;
 const mode=secretKey?.startsWith('test_sk_')?'test':secretKey?.startsWith('live_sk_')?'live':null;
 if(!mode||!clientKey?.startsWith(mode+'_ck_'))throw Error('Matching Toss individual-integration keys required');
 async function request(route,body,idempotency){
  const response=await fetchImpl('https://api.tosspayments.com/v1/payments'+route,{method:body?'POST':'GET',headers:{Authorization:'Basic '+Buffer.from(secretKey+':').toString('base64'),'Content-Type':'application/json',...(idempotency?{'Idempotency-Key':idempotency}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw commerceError('PAYMENT_UNCERTAIN','결제사 상태를 확인하지 못했습니다. 재결제하지 말고 주문 상태를 조회하세요.',502);
  return response.json();
 }
 return {mode,clientKey,confirm:p=>request('/confirm',p,'confirm-'+p.orderId),lookup:id=>request('/orders/'+encodeURIComponent(id))};
}
