import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readEduRoute,eduRoute} from '../scripts/site/edu-guide.mjs';
test('shared portal uses versioned Edu presentation facts without copying the Edu question engine',async()=>{
 const facts=JSON.parse(await readFile('scripts/site/edu-guide-content.json','utf8')),meta=JSON.parse(await readFile('platform/download-site/edu-updates.json','utf8')),home=await readFile('platform/download-site/index.html','utf8'),guide=await readFile('platform/download-site/edu.html','utf8');
 assert.equal(facts.edition,'edu');assert.equal(meta.question_count,facts.question_count);assert.equal(meta.feature_source_revision,facts.feature_source_revision);assert.equal(meta.engine_executed_on_website,false);assert.deepEqual(facts.difficulty_levels.map(l=>l.level),[1,2,3]);
 assert.ok(home.includes('/edu/#quiz'));assert.ok(home.includes('/edu/#design/1'));assert.ok(home.includes('/tutorial/oscillators/'));assert.ok(guide.includes('not_run'));
 for(let step=1;step<=7;step++)assert.deepEqual(readEduRoute(eduRoute('design',step)),{mode:'design',step});
 const manifest=JSON.parse(await readFile('platform/download-site/learning-assets.json','utf8'));
 const eduAssets=manifest.files.filter(f=>f.file.startsWith('edu'));assert.equal(eduAssets.length,7);
 for(const f of eduAssets){const body=await readFile('platform/download-site/'+f.file);assert.equal(body.length,f.bytes);assert.equal(createHash('sha256').update(body).digest('hex'),f.sha256);}
});
test('published update guidance distinguishes edition auto-download from confirmed installation and legacy bootstrap',async()=>{
 const policy=JSON.parse(await readFile('platform/download-site/updates.json','utf8')),page=await readFile('platform/download-site/updates.html','utf8');
 assert.equal(policy.minimum_edition_updater_version,'0.29.0');assert.equal(policy.automatic_download,true);assert.equal(policy.automatic_install,false);assert.equal(policy.edition_isolated,true);assert.ok(page.includes('한 번 직접 설치'));assert.ok(page.includes('/download/edu/'));assert.ok(page.includes('/download/industry/'));
});
