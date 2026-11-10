import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {prepareDownloadAppearance} from '../scripts/download-appearance.mjs';

test('appearance build is idempotent and preserves evidence and non-style asset facts',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'resistor-appearance-'));
  try {
    const site=path.join(root,'platform/download-site');
    await mkdir(site,{recursive:true});await mkdir(path.join(root,'scripts/site'),{recursive:true});
    await writeFile(path.join(root,'scripts/site/workbench.css'),':root { color: red; }\r\n');
    await writeFile(path.join(root,'scripts/site/edu-guide.css'),'.edu { padding: 8px; }\r\n');
    const evidence={file:'recording.json',bytes:123,sha256:'historical-recording-hash',source_revision:'old-revision'};
    await writeFile(path.join(site,'learning-assets.json'),JSON.stringify({guide_version:'old-version',files:[evidence,{file:'edu-guide.css',bytes:0,sha256:'old'}]}));
    await writeFile(path.join(site,'recording.json'),'historical engine evidence');
    const first=await prepareDownloadAppearance(root),snapshot=await readFile(path.join(site,'learning-assets.json'),'utf8');
    assert.deepEqual(await prepareDownloadAppearance(root),first);
    assert.equal(await readFile(path.join(site,'learning-assets.json'),'utf8'),snapshot);
    assert.equal(await readFile(path.join(site,'recording.json'),'utf8'),'historical engine evidence');
    const manifest=JSON.parse(snapshot),body=await readFile(path.join(site,'edu-guide.css'));
    assert.equal(manifest.guide_version,'old-version');assert.deepEqual(manifest.files[0],evidence);
    assert.equal(manifest.files.length,2);assert.equal(manifest.files[1].bytes,body.length);
    assert.equal(manifest.files[1].sha256,createHash('sha256').update(body).digest('hex'));
    assert.equal(first.engine_evidence_regenerated,false);assert.ok(!body.includes(13));
  } finally { await rm(root,{recursive:true,force:true}); }
});
