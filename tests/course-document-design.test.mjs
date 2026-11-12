import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {applyCourseDocumentDesign,documentFamily} from '../scripts/site/course-document-design.mjs';
import {courseSiteHeader,courseSiteFooter} from '../scripts/course-site-design.mjs';
import {courseSiteInventory} from '../scripts/course-site-inventory.mjs';

const chrome={header:courseSiteHeader,footer:courseSiteFooter};
const document=(body,footer='')=>'<!doctype html><html lang="ko"><head><title>Verified source</title><link rel="stylesheet" href="/original.css"><script type="module" src="/original.mjs"></script></head><body class="wb-doc-body" data-wb-page="example">'+courseSiteHeader+body+footer+'</body></html>';
test('every public family gets the same shell without rewriting a native link, formula, control or embedded script',()=>{
 const body='<main id="main-content" class="lesson" data-lesson="original"><h1>0.9 V · 이전 r7</h1><p>not_run · unavailable · foundry signoff 아님</p><a data-native-download href="https://github.com/Lead729726-cell/Resistor/releases/download/edu-v0.32.0/Resistor-Edu-0.32.0-windows-x64.exe">기존 설치 파일</a><label>전압<input id="vin" type="number" value="1.8"></label><code>Vout = Vin * R2 / (R1 + R2)</code><script>window.originalScope="unchanged";</script></main>';
 for(const file of ['download-edu.html','download-industry.html','pdk-links.html','research.html','tutorial.html','learning/example.html','checkout.html','course-workbook.html','license-mail.html','terms.html','privacy.html','terms/index.html','privacy/index.html']){
  const result=applyCourseDocumentDesign(document(body),file,chrome);
  assert.ok(result.includes(body),file);assert.match(result,/class="wb-doc-body academy-page academy-document"/);
  assert.match(result,/data-wb-page="example"/);assert.match(result,/href="\/course-documents.css"/);
  assert.equal((result.match(/data-academy-header/g)||[]).length,1);
  assert.equal((result.match(/class="academy-footer"/g)||[]).length,1);
  assert.ok(result.includes('src="/original.mjs"'));assert.ok(result.includes('href="/original.css"'));
  assert.ok(result.includes('href="/terms/"'));assert.ok(result.includes('href="/privacy/"'));
 }
});

test('legacy footer source/license limits and linked resources survive in place with idempotent generation',()=>{
 const note='<p>公開 deck 검사 ≠ 제조 승인</p><a href="/learning-handbook.md" download>전체 원본</a><a href="https://example.org/license">모델 라이선스</a>';
 const before=document('<main id="main-content">원본 강의</main>','<footer class="wb-footer">'+note+'</footer>');
 const once=applyCourseDocumentDesign(before,'tutorial-library.html',chrome),twice=applyCourseDocumentDesign(once,'tutorial-library.html',chrome);
 assert.equal(twice,once);assert.ok(once.includes('<div>'+note+'</div>'));
 assert.equal((once.match(/data-document-footer/g)||[]).length,1);
 assert.ok(once.indexOf('data-document-footer')<once.indexOf('class="academy-footer"'));
 assert.equal((once.match(/href="\/course-documents.css"/g)||[]).length,1);
 assert.equal((once.match(/src="\/appearance.js"/g)||[]).length,1);
});

test('a formerly omitted public page keeps its own introduction and receives working theme/menu assets',()=>{
 const intro='<header class="intro"><h1>원래 제목</h1><p>원래 공정 조건</p></header>';
 const html=applyCourseDocumentDesign('<html><body>'+intro+'<main id="main-content">기존 본문</main></body></html>','native-runtime.html',chrome);
 assert.ok(html.includes(intro));assert.match(html,/<head>/);assert.match(html,/src="\/appearance.js"/);
 assert.match(html,/src="\/course-site.mjs"/);assert.equal((html.match(/data-academy-header/g)||[]).length,1);
 assert.equal(applyCourseDocumentDesign(html,'native-runtime.html',chrome),html);
});

test('route audit covers every local HTML family and keeps rewrites/download protections explicit',async()=>{
 const inventory=await courseSiteInventory();
 assert.ok(inventory.html_pages>=139);assert.equal(inventory.pages.length,inventory.html_pages);
 for(const family of ['course','download','commerce','lesson','tutorial','mail','resource','research','edu'])assert.ok(inventory.families[family].pages>0,family);
 for(const page of inventory.pages){assert.equal(page.family,documentFamily(page.file));assert.ok(page.routes.includes('/'+page.file));assert.match(page.sha256,/^[a-f0-9]{64}$/);}
 assert.ok(inventory.pages.find(page=>page.file==='download-edu.html').routes.includes('/download/edu/'));
 for(const key of ['vercel.json','api/shop.mjs','downloads.json','edition-downloads.json','edu-updates.json'])assert.match(inventory.protected_sha256[key],/^[a-f0-9]{64}$/);
});

test('document stylesheet parses cleanly and is scoped away from embedded graphics and homepage layout',async()=>{
 const source=await readFile(new URL('../scripts/site/course-documents.css',import.meta.url),'utf8');
 const parsed=await build({stdin:{contents:source,loader:'css'},write:false,logLevel:'silent'});
 assert.equal(parsed.warnings.length,0);
 assert.doesNotMatch(source,/\b(?:svg|canvas|video)\s*\{[^}]*filter\s*:/);
 assert.doesNotMatch(source,/(?:^|\n)\s*(?:body|main|section|footer|button|:root)\s*\{/);
 assert.match(source,/@media\(max-width:600px\)/);assert.match(source,/@media print/);
});
