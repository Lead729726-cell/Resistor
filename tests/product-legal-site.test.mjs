import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {prepareProductLegalSite,renderProductLegalPages,productLegalPages} from '../scripts/product-legal-site.mjs';
import {productLegalReadiness,legalReview,legalOperator,termsSections,privacySections,legalImplementationSources,privacyAgePolicy} from '../scripts/site/product-legal-content.mjs';
import {privacyTransferProviders,privacyTransferReadiness} from '../scripts/site/privacy-transfers.mjs';
import {courseAccessPolicy} from '../platform/licensing/access-policy.mjs';
import {courseSiteHeader,courseSiteFooter} from '../scripts/course-site-design.mjs';
import {applyCourseDocumentDesign} from '../scripts/site/course-document-design.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const sha=value=>createHash('sha256').update(value).digest('hex');

test('unknown operator decisions cannot be rendered as a final effective policy',()=>{
 assert.equal(productLegalReadiness().ready,false);
 for(const id of ['retention','international','minors','policy-approval','effective-date','reviewed-at'])assert(productLegalReadiness().missing.includes(id));
 assert.equal(productLegalReadiness().missing.includes('privacy-contact'),false);
 assert.throws(()=>renderProductLegalPages({mode:'final'}),/review is incomplete/);
 assert.throws(()=>renderProductLegalPages({mode:'unknown'}),/Legal mode/);
 const spoofed={...legalReview,status:'approved',effective_date:'2026-11-12',reviewed_at:'2026-11-12T00:00:00Z'};
 assert.equal(productLegalReadiness(spoofed).ready,false);
 for(const html of Object.values(renderProductLegalPages())){
  assert.match(html,/data-policy-status="review_required"/);
  assert.match(html,/시행일 미확정/);
  assert.match(html,/name="robots" content="noindex,follow"/);
  assert.match(html,/<details class="academy-document-note" data-policy-toc><summary>이 문서의 항목<\/summary>/);
  assert.doesNotMatch(html,/<details[^>]*(?:data-policy-toc|data-policy-review)[^>]*\bopen\b/);
  assert.doesNotMatch(html,/<input|<form|<textarea|onclick=|onload=/);
 }
});

test('approved contact and retention decisions remain distinct from unverified deletion operations',()=>{
 assert.equal(legalReview.items.find(item=>item.id==='privacy-contact').status,'verified');
 assert.equal(legalReview.items.find(item=>item.id==='retention').status,'policy_approved');
 const pages=renderProductLegalPages(),privacy=pages['privacy/index.html'],terms=pages['terms/index.html'];
 for(const html of [privacy,terms]){
  assert.match(html,/개인정보 보호책임자[\s\S]*대표 이석형/);
  assert.match(html,/creditlsh00726@gmail\.com/);
  assert.match(html,/문의[\s\S]*해결 후 1년/);
  assert.match(html,/수동[\s\S]*처리/);
  assert.doesNotMatch(html,/겸임 지정은 운영자 확인이 필요|보호책임자 지정, 서버별/);
  assert.doesNotMatch(html,/<h3>개인정보 보호책임자 지정<\/h3>/);
 }
 assert.match(privacy,/리그·커뮤니티 기록은 이용 중 보관/);
 assert.match(privacy,/법정 기간 동안 별도 보존/);
 assert.match(privacy,/자동 삭제가 구현되어 있지 않습니다/);
 assert.match(privacy,/완료하지 않은 단계는 대기·추가 확인/);
 assert.match(privacy,/국외 이전 세부사항 등 남은 확인 항목/);
 assert.equal(productLegalReadiness().ready,false);
 assert.throws(()=>renderProductLegalPages({mode:'final'}),/review is incomplete/);
});

test('product policies preserve actual Edu entitlement, planned sales and separate operator-mail privacy scope',async()=>{
 const pages=renderProductLegalPages(),terms=pages['terms/index.html'],privacy=pages['privacy/index.html'];
 assert.equal(courseAccessPolicy.edition,'edu');assert.equal(courseAccessPolicy.device_limit,2);assert.equal(courseAccessPolicy.industry_included,false);
 const catalog=JSON.parse(await readFile(path.join(root,'platform/commerce/catalog.json'),'utf8'));
 assert.equal(catalog.direct_sales_enabled,false);
 assert.equal(catalog.products.find(p=>p.id==='resistor.edu.course-bundle').price_krw,250000);
 assert.match(terms,/Resistor Edu 전용이며 개인 기기 2대/);
 assert.match(terms,/판매 예정가는 250,000원/);
 assert.match(terms,/현재 resistor.kr에서는 자체 결제/);
 assert.match(terms,/철회권 포기·환불 불가에 동의한 것으로 처리하지 않습니다/);
 assert.match(privacy,/공개된 운영자 Google 연동 안내는 별도 범위/);
 assert.match(privacy,/기간 만료 자동 삭제가 구현되어 있지 않습니다/);
 assert.match(privacy,/store:false/);assert.match(privacy,/0일 보관한다는 뜻은 아닙니다/);
 assert.match(privacy,/주민등록번호나 하드웨어 일련번호를 수집하는 구조가 아닙니다/);
 const footerSource=await readFile(path.join(root,legalOperator.source),'utf8');
 for(const value of Object.values(legalOperator).filter(value=>value!==legalOperator.source))assert(footerSource.includes(value),`Unverified operator fact: ${value}`);
 for(const source of legalImplementationSources)assert((await readFile(path.join(root,source))).length>0,source);
});

