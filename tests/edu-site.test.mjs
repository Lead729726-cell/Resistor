import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readEduRoute,eduRoute} from '../scripts/site/edu-guide.mjs';
import {initialStudyQuestions} from '../packages/education/src/self-study.ts';

test('public Edu guide routes support all seven pages and reject malformed or injected routes',()=>{
 for(let step=1;step<=7;step++)assert.deepEqual(readEduRoute(eduRoute('design',step)),{mode:'design',step});
 assert.equal(eduRoute('design',0),'#design/1');assert.equal(eduRoute('design',9),'#design/7');
 for(const hash of ['', '#quiz','#design/0','#design/8','#design/01','#design/<script>','#design/2?next=evil'])assert.deepEqual(readEduRoute(hash),{mode:'quiz',step:1});
});
test('homepage and guide expose real modes, bounded question count and source scope without replacing native downloads',async()=>{
 const root='platform/download-site/',home=await readFile(root+'index.html','utf8'),guide=await readFile(root+'edu.html','utf8'),meta=JSON.parse(await readFile(root+'edu-updates.json','utf8')),config=JSON.parse(await readFile(root+'vercel.json','utf8')),manifest=JSON.parse(await readFile(root+'edition-downloads.json','utf8'));
 assert.equal(meta.edition,'edu');assert.equal(meta.question_count,initialStudyQuestions().length);assert.equal(meta.design_steps.length,7);assert.equal(meta.native_installer_rebuilt,false);assert.equal(meta.engine_executed_on_website,false);
 assert.ok(home.includes('href="/edu/"'));assert.ok(home.includes('href="/edu/#design/1"'));assert.ok(home.includes('/download/edu/'));assert.ok(home.includes('/download/industry/'));assert.ok(home.includes('/tutorial/oscillators/'));
 assert.equal(manifest.editions.reduce((n,e)=>n+e.native_installer.files.length,0),10);assert.equal(meta.source_revision,manifest.editions.find(e=>e.edition==='edu').source.revision);
 for(let i=1;i<=7;i++)assert.ok(guide.includes('data-edu-step="'+i+'"'));assert.ok(guide.includes('not_run'));assert.ok(guide.includes('별도 QA'));assert.ok(guide.includes('이 페이지는 앱 사용법 가이드'));
 for(const source of ['/edu','/edu/'])assert.equal(config.rewrites.find(r=>r.source===source).destination,'/edu.html');
 for(const key of ['edu.html','edu-guide.css','edu-guide.mjs','edu-assets/inverter-desktop.png']){const assets=JSON.parse(await readFile(root+'learning-assets.json','utf8')),entry=assets.files.find(f=>f.file===key),body=await readFile(root+key);assert.equal(entry.bytes,body.length);assert.equal(entry.sha256,createHash('sha256').update(body).digest('hex'));}
});
