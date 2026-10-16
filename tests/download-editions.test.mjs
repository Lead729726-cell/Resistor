import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateEditionDownloads,editionDownloadCards,refreshEditionSources} from '../scripts/download-editions.mjs';
const definitions=JSON.parse(await readFile('apps/desktop/product-editions.json','utf8'));
const manifest=JSON.parse(await readFile('platform/download-site/edition-downloads.json','utf8'));
test('public sources are pinned to distinct, verified Edu and Indust products',()=>{
  validateEditionDownloads(manifest,definitions);assert.notEqual(manifest.editions[0].source.url,manifest.editions[1].source.url);
  const cards=editionDownloadCards(manifest);assert(cards.includes('/download/edu/'));assert(cards.includes('/download/industry/'));assert(cards.includes('전용 설치 파일 준비 중'));
});
test('wrong edition identity, unpinned URLs and common-installer relabeling are rejected',()=>{
  for(const mutate of [m=>m.editions.pop(),m=>m.editions[1].edition='edu',m=>m.editions[0].source.product_edition_verified='indust',m=>m.editions[0].source.url='https://example.com/fake.zip',m=>m.editions[0].source.revision='main',m=>m.editions[0].native_installer.status='published',m=>m.editions[0].native_installer.files=['Resistor-0.27.0-win-x64.exe']]){
    const m=structuredClone(manifest);mutate(m);assert.throws(()=>validateEditionDownloads(m,definitions));
  }
});
test('refresh aborts before writing if a public branch belongs to the wrong product',async()=>{
  const before=await readFile('platform/download-site/edition-downloads.json','utf8');
  await assert.rejects(()=>refreshEditionSources(process.cwd(),async url=>({ok:true,json:async()=>url.includes('/branches/')?{commit:{sha:'a'.repeat(40)}}:{schema_version:1,edition:'another-product'}})),/another edition/);
  assert.equal(await readFile('platform/download-site/edition-downloads.json','utf8'),before);
});
