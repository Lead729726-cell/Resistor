import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import os from 'node:os';
import {_electron as electron,chromium} from 'playwright';
const exec=promisify(execFile);
test('cold Windows, isolated Linux browser and both actual Node backends execute the same 3D process recipe',{timeout:240000},async()=>{
  const root=process.cwd(),temp=await mkdtemp(path.join(os.tmpdir(),'register-flow-release-')),exe=path.join(root,'release/Register-win32-x64/Register.exe'),errors=[];
  const exercise=async(page,name)=>{
    let native=0;page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/\/rpc|\/events/.test(new URL(r.url()).pathname))native++;});
    await page.getByTestId('viewer-process').click();await page.getByTestId('process-recipe-details').locator('summary').first().click();await page.getByTestId('recipe-json-input').setInputFiles(path.join(root,'examples/process/hole-flow.recipe.json'));await page.getByTestId('recipe-run').click();
    await page.getByTestId('process-timeline').waitFor({timeout:45000});await page.getByTestId('process-recipe-details').locator('summary').first().click();await page.getByTestId('process-stage-1').click();
    await page.waitForFunction(()=>document.querySelector('[data-testid="process-inspected"]')?.textContent==='13824 / 13824');
    assert((await page.getByTestId('process-voids').innerText()).includes('폐쇄 공극'));await page.getByTestId('process-voids').getByRole('button',{name:/폐쇄 공극/}).first().click();await page.getByTestId('process-material-2').uncheck();
    await page.waitForFunction(()=>Number(document.querySelector('[data-testid="process-canvas"]')?.getAttribute('data-section-cells'))>0);await page.getByTestId('process-panel').evaluate(p=>{p.scrollTop=p.scrollHeight;});await page.screenshot({path:`docs/evidence/${name}-process-flow.png`});
    assert.equal(native,0);return {actual_run_worker:true,actual_tetra_cells:13824,closed_void:true,actual_XYZ_slice:true,no_native_requests:true};
  };
  const desktop=await electron.launch({executablePath:exe,args:['--viewer',`--user-data-dir=${path.join(temp,'profile')}`],env:{...process.env,PATH:path.dirname(process.execPath),MOS_WORKSPACE:temp},timeout:60000});let windows,linux;
  try{windows=await exercise(await desktop.firstWindow(),'windows');assert(await (await desktop.firstWindow()).evaluate(()=>!('require' in window)));await assert.rejects(access(path.join(temp,'.runtime/worker.json')));}finally{await desktop.close();}
  const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-webgl']});try{const page=await browser.newPage({viewport:{width:1600,height:1000}});await page.goto(`${process.env.REGISTER_CLOUD_TEST_URL||'http://127.0.0.1:18767'}/?mode=viewer`);linux=await exercise(page,'linux');}finally{await browser.close();}
  const win=await exec(exe,[path.join(root,'release/Register-win32-x64/resources/app/scripts/process-engine.mjs'),'--recipe',path.join(root,'examples/process/hole-flow.recipe.json'),'--out',path.join(temp,'runs')],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1',PATH:path.dirname(process.execPath)},timeout:90000,maxBuffer:1024*1024});
  const windowsCli=JSON.parse(win.stdout.trim()),windowsRun=JSON.parse(await readFile(path.join(windowsCli.directory,'run.json'),'utf8')),receipt=JSON.parse(await readFile(path.join(windowsCli.directory,'receipt.json'),'utf8'));
  assert.equal(windowsRun.stages.length,5);assert.equal(windowsRun.calibrated_physical_prediction,false);assert.equal(windowsRun.stages[1].closed_voids,1);assert(windowsRun.stages[3].removed_volume_um3>0);assert(windowsRun.stages[4].removed_volume_um3>0);
  for(const file of receipt.files){const bytes=await readFile(path.join(windowsCli.directory,file.name));assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);assert.equal(bytes.length,file.bytes);}assert.equal(receipt.files.length,21);
  const remote=await exec('docker',['exec','register-cloud-hub-1','node','/workspace/dist/process-engine.mjs','--recipe','/workspace/examples/process/hole-flow.recipe.json','--out','/tmp/register-process-release'],{timeout:90000,maxBuffer:1024*1024});const linuxCli=JSON.parse(remote.stdout.trim());
  const fetched=await exec('docker',['exec','register-cloud-hub-1','cat',`${linuxCli.directory}/run.json`],{timeout:10000,maxBuffer:4*1024*1024});const linuxRun=JSON.parse(fetched.stdout);
  assert.deepEqual(windowsRun.stages,linuxRun.stages);assert.equal(windowsRun.recipe_sha256,linuxRun.recipe_sha256);assert.deepEqual(errors,[]);
  const sourceFiles=['packages/process/src/recipe.ts','packages/process/src/export.ts','packages/ui/src/ProcessRecipeEditor.tsx','packages/ui/src/ProcessPanel.tsx','packages/ui/src/process-run-worker.ts','packages/ui/src/process.css','scripts/process-run.ts','scripts/process-engine-build.mjs','scripts/package.mjs','tests/ui/process-recipe.spec.ts','tests/process-flow-release.test.mjs'];
  const hashes=Object.fromEntries(await Promise.all(sourceFiles.map(async f=>[f,createHash('sha256').update(await readFile(f)).digest('hex')])));
  await writeFile('docs/evidence/process-flow-release.json',JSON.stringify({checked_at:new Date().toISOString(),version:JSON.parse(await readFile('package.json','utf8')).version,windows,linux,windows_cli:{stages:5,recipe_sha256:windowsRun.recipe_sha256,files_hash_verified:receipt.files.length,node_runtime:'packaged Electron',cold_no_Docker:true},linux_cli:{stages:5,recipe_sha256:linuxRun.recipe_sha256,actual_Node_backend:true},identical_all_stage_occupancy_and_metrics:true,browser_errors:errors,kinematic_prediction:true,calibrated_physical_prediction:false,foundry_signoff:false,source_sha256:hashes},null,2));
});
