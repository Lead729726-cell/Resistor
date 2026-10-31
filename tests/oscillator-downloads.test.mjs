import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {unzipSync} from 'fflate';

const site='platform/download-site',base='examples/oscillator-lab';
const json=async f=>JSON.parse(await readFile(f,'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');

test('public projects retain original evidence and current-source native regression',async()=>{
  const report=await json('docs/evidence/oscillator-lab/current-source-regression.json');
  const baseline=report.published_asset_baseline;
  assert.equal(baseline.path,'docs/evidence/oscillator-lab/native-verification.json');assert.equal(baseline.regenerated,false);
  assert.equal(sha(await readFile(baseline.path)),baseline.sha256);
  for(const checked of [report,await json(baseline.path)]){
    assert.equal(checked.completed,true);assert.equal(checked.runs.length,19);
    assert.equal(checked.manufacturing_signoff,false);assert.equal(checked.docker_used,false);
    for(const run of checked.runs){assert.equal(run.execution_status,'completed');assert.equal(run.analysis_result,'pass');assert(run.reference_verification.checks.every(c=>c.pass));}
  }
  for(const [file,hash] of Object.entries(report.source_sha256))assert.equal(sha(await readFile(file)),hash,file);
  for(const template of (await json(base+'/catalog.json')).templates){
    const check=report.checks.find(c=>c.name===template.id+' current netlist equals published DUT');
    assert.equal(check?.passed,true);assert.equal(check.sha256,sha(await readFile(path.join(base,template.id,'core.spice'))));
  }
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

test('native installer versions and bytes match actual publication evidence while historical receipts remain intact',async()=>{
  const editions=await json(site+'/edition-downloads.json'),published=await json('docs/evidence/edition-installers/public-verification.json'),historical=await json('docs/evidence/edition-installers/0.28.0/public-verification.json');
  assert.equal(editions.editions.length,2);assert.equal(published.completed,true);assert.equal(published.manufacturing_signoff,false);
  for(const edition of editions.editions){assert.equal(edition.native_installer.files.length,5);for(const file of edition.native_installer.files){
    const matches=published.installers.filter(r=>r.edition===edition.edition&&r.target===file.target);assert.equal(matches.length,1);
    const receipt=matches[0];for(const key of ['bytes','sha256','receipt_sha256'])assert.equal(file[key],receipt[key]);
    assert.equal(file.name,receipt.file);assert(file.name.includes('-'+file.version+'-'));
    assert.equal(receipt.github_computed_digest_verified,true);assert.equal(receipt.installed_app_verification,true);assert.equal(receipt.public_status,200);
  }}
  assert.equal(historical.completed,true);assert.equal(historical.installers.length,10);for(const receipt of historical.installers)assert(receipt.file.includes('-0.28.0-'));
});
