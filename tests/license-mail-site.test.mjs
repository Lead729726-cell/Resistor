import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {licenseMailPages,prepareLicenseMailSite,renderLicenseMailPages} from '../scripts/download-license-mail.mjs';

test('License Mail public routes expose the app and scoped policy without an OAuth credential form',async()=>{
 const root='platform/download-site/',config=JSON.parse(await readFile(root+'vercel.json','utf8')),ignore=(await readFile(root+'.vercelignore','utf8')).split(/\r?\n/),sitemap=await readFile(root+'sitemap.xml','utf8');
 const pages=new Map();
 for(const {route,file}of licenseMailPages){
  const html=await readFile(root+file,'utf8');pages.set(route,html);
  assert.equal((html.match(/<h1(?:\s|>)/g)||[]).length,1);assert.match(html,/lang="ko"/);assert.match(html,/id="main-content"/);
  assert.ok(html.includes('href="https://resistor.kr'+route+'"'));assert.ok(html.includes('Resistor License Mail'));assert.ok(html.includes('href="mailto:creditlsh00726@gmail.com"'));
  assert.ok(ignore.includes('!'+file));assert.ok(sitemap.includes('https://resistor.kr'+route+'</loc>'));
  for(const source of [route,route.slice(0,-1)])assert.equal(config.rewrites.find(r=>r.source===source)?.destination,'/'+file);
  assert.doesNotMatch(html,/<(?:form|input|iframe)\b|accounts\.google\.com\/o\/oauth|[?&](?:client_secret|access_token|refresh_token)=|RS1-(?:[A-F0-9]{8}-){4}/i);
  for(const match of html.matchAll(/(?:href|src)="([^"]+)"/g)){
   const url=new URL(match[1],'https://resistor.kr'+route);if(url.origin!=='https://resistor.kr')continue;
   const destination=config.rewrites.find(r=>r.source===url.pathname)?.destination??(url.pathname==='/'?'/index.html':url.pathname);
   assert.ok(!destination.includes('..'));const target=await readFile(root+destination.slice(1),'utf8');
   if(url.hash)assert.ok(target.includes('id="'+url.hash.slice(1)+'"'),`Missing anchor ${url.href}`);
  }
 }
 const privacy=pages.get('/license-mail/privacy/');
 for(const required of ['운영자 연결을 유지하는 기간','수동으로 삭제','권한만 철회','자동 삭제','구매·환불 기록','AES-GCM','Limited Use','AI 학습','Google 보낸편지함'])assert.ok(privacy.includes(required),required);
 assert.ok(pages.get('/license-mail/').includes('인프런 결제·환불을 자동 수신하는 웹훅 연결은 제공하지 않습니다'));
 assert.ok((await readFile(root+'index.html','utf8')).includes('href="/license-mail/privacy/"'));
 assert.ok(ignore.includes('!license-mail.css'));
});

test('regeneration preserves the published operator-verified automatic-mail scope and its delivery limits',async()=>{
 const published=await readFile('platform/download-site/license-mail.html','utf8'),generated=renderLicenseMailPages()['license-mail.html'];
 const workflow=html=>html.match(/<section\b[^>]*aria-labelledby="mail-flow"[^>]*>[\s\S]*?<\/section>/)?.[0];
 assert.ok(workflow(published));assert.equal(workflow(generated),workflow(published),'Regeneration must not revert the reviewed public fulfillment scope');
 const config=await readFile('platform/licensing/cloudflare/wrangler.jsonc','utf8'),course=config.match(/"LICENSE_INFLEARN_COURSE_ID"\s*:\s*"(\d+)"/)?.[1];
 assert.ok(course);assert.ok(generated.includes('인프런 강의 '+course));assert.match(config,/"\*\/5 \* \* \* \*"/);
 for(const html of [published,generated]){
  assert.match(workflow(html),/운영자가[\s\S]*주문과 수신 주소를 확인해 등록하면[\s\S]*발송을 자동 요청/);
  assert.ok(workflow(html).includes('5분마다 발송 대기열'));
  assert.ok(workflow(html).includes('웹훅 연결은 제공하지 않습니다'));
  assert.ok(workflow(html).includes('불명확하면 자동 재발송하지 않고 운영자가 확인'));
  assert.ok(workflow(html).includes('받은편지함 도착이나 읽음 확인을 뜻하지 않습니다'));
 }
});

test('adding License Mail pages preserves existing production downloads, routes and private deployment exclusions',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'resistor-mail-site-'));
 try{
  const manifest='unchanged actual native receipts and hashes',home='<html><body><main id="native-downloads">production native 0.32.0</main><footer class="wb-footer">existing links</footer></body></html>',config={rewrites:[{source:'/download/edu/',destination:'/actual-native.html'}],redirects:[{source:'/download/native',destination:'https://example.invalid/actual.exe'}],headers:[{source:'/(.*)',headers:[{key:'X-Content-Type-Options',value:'nosniff'}]}]};
  for(const [file,content]of Object.entries({'index.html':home,'vercel.json':JSON.stringify(config),'.vercelignore':'*\n!index.html\n**/.env*\n**/.runtime/**\n','sitemap.xml':'<urlset><url><loc>https://resistor.kr/download/edu/</loc></url></urlset>','edition-downloads.json':manifest}))await writeFile(path.join(directory,file),content);
  await prepareLicenseMailSite(directory);const first=await readFile(path.join(directory,'index.html'),'utf8');await prepareLicenseMailSite(directory);
  assert.equal(await readFile(path.join(directory,'index.html'),'utf8'),first);assert.ok(first.includes('<main id="native-downloads">production native 0.32.0</main>'));assert.ok(first.includes('existing links'));
  assert.equal(await readFile(path.join(directory,'edition-downloads.json'),'utf8'),manifest);
  const after=JSON.parse(await readFile(path.join(directory,'vercel.json'),'utf8'));assert.deepEqual(after.redirects,config.redirects);assert.deepEqual(after.headers,config.headers);assert.deepEqual(after.rewrites[0],config.rewrites[0]);assert.equal(after.rewrites.length,5);
  const exclusions=await readFile(path.join(directory,'.vercelignore'),'utf8');assert.ok(exclusions.includes('**/.env*'));assert.ok(exclusions.includes('**/.runtime/**'));assert.ok(!exclusions.includes('!**'));
 }finally{assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));await rm(directory,{recursive:true,force:true});}
});
