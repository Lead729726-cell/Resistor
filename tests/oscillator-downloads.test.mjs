import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {unzipSync} from 'fflate';

const site='platform/download-site',base='examples/oscillator-lab';
const json=async f=>JSON.parse(await readFile(f,'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');

test('public projects have complete actual engine evidence for the current source',async()=>{
  const report=await json('docs/evidence/oscillator-lab/native-verification.json');
  assert.equal(report.completed,true);assert.equal(report.runs.length,19);
  assert.equal(report.manufacturing_signoff,false);assert.equal(report.docker_used,false);
  for(const [file,hash] of Object.entries(report.source_sha256))assert.equal(sha(await readFile(file)),hash,file);
  for(const run of report.runs){assert.equal(run.execution_status,'completed');assert.equal(run.analysis_result,'pass');assert(run.reference_verification.checks.every(c=>c.pass));}
});

test('all four projects retain editable schematic bundles and original solver data',async()=>{
  const catalog=await json(base+'/catalog.json');assert.equal(catalog.templates.length,4);
  const sums=await json(site+'/oscillator-assets/SHA256SUMS.json');assert.equal(Object.keys(sums).length,22);
  for(const [file,item] of Object.entries(sums)){
    const source=await readFile(file==='app-workflow.webm'?'docs/evidence/oscillator-lab/oscillator-workflow.webm':file==='app-results.png'?'docs/evidence/oscillator-lab/sensor-results.png':path.join(base,file));const published=await readFile(path.join(site,'oscillator-assets',file));
    assert.equal(sha(source),item.sha256,file);assert.equal(sha(published),item.sha256,file);assert.equal(published.length,item.bytes);
    if(file.endsWith('.register.zip'))assert(Object.keys(unzipSync(published)).some(f=>f.endsWith('project.json')));
  }
});

test('guide distinguishes latest source from existing installers and from physical signoff',async()=>{
  const html=await readFile(site+'/oscillator-lab.html','utf8');
  assert.equal((html.match(/data-oscillator-project/g)||[]).length,4);
  assert.match(html,/0\.28 설치 파일에는 이 네 프로젝트가 아직 포함되지 않았습니다/);
  assert.match(html,/canonical" href="https:\/\/resistor\.kr\/tutorial\/oscillators\//);
  assert.match(html,/위상 잡음/);assert.match(html,/제조 승인/);
  const config=await json(site+'/vercel.json');
  assert(config.rewrites.some(r=>r.source==='/tutorial/oscillators/'&&r.destination==='/oscillator-lab.html'));
  assert.match(await readFile(site+'/index.html','utf8'),/href="\/tutorial\/oscillators\/"/);
});

test('new lab does not relabel an old native installer as a new circuit release',async()=>{
  const editions=await json(site+'/edition-downloads.json');
  assert.equal(editions.editions.length,2);
  for(const edition of editions.editions){assert.equal(edition.native_installer.files.length,5);for(const file of edition.native_installer.files)assert.equal(file.version,'0.28.0');}
});
