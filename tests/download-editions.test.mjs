import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateEditionDownloads,editionDownloadCards,refreshEditionSources} from '../scripts/download-editions.mjs';
const definitions=JSON.parse(await readFile('apps/desktop/product-editions.json','utf8'));
const manifest=JSON.parse(await readFile('platform/download-site/edition-downloads.json','utf8'));
test('public sources are pinned to distinct, verified Edu and Indust products',()=>{
  validateEditionDownloads(manifest,definitions);assert.notEqual(manifest.editions[0].source.url,manifest.editions[1].source.url);
  const cards=editionDownloadCards(manifest);assert(cards.includes('/download/edu/'));assert(cards.includes('/download/industry/'));assert(cards.includes('인프런 강의에는 Resistor Edu 사용권만 포함됩니다.'));assert(cards.includes('개인 기기 2대'));assert(cards.includes('Industry는 강의 제공 범위에 포함되지 않는 별도 구매 제품입니다.'));assert(cards.includes(manifest.editions.every(e=>e.native_installer.status==='published')?'Windows x64·ARM64':'전용 설치 파일 준비 중'));
});
test('wrong edition identity, unpinned URLs and common-installer relabeling are rejected',()=>{
  for(const mutate of [m=>m.editions.pop(),m=>m.editions[1].edition='edu',m=>m.editions[0].source.product_edition_verified='indust',m=>m.editions[0].source.url='https://example.com/fake.zip',m=>m.editions[0].source.revision='main',m=>m.editions[0].native_installer={status:'published',files:[]},m=>m.editions[0].native_installer.files=['Resistor-0.27.0-win-x64.exe']]){
    const m=structuredClone(manifest);mutate(m);assert.throws(()=>validateEditionDownloads(m,definitions));
  }
});
test('refresh aborts before writing if a public branch belongs to the wrong product',async()=>{
  const before=await readFile('platform/download-site/edition-downloads.json','utf8');
  await assert.rejects(()=>refreshEditionSources(process.cwd(),async url=>({ok:true,json:async()=>url.includes('/branches/')?{commit:{sha:'a'.repeat(40)}}:{schema_version:1,edition:'another-product'}})),/another edition/);
  assert.equal(await readFile('platform/download-site/edition-downloads.json','utf8'),before);
});
test('dedicated installer schema rejects partial, substituted and unverified releases',()=>{
  const m=structuredClone(manifest),repo='https://github.com/Lead729726-cell/Resistor/releases/download/editions-v0.28.0/';
  for(const e of m.editions)e.native_installer={status:'published',files:['windows-x64','windows-arm64','macos-arm64','macos-x64','linux-x64'].map(target=>{
    const name=`Resistor-${e.edition==='edu'?'Edu':'Indust'}-0.28.0-${target}.${target.startsWith('windows')?'exe':target.startsWith('macos')?'zip':'tar.gz'}`;
    return {target,name,url:repo+name,receipt_url:repo+name.replace(/\.(exe|zip|tar\.gz)$/,'.json'),version:'0.28.0',product_id:e.product_id,bytes:1000001,sha256:'b'.repeat(64),receipt_sha256:'c'.repeat(64),source_revision:e.source.revision,build_tools_revision:'a'.repeat(40),qa_completed:true,runtime_arch:target==='windows-arm64'?'x64':target.endsWith('arm64')?'arm64':'x64',requires_emulation:target==='windows-arm64',minimum_os:target.startsWith('macos')?'15.0':target==='windows-arm64'?'11.0':target==='windows-x64'?'10.0':null};
  })};
  validateEditionDownloads(m,definitions);
  for(const mutate of [m=>m.editions[0].native_installer.files.pop(),m=>m.editions[0].native_installer.files[0].qa_completed=false,m=>m.editions[0].native_installer.files[1].requires_emulation=false,m=>m.editions[0].native_installer.files[0].product_id='resistor.indust',m=>m.editions[0].native_installer.files[0].receipt_sha256='bad',m=>m.editions[0].native_installer.files[0].url='https://example.com/substitute.exe']){const changed=structuredClone(m);mutate(changed);assert.throws(()=>validateEditionDownloads(changed,definitions));}
});
test('published Industry and Indust labels remain compatible only within the same product identity',()=>{
 for(const name of ['Resistor Industry','Resistor Indust']){const m=structuredClone(manifest);m.editions.find(e=>e.edition==='indust').name=name;assert.doesNotThrow(()=>validateEditionDownloads(m,definitions));}
 const invalid=structuredClone(manifest);invalid.editions.find(e=>e.edition==='indust').name='Another product';assert.throws(()=>validateEditionDownloads(invalid,definitions));
});
