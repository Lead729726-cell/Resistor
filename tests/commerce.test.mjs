import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {generateKeyPairSync,randomBytes} from 'node:crypto';
import {createLicenseService} from '../platform/licensing/service.mjs';
import {createCommerceService} from '../platform/commerce/service.mjs';
import {createCommerceHttpServer,shopCookie} from '../platform/commerce/http.mjs';
import {storeCatalog,publicCatalog} from '../platform/commerce/catalog.mjs';
import {createTossProvider} from '../platform/commerce/toss.mjs';
const catalog={...structuredClone(storeCatalog),direct_sales_enabled:true,terms_version:'fixture-terms-v1',products:storeCatalog.products.map(p=>({...p,purchase_channel:'direct',status:'ready',price_krw:110000,price_approved:true,delivery_ready:true,blockers:[]}))};
async function fixture(fn){
 const dir=await mkdtemp(path.join(os.tmpdir(),'resistor-shop-')),key=randomBytes(32),keys=generateKeyPairSync('ed25519'),licenses=createLicenseService({filename:path.join(dir,'license.sqlite'),masterKey:key,privateKey:keys.privateKey.export({type:'pkcs8',format:'pem'})});
 let calls=0,lookups=0,fail=false,receipt=null,held;
 const provider={mode:'test',clientKey:'test_ck_fixture',async confirm(p){calls++;if(held)await held;if(fail)throw Error('timeout');return receipt??{orderId:p.orderId,paymentKey:p.paymentKey,totalAmount:p.amount,balanceAmount:p.amount,currency:'KRW',status:'DONE'};},async lookup(id){lookups++;return receipt??{orderId:id,paymentKey:'fixture-payment',totalAmount:110000,balanceAmount:110000,currency:'KRW',status:'DONE'};}};
 const config={filename:path.join(dir,'commerce.sqlite'),masterKey:key,licenses,provider,catalog,allowTestFulfillment:true,readiness:{fulfillmentReady:true,termsApproved:true}};let service=createCommerceService(config);
 const create=(product_id='resistor.edu.standalone')=>service.create({product_id,email:'buyer@example.invalid',consent:true,terms_version:catalog.terms_version});
 try{await fn({get service(){return service;},licenses,dir,key,config,provider,create,setReceipt:v=>receipt=v,setFail:v=>fail=v,hold:v=>held=v,counts:()=>({calls,lookups}),reopen:()=>{service.close();service=createCommerceService(config);}});}finally{service.close();licenses.close();await rm(dir,{recursive:true,force:true});}
}
const confirm=(s,c,patch={})=>s.confirm({order_id:c.order.order_id,payment_key:'fixture-payment',amount:110000,...patch},c.session);
test('unconnected catalog and unrecorded course fail closed; price is not client controlled',()=>fixture(async f=>{
 assert.ok(publicCatalog().products.every(p=>!p.purchasable));assert.equal(publicCatalog().checkout_enabled,false);
 const closed=createCommerceService({...f.config,filename:':memory:',catalog:storeCatalog});try{assert.throws(()=>closed.create({product_id:'resistor.edu.course-bundle'}),{code:'SHOP_UNAVAILABLE'});}finally{closed.close();}
 const testKeysOnly=createCommerceService({...f.config,filename:':memory:',allowTestFulfillment:false});try{assert.equal(testKeysOnly.catalog().checkout_enabled,false);assert.throws(()=>testKeysOnly.create({product_id:'resistor.edu.standalone'}),{code:'SHOP_UNAVAILABLE'});}finally{testKeysOnly.close();}
 const c=f.create();await assert.rejects(()=>confirm(f.service,c,{amount:1}),{code:'ORDER_AMOUNT'});assert.deepEqual(f.counts(),{calls:0,lookups:0});
 assert.throws(()=>f.service.create({product_id:'resistor.indust.official'}),{code:'SHOP_UNAVAILABLE'});
 assert.throws(()=>f.service.create({product_id:'resistor.edu.standalone',email:'buyer@example.invalid',consent:'true',terms_version:catalog.terms_version}),{code:'CONSENT'});
}));
test('verified provider receipt creates one Edu-only grant; repeat and restart preserve identity',()=>fixture(async f=>{
 const c=f.create(),result=await confirm(f.service,c);assert.equal(result.state,'fulfilled');assert.match(result.serial,/^RS1-/);assert.equal(result.payment_mode,'test');
 const retry=await confirm(f.service,c);assert.equal(retry.serial,result.serial);f.reopen();assert.equal(f.service.status({order_id:result.order_id},c.session).serial,result.serial);assert.equal(f.counts().calls,1);
 const h='a'.repeat(64);assert.ok(f.licenses.activate({serial:result.serial,edition:'edu',device_hash:h}).lease);
 assert.throws(()=>f.licenses.activate({serial:result.serial,edition:'indust',device_hash:h}),{code:'LICENSE_EDITION'});
 for(const suffix of ['', '-wal']){const bytes=await readFile(path.join(f.dir,'commerce.sqlite'+suffix));assert.ok(!bytes.includes(Buffer.from('buyer@example.invalid')));assert.ok(!bytes.includes(Buffer.from('fixture-payment')));assert.ok(!bytes.includes(Buffer.from(result.serial)));}
}));
test('order ID and redirect fields never authorize another browser or a forged receipt',()=>fixture(async f=>{
 const c=f.create(),other=f.create();assert.throws(()=>f.service.status({order_id:c.order.order_id},other.session),{code:'ORDER_ACCESS'});await assert.rejects(()=>confirm(f.service,{...c,session:undefined}),{code:'ORDER_ACCESS'});
 f.setReceipt({orderId:c.order.order_id,paymentKey:'fixture-payment',totalAmount:1,balanceAmount:1,currency:'KRW',status:'DONE'});
 await assert.rejects(()=>confirm(f.service,c),{code:'RECEIPT_MISMATCH'});assert.equal(f.service.status({order_id:c.order.order_id},c.session).state,'review_required');assert.equal(f.licenses.status().order_source,'verified_operator_or_payment_receipt');
}));
test('uncertain approval is reconciled by GET after restart, never another confirm',()=>fixture(async f=>{
 const c=f.create();f.setFail(true);await assert.rejects(()=>confirm(f.service,c),{code:'PAYMENT_UNCERTAIN'});assert.equal(f.service.status({order_id:c.order.order_id},c.session).state,'unknown');f.reopen();
 const result=await confirm(f.service,c);assert.equal(result.state,'fulfilled');assert.deepEqual(f.counts(),{calls:1,lookups:1});
}));
test('simultaneous confirms cannot double issue or double charge',()=>fixture(async f=>{
 let release;f.hold(new Promise(r=>release=r));const c=f.create(),first=confirm(f.service,c);await assert.rejects(()=>confirm(f.service,c),{code:'ORDER_BUSY'});release();assert.equal((await first).state,'fulfilled');assert.equal(f.counts().calls,1);
}));
test('fulfillment outage keeps paid_pending and can recover using same order',()=>fixture(async f=>{
 const c=f.create(),original=f.licenses.issue;f.licenses.issue=()=>{throw Error('database busy');};assert.equal((await confirm(f.service,c)).state,'paid_pending');f.licenses.issue=original;
 assert.equal((await f.service.reconcile({order_id:c.order.order_id},c.session)).state,'fulfilled');assert.equal(f.counts().calls,1);
}));
test('webhooks query provider state, partial refunds require review, full refunds revoke only web grant',()=>fixture(async f=>{
 const c=f.create(),paid=await confirm(f.service,c),a=f.licenses.activate({serial:paid.serial,edition:'edu',device_hash:'a'.repeat(64)});
 await f.service.webhook({order_id:'RE_'+'a'.repeat(40),status:'CANCELED'});assert.equal(f.counts().lookups,0);
 await f.service.webhook({order_id:c.order.order_id,status:'CANCELED'});assert.equal(f.service.status({order_id:c.order.order_id},c.session).state,'fulfilled');
 const base={orderId:c.order.order_id,paymentKey:'fixture-payment',totalAmount:110000,currency:'KRW'};f.setReceipt({...base,status:'PARTIAL_CANCELED',balanceAmount:100000});await f.service.webhook({order_id:c.order.order_id});assert.equal(f.service.status({order_id:c.order.order_id},c.session).state,'review_required');
 f.setReceipt({...base,status:'DONE',balanceAmount:110000});await f.service.webhook({order_id:c.order.order_id});assert.equal(f.service.status({order_id:c.order.order_id},c.session).state,'review_required');
 f.setReceipt({...base,status:'CANCELED',balanceAmount:0});await f.service.webhook({order_id:c.order.order_id});assert.equal(f.service.status({order_id:c.order.order_id},c.session).state,'refunded');assert.throws(()=>f.licenses.refresh({activation_id:JSON.parse(Buffer.from(a.lease.split('.')[0],'base64url')).activation_id,refresh_secret:a.refresh_secret,device_hash:'a'.repeat(64)}),{code:'LICENSE_REVOKED'});
 f.setReceipt({...base,status:'DONE',balanceAmount:110000});await f.service.webhook({order_id:c.order.order_id});assert.equal((await confirm(f.service,c)).state,'refunded');
}));
test('WAITING_FOR_DEPOSIT is not fulfillment or paid; independent price/currency checks reject mismatch',()=>fixture(async f=>{
 for(const patch of [{status:'WAITING_FOR_DEPOSIT'},{currency:'USD'},{paymentKey:'other'}]){
  const c=f.create();f.setReceipt({orderId:c.order.order_id,paymentKey:'fixture-payment',totalAmount:110000,balanceAmount:110000,currency:'KRW',status:'DONE',...patch});
  if(patch.status)assert.equal((await confirm(f.service,c)).state,'unknown');else await assert.rejects(()=>confirm(f.service,c),{code:'RECEIPT_MISMATCH'});
 }
}));
test('HTTP sets HttpOnly Secure session; unauthenticated status and issuance are denied',()=>fixture(async f=>{
 const token='f'.repeat(43),server=createCommerceHttpServer(f.service,{gatewayToken:token});await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 try{
  assert.equal((await fetch(url+'/catalog')).status,401);
  const post=(action,body,cookie)=>fetch(url+'/'+action,{method:'POST',headers:{'Content-Type':'application/json','X-Shop-Gateway':token,...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
  const response=await post('create',{product_id:'resistor.edu.standalone',email:'buyer@example.invalid',consent:true,terms_version:catalog.terms_version});assert.equal(response.status,200);const set=response.headers.get('set-cookie');assert.match(set,/HttpOnly; Secure; SameSite=Lax/);assert.match(set,new RegExp('^'+shopCookie+'='));const order=(await response.json()).result;assert.equal(order.session,undefined);assert.equal(order.email,undefined);
  assert.equal((await post('status',{order_id:order.order_id})).status,403);assert.equal((await post('status',{order_id:order.order_id},set.split(';')[0])).status,200);assert.equal((await post('admin/orders',{})).status,404);
 }finally{await new Promise(r=>server.close(r));}
}));
test('Toss adapter uses fixed official endpoint, server Basic auth and stable idempotency; never falls back to samples',async()=>{
 assert.equal(createTossProvider(),undefined);assert.throws(()=>createTossProvider({secretKey:'live_sk_fixture',clientKey:'test_ck_fixture'}));let calls=[];
 const provider=createTossProvider({secretKey:'test_sk_fixture',clientKey:'test_ck_fixture',fetchImpl:async(url,p)=>{calls.push({url,...p});return {ok:true,json:async()=>({status:'DONE'})};}});
 await provider.confirm({orderId:'fixture-order',paymentKey:'fixture-payment',amount:110000});await provider.lookup('fixture-order');assert.equal(calls[0].url,'https://api.tosspayments.com/v1/payments/confirm');assert.equal(calls[0].headers['Idempotency-Key'],'confirm-fixture-order');assert.equal(calls[0].headers.Authorization,'Basic '+Buffer.from('test_sk_fixture:').toString('base64'));assert.equal(calls[1].method,'GET');assert.equal(calls[1].url,'https://api.tosspayments.com/v1/payments/orders/fixture-order');
});
