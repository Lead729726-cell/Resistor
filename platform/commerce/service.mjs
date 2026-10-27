import {DatabaseSync} from 'node:sqlite';
import {randomBytes,createHash,createCipheriv,createDecipheriv} from 'node:crypto';
import {publicCatalog,storeCatalog,commerceError} from './catalog.mjs';
const fail=(code,message,status)=>{throw commerceError(code,message,status);};
const digest=value=>createHash('sha256').update(value).digest('hex');
const sessionValid=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{43}$/.test(s);
const orderValid=id=>typeof id==='string'&&/^RE_[a-f0-9]{40}$/.test(id);
export function createCommerceService({filename,masterKey,licenses,provider,catalog=storeCatalog,readiness={},allowTestFulfillment=false,now=()=>Date.now()}={}){
 if(!Buffer.isBuffer(masterKey)||masterKey.length!==32||!licenses)throw Error('Commerce requires durable storage, encryption and licensing');
 const db=new DatabaseSync(filename);db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS shop_orders(id TEXT PRIMARY KEY,product_id TEXT NOT NULL,revision TEXT NOT NULL,amount INTEGER NOT NULL,session_hash TEXT NOT NULL,state TEXT NOT NULL,payload TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS shop_events(id INTEGER PRIMARY KEY,order_id TEXT NOT NULL,state TEXT NOT NULL,created_at INTEGER NOT NULL);`);
 const seal=(id,value)=>{const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',masterKey,iv);c.setAAD(Buffer.from(id));const b=Buffer.concat([c.update(JSON.stringify(value),'utf8'),c.final()]);return [iv,c.getAuthTag(),b].map(v=>v.toString('base64url')).join('.');};
 const open=row=>{const [iv,tag,b]=row.payload.split('.').map(v=>Buffer.from(v,'base64url')),c=createDecipheriv('aes-256-gcm',masterKey,iv);c.setAAD(Buffer.from(row.id));c.setAuthTag(tag);return JSON.parse(Buffer.concat([c.update(b),c.final()]).toString('utf8'));};
 const get=id=>db.prepare('SELECT * FROM shop_orders WHERE id=?').get(id);
 const update=(row,state,payload=open(row))=>{db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE shop_orders SET state=?,payload=?,updated_at=? WHERE id=?').run(state,seal(row.id,payload),now(),row.id);db.prepare('INSERT INTO shop_events(order_id,state,created_at) VALUES(?,?,?)').run(row.id,state,now());db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return get(row.id);};
 const own=(id,session)=>{if(!orderValid(id)||!sessionValid(session))fail('ORDER_ACCESS','이 브라우저에서 만든 주문만 조회할 수 있습니다.',403);const row=get(id);if(!row||row.session_hash!==digest(session))fail('ORDER_ACCESS','주문 인증 정보가 일치하지 않습니다.',403);return row;};
 const products=()=>publicCatalog(catalog,{...readiness,providerReady:!!provider&&(provider.mode==='live'||allowTestFulfillment)});
 const view=row=>({schema_version:1,edition:'edu',order_id:row.id,product_id:row.product_id,catalog_revision:row.revision,amount:row.amount,currency:'KRW',state:row.state,created_at:row.created_at,updated_at:row.updated_at,payment_mode:provider?.mode||'unavailable',...(row.state==='fulfilled'?{serial:licenses.operatorDelivery(open(row).delivery_id).serial,device_limit:2,download_url:'https://resistor.kr/download/edu/'}:{}),...(row.state==='paid_pending'?{message:'결제 확인 완료 · 사용권 전달 준비 중입니다. 재결제하지 말고 이 주문 번호로 문의하세요.'}:{}),...(row.state==='unknown'||row.state==='confirming'?{message:'승인 여부 확인 중입니다. 새 결제를 만들지 말고 상태를 다시 조회하세요.'}:{})});
 function create({product_id,email,terms_version,consent},session){
  const p=products().products.find(p=>p.id===product_id);
  if(!p?.purchasable)fail('SHOP_UNAVAILABLE','아직 판매 준비 중입니다. 결제를 받지 않습니다.',503);
  if(typeof email!=='string'||email.length>254||!/^\S+@\S+\.\S+$/.test(email)||/[\r\n\x00]/.test(email))fail('EMAIL','이메일을 확인하세요.');
  if(consent!==true||terms_version!==catalog.terms_version)fail('CONSENT','현재 거래조건과 개인정보 안내를 확인하세요.');
  const secret=sessionValid(session)?session:randomBytes(32).toString('base64url'),id='RE_'+randomBytes(20).toString('hex');
  const payload={email,terms_version,consent_at:now(),product:p,payment_key:null,receipt:null,delivery_id:null};
  db.prepare('INSERT INTO shop_orders VALUES(?,?,?,?,?,?,?,?,?)').run(id,p.id,catalog.revision,p.price_krw,digest(secret),'created',seal(id,payload),now(),now());
  return {session:secret,order:{...view(get(id)),client_key:provider.clientKey,order_name:p.name}};
 }
 const locks=new Set();
 async function locked(id,fn){if(locks.has(id))fail('ORDER_BUSY','주문 처리 중입니다. 잠시 후 상태를 조회하세요.',409);locks.add(id);try{return await fn();}finally{locks.delete(id);}}
 async function fulfill(row){
  if(row.state==='refunded'||row.state==='review_required')return row;
  if(provider?.mode!=='live'&&!allowTestFulfillment)return update(row,'paid_pending');
  const p=open(row);
  // The paid row is durable before the shared license engine is called. An
  // interrupted delivery retries the same provider/order/receipt identity.
  try{
   const issued=licenses.issue({provider:'resistor_web',purchase_ref:row.id,product_id:row.product_id,edition:'edu',device_limit:2,email:p.email,verified:true,evidence_sha256:digest(JSON.stringify(p.receipt))});
   return update(row,'fulfilled',{...p,delivery_id:issued.delivery_id});
  }catch{return update(row,'paid_pending',p);}
 }
 function checkReceipt(row,receipt,expectedKey){
  if(receipt?.orderId!==row.id||receipt.totalAmount!==row.amount||receipt.currency!=='KRW'||typeof receipt.paymentKey!=='string'||!receipt.paymentKey.length||receipt.paymentKey.length>200||(expectedKey&&receipt.paymentKey!==expectedKey))fail('RECEIPT_MISMATCH','결제사 응답이 저장된 주문과 다릅니다. 운영자 확인이 필요합니다.',409);
  // Store only the minimum stable receipt, never raw card/bank/customer data.
  return {orderId:receipt.orderId,paymentKey:receipt.paymentKey,totalAmount:receipt.totalAmount,currency:receipt.currency,status:receipt.status,balanceAmount:receipt.balanceAmount};
 }
 async function apply(row,raw,expectedKey){
  let r;try{r=checkReceipt(row,raw,expectedKey);}catch(e){update(row,'review_required');throw e;}
  const p=open(row);
  if(r.status==='CANCELED'&&r.balanceAmount===0){
   // Refund an existing grant; a never-fulfilled canceled order has no grant.
   try{licenses.refund({provider:'resistor_web',purchase_ref:row.id,reason:'provider-confirmed-full-cancellation'});}catch(e){if(e.code!=='ORDER_NOT_FOUND')throw e;}
   return update(row,'refunded',{...p,receipt:r});
  }
  if(r.status==='PARTIAL_CANCELED')return update(row,'review_required',{...p,receipt:r});
  if(row.state==='refunded')return row; // A late DONE event never re-grants.
  if(row.state==='review_required')return row; // Operator review cannot be cleared by a retry.
  if(r.status!=='DONE')return update(row,['ABORTED','EXPIRED'].includes(r.status)?'failed':'unknown',{...p,receipt:r});
  if(r.balanceAmount!==row.amount)return update(row,'review_required',{...p,receipt:r});
  if(row.state==='fulfilled')return row;
  row=update(row,'paid_pending',{...p,receipt:r,payment_key:r.paymentKey});
  return fulfill(row);
 }
 async function confirm({order_id,payment_key,amount},session){
  return locked(order_id,async()=>{
   let row=own(order_id,session);
   if(amount!==row.amount||typeof payment_key!=='string'||payment_key.length<1||payment_key.length>200||/[\r\n\x00]/.test(payment_key))fail('ORDER_AMOUNT','금액 또는 결제 정보가 일치하지 않습니다.');
   if(!provider)fail('SHOP_UNAVAILABLE','결제사가 연결되지 않았습니다.',503);
   if(row.state==='fulfilled'||row.state==='refunded'||row.state==='review_required')return view(row);
   if(row.state==='paid_pending')return view(await lookup(row));
   if(row.state!=='created')return view(await lookup(row));
   row=update(row,'confirming',{...open(row),payment_key});
   try{return view(await apply(row,await provider.confirm({orderId:row.id,paymentKey:payment_key,amount:row.amount}),payment_key));}
   catch(e){if(get(row.id).state==='confirming')update(get(row.id),'unknown');throw e.code?e:commerceError('PAYMENT_UNCERTAIN','결제 승인 여부를 확인하지 못했습니다. 상태를 다시 조회하세요.',502);}
  });
 }
 async function lookup(row){
  if(!provider)fail('SHOP_UNAVAILABLE','결제사가 연결되지 않았습니다.',503);
  if(row.state==='created'||row.state==='refunded')return row;
  const r=await provider.lookup(row.id);return apply(row,r,open(row).payment_key);
 }
 async function reconcile({order_id},session){own(order_id,session);return locked(order_id,async()=>view(await lookup(own(order_id,session))));}
 // Webhooks are only hints. Always fetch the current receipt with the secret
 // key; unknown order IDs cannot trigger arbitrary provider lookups.
 async function webhook({order_id}){if(!orderValid(order_id)||!get(order_id))return {accepted:true};return locked(order_id,async()=>{await lookup(get(order_id));return {accepted:true};});}
 return {catalog:products,create,confirm,reconcile,webhook,status:({order_id},session)=>view(own(order_id,session)),close:()=>db.close()};
}
