// Actual browser and isolated native worker. Navigation must not mutate designs
// or trigger numerical engines. License authority is disposable QA only.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {chromium} from '@playwright/test';
import {startWorker,stopWorker} from '../../scripts/worker.mjs';
import {runtimeConfig,workerRpc} from '../../scripts/runtime.mjs';
import {disposableUiLicense} from './disposable-ui-license.mjs';

process.env.RESISTOR_EDITION='indust';
const root=process.cwd(),out=path.resolve(process.env.RESISTOR_UI_QA_OUTPUT||'docs/evidence/guided-workbench-20261031');
const evidenceSources=['packages/ui/src/App.tsx','packages/ui/src/GuidedPages.tsx','packages/ui/src/TaskChooser.tsx','packages/ui/src/guided-workbench.css','packages/ui/src/NewProject.tsx','packages/ui/src/TestbenchEditor.tsx','packages/ui/src/DesignAssistantWorkbench.tsx','packages/ui/src/AutoDesign.tsx','packages/ui/src/AssistantWorkflow.tsx','packages/ui/src/design-assistant.css','packages/ui/src/SemiconductorStarters.tsx','packages/ui/src/starter-flow.css','packages/ui/src/PdkSetupWizard.tsx','packages/ui/src/pdk-guided.css','packages/ui/src/SchematicEditor.tsx','packages/ui/src/schematic-guided.css','packages/viewer/src/LayoutViewer.tsx','packages/viewer/src/layout-guided.css','tests/integration/guided-workbench.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(evidenceSources.map(async f=>[f,createHash('sha256').update(await readFile(f)).digest('hex')])));
const initialHashes=await hashes();
await mkdir(out,{recursive:true});await mkdir('.runtime/guided-workbench',{recursive:true});
const workspace=await mkdtemp(path.join(root,'.runtime/guided-workbench/native-'));
const free=async()=>{const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;};
const config=await runtimeConfig(workspace);config.url='http://127.0.0.1:'+await free();await writeFile(config.file,JSON.stringify({url:config.url,token:config.token}));
const api=async(method,params={})=>{const r=await workerRpc(config,method,params);assert(r.ok,`${method}: ${r.error?.code}: ${r.error?.message}`);return r.result;};
const poll=async(fn,message='Expected UI state',timeout=30000)=>{const until=Date.now()+timeout;while(!await fn()){assert(Date.now()<until,message);await new Promise(r=>setTimeout(r,100));}};
const report={schema_version:1,edition:'indust',checked_at:new Date().toISOString(),completed:false,paid_calls:0,license:'isolated synthetic QA authority; production settings unchanged',cases:[],browser_errors:[],ui_methods:[]};
const check=(name,ok,details={})=>{assert(ok,name);report.cases.push({name,pass:true,...details});console.log('PASS '+name);};
const mutations=()=>report.ui_methods.filter(m=>/^(?:simulation\.run|analysis\.(?:configure|run|verify)|verification\.run_|extraction\.run_|starter\.create|design\.create_|project\.(?:create|import|save)|schematic\.apply_|layout\.(?:apply_|generate_|import))/.test(m));
const shot=async name=>page.screenshot({path:path.join(out,name+'.png')});
let licenseQa,vite,browser,context,page,worker=false,appOutput='',releasePdk=()=>{};
try{
  licenseQa=await disposableUiLicense(workspace,'indust');
  await startWorker(workspace,{resourcesRoot:root,mode:'native',prepare:false});worker=true;
  const p=await api('design.create_template',{template_id:'rc_lowpass',command_id:randomUUID()});
  const initial=await api('project.open',{project_id:p.id});
  report.project_id=p.id;report.initial_revision=p.revision;
  const port=await free(),url='http://127.0.0.1:'+port+'/eda';
  vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1'],{cwd:root,env:{...process.env,RESISTOR_EDITION:'indust',MOS_WORKSPACE:workspace,REGISTER_DEV_PORT:String(port),RESISTOR_LICENSE_CONFIG:licenseQa.configFile},windowsHide:true,stdio:['ignore','pipe','pipe']});
  const capture=b=>appOutput=(appOutput+b.toString()).slice(-8000);vite.stdout.on('data',capture);vite.stderr.on('data',capture);
  let exited=false;vite.once('exit',()=>{exited=true;});
  await poll(async()=>{if(exited)throw Error('Vite exited: '+appOutput);try{return (await fetch(url,{signal:AbortSignal.timeout(1500)})).ok;}catch{return false;}},'Vite did not serve the real app',60000);
  browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:path.join(workspace,'recording'),size:{width:1440,height:1000}}});
  await context.addInitScript(id=>{localStorage.setItem('mos.last_project',id);if(!localStorage.getItem('register.appearance'))localStorage.setItem('register.appearance',JSON.stringify({version:1,mode:'dark',skin:'graphite'}));},p.id);
  page=await context.newPage();page.on('pageerror',e=>report.browser_errors.push(e.message));
  page.on('request',request=>{if(request.method()==='POST'&&request.url().endsWith('/api/rpc')){try{const body=request.postDataJSON();report.ui_methods.push(body.method);}catch{}}});
  await page.goto(url);await page.getByTestId('app-ready').waitFor({timeout:60000});
  await shot('desktop-workspace');
  // Flow assertions are intentionally tied to visible navigation, not internal
  // React state, and follow below once the shared task surface is available.
  check('Existing project opens in the correct edition',await page.getByTestId('app-ready').getAttribute('data-project-id')===p.id);
  check('Fresh project does not inherit a simulation verdict',initial.runs.length===0);

  const openTool=async(category,id)=>{await page.getByTestId('guided-task-open').click();await page.getByTestId('guided-category-'+category).click();for(let n=0;n<8&&!(await page.getByTestId(id).isVisible());n++)await page.getByRole('button',{name:'다음 도구 →',exact:true}).click();await page.getByTestId(id).click();};
  const close=async()=>{await page.getByTestId('guided-close').click();await page.getByRole('dialog').waitFor({state:'detached'});};
  const next=async()=>page.getByTestId('guided-next').click();
  const back=async()=>page.getByTestId('guided-back').click();
  check('Work canvas starts without permanently open explorer or inspector',await page.locator('.project-sidebar').isHidden()&&await page.locator('.inspector-sidebar').isHidden());
  check('Run executes only inside its review popup',await page.getByTestId('run-simulation').count()===0||await page.getByTestId('run-simulation').isHidden());
  const beforeNavigation=mutations().length;
  await page.getByTestId('schematic-tools-open').click();await page.getByTestId('schematic-tools-analysis').click();
  check('Schematic analysis controls occupy one popup depth',await page.getByTestId('connectivity-mode').isVisible()&&await page.getByTestId('schematic-tools-dialog').getAttribute('data-page')==='analysis');
  await page.getByTestId('schematic-tools-back').click();await shot('desktop-schematic-tools');await page.getByRole('button',{name:'회로도 도구 닫기',exact:true}).click();
  await page.getByTestId('tab-layout2d').click();await page.getByTestId('layout-open-tools').click();await page.getByTestId('layout-draw-box').click();
  await page.getByLabel('그리기 Net',{exact:true}).fill('DRAFT_NOT_APPLIED');await page.getByTestId('layout-popup-back').click();await page.getByTestId('layout-draw-box').click();
  check('Layout draw settings survive going back through the tool popup',await page.getByLabel('그리기 Net',{exact:true}).inputValue()==='DRAFT_NOT_APPLIED');
  await page.getByTestId('layout-start-drawing').click();await page.getByTestId('layout-open-drawing-options').click();
  check('Closing and reopening drawing settings keeps the draft without geometry edits',await page.getByLabel('그리기 Net',{exact:true}).inputValue()==='DRAFT_NOT_APPLIED'&&mutations().length===beforeNavigation);await shot('desktop-layout-drawing');
  await page.getByRole('button',{name:'레이아웃 도구 닫기',exact:true}).click();await page.getByTestId('tab-schematic').click();
  await page.getByTestId('guided-task-open').click();await shot('desktop-task-choice');
  await page.getByTestId('guided-category-project').click();
  await page.getByTestId('guided-parent-back').click();
  check('Parent navigation returns to the task chooser',await page.getByTestId('guided-category-project').isVisible());
  await close();
  check('Closing the popup restores keyboard focus to its trigger',await page.getByTestId('guided-task-open').evaluate(e=>e===document.activeElement));

  await page.locator('.schematic-svg').focus();await page.keyboard.press('Control+Shift+L');
  check('Log shortcut opens the results popup on the actual Logs panel',await page.getByRole('dialog').count()===1&&(await page.locator('.panel-tabs button.active').innerText())==='Logs');await close();
  await openTool('environment','open-shortcuts');
  check('Shortcut help replaces the task popup with a single focus-trapped dialog',await page.getByRole('dialog').count()===1&&await page.getByRole('button',{name:'단축키 안내 닫기',exact:true}).isVisible()&&await page.getByTestId('guided-close').count()===0);
  await page.getByRole('button',{name:'단축키 안내 닫기',exact:true}).click();

  await page.getByTestId('guided-task-open').click();await page.getByTestId('guided-category-project').click();await page.getByRole('button',{name:'새 프로젝트',exact:true}).click();
  await page.getByTestId('project-template-schematic').click();await next();await page.getByTestId('project-name').fill('');
  check('New project cannot advance without a name',await page.getByTestId('guided-next').isDisabled());
  await page.getByTestId('project-name').fill('아직 만들지 않은 새 회로');await back();await next();
  check('New-project name survives going back to choose the starting circuit',await page.getByTestId('project-name').inputValue()==='아직 만들지 않은 새 회로');
  await page.getByTestId('project-name').press('Enter');
  check('Enter advances to review without creating a project',await page.getByTestId('project-create').isVisible()&&mutations().length===beforeNavigation);await close();

  await openTool('project','open-semiconductor-starters');
  await page.getByTestId('starter-family-회로 기초').click();await page.getByTestId('starter-next').click();await page.getByTestId('starter-signal_filter').click();
  check('Starter shows only the current choice depth',await page.getByTestId('semiconductor-starters').getAttribute('data-step')==='design'&&await page.getByLabel('내 반도체 설계 이름').count()===0);
  await page.getByTestId('starter-next').click();
  if(await page.getByTestId('starter-next').isEnabled()){
    await page.getByTestId('starter-next').click();await page.getByLabel('내 반도체 설계 이름').fill('입력 유지 · 단계별 RC');
    await page.getByTestId('starter-next').click();
    check('Create is reserved for the last review page',await page.getByTestId('starter-create').isVisible()&&await page.getByTestId('semiconductor-starters').getAttribute('data-step')==='review');
    await page.getByTestId('starter-back').click();
    check('Starter settings survive backwards navigation',await page.getByLabel('내 반도체 설계 이름').inputValue()==='입력 유지 · 단계별 RC');
    await page.getByTestId('starter-next').click();await shot('desktop-starter-review');
  }else report.starter_unavailable='Native PDK resources unavailable; process advance stays disabled. No later starter assertions claimed.';
  await close();

  // Hold the actual first response so drafting happens before profile discovery
  // completes. This detects the real initial-load overwrite race without a mock.
  let pdkHeld=false;const pdkGate=new Promise(resolve=>{releasePdk=resolve;});
  const pdkRoute=async route=>{const request=route.request();if(request.method()==='POST'&&request.postDataJSON()?.method==='pdk.list_profiles'){const response=await route.fetch();pdkHeld=true;await pdkGate;await route.fulfill({response});}else await route.continue();};
  await page.route('**/api/rpc',pdkRoute);
  await openTool('setup','open-pdk-setup');
  await page.getByTestId('pdk-new-profile').click();await page.getByTestId('pdk-manifest-name').fill('아직 등록하지 않은 QA 공정');
  const identity=await page.getByTestId('pdk-manifest-id').inputValue();
  await poll(async()=>pdkHeld,'PDK discovery response was not intercepted');
  const pdkDelivered=page.waitForResponse(r=>r.url().endsWith('/api/rpc')&&r.request().method()==='POST'&&r.request().postDataJSON()?.method==='pdk.list_profiles');releasePdk();await pdkDelivered;
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.unroute('**/api/rpc',pdkRoute);
  check('Late native PDK discovery does not overwrite a draft created while loading',await page.getByTestId('pdk-manifest-name').inputValue()==='아직 등록하지 않은 QA 공정'&&await page.getByTestId('pdk-manifest-id').inputValue()===identity);
  await page.getByTestId('pdk-manifest-next').click();await page.getByTestId('pdk-manifest-back').click();
  check('Nested PDK form keeps unregistered identity when returning',await page.getByTestId('pdk-manifest-name').inputValue()==='아직 등록하지 않은 QA 공정'&&await page.getByTestId('pdk-manifest-id').inputValue()===identity);
  check('PDK identity page has no more than four visible data fields',await page.locator('[data-testid="pdk-setup-wizard"] input:visible').count()<=4);
  await shot('desktop-pdk-depth');await close();

  await page.getByTestId('guided-run-open').click();await next();await page.getByTestId('open-testbench').click();
  await page.getByTestId('testbench-analysis').selectOption('tran');await next();
  await page.getByTestId('testbench-temperature_C').fill('31');await next();
  const originalDuration=await page.getByTestId('testbench-duration_s').inputValue();
  await page.getByTestId('testbench-duration_s').fill('80');await back();
  check('Testbench values survive backwards navigation',await page.getByTestId('testbench-temperature_C').inputValue()==='31');
  await next();check('Testbench time unit and numeric draft survive forward navigation',await page.getByTestId('testbench-duration_s').inputValue()==='80');
  await page.getByTestId('testbench-step_s').fill('-1');
  check('Invalid time step cannot advance to review',await page.getByTestId('guided-next').isDisabled());
  await page.getByTestId('testbench-step_s').fill(String(Number(initial.testbench.step_s)/1e-12));
  await next();await shot('desktop-testbench-review');
  check('Review requires explicit condition save and does not run the engine',await page.getByTestId('testbench-apply').isVisible()&&mutations().length===beforeNavigation);
  await page.getByTestId('guided-parent-back').click();await page.getByTestId('open-testbench').click();
  check('Returning through the parent setup preserves unapplied testbench values and review step',await page.getByTestId('testbench-apply').isVisible()&&await page.getByTestId('testbench-temperature_C').inputValue()==='31'&&await page.getByTestId('testbench-duration_s').inputValue()==='80');
  await close();
  const unchanged=await api('project.open',{project_id:p.id});
  check('Pure navigation preserves native revision, circuit and run history',unchanged.revision===initial.revision&&JSON.stringify(unchanged.schematic)===JSON.stringify(initial.schematic)&&unchanged.runs.length===0&&unchanged.testbench.duration_s===initial.testbench.duration_s,{initial_duration_ns:originalDuration});

  await page.getByTestId('tab-schematic').click();
  const resistor=initial.schematic.devices.find(d=>d.kind==='resistor');assert(resistor);
  await page.getByRole('button',{name:resistor.name+' resistor',exact:true}).click();await page.getByTestId('toggle-inspector').click();
  const parameter=page.getByLabel(resistor.name+' value',{exact:true});await parameter.fill(String(Number(resistor.parameters.value)+321));
  await close();await page.getByTestId('toggle-inspector').click();
  check('Unapplied device parameter survives closing and reopening its popup',await parameter.inputValue()===String(Number(resistor.parameters.value)+321));
  await close();

  await page.getByTestId('guided-run-open').click();
  await next();await back();await next();
  // The real execution button appears only on the last step; keep moving
  // through review pages without changing any declared numerical conditions.
  for(let n=0;n<6&&!(await page.getByTestId('run-simulation').isVisible());n++)await next();
  check('Run review navigation did not mutate or solve the project',mutations().length===beforeNavigation);
  await shot('desktop-run-review');
  await page.getByTestId('run-simulation').click();
  let current;
  await poll(async()=>{current=await api('project.open',{project_id:p.id});return current.runs.some(r=>r.kind==='simulation'&&!['queued','running'].includes(r.execution_status));},'Native RC simulation did not finish',120000);
  const run=current.runs.filter(r=>r.kind==='simulation').at(-1);assert.equal(run.execution_status,'completed');assert(run.waveforms?.length);
  check('Final execution dispatches one actual native simulation',report.ui_methods.filter(m=>m==='simulation.run').length===1&&run.tool==='ngspice');
  report.actual_run={id:run.id,project_id:run.project_id,revision:run.revision,tool:run.tool,execution_status:run.execution_status,analysis_result:run.analysis_result,samples:run.measurements?.samples};
  if(await page.getByTestId('guided-close').isVisible())await close();
  await page.getByTestId('toggle-results').click();await shot('desktop-actual-result');await close();

  await page.setViewportSize({width:390,height:844});await page.getByTestId('guided-task-open').click();await shot('mobile-task-choice');
  check('Mobile popup and document stay inside the viewport',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)&&await page.getByRole('dialog').evaluate(el=>el.getBoundingClientRect().right<=innerWidth&&el.getBoundingClientRect().left>=0));
  await page.keyboard.press('Escape');
  await poll(async()=>await page.getByRole('dialog').count()===0,'Escape did not close top-level chooser');
  check('Escape restores access to the canvas without a design edit',(await api('project.open',{project_id:p.id})).revision===initial.revision);
  await page.setViewportSize({width:1440,height:1000});
  await page.getByTestId('tab-schematic').click();await page.getByTestId('schematic-place-open').click();await page.getByTestId('schematic-place-resistor').click();await page.getByLabel('배치 값 저항 (Ω)',{exact:true}).fill('4.7k');
  await page.getByTestId('schematic-tools-back').click();await page.getByRole('button',{name:'회로도 도구 닫기',exact:true}).click();await page.getByTestId('schematic-place-open').click();await page.getByTestId('schematic-place-resistor').click();
  check('Same-kind placement re-selection keeps the displayed engineering-unit draft',await page.getByLabel('배치 값 저항 (Ω)',{exact:true}).inputValue()==='4.7k');
  await page.getByRole('button',{name:'이 값으로 캔버스에 배치 →',exact:true}).click();await page.locator('.schematic-svg').click({position:{x:120,y:100}});
  let edited;await poll(async()=>{edited=await api('project.open',{project_id:p.id});return edited.revision>initial.revision;},'Explicit resistor placement was not saved');
  const placed=edited.schematic.devices.find(d=>!initial.schematic.devices.some(old=>old.id===d.id));
  check('Explicit canvas placement saves the same 4.7k value shown in the popup',placed?.kind==='resistor'&&placed.parameters.value===4700);
  check('Editing after the measured run marks that evidence stale',(await api('job.status',{run_id:run.id})).freshness==='stale');report.final_revision=edited.revision;
  await page.evaluate(()=>localStorage.setItem('register.appearance',JSON.stringify({version:1,mode:'light',skin:'graphite'})));await page.reload();await page.getByTestId('app-ready').waitFor();
  await page.getByTestId('guided-task-open').click();await shot('desktop-light-choice');
  check('Existing light theme remains available',await page.locator('html').getAttribute('data-theme')==='light');
  await close();

  check('Actual workbench finishes without browser errors',report.browser_errors.length===0);
  assert.deepEqual(await hashes(),initialHashes,'UI source changed during qualification; rerun after edits stop.');
  report.completed=true;
}catch(e){report.error=e.message;if(page){await shot('failure').catch(()=>{});report.failure_body=await page.locator('body').innerText().catch(()=>'');}throw e;}
finally{
  releasePdk();
  if(context){const video=page?.video();await context.close();if(video)await video.saveAs(path.join(out,'actual-guided-workflow.webm'));}if(browser)await browser.close();if(vite)vite.kill();if(worker)await stopWorker(workspace);if(licenseQa)await licenseQa.close();
  report.source_sha256=await hashes();
  await writeFile(path.join(out,'ui-verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({completed:report.completed,cases:report.cases.length,error:report.error}));
}
