// Real browser + disposable native workspace. This suite qualifies navigation,
// draft retention, and explicit mutation boundaries, not electrical signoff.
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
const root=process.cwd(),out=path.resolve(process.env.RESISTOR_UI_QA_OUTPUT||'docs/evidence/guided-advanced-20261031');
const evidenceSources=['packages/ui/src/App.tsx','packages/ui/src/GuidedPages.tsx','packages/ui/src/TaskChooser.tsx','packages/ui/src/guided-workbench.css','packages/ui/src/HardwareWorkbench.tsx','packages/ui/src/hardware-guided.css','packages/ui/src/IntegratedTools.tsx','packages/ui/src/integrated-tools.css','packages/ui/src/integrated-guided.css','packages/ui/src/ChipEnvelope.tsx','tests/integration/guided-advanced.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(evidenceSources.map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')])));
const initialHashes=await hashes();
await mkdir(out,{recursive:true});await mkdir('.runtime/guided-advanced',{recursive:true});
const workspace=await mkdtemp(path.join(root,'.runtime/guided-advanced/native-'));
const free=async()=>{const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;};
const config=await runtimeConfig(workspace);config.url='http://127.0.0.1:'+await free();await writeFile(config.file,JSON.stringify({url:config.url,token:config.token}));
const api=async(method,params={})=>{const response=await workerRpc(config,method,params);assert(response.ok,`${method}: ${response.error?.code}: ${response.error?.message}`);return response.result;};
const poll=async(fn,message,timeout=30000)=>{const until=Date.now()+timeout;while(!await fn()){assert(Date.now()<until,message);await new Promise(resolve=>setTimeout(resolve,100));}};
const report={schema_version:1,edition:'indust',checked_at:new Date().toISOString(),completed:false,paid_calls:0,scope:'Actual UI navigation and native project immutability; no simulation or manufacturing verdict',license:'isolated synthetic QA authority; production settings unchanged',cases:[],browser_errors:[],ui_methods:[]};
const check=(name,ok,details={})=>{assert(ok,name);report.cases.push({name,pass:true,...details});console.log('PASS '+name);};
const mutations=()=>report.ui_methods.filter(method=>/^(?:simulation\.run|analysis\.(?:configure|run|verify)|verification\.run_|extraction\.run_|starter\.create|design\.(?:create_|route_apply|floorplan_apply)|project\.(?:create|import|save)|schematic\.apply_|layout\.(?:apply_|generate_|import)|hdl\.(?:create|save|run|apply|new_assembly|analog_test)|pvt\.(?:create|start|cancel))/.test(method));
const shot=async name=>page.screenshot({path:path.join(out,name+'.png')});
let licenseQa,vite,browser,context,page,worker=false,appOutput='';
try{
  licenseQa=await disposableUiLicense(workspace,'indust');
  await startWorker(workspace,{resourcesRoot:root,mode:'native',prepare:false});worker=true;
  const project=await api('design.create_template',{template_id:'rc_lowpass',command_id:randomUUID()});
  const initial=await api('project.open',{project_id:project.id});report.project_id=project.id;report.initial_revision=initial.revision;
  const port=await free(),url='http://127.0.0.1:'+port+'/eda';
  vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1'],{cwd:root,env:{...process.env,RESISTOR_EDITION:'indust',MOS_WORKSPACE:workspace,REGISTER_DEV_PORT:String(port),RESISTOR_LICENSE_CONFIG:licenseQa.configFile},windowsHide:true,stdio:['ignore','pipe','pipe']});
  const capture=data=>appOutput=(appOutput+data.toString()).slice(-8000);vite.stdout.on('data',capture);vite.stderr.on('data',capture);let exited=false;vite.once('exit',()=>{exited=true;});
  await poll(async()=>{if(exited)throw Error('Vite exited: '+appOutput);try{return (await fetch(url,{signal:AbortSignal.timeout(1500)})).ok;}catch{return false;}},'Vite did not serve the app',60000);
  browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:path.join(workspace,'recording'),size:{width:1440,height:1000}}});
  await context.addInitScript(id=>{localStorage.setItem('mos.last_project',id);if(!localStorage.getItem('register.appearance'))localStorage.setItem('register.appearance',JSON.stringify({version:1,mode:'dark',skin:'graphite'}));},project.id);
  page=await context.newPage();page.on('pageerror',error=>report.browser_errors.push(error.message));
  page.on('request',request=>{if(request.method()==='POST'&&request.url().endsWith('/api/rpc')){try{report.ui_methods.push(request.postDataJSON().method);}catch{}}});
  await page.goto(url);await page.getByTestId('app-ready').waitFor({timeout:60000});
  const openTool=async(category,id)=>{await page.getByTestId('guided-task-open').click();await page.getByTestId('guided-category-'+category).click();for(let n=0;n<8&&!await page.getByTestId(id).isVisible();n++)await page.getByRole('button',{name:'다음 도구 →',exact:true}).click();await page.getByTestId(id).click();};
  const close=async()=>{await page.getByTestId('guided-close').click();await page.getByRole('dialog').waitFor({state:'detached'});};
  const next=async id=>page.getByTestId(id).getByTestId('guided-next').click();
  const back=async id=>page.getByTestId(id).getByTestId('guided-back').click();
  const visiblePage=async id=>page.getByTestId(id).locator('[data-testid="guided-page"]:visible').getAttribute('data-step');
  const withinViewport=async()=>page.getByRole('dialog').evaluate(element=>{const rect=element.getBoundingClientRect();return rect.left>=0&&rect.right<=innerWidth&&document.documentElement.scrollWidth<=innerWidth;});
  check('Correct Indust project opens before advanced workflow checks',await page.getByTestId('app-ready').getAttribute('data-project-id')===project.id);
  check('Seed has no inherited engine verdict',initial.runs.length===0);

  await openTool('project','open-hardware-workbench');
  await page.getByLabel('HDL 프로젝트 이름',{exact:true}).fill('');
  check('Hardware setup blocks advancing with an empty project name',await page.getByTestId('hardware-next').isDisabled());
  await page.getByTestId('hardware-example-rom').click();await page.getByLabel('HDL 프로젝트 이름',{exact:true}).fill('유지할 ROM 초안');
  check('Hardware setup shows at most four example choices',await page.locator('[data-testid^="hardware-example-"]:visible').count()<=4);
  check('Source, vectors, and final mutations remain hidden before their step',await page.getByLabel('HDL 소스 코드',{exact:true}).isHidden()&&await page.getByLabel('HDL 테스트 벡터',{exact:true}).isHidden()&&await page.getByTestId('hardware-save-new').isHidden()&&await page.getByTestId('hardware-run').isHidden());
  await page.getByTestId('hardware-next').click();
  const source=await page.getByLabel('HDL 소스 코드',{exact:true}).inputValue(),edited=source+'\n// retained navigation draft\n';
  await page.getByLabel('HDL 소스 코드',{exact:true}).fill(edited);await page.getByTestId('hardware-source-next').click();
  await page.getByLabel('HDL 소스 코드',{exact:true}).fill('01\n23\n45\n67\n');await page.getByTestId('hardware-source-prev').click();
  check('Each source file retains its own draft while changing files',await page.getByLabel('HDL 소스 코드',{exact:true}).inputValue()===edited);
  await page.getByTestId('hardware-source-next').click();check('Memory data source is retained independently',await page.getByLabel('HDL 소스 코드',{exact:true}).inputValue()==='01\n23\n45\n67\n');
  const languages=await page.getByLabel('HDL 파일 언어',{exact:true}).locator('option').allTextContents();
  check('Existing hardware language choices remain available',['verilog','systemverilog','vhdl','c','spice','rtlil','blif','data'].every(language=>languages.includes(language)));
  await page.getByTestId('hardware-back').click();check('Project name survives returning from source editing',await page.getByLabel('HDL 프로젝트 이름',{exact:true}).inputValue()==='유지할 ROM 초안');await page.getByTestId('hardware-next').click();
  await page.setViewportSize({width:390,height:844});await shot('mobile-hardware-source');check('Hardware editor popup fits the mobile viewport',await withinViewport());await page.setViewportSize({width:1440,height:1000});
  await page.getByTestId('hardware-next').click();const vectors=await page.getByLabel('HDL 테스트 벡터',{exact:true}).inputValue();await page.getByLabel('HDL 테스트 벡터',{exact:true}).fill('{invalid');
  check('Invalid vectors remain visible and block advancing',await page.getByTestId('hardware-next').isDisabled()&&await page.getByLabel('HDL 테스트 벡터',{exact:true}).inputValue()==='{invalid');
  await page.getByLabel('HDL 테스트 벡터',{exact:true}).fill(vectors);await page.getByLabel('HDL 벡터 간격',{exact:true}).fill('13');await page.getByTestId('hardware-next').click();
  await page.getByLabel('HDL 칩 폭',{exact:true}).fill('0');check('Zero physical width is retained and blocks advancing',await page.getByLabel('HDL 칩 폭',{exact:true}).inputValue()==='0'&&await page.getByTestId('hardware-next').isDisabled());
  await page.getByLabel('HDL 칩 폭',{exact:true}).fill('123');await page.getByLabel('HDL 칩 높이',{exact:true}).fill('456');await page.getByTestId('hardware-back').click();
  check('Test vectors and nanosecond interval survive physical-settings navigation',await page.getByLabel('HDL 벡터 간격',{exact:true}).inputValue()==='13'&&await page.getByLabel('HDL 테스트 벡터',{exact:true}).inputValue()===vectors);await page.getByTestId('hardware-next').click();
  check('Physical dimensions survive backward and forward navigation',await page.getByLabel('HDL 칩 폭',{exact:true}).inputValue()==='123'&&await page.getByLabel('HDL 칩 높이',{exact:true}).inputValue()==='456');await page.getByTestId('hardware-next').click();await shot('desktop-hardware-review');
  check('Review requires explicit save and cannot advance an unsaved design',await page.getByTestId('hardware-save-new').isVisible()&&await page.getByTestId('hardware-next').isDisabled()&&await page.getByTestId('hardware-run').isHidden());
  check('Hardware navigation dispatched no create/save/run/apply requests',mutations().length===0,{mutation_methods:mutations()});
  for(let i=0;i<18;i++){await page.keyboard.press('Tab');assert(await page.getByRole('dialog').evaluate(dialog=>dialog.contains(document.activeElement)),'Keyboard escaped hardware dialog');}
  check('Tab navigation stays inside the visible Hardware dialog',true);await close();

  await openTool('design','open-integrated-tools');
  const chooseIntegrated=async tab=>{if(await page.getByTestId('integrated-tool-back').isVisible())await page.getByTestId('integrated-tool-back').click();const chooser=page.getByTestId('integrated-tool-choice');for(let i=0;i<3&&!await page.getByTestId('integrated-tab-'+tab).isVisible();i++){const forward=chooser.getByTestId('guided-next');if(await forward.isVisible())await forward.click();else await chooser.getByTestId('guided-back').click();}await page.getByTestId('integrated-tab-'+tab).click();};
  await chooseIntegrated('design');await page.getByTestId('design-load-catalog').click();await poll(()=>page.getByTestId('design-page-template').isEnabled(),'Design catalog did not load');
  check('Integrated design starts with four focused task choices',await page.locator('[data-testid^="design-page-"]:visible').count()===4);
  await page.getByTestId('design-page-template').click();const templateFlow=page.getByTestId('design-template-guided');await templateFlow.getByLabel('가로 (µm)',{exact:true}).fill('600');await next('design-template-guided');
  await page.getByTestId('design-template').selectOption('rc_lowpass');await page.getByLabel('Template 프로젝트 이름',{exact:true}).fill('설정만 한 RC 초안');await back('design-template-guided');
  check('Template physical limit survives circuit configuration',await templateFlow.getByLabel('가로 (µm)',{exact:true}).inputValue()==='600');await next('design-template-guided');
  check('Template name is retained and creation requires explicit approval',await page.getByLabel('Template 프로젝트 이름',{exact:true}).inputValue()==='설정만 한 RC 초안'&&await page.getByTestId('design-create').isDisabled());
  await page.getByTestId('design-create-confirm').check();check('Explicit template approval only enables creation without dispatching it',await page.getByTestId('design-create').isEnabled()&&mutations().length===0);await page.getByTestId('design-create-confirm').uncheck();
  await page.getByRole('button',{name:'← 회로 작업 선택',exact:true}).click();await page.getByTestId('design-page-template').click();
  check('Template draft survives returning to its parent task',await page.getByLabel('Template 프로젝트 이름',{exact:true}).inputValue()==='설정만 한 RC 초안');await shot('desktop-template-review');

  await chooseIntegrated('pvt');check('PVT opens only its history and support step',await visiblePage('pvt-guided')==='0'&&await page.getByLabel('PVT temperatures',{exact:true}).isHidden());
  await next('pvt-guided');await page.getByLabel('PVT temperatures',{exact:true}).fill('-40, 27, 125');await page.getByLabel('PVT supplies',{exact:true}).fill('1.62, 1.8, 1.98');await next('pvt-guided');
  await page.getByLabel('PVT 공급원 유형',{exact:true}).selectOption('testbench');await page.getByTestId('pvt-supply-name').fill('VDD');await back('pvt-guided');
  check('PVT temperature and supply lists preserve exact drafts',await page.getByLabel('PVT temperatures',{exact:true}).inputValue()==='-40, 27, 125'&&await page.getByLabel('PVT supplies',{exact:true}).inputValue()==='1.62, 1.8, 1.98');await next('pvt-guided');
  check('PVT supply binding survives navigation',await page.getByTestId('pvt-supply-name').inputValue()==='VDD');await next('pvt-guided');
  await page.getByLabel('PVT metric 1 이름',{exact:true}).fill('Vout_peak');await page.getByRole('button',{name:'Metric 추가',exact:true}).click();await page.getByLabel('PVT metric 2 이름',{exact:true}).fill('Iavg');
  check('Only one metric editor is visible after adding another',await page.locator('.it-metric-row:visible').count()===1&&await page.getByLabel('PVT metric 1 이름',{exact:true}).isHidden());await page.getByRole('button',{name:'← 이전 metric',exact:true}).click();
  check('First metric draft survives editing a second metric',await page.getByLabel('PVT metric 1 이름',{exact:true}).inputValue()==='Vout_peak');await next('pvt-guided');await page.getByLabel('PVT constraint value',{exact:true}).fill('0.7');await next('pvt-guided');await page.getByLabel('PVT wall time',{exact:true}).fill('420');await next('pvt-guided');
  check('PVT save and run are exposed only at the explicit final action step',await visiblePage('pvt-guided')==='6'&&await page.getByTestId('pvt-create').isVisible()&&await page.getByTestId('pvt-start').isDisabled());await back('pvt-guided');check('PVT time limit survives final review',await page.getByLabel('PVT wall time',{exact:true}).inputValue()==='420');await next('pvt-guided');await shot('desktop-pvt-review');await next('pvt-guided');
  check('Unexecuted PVT result page does not invent point results',await page.getByTestId('pvt-point').count()===0&&await page.getByTestId('pvt-summary').count()===0&&await page.getByTestId('pvt-constraint-results').count()===0);
  await chooseIntegrated('routing');check('Routing cannot advance before reading actual rules',await page.getByTestId('routing-guided').getByTestId('guided-next').isDisabled());await page.getByTestId('routing-load-rules').click();await page.getByTestId('routing-rule-ledger').waitFor({timeout:30000});await next('routing-guided');
  const width=await page.getByTestId('routing-width').inputValue();await page.getByLabel('배선 net',{exact:true}).fill('DRAFT_ONLY');await next('routing-guided');await page.getByLabel('끝 X DBU',{exact:true}).fill('2000');await page.getByLabel('끝 Y DBU',{exact:true}).fill('3000');await back('routing-guided');
  check('Routing net and integer width survive endpoint navigation',await page.getByLabel('배선 net',{exact:true}).inputValue()==='DRAFT_ONLY'&&await page.getByTestId('routing-width').inputValue()===width);await next('routing-guided');
  check('Integer DBU endpoints remain exact on return',await page.getByLabel('끝 X DBU',{exact:true}).inputValue()==='2000'&&await page.getByLabel('끝 Y DBU',{exact:true}).inputValue()==='3000');await next('routing-guided');
  check('Routing review does not create a preview or apply without explicit action',await page.getByTestId('routing-preview').isVisible()&&await page.getByTestId('routing-apply').count()===0&&!report.ui_methods.includes('design.route_preview')&&!report.ui_methods.includes('design.route_search'));
  await page.setViewportSize({width:390,height:844});await shot('mobile-routing-review');check('Integrated routing popup fits the mobile viewport',await withinViewport());await page.setViewportSize({width:1440,height:1000});
  await chooseIntegrated('pvt');check('PVT depth and drafts survive switching integrated tools',await visiblePage('pvt-guided')==='7');await back('pvt-guided');await back('pvt-guided');check('PVT run-limit draft survives switching integrated tools',await page.getByLabel('PVT wall time',{exact:true}).inputValue()==='420');
  check('Advanced navigation dispatched no design mutations or engines',mutations().length===0,{mutation_methods:mutations()});await close();
  const final=await api('project.open',{project_id:project.id});
  assert.deepEqual({revision:final.revision,schematic:final.schematic,testbench:final.testbench,runs:final.runs,hdl_design:final.hdl_design,chip_limits:final.chip_limits},{revision:initial.revision,schematic:initial.schematic,testbench:initial.testbench,runs:initial.runs,hdl_design:initial.hdl_design,chip_limits:initial.chip_limits});
  check('Native project revision, circuit, limits, sources, and engine records are unchanged',true);report.final_revision=final.revision;
  await page.evaluate(()=>localStorage.setItem('register.appearance',JSON.stringify({version:1,mode:'light',skin:'graphite'})));await page.reload();await page.getByTestId('app-ready').waitFor();await openTool('project','open-hardware-workbench');await shot('desktop-light-hardware');
  check('Advanced guided pages preserve the existing light theme',await page.locator('html').getAttribute('data-theme')==='light');await close();
  check('Advanced workbench finishes without browser exceptions',report.browser_errors.length===0);
  assert.deepEqual(await hashes(),initialHashes,'Source changed during qualification; rerun after edits stop.');report.completed=true;
}catch(error){report.error=error.message;if(page){await shot('failure').catch(()=>{});report.failure_body=await page.locator('body').innerText().catch(()=>'');}throw error;}
finally{
  let cleanupError;
  try{
    if(context){const video=page?.video();await context.close();if(video)await video.saveAs(path.join(out,'actual-guided-advanced.webm'));}if(browser)await browser.close();if(vite)vite.kill();
    // Closing the last modal can leave its read-only catalog request in flight.
    // The worker correctly refuses shutdown until the request completes.
    if(worker){for(let attempt=0;attempt<12;attempt++){try{await stopWorker(workspace);break;}catch(error){if(attempt===11||!String(error.message).includes('요청을 완료하거나'))throw error;await new Promise(resolve=>setTimeout(resolve,500));}}}
  }catch(error){cleanupError=error;report.cleanup_error=error.message;report.completed=false;}
  finally{if(licenseQa)await licenseQa.close();report.source_sha256=await hashes();await writeFile(path.join(out,'ui-verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({completed:report.completed,cases:report.cases.length,error:report.error,cleanup_error:report.cleanup_error}));}
  if(cleanupError)throw cleanupError;
}
