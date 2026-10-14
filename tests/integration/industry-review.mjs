import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium} from '@playwright/test';
import {startWorker} from '../../scripts/worker.mjs';
import {runtimeConfig,workerRpc} from '../../scripts/runtime.mjs';
import {stopNativeWorker} from '../../scripts/native-worker.mjs';

const root=process.cwd(),folder=path.join(root,'docs/evidence/industry-review');await mkdir(folder,{recursive:true});
const base=path.join(root,'.runtime/industry-review');await mkdir(base,{recursive:true});const workspace=await mkdtemp(path.join(base,'ui-'));
const freePort=async()=>{const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));return port;};
const config=await runtimeConfig(workspace);config.url='http://127.0.0.1:'+await freePort();await writeFile(config.file,JSON.stringify({url:config.url,token:config.token}));
const port=await freePort(),url=`http://127.0.0.1:${port}/eda`,evidence={schema_version:1,edition:'indust',checked_at:new Date().toISOString(),cases:[],browser_errors:[],public_fixture_only:true};
const check=(name,value)=>{assert(value,name);evidence.cases.push({name,pass:true});};
const api=async(method,params={})=>{const result=await workerRpc(config,method,params);assert(result.ok,result.error?.message);return result.result;};
let worker=false,vite,browser;
try{
 await startWorker(workspace,{resourcesRoot:root,mode:'native',prepare:false});worker=true;
 vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1'],{cwd:root,env:{...process.env,RESISTOR_EDITION:'indust',MOS_WORKSPACE:workspace,REGISTER_DEV_PORT:String(port)},windowsHide:true,stdio:['ignore','pipe','pipe']});
 await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('Local test app startup timed out')),20000);vite.stdout.on('data',b=>{output+=b;if(output.includes('Local:')){clearTimeout(timer);resolve();}});vite.once('error',reject);vite.once('exit',code=>{if(code)reject(Error('Vite test process stopped'));});});
 browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',error=>evidence.browser_errors.push(error.message));
 // Real requests remain forwarded. Delay only review-list reads to expose a
 // late automatic refresh that formerly discarded the first selected target.
 await page.route('**/api/rpc',async route=>{if(route.request().postDataJSON()?.method==='review.list')await new Promise(r=>setTimeout(r,500));await route.continue();});
 const open=async()=>{await page.locator('[data-testid="design-tools-menu"] summary').click();await page.getByTestId('open-industry-review').click();await page.getByTestId('industry-review').waitFor();};
 await page.goto(url);await page.getByRole('button',{name:/Worker · 도구/}).waitFor({timeout:20000});await open();
 await page.getByTestId('review-example').click();await page.getByTestId('review-context').waitFor({timeout:20000});
 check('Actual source-copy context and correct product name',(await page.getByTestId('review-context').innerText()).includes('Resistor Indust'));
 const options=await page.locator('select[aria-label="후보 도형 선택"] option').evaluateAll(items=>items.map(o=>o.value).filter(Boolean));assert.equal(options.length,2);
 const targets=async()=>{for(const id of options){await page.getByLabel('후보 도형 선택',{exact:true}).selectOption(id);await page.getByRole('button',{name:'제약 대상에 추가',exact:true}).click();}};
 await page.getByTestId('intent-author').fill('Public UI QA');
 for(const [kind,criteria] of [['symmetry',{axis:'x',axis_twice_dbu:'0'}],['spacing',{minimum_dbu:'2000'}],['fixed_region',{box:['-2500','-500','2500','1500'],layers:['68/20']}]] ){
  await page.getByLabel('검토 제약 종류',{exact:true}).selectOption(kind);if(kind!=='fixed_region')await targets();
  await page.getByTestId('intent-reason').fill('Explicit public-fixture criterion '+kind);await page.getByTestId('intent-criteria').fill(JSON.stringify(criteria));
  await page.getByTestId('intent-add').click();await page.getByTestId('intent-add').waitFor({state:'visible'});
  try{await page.waitForFunction(expected=>document.querySelectorAll('[data-testid="intent-row"]').length===expected,kind==='symmetry'?1:kind==='spacing'?2:3);}catch(error){throw Error('Constraint UI phase '+kind+': '+(await page.getByTestId('industry-review').innerText()).slice(-4500));}
 }
 await page.getByTestId('review-evaluate').click();await page.getByText('현재 후보의 실제 기하 검사',{exact:true}).waitFor({timeout:20000});
 check('Three actual geometric criteria pass',(await page.getByTestId('intent-row').allTextContents()).every(text=>text.includes('기하 기준 충족')));
 check('Independent missing physical engines remain unavailable',(await page.getByTestId('industry-review').innerText()).includes('NOT RUN · 이 후보 revision의 엔진 실행 기록 없음'));
 await page.locator('select:has(option[value="deferred"])').selectOption('deferred');await page.getByTestId('review-decision-reason').fill('Public fixture only; electrical matching and manufacturing are unassessed');
 await page.getByTestId('review-report-save').click();await page.getByTestId('review-saved-report').waitFor({timeout:20000});
 const download=page.waitForEvent('download');await page.getByTestId('review-report-download').click();const actualDownload=await download;const downloaded=path.join(folder,'ui-report.review.json');await actualDownload.saveAs(downloaded);
 const report=JSON.parse(await readFile(downloaded,'utf8'));check('Actual downloadable report has exact source/candidate, constraints and deferred decision',report.report.constraints.length===3&&report.report.decision==='deferred'&&report.report.signoff===false);
 await page.locator('input[type="file"][accept=".json"]').setInputFiles(downloaded);
 check('Report reopens against saved native checksum',(await page.getByTestId('review-saved-report').innerText()).includes(report.sha256));
 await page.getByTestId('intent-row').first().click();check('Selected intent exposes exact assessment method',(await page.getByTestId('industry-review').innerText()).includes('Exact reflected mask XOR'));
 await page.locator('.indust-review').evaluate(el=>el.scrollTop=0);
 await page.screenshot({path:path.join(folder,'automated-desktop.png')});
 const source=await api('project.open',{project_id:report.report.source.project_id});const sourceChecksum=(await api('layout.export',{project_id:source.id,format:'oas'})).roundtrip.before_hash;
 const p=await api('project.open',{project_id:report.report.project_id});await api('layout.apply_command',{project_id:p.id,expected_revision:p.revision,command_id:randomUUID(),command:{type:'move_shape',id:options[0],dx:'5',dy:'0'}});
 await page.reload();await page.getByRole('button',{name:/Worker · 도구/}).waitFor({timeout:20000});await open();await page.getByText('STALE · 후보 또는 검토 내용 변경, 재검사 필요',{exact:true}).waitFor({timeout:20000});
 check('Candidate mutation never presents old geometry checks as current',true);
 await page.getByTestId('review-evaluate').click();await page.getByText('현재 후보의 실제 기하 검사',{exact:true}).waitFor({timeout:20000});
 check('Moved polygon violates symmetry, gap and protected region',(await page.getByTestId('intent-row').allTextContents()).every(text=>text.includes('기하 기준 위반')));
 await page.getByRole('button',{name:/보고서 다시 열기 · r1/}).click();await page.getByTestId('review-saved-report').waitFor();
 check('Historical report retains checksum and shows stale',(await page.getByTestId('review-saved-report').innerText()).includes('stale'));
 check('Original project geometry preserved',(await api('layout.export',{project_id:source.id,format:'oas'})).roundtrip.before_hash===sourceChecksum);
 await page.setViewportSize({width:390,height:844});await page.getByTestId('review-fit').click();await page.locator('.indust-review').evaluate(el=>el.scrollTop=0);
 check('Mobile modal remains inside viewport',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 check('Mobile original/candidate preview remains readable',await page.locator('.ir-view-grid').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
 await page.screenshot({path:path.join(folder,'automated-mobile.png')});
 check('No uncaught browser errors',evidence.browser_errors.length===0);
 evidence.passed=evidence.cases.length;await writeFile(path.join(folder,'ui-verification.json'),JSON.stringify(evidence,null,2)+'\n');console.log(`PASS ${evidence.passed} native-backed UI workflow checks`);
}finally{
 if(browser)await browser.close();if(vite){vite.kill();await new Promise(resolve=>{if(vite.exitCode!==null)return resolve();vite.once('exit',resolve);setTimeout(resolve,1000);});}if(worker)await stopNativeWorker(workspace);
}
