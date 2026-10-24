import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {sourceVerificationNotice,refreshEditionSources} from '../scripts/download-editions.mjs';

const manifest=JSON.parse(await readFile('platform/download-site/edition-downloads.json','utf8'));
const indust=manifest.editions.find(e=>e.edition==='indust');
test('verified source has a distinct download and never relabels older installers',()=>{
 const html=sourceVerificationNotice(indust);
 assert.match(html,/data-verified-source="indust"/);
 assert.match(html,/새 설치파일은 아직 공개하지 않았습니다/);
 assert.ok(html.includes(indust.source.verification.report_url));
 assert.ok(html.includes('0.31.0'));
});
test('a stale or absent QA revision cannot certify another source',()=>{
 const e=structuredClone(indust);e.source.revision='f'.repeat(40);
 assert.equal(sourceVerificationNotice(e),'');
 assert.equal(sourceVerificationNotice(manifest.editions.find(e=>e.edition==='edu')),'');
});
test('a substituted QA report or edition is rejected',()=>{
 for(const field of ['report_url','edition']){
  const e=structuredClone(indust);e.source.verification[field]='substituted';
  assert.throws(()=>sourceVerificationNotice(e),/identity mismatch/);
 }
});
test('installers built from the verified source are not labeled unpublished',()=>{
 const e=structuredClone(indust);
 for(const f of e.native_installer.files)f.source_revision=e.source.revision;
 assert.doesNotMatch(sourceVerificationNotice(e),/새 설치파일은 아직 공개하지 않았습니다/);
});
test('source refresh retains same-revision QA but drops it on a new untested commit',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'resistor-source-qa-'));
 try{
  await mkdir(path.join(dir,'apps/desktop'),{recursive:true});await mkdir(path.join(dir,'platform/download-site'),{recursive:true});
  await writeFile(path.join(dir,'apps/desktop/product-editions.json'),await readFile('apps/desktop/product-editions.json'));
  const file=path.join(dir,'platform/download-site/edition-downloads.json');await writeFile(file,JSON.stringify(manifest));
  const mock=changed=>async url=>({ok:true,json:async()=>{
   if(url.includes('/branches/')){const e=manifest.editions.find(e=>url.endsWith(e.edition));return {commit:{sha:changed&&e.edition==='indust'?'f'.repeat(40):e.source.revision}};}
   return {schema_version:1,edition:url.includes(manifest.editions.find(e=>e.edition==='edu').source.revision)?'edu':'indust'};
  }});
  const same=await refreshEditionSources(dir,mock(false));assert.deepEqual(same.editions.find(e=>e.edition==='indust').source.verification,indust.source.verification);
  const changed=await refreshEditionSources(dir,mock(true));assert.equal(changed.editions.find(e=>e.edition==='indust').source.verification,undefined);
  assert.deepEqual(changed.editions.map(e=>e.native_installer),manifest.editions.map(e=>e.native_installer));
 }finally{
  assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep));await rm(dir,{recursive:true});
 }
});
