// Actual app clicks against a separate native worker, not mocked RPC.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {chromium,expect} from '@playwright/test';
import {startWorker,stopWorker} from '../../scripts/worker.mjs';
import {runtimeConfig,workerRpc} from '../../scripts/runtime.mjs';

const root=process.cwd(),out=path.join(root,'docs/evidence/oscillator-lab');
await mkdir(out,{recursive:true});await mkdir('.runtime/oscillator-ui',{recursive:true});
const workspace=await mkdtemp(path.join(root,'.runtime/oscillator-ui','qa-'));
const free=async()=>{const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;};
const config=await runtimeConfig(workspace);config.url='http://127.0.0.1:'+await free();
await writeFile(config.file,JSON.stringify({url:config.url,token:config.token}));
const api=async(method,params={})=>{const r=await workerRpc(config,method,params);assert(r.ok,JSON.stringify(r.error));return r.result;};
const evidence={schema_version:1,edition:'Resistor Indust',checked_at:new Date().toISOString(),completed:false,cases:[],browser_errors:[]};
const check=name=>{evidence.cases.push({name,passed:true});console.log('PASS '+name);};
let worker=false,vite,browser,context,page;
try{
  await startWorker(workspace,{resourcesRoot:root,mode:'native',prepare:false});worker=true;
  const initial=await api('project.create',{example:'schematic',name:'Oscillator UI starting workspace'});
  const port=await free(),url='http://127.0.0.1:'+port+'/eda';
  vite=spawn(process.execPath,['node_modules/vite/bin/vite.js'],{cwd:root,env:{...process.env,RESISTOR_EDITION:'indust',MOS_WORKSPACE:workspace,REGISTER_DEV_PORT:String(port)},windowsHide:true,stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('App startup timed out')),30000);vite.stdout.on('data',b=>{output+=b;if(output.includes('Local:')){clearTimeout(timer);resolve();}});vite.once('error',reject);});
  browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  context=await browser.newContext({viewport:{width:1600,height:1000},recordVideo:{dir:path.join(workspace,'recording'),size:{width:1600,height:1000}}});
  page=await context.newPage();
  await page.addInitScript(id=>{localStorage.setItem('mos.last_project',id);localStorage.setItem('register.appearance',JSON.stringify({version:1,mode:'dark',skin:'graphite'}));},initial.id);
  page.on('pageerror',e=>evidence.browser_errors.push(e.message));
  await page.goto(url);await page.getByTestId('app-ready').waitFor({timeout:60000});
  await page.getByTestId('design-tools-menu').click();
  await page.getByTestId('open-integrated-tools').click();
  await page.getByTestId('integrated-tab-design').click();
  await page.getByTestId('design-load-catalog').click();
  await expect(page.getByTestId('oscillator-library')).toBeVisible({timeout:30000});
  for(const id of ['osc_ring5','osc_rc_sensor','osc_beat','osc_burst'])await expect(page.getByTestId('choose-'+id)).toBeVisible();
  check('actual catalog exposes four oscillator projects');
  await page.getByTestId('choose-osc_rc_sensor').click();
  await expect(page.getByTestId('design-template')).toHaveValue('osc_rc_sensor');
  await page.getByRole('spinbutton',{name:'Template sense_F',exact:true}).fill('0.00000000002');
  await page.getByRole('textbox',{name:'Template 프로젝트 이름'}).fill('Oscillator UI · 20pF sensor');
  await page.getByTestId('design-create-confirm').check();
  await page.getByTestId('design-create').click();
  let created;
  await expect.poll(async()=>{const rows=await api('project.list',{metadata_only:true});created=rows.find(r=>r.name==='Oscillator UI · 20pF sensor');return !!created;},{timeout:30000}).toBe(true);
  const p=await api('project.open',{project_id:created.id});
  assert.equal(p.design_template.parameters.sense_F,20e-12);assert.equal(p.runs.length,0);
  await expect(page.locator('.view-context')).toContainText('osc_rc_sensor',{timeout:30000});
  check('UI component value creates a separate real project with no inherited PASS');
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.schematic-svg')).toBeVisible();
  await page.screenshot({path:path.join(out,'sensor-schematic.png')});
  await page.getByTestId('run-simulation').click();
  let project;
  await expect.poll(async()=>{project=await api('project.open',{project_id:p.id});const run=project.runs.at(-1);return run?.execution_status;},{timeout:150000,intervals:[1000,2000]}).toBe('completed');
  const result=project.runs.at(-1);assert.equal(result.analysis_result,'pass');
  assert(result.measurements.output_frequency_Hz>150e3&&result.measurements.output_frequency_Hz<200e3);
  await page.getByTestId('tab-simulation').click();
  await expect(page.getByTestId('oscillator-metrics')).toBeVisible({timeout:30000});
  await expect(page.getByTestId('oscillator-metrics')).toContainText('출력 주파수');
  await expect(page.getByTestId('chip-reference-results')).toContainText('파형 기준 통과');
  check('actual UI-launched transient displays frequency, thresholds and named criteria');
  evidence.run={id:result.id,revision:result.revision,execution_status:result.execution_status,analysis_result:result.analysis_result,frequency_Hz:result.measurements.output_frequency_Hz};
  await page.getByTestId('oscillator-metrics').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(out,'sensor-results.png')});
  await page.getByTestId('project-tools-menu').click();await page.getByTestId('open-semiconductor-starters').click();
  await page.getByRole('combobox',{name:'시작 설계 종류'}).selectOption({label:'발진기·센서 프로젝트'});
  for(const id of ['osc_ring5','osc_rc_sensor','osc_beat','osc_burst'])await expect(page.getByTestId('starter-'+id)).toBeVisible();
  check('beginner starter flow exposes the same shared engine circuits');
  assert.deepEqual(evidence.browser_errors,[]);check('no browser runtime errors');
  evidence.completed=true;
}catch(error){
  evidence.error=error.message;
  if(page){await page.screenshot({path:path.join(out,'ui-failure.png')}).catch(()=>{});await writeFile(path.join(workspace,'failure-body.txt'),await page.locator('body').innerText().catch(()=>''));}
  throw error;
}finally{
  if(context){const video=page?.video();await context.close();if(video)await video.saveAs(path.join(out,'oscillator-workflow.webm'));}
  if(browser)await browser.close();if(vite)await new Promise(r=>{vite.once('exit',r);vite.kill();setTimeout(r,1000);});
  if(worker)await stopWorker(workspace);
  evidence.source_sha256=Object.fromEntries(await Promise.all(['packages/ui/src/OscillatorLibrary.tsx','packages/ui/src/OscillatorMetrics.tsx','packages/ui/src/IntegratedTools.tsx','packages/ui/src/ChipReferenceResults.tsx','tests/integration/oscillator-lab.mjs'].map(async f=>[f,createHash('sha256').update(await readFile(f)).digest('hex')])));
  await writeFile(path.join(out,'ui-verification.json'),JSON.stringify(evidence,null,2)+'\n');
}
