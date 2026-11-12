import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {eduGuideAccess,eduGuidePage,eduLegalPages} from '../packages/ui/src/edu-legal-content';
import {courseAccessPolicy,orderAccess} from '../platform/licensing/access-policy.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));

test('the Edu guidance entitlement agrees with the real course issuance policy',()=>{
 const issued=orderAccess({provider:'inflearn',edition:eduGuideAccess.edition,device_limit:eduGuideAccess.device_limit});
 assert.equal(eduGuideAccess.edition,courseAccessPolicy.edition);
 assert.equal(eduGuideAccess.device_limit,courseAccessPolicy.device_limit);
 assert.equal(eduGuideAccess.industry_included,issued.industry_included);
 assert.deepEqual(issued.included_editions,[eduGuideAccess.edition]);
 assert.throws(()=>orderAccess({provider:'inflearn',edition:'indust',device_limit:2}),{code:'ORDER_EDITION'});
 assert.throws(()=>orderAccess({provider:'inflearn',edition:'edu',device_limit:3}),{code:'ORDER_POLICY'});
 const access=eduLegalPages.find(page=>page.id==='access')!;
 assert(access.links.some(link=>link.href===courseAccessPolicy.download_url));
});

test('help navigation is bounded, reversible and resettable without creating a consent or completion record',()=>{
 let page=0;
 const original=JSON.stringify(eduLegalPages);
 for(let index=1;index<eduLegalPages.length;index++){page=eduGuidePage(page,'next');assert.equal(page,index);}
 assert.equal(eduGuidePage(page,'next'),page);
 for(let index=eduLegalPages.length-2;index>=0;index--){page=eduGuidePage(page,'back');assert.equal(page,index);}
 assert.equal(eduGuidePage(page,'back'),0);
 assert.equal(eduGuidePage(4,'reset'),0);
 assert.equal(eduGuidePage(NaN,'reset'),0);
 assert.equal(JSON.stringify(eduLegalPages),original);
});

test('official help URLs stay on known public pages, not checkout or privileged endpoints',async()=>{
 const site=path.join(root,'platform/download-site');
 const config=JSON.parse(await readFile(path.join(site,'vercel.json'),'utf8'));
 const urls=[...new Set(eduLegalPages.flatMap(page=>page.links.map(link=>link.href)))];
 assert(urls.length>0);
 const externalPolicies=new Set(['https://resistor.kr/terms/','https://resistor.kr/privacy/']);
 for(const url of externalPolicies)assert(urls.includes(url));
 for(const href of urls){
  const url=new URL(href);
  assert.equal(url.protocol,'https:');assert.equal(url.username,'');assert.equal(url.password,'');
  assert.equal(url.search,'');assert.equal(url.hash,'');
  assert(['resistor.kr','github.com'].includes(url.hostname));
  // These are independently deployed product-policy pages. The website generator
  // owns their route/content tests; installers link to them without bundling drafts.
  if(externalPolicies.has(href))continue;
  if(url.hostname==='resistor.kr'){
   const route=config.rewrites.find((value:{source:string})=>value.source===url.pathname);
   const target=route?.destination??url.pathname+'index.html';
   assert((await stat(path.join(site,target.replace(/^\//,'')))).isFile(),`Missing official help route: ${url.pathname}`);
  }else assert(url.pathname.startsWith('/Lead729726-cell/Resistor/'));
 }
 // The operator-only mail notice must not silently become the whole-product policy.
 assert.equal(eduLegalPages.find(page=>page.id==='mail')?.links.find(link=>link.href.endsWith('/privacy/'))?.label,'운영자 Google 연동 개인정보 안내');
 for(const source of new Set(eduLegalPages.flatMap(page=>page.sources)))assert((await stat(path.join(root,source))).isFile(),source);
});
