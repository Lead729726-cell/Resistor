import {readFileSync} from 'node:fs';
export const storeCatalog=JSON.parse(readFileSync(new URL('./catalog.json',import.meta.url),'utf8'));
export function publicCatalog(catalog=storeCatalog,{providerReady=false,fulfillmentReady=false,termsApproved=false}={}){
 const products=catalog.products.map(p=>{
  const reasons=[...p.blockers];
  if(!providerReady)reasons.push('결제사 연결');
  if(!fulfillmentReady)reasons.push('상시 주문·인증 서버와 전달 경로 확인');
  if(!termsApproved||catalog.terms_version.startsWith('draft-'))reasons.push('거래조건·개인정보 안내 확정');
  const purchasable=p.status==='ready'&&p.price_approved===true&&Number.isSafeInteger(p.price_krw)&&p.price_krw>0&&p.delivery_ready===true&&reasons.length===0;
  return {...p,purchasable,blockers:[...new Set(reasons)]};
 });return {...catalog,checkout_enabled:products.some(p=>p.purchasable),products};
}
export function commerceError(code,message,status=400){return Object.assign(new Error(message),{code,status});}
