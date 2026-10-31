// Actual app + isolated native engine. Capture fixture is explicitly a synthetic
// canvas, testing MediaRecorder bytes/cleanup, not OS chooser or microphone QA.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {createServer as httpServer} from 'node:http';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {chromium} from '@playwright/test';
import {startWorker,stopWorker} from '../../scripts/worker.mjs';
import {runtimeConfig,workerRpc} from '../../scripts/runtime.mjs';
import {disposableUiLicense} from './disposable-ui-license.mjs';
const edition=process.env.LECTURE_QA_EDITION==='edu'?'edu':'indust';process.env.RESISTOR_EDITION=edition;
const root=process.cwd(),out=path.join(process.env.RESISTOR_UI_QA_OUTPUT||path.join(root,'docs/evidence/lecture-studio'),edition);await mkdir(out,{recursive:true});await mkdir('.runtime/lecture-qa',{recursive:true});
const workspace=await mkdtemp(path.join(root,'.runtime/lecture-qa/'+edition+'-'));
const free=async()=>{const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const port=s.address().port;await new Promise(r=>s.close(r));return port;};
const config=await runtimeConfig(workspace);config.url='http://127.0.0.1:'+await free();await writeFile(config.file,JSON.stringify({url:config.url,token:config.token}));
const api=async(method,params={})=>{const r=await workerRpc(config,method,params);assert(r.ok,JSON.stringify(r.error));return r.result;};
const report={schema_version:1,edition,checked_at:new Date().toISOString(),cases:[],browser_errors:[],capture_source:'explicit synthetic canvas fixture; OS picker/microphone hardware not tested',paid_calls:0};
const check=(name,ok,details={})=>{assert(ok,name);report.cases.push({name,pass:true,...details});console.log('PASS '+name);};
const openLecture=async()=>{await page.getByTestId('guided-task-open').click();await page.getByTestId('guided-category-environment').click();await page.getByTestId('open-lecture-studio').click();};
const poll=async(fn,timeout=30000)=>{const until=Date.now()+timeout;while(!await fn()){assert(Date.now()<until,'UI/native state timed out');await new Promise(r=>setTimeout(r,100));}};
let vite,staticServer,browser,context,page,worker=false,licenseQa;
try{
  licenseQa=await disposableUiLicense(workspace,edition);report.licensing='isolated synthetic QA authority; production configuration unchanged';
  await startWorker(workspace,{resourcesRoot:root,prepare:false});worker=true;
  const original=await api('project.create',{example:'layout',name:'[강의 QA] 원본 보존'});
  const before=await api('project.open',{project_id:original.id});
  // Production builds recognize only the legacy loopback port as a local web
  // workbench. Bind exclusively; never stop another process using that port.
  const port=edition==='edu'?5173:await free(),url='http://127.0.0.1:'+port+'/eda';
  let output='',failure='';
  if(edition==='edu'){
    // Serve the actual Edu build against only this owned random-port engine.
    // Never take over the user's dedicated Edu worker on port 18775.
    const dist=path.join(root,'dist-edu');await readFile(path.join(dist,'product-context.json')).then(b=>assert.equal(JSON.parse(b).product_id,'resistor.edu'));
    staticServer=httpServer(async(req,res)=>{try{
      if(req.url==='/api/rpc'&&req.method==='POST'){let body='';for await(const b of req)body+=b;const p=JSON.parse(body);let result;if(p.method.startsWith('license.'))result={ok:true,result:await licenseQa.client.rpc(p.method,p.params||{})};else{await licenseQa.client.assertActive();result=await workerRpc(config,p.method,p.params||{});}res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result));return;}
      const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(dist,pathname==='/eda'?'index.html':'.'+pathname);if(!file.startsWith(dist+path.sep)){res.writeHead(403).end();return;}
      const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.wasm':'application/wasm'};res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(await readFile(file));
    }catch{if(!res.headersSent)res.writeHead(404);res.end();}});await new Promise(r=>staticServer.listen(port,'127.0.0.1',r));
  }else{
    vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1'],{cwd:root,env:{...process.env,RESISTOR_EDITION:edition,MOS_WORKSPACE:workspace,REGISTER_DEV_PORT:String(port),RESISTOR_LICENSE_CONFIG:licenseQa.configFile},windowsHide:true,stdio:['ignore','pipe','pipe']});
    const capture=b=>output=(output+b.toString()).slice(-6000);vite.stdout.on('data',capture);vite.stderr.on('data',capture);vite.once('error',e=>failure=e.message);vite.once('exit',code=>failure='Vite exited '+code);
  }
  await poll(async()=>{if(failure)throw Error(failure+'\n'+output);try{return (await fetch(url)).ok;}catch{return false;}},60000);
  browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  context=await browser.newContext({viewport:{width:1920,height:1080},recordVideo:{dir:path.join(workspace,'recording'),size:{width:1920,height:1080}}});page=await context.newPage();page.on('pageerror',e=>report.browser_errors.push(e.message));
  await page.goto(url);await page.evaluate(({id,edition})=>{localStorage.setItem('mos.last_project'+(edition==='edu'?'.edu':''),id);localStorage.setItem('register.appearance',JSON.stringify({version:1,mode:'dark',skin:'graphite'}));}, {id:original.id,edition});await page.reload();await page.getByTestId('app-ready').waitFor({timeout:60000});
  if(edition==='edu')await page.keyboard.press('Escape');
  await page.keyboard.press('Control+Shift+F9');await page.getByTestId('lecture-studio').waitFor();
  check('Studio opens through the documented shortcut in the correct edition',(await page.getByTestId('lecture-studio').innerText()).includes(edition==='edu'?'Resistor Edu':'Resistor Indust'));
  await page.screenshot({path:path.join(out,'studio-dark-1080p.png')});
  await page.getByLabel('내 강의 메모',{exact:true}).fill('강사 전용 <script>실행하지 마세요</script>');
  const popupPromise=page.waitForEvent('popup');await page.getByTestId('lecture-notes-window').click();const notes=await popupPromise;await notes.waitForLoadState();
  check('Presenter notes open separately as text without executing user markup',(await notes.locator('pre').innerText()).includes('<script>실행하지 마세요</script>')&&await notes.locator('script').count()===0);
  await notes.close();await page.bringToFront();
  let downloadPromise=page.waitForEvent('download');await page.getByTestId('lecture-handout').click();let file=await downloadPromise;await file.saveAs(path.join(out,'lecture-handout.md'));
  check('Instructor handout contains actions, notes and recording setup',(await readFile(path.join(out,'lecture-handout.md'),'utf8')).includes('캔버스/출력 1920×1080'));
  await page.getByTestId('lecture-create-demo').click();await poll(async()=>await page.getByTestId('lecture-project').innerText().then(t=>t.includes('[강의] 첫 강의')));
  const id=await page.getByTestId('app-ready').getAttribute('data-project-id'),rc=await api('project.open',{project_id:id});
  check('New RC lecture demo uses the actual template and preserves original project',id!==original.id&&!!rc.design_template&&JSON.stringify(await api('project.open',{project_id:original.id}))===JSON.stringify(before));
  const revision=rc.revision;
  const originalPanels=await Promise.all(['.project-sidebar','.inspector-sidebar','.results-panel'].map(s=>page.locator(s).isVisible()));
  await page.getByLabel('강의용 글자 크게',{exact:false}).check();await page.getByTestId('lecture-present').click();
  check('Lecture focus hides side panels and retains visible project/revision',await page.locator('.project-sidebar').isHidden()&&await page.locator('.inspector-sidebar').isHidden()&&await page.locator('.results-panel').isHidden()&&await page.locator('.project-breadcrumb').isVisible()&&await page.locator('.view-context').innerText().then(t=>t.includes('revision '+revision)));
  await page.screenshot({path:path.join(out,'lecture-workspace-1080p.png')});
  await page.getByLabel('다음 강의 단계',{exact:true}).click();await page.getByLabel('다음 강의 단계',{exact:true}).click();
  check('Step navigation changes workspace without running a simulation or editing revision',(await api('project.open',{project_id:id})).revision===revision&&(await api('project.open',{project_id:id})).runs.length===0&&await page.getByTestId('tab-simulation').getAttribute('aria-selected')==='true');
  await page.keyboard.press('F8');check('F8 restores the original panel visibility',JSON.stringify(await Promise.all(['.project-sidebar','.inspector-sidebar','.results-panel'].map(s=>page.locator(s).isVisible())))===JSON.stringify(originalPanels));
  await openLecture();
  await page.evaluate(()=>{Object.defineProperty(navigator.mediaDevices,'getDisplayMedia',{configurable:true,value:async()=>{throw new DOMException('fixture denied','NotAllowedError');}});});
  await page.getByTestId('lecture-record').click();await page.getByTestId('lecture-error').waitFor();
  check('Denied chooser returns to idle without claiming recording',(await page.getByTestId('lecture-capture-state').innerText()).includes('대기')&&(await page.getByTestId('lecture-error').innerText()).includes('녹화를 시작하지 않았습니다'));
  await page.evaluate(()=>{
    window.__lectureRecorderEvents=[];const NativeRecorder=window.MediaRecorder;window.MediaRecorder=class extends NativeRecorder{constructor(...args){super(...args);for(const name of ['start','stop','error','dataavailable'])this.addEventListener(name,e=>window.__lectureRecorderEvents.push({name,bytes:e.data?.size,error:e.error?.message,visible:document.visibilityState}));}};
    const canvas=document.createElement('canvas');canvas.width=1920;canvas.height=1080;canvas.style.cssText='position:fixed;bottom:0;right:0;width:192px;height:108px;z-index:9999;pointer-events:none';document.body.append(canvas);window.__lectureCanvas=canvas;const ctx=canvas.getContext('2d');ctx.fillStyle='#20252a';ctx.fillRect(0,0,1920,1080);ctx.fillStyle='#ffffff';ctx.font='32px sans-serif';ctx.fillText('Synthetic capture fixture · not OS screen recording',70,90);
    const stream=canvas.captureStream(30);window.__lectureCaptureTracks=stream.getTracks();window.__lectureCaptureTimer=setInterval(()=>{ctx.fillStyle='#20252a';ctx.fillRect(70,130,500,80);ctx.fillStyle='#ffffff';ctx.fillText(String(performance.now()),70,180);},33);
    Object.defineProperty(navigator.mediaDevices,'getDisplayMedia',{configurable:true,value:async()=>stream});
  });
  await page.getByTestId('lecture-record').click();await poll(async()=>await page.getByTestId('lecture-capture-state').innerText().then(t=>t.includes('실제 녹화 중')));
  const captureOverwriteBlocked=await page.getByTestId('lecture-record').isDisabled();await page.getByRole('button',{name:'작업 화면으로',exact:true}).click();await page.getByTestId('guided-task-open').click();await page.getByTestId('guided-category-environment').click();check('Active recording blocks viewer navigation and new capture overwrite',await page.getByTestId('open-standalone-viewer').isDisabled()&&captureOverwriteBlocked);await page.getByTestId('guided-close').click();await page.getByLabel('다음 강의 단계',{exact:true}).click();
  await page.waitForTimeout(2300);await page.getByTestId('lecture-stop').click();await openLecture();await page.getByTestId('lecture-recording').waitFor({timeout:10000});
  check('Real MediaRecorder encodes the fixture, reports actual dimensions and releases tracks',(await page.getByTestId('lecture-recording').innerText()).includes('1920×1080')&&await page.evaluate(()=>window.__lectureCaptureTracks.every(t=>t.readyState==='ended')));
  const video=page.locator('.lecture-recording video');await video.evaluate(async v=>{await v.play();});await poll(()=>video.evaluate(v=>v.videoWidth===1920&&v.videoHeight===1080&&v.currentTime>0));
  check('Encoded fixture preview actually decodes and plays',true);
  downloadPromise=page.waitForEvent('download');await page.getByTestId('lecture-save-video').click();file=await downloadPromise;await file.saveAs(path.join(out,'recorder-fixture.webm'));
  check('Video bytes download locally without an upload',(await readFile(path.join(out,'recorder-fixture.webm'))).length>1000);
  downloadPromise=page.waitForEvent('download');await page.getByTestId('lecture-save-session').click();file=await downloadPromise;await file.saveAs(path.join(out,'lecture-session.json'));const session=JSON.parse(await readFile(path.join(out,'lecture-session.json'),'utf8'));
  check('Session export retains project revision, actual capture settings and chapter order',session.product_id==='resistor.'+edition&&session.project.id===id&&session.project.revision===revision&&session.recording.video.width===1920&&session.chapters.length===2&&session.chapters[0].seconds===0&&session.chapters[1].seconds>=0&&session.runs.length===0&&session.lecture_progress_is_engine_verification===false);
  downloadPromise=page.waitForEvent('download');await page.getByTestId('lecture-save-chapters').click();file=await downloadPromise;await file.saveAs(path.join(out,'chapters.txt'));check('Recorded chapter file starts at zero',(await readFile(path.join(out,'chapters.txt'),'utf8')).startsWith('00:00:00 '));
  await page.getByRole('button',{name:'내려받은 영상 비우기',exact:true}).click();check('Explicit clear permits a new take and leaves engine results untouched',await page.getByTestId('lecture-record').isEnabled()&&(await api('project.open',{project_id:id})).runs.length===0);
  await page.getByTestId('lecture-plan').selectOption('layout');await page.getByTestId('lecture-create-demo').click();await poll(async()=>await page.getByTestId('lecture-project').innerText().then(t=>t.includes('레이아웃 직접')));
  const layoutId=await page.getByTestId('app-ready').getAttribute('data-project-id');check('Layout lecture creates a separate actual editable project',layoutId!==id&&(await api('project.open',{project_id:layoutId})).example==='layout');
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'studio-mobile.png')});
  check('Mobile studio keeps all controls inside the viewport',await page.getByTestId('lecture-studio').evaluate(el=>el.scrollWidth<=el.clientWidth+1)&&await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.setViewportSize({width:1920,height:1080});await page.getByRole('button',{name:'강의 스튜디오 닫기',exact:true}).click();
  await page.evaluate(()=>localStorage.setItem('register.appearance',JSON.stringify({version:1,mode:'light',skin:'graphite'})));await page.reload();await page.getByTestId('app-ready').waitFor();if(edition==='edu')await page.keyboard.press('Escape');await openLecture();
  check('Edition-scoped lecture plan, notes and large text survive reload',(await page.getByTestId('lecture-plan').inputValue())==='layout'&&(await page.getByLabel('내 강의 메모',{exact:true}).inputValue()).includes('강사 전용')&&await page.locator('.app-shell').getAttribute('data-lecture-large')==='true');
  await page.screenshot({path:path.join(out,'studio-light-1080p.png')});check('Dark/light workspaces finish without browser errors',report.browser_errors.length===0);report.completed=true;
}catch(e){report.completed=false;report.error=e.message;if(page){report.fixture_events=await page.evaluate(()=>({events:window.__lectureRecorderEvents,tracks:window.__lectureCaptureTracks?.map(t=>({state:t.readyState,settings:t.getSettings()})),visible:document.visibilityState})).catch(()=>null);await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});report.body=await page.locator('body').innerText().catch(()=>'');}throw e;}
finally{
  if(context){const video=page?.video();await context.close();if(video)await video.saveAs(path.join(out,'actual-app-workflow.webm'));}if(browser)await browser.close();if(vite)vite.kill();if(staticServer)await new Promise(r=>staticServer.close(r));if(worker)await stopWorker(workspace);if(licenseQa)await licenseQa.close();
  report.source_sha256=Object.fromEntries(await Promise.all(['packages/ui/src/LectureStudio.tsx','packages/ui/src/lecture-model.ts','packages/ui/src/lecture-recorder.ts','packages/ui/src/App.tsx'].map(async f=>[f,createHash('sha256').update(await readFile(f)).digest('hex')])));await writeFile(path.join(out,'ui-verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({completed:report.completed,cases:report.cases.length,error:report.error}));
}
