import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createShopGateway} from '../platform/download-site/api/shop.mjs';
async function call(handler,{action='catalog',method='GET',origin,body,cookie}={}){const headers={},res={setHeader:(k,v)=>headers[k]=v,end(text){this.body=JSON.parse(text);}};await handler({url:'/api/shop?action='+action,method,headers:{origin,cookie},body},res);return {status:res.statusCode,headers,body:res.body};}
test('public gateway fails closed without backend, rejects cross origin and never forwards admin routes',async()=>{
 const handler=createShopGateway({env:{}}),catalog=await call(handler);assert.equal(catalog.status,200);assert.equal(catalog.body.result.checkout_enabled,false);assert.ok(catalog.body.result.products.every(p=>!p.purchasable));
 assert.equal((await call(handler,{action:'create',method:'POST',origin:'https://evil.invalid',body:{}})).status,403);
 assert.equal((await call(handler,{action:'create',method:'POST',origin:'https://resistor.kr',body:{}})).status,503);
 assert.equal((await call(handler,{action:'admin/orders',method:'POST',origin:'https://resistor.kr',body:{}})).status,405);
});
test('gateway uses fixed HTTPS origin, forwards only shop cookie and gateway key, preserves uncertain status',async()=>{
 let seen;const handler=createShopGateway({env:{RESISTOR_COMMERCE_ORIGIN:'https://shop.example.invalid',RESISTOR_SHOP_GATEWAY_TOKEN:'fixture'},fetchImpl:async(url,p)=>{seen={url:String(url),...p};return {status:502,json:async()=>({ok:false,error:{code:'PAYMENT_UNCERTAIN'}}),headers:new Headers()};}});
 const r=await call(handler,{action:'confirm',method:'POST',origin:'https://resistor.kr',body:{order_id:'fixture',target:'https://evil.invalid'},cookie:'other=private; __Host-resistor_shop='+'a'.repeat(43)});
 assert.equal(r.status,502);assert.equal(seen.url,'https://shop.example.invalid/confirm');assert.equal(seen.headers.Cookie,'__Host-resistor_shop='+'a'.repeat(43));assert.equal(seen.redirect,'error');assert.ok(!seen.headers.Cookie.includes('other'));
 const invalid=createShopGateway({env:{RESISTOR_COMMERCE_ORIGIN:'http://localhost',RESISTOR_SHOP_GATEWAY_TOKEN:'fixture'},fetchImpl:()=>assert.fail('no insecure backend call')});assert.equal((await call(invalid)).status,503);
});
test('shop, workbook and checkout keep canonical chrome, separate editions and gated purchase routes',async()=>{
 const site='platform/download-site/',config=JSON.parse(await readFile(site+'vercel.json','utf8')),ignore=await readFile(site+'.vercelignore','utf8');
 for(const [route,file]of [['/shop/','shop.html'],['/checkout/','checkout.html'],['/course/','course-workbook.html']]){const html=await readFile(site+file,'utf8');assert.equal((html.match(/<header\b/g)||[]).length,1);assert.ok(html.includes('id="main-content"'));assert.ok(html.includes('/appearance.js'));assert.ok(html.includes('Resistor Edu'));assert.equal(config.rewrites.find(r=>r.source===route).destination,'/'+file);assert.ok(ignore.includes('!'+file));}
 assert.ok(config.headers.find(h=>h.source==='/checkout/').headers.some(h=>h.key==='Referrer-Policy'&&h.value==='no-referrer'));
 const home=await readFile(site+'index.html','utf8');assert.ok(home.includes('data-course-entry'));assert.ok(home.includes('href="/shop/"'));assert.ok(home.includes('/download/industry/'));assert.ok(home.includes('/download/edu/'));
 const checkout=await readFile(site+'checkout.html','utf8');assert.ok(checkout.includes('id="purchase-form" hidden'));assert.ok(checkout.includes('이메일을 받지 않습니다'));
});