test('legal sections have unique anchors and safe public references with no account actions',()=>{
 for(const sections of [termsSections,privacySections])assert.equal(new Set(sections.map(section=>section.id)).size,sections.length);
 for(const html of Object.values(renderProductLegalPages())){
  assert.equal((html.match(/class="academy-footer"/g)||[]).length,1);
  assert.equal((html.match(/id="main-content"/g)||[]).length,1);
  for(const [,href]of html.matchAll(/href="([^"]+)"/g)){
   if(href.startsWith('#'))assert(html.includes(`id="${href.slice(1)}"`),href);
   if(href.startsWith('https://')){const url=new URL(href.replaceAll('&amp;','&'));assert.equal(url.username,'');assert.equal(url.password,'');assert(!/^\/admin\b|\/login\/|\/course\/edit\//.test(url.pathname));}
   assert(!href.startsWith('javascript:'));
  }
  assert(html.includes('href="/terms/"'));assert(html.includes('href="/privacy/"'));
 }
});

test('generation adds physical legal routes without modifying any existing deployment bytes and is repeatable',async()=>{
 const site=await mkdtemp(path.join(os.tmpdir(),'resistor-product-policy-'));
 try{
  const protectedFiles={
   'vercel.json':JSON.stringify({rewrites:[{source:'/download/edu/',destination:'/download-edu.html'}],redirects:[{source:'/download/native',destination:'https://github.com/Lead729726-cell/Resistor/releases/download/edu-v0.32.0/real.zip'}]}),
   '.vercelignore':'*\n!index.html\n**/.env*\n**/.runtime/**\n',
   'index.html':'<main>existing course home</main>',
   'edition-downloads.json':'real release metadata',
   'updates.json':'protected updater metadata',
   'learning-assets.json':'protected asset manifest',
   'sitemap.xml':'<urlset><url><loc>https://resistor.kr/</loc></url></urlset>',
   'api/shop.mjs':'existing authenticated commerce gateway',
  };
  for(const [file,value]of Object.entries(protectedFiles)){await mkdir(path.dirname(path.join(site,file)),{recursive:true});await writeFile(path.join(site,file),value);}
  const result=await prepareProductLegalSite(root,site);
  assert.equal(result.ready,false);assert.equal(result.edition,'edu');assert.equal(result.assets.length,2);
  for(const page of productLegalPages){
   assert.equal(page.file,page.route.slice(1)+'index.html');
   const bytes=await readFile(path.join(site,page.file)),asset=result.assets.find(asset=>asset.file===page.file);
   assert.equal(asset.sha256,sha(bytes));assert.equal(asset.bytes,bytes.length);
  }
  const second=await prepareProductLegalSite(root,site);assert.deepEqual(second,result);
  for(const [file,value]of Object.entries(protectedFiles))assert.equal(await readFile(path.join(site,file),'utf8'),value,file);
  assert.deepEqual((await readdir(path.join(site,'privacy'))),['index.html']);
  assert.equal((await readdir(site)).includes('legal-readiness.json'),false);
  await assert.rejects(()=>prepareProductLegalSite(root,site,{mode:'final'}),/review is incomplete/);
  for(const asset of result.assets)assert.equal(sha(await readFile(path.join(site,asset.file))),asset.sha256);
 }finally{assert.equal(path.dirname(path.resolve(site)),path.resolve(os.tmpdir()));await rm(site,{recursive:true,force:true});}
});

test('shared site regeneration does not change a freshly generated legal page or invalidate its receipt hash',()=>{
 for(const [file,html]of Object.entries(renderProductLegalPages()))assert.equal(applyCourseDocumentDesign(html,file,{header:courseSiteHeader,footer:courseSiteFooter}),html);
});

// Pure gate fixtures are synthetic completeness evidence, never provider/account verification.
function completeTransferFixture(){
 return structuredClone(privacyTransferProviders).map(provider=>({...provider,
  countries:{...provider.countries,status:'verified',verified_countries:['대한민국'],evidence:['synthetic account scope for test only']},
  ...Object.fromEntries(['retention','legal_basis','account'].map(field=>[field,{...provider[field],status:'verified',evidence:['synthetic review for test only']}])),
 }));
}
test('provider readiness cannot use public company locations or global placeholders as account-country evidence',()=>{
 const real=privacyTransferReadiness();assert.equal(real.ready,false);
 for(const provider of privacyTransferProviders){
  for(const field of ['countries','retention','legal_basis','account'])assert(real.missing.includes(`${provider.id}:${field}`));
 }
 assert.equal(privacyTransferReadiness([]).ready,false);
 const fixture=completeTransferFixture();assert.equal(privacyTransferReadiness(fixture).ready,true);
 for(const country of ['','미국 및 전세계','미국 및 전 세계','Global','unknown','확인 중']){
  const altered=structuredClone(fixture);altered[0].countries.verified_countries=[country];
  assert(privacyTransferReadiness(altered).missing.includes('cloudflare:countries'),country);
 }
 for(const field of ['countries','retention','legal_basis','account']){
  const altered=structuredClone(fixture);altered[1][field].evidence=[];
  assert(privacyTransferReadiness(altered).missing.includes(`google:${field}`),field);
 }
 const duplicate=[...fixture,fixture[0]];assert(privacyTransferReadiness(duplicate).missing.includes('cloudflare:provider'));
 assert(privacyTransferReadiness([...fixture,{...fixture[0],id:'unreviewed-provider'}]).missing.includes('unexpected-provider'));
 const noItems=structuredClone(fixture);noItems[2].items='';assert(privacyTransferReadiness(noItems).missing.includes('vercel:disclosure'));
 const cloudflare=privacyTransferProviders.find(provider=>provider.id==='cloudflare');
 assert.equal(cloudflare.account.configuration_evidence.jurisdiction,null);
 assert.equal(cloudflare.account.configuration_evidence.actual_database_country_verified,false);
 assert.equal(cloudflare.account.status,'pending');
 const vercel=privacyTransferProviders.find(provider=>provider.id==='vercel');
 assert.equal(vercel.account.configuration_evidence.project_http,200);
 assert.deepEqual(vercel.account.configuration_evidence.regions,['iad1']);
 assert.equal(vercel.account.configuration_evidence.retention_config_verified,false);
 assert.equal(vercel.account.configuration_evidence.all_processing_countries_verified,false);
 assert.equal(vercel.account.status,'pending');assert.equal(vercel.countries.status,'pending');
});

test('approved 14+ online policy is distinct from unreleased enforcement and does not create blanket consent',()=>{
 assert.equal(privacyAgePolicy.minimum_age,14);assert.equal(privacyAgePolicy.approval,'owner-confirmed');
 assert.equal(privacyAgePolicy.enforcement.status,'not_verified');
 const html=renderProductLegalPages()['privacy/index.html'];
 assert.match(html,/만 14세 이상으로 정했습니다/);
 assert.match(html,/공개 설명 열람과 기기에만 저장되는 계산·학습까지 금지하는 정책은 아닙니다/);
 assert.match(html,/기존 0\.33\.0 배포본에서 연령 확인이 이미 시행된 것으로 안내하지 않습니다/);
 assert.match(html,/연령 자기 확인은 신분증에 의한 본인 확인이나 법정대리인 동의 검증을 뜻하지 않습니다/);
 assert.doesNotMatch(html,/<input|<form|checked|동의한 것으로 간주합니다/);
 const review={...legalReview,status:'approved',effective_date:'2026-11-20',reviewed_at:'2026-11-13T00:00:00Z',items:legalReview.items.map(item=>({...item,status:'verified'}))};
 const defaultState=productLegalReadiness(review);assert.equal(defaultState.ready,false);
 assert(defaultState.missing.includes('age-policy-enforcement'));assert(defaultState.missing.includes('transfer:cloudflare:countries'));
 const providers=completeTransferFixture();assert.equal(productLegalReadiness(review,{providers}).ready,false);
 const agePolicy={...privacyAgePolicy,enforcement:{status:'verified',source_revision:'synthetic-source',release:'test-only',evidence:['synthetic gate evidence']}};
 assert.equal(productLegalReadiness(review,{providers,agePolicy}).ready,true);
 assert(productLegalReadiness({...review,effective_date:'2026-02-30'},{providers,agePolicy}).missing.includes('effective-date'));
});

test('public transfer disclosure distinguishes recipient contacts, account checks, consumer Gmail and source limits',()=>{
 const html=renderProductLegalPages()['privacy/index.html'];
 for(const provider of privacyTransferProviders){assert(html.includes(provider.contact));assert(html.includes(provider.timing));assert(html.includes(provider.method));}
 assert.match(html,/소비자 Gmail 계정을 사용합니다/);
 assert.match(html,/Workspace DPA를 적용한 것으로 표시하지 않습니다/);
 assert.match(html,/국가 제한\(jurisdiction\)을 지정하지 않았습니다/);
 assert.match(html,/세계 각지의 사업자·재수탁자 시설에서도 처리될 수 있다고 설명합니다/);
 assert.match(html,/지역별 저장 기능과 실제 모델 처리 지역은 같지 않을 수 있습니다/);
 assert.match(html,/계정별 국가 확인 중/);
 assert.doesNotMatch(html,/국외 이전 동의를 완료했습니다|미국에만 저장됩니다|한국에만 저장됩니다/);
});
