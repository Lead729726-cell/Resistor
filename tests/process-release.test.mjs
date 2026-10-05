import test from 'node:test';
import assert from 'node:assert/strict';
import { _electron as electron,chromium } from 'playwright';
import { access,mkdtemp,readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

test('packaged cold Windows and rebuilt Linux web execute actual process mesh worker, slices and all-cell exports', {timeout:180000},async()=>{
  const root=process.cwd(),workspace=await mkdtemp(path.join(os.tmpdir(),'register-process-cold-')),errors=[];
  const exercise=async(page,name,desktop)=>{
    page.on('pageerror',error=>errors.push(error.message));let rpc=0;page.on('request',request=>{if(/\/rpc|\/events/.test(new URL(request.url()).pathname))rpc++;});
    await page.getByTestId('viewer-process').click();await page.getByTestId('process-json-input').setInputFiles(path.join(root,'examples/process/step-keyhole.process.json'));
    await page.getByTestId('process-inspected').waitFor({timeout:30000});assert.equal(await page.getByTestId('process-inspected').innerText(),'1296 / 1296');assert.equal(await page.getByTestId('process-min-thickness').innerText(),'20 nm');
    await page.getByTestId('process-voids').getByRole('button',{name:/폐쇄 공극/}).click();assert((await page.getByTestId('process-selected').innerText()).includes('sealed hole'));
    await page.waitForFunction(()=>Number(document.querySelector('[data-testid="process-canvas"]')?.getAttribute('data-section-cells'))>0);
    await page.getByTestId('process-material-3').uncheck();await page.getByTestId('process-heat').check();assert.equal(await page.getByTestId('process-inspected').innerText(),'1296 / 1296');
    await page.screenshot({path:`docs/evidence/${name}-process-keyhole.png`});
    const resultPath=path.join(workspace,`${name}-inspection.json`);
    if(desktop){
      // Electron handles downloads with the native save dialog, outside Playwright's browser download events.
      // Select only the test's temporary destination and inspect Electron's actual completed download.
      await desktop.evaluate(({BrowserWindow},destination)=>{
        globalThis.__registerProcessDownload={state:'pending'};
        BrowserWindow.getAllWindows()[0].webContents.session.once('will-download',(_event,item)=>{
          item.setSavePath(destination);
          item.once('done',(_event,state)=>{globalThis.__registerProcessDownload={state,path:item.getSavePath(),name:item.getFilename()};});
        });
      },resultPath);
      await page.getByTestId('process-export-report').click();
      const saved=await desktop.evaluate(async()=>{
        const until=Date.now()+15000;
        while(globalThis.__registerProcessDownload.state==='pending'&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,100));
        return globalThis.__registerProcessDownload;
      });
      assert.equal(saved.state,'completed');assert.equal(saved.path,resultPath);assert.equal(saved.name,'register-process.inspection.json');
    }else{
      const next=page.waitForEvent('download');await page.getByTestId('process-export-report').click();const file=await next;await file.saveAs(resultPath);
    }
    const report=JSON.parse(await readFile(resultPath,'utf8'));
    assert.equal(report.inspected_cells,1296);assert.equal(report.physical_prediction,false);assert.equal(report.source_kind,'demo');assert.equal(report.voids.filter(v=>v.closed).length,1);assert.match(report.content_sha256,/^[0-9a-f]{64}$/);
    assert.equal(rpc,0);return {cells:report.inspected_cells,closed_voids:1,min_thickness_um:report.min_thickness_um,content_sha256:report.content_sha256,section_cells:Number(await page.getByTestId('process-canvas').getAttribute('data-section-cells')),no_native_requests:true,worker_executed:true};
  };
  const desktop=await electron.launch({executablePath:path.join(root,'release/Register-win32-x64/Register.exe'),args:['--viewer',`--user-data-dir=${path.join(workspace,'profile')}`],env:{...process.env,MOS_WORKSPACE:workspace,PATH:path.dirname(process.execPath)},timeout:60000});
  let windows;
  try{assert.equal(path.resolve(await desktop.evaluate(({app})=>app.getPath('userData'))),path.resolve(workspace,'profile'));const page=await desktop.firstWindow();windows=await exercise(page,'windows',desktop);assert(await page.evaluate(()=>!('require' in window)));await assert.rejects(access(path.join(workspace,'.runtime/worker.json')));}finally{await desktop.close();}
  const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-webgl']});let linux;
  try{const page=await browser.newPage({viewport:{width:1600,height:1000}});await page.goto(`${process.env.REGISTER_CLOUD_TEST_URL||'http://127.0.0.1:18767'}/?mode=viewer`);linux=await exercise(page,'linux');}finally{await browser.close();}
  assert.deepEqual(errors,[]);assert.equal(windows.content_sha256,linux.content_sha256);
  const files=['packages/process/src/model.ts','packages/process/src/inspect.ts','packages/process/src/vtu.ts','packages/process/src/index.ts','packages/ui/src/ProcessPanel.tsx','packages/ui/src/ProcessMeshViewer.tsx','packages/ui/src/process-worker.ts','packages/ui/src/process.css','packages/ui/src/App.tsx','packages/ui/src/StandaloneViewer.tsx','tests/process.test.ts','tests/ui/process.spec.ts','tests/process-release.test.mjs'];
  const hashes=Object.fromEntries(await Promise.all(files.map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')])));
  await writeFile('docs/evidence/process-release.json',JSON.stringify({checked_at:new Date().toISOString(),version:JSON.parse(await readFile('package.json','utf8')).version,windows,linux,cold_desktop_no_worker_session:true,desktop_node_isolated:true,browser_errors:errors,source_sha256:hashes,physical_process_prediction:false},null,2));
});
