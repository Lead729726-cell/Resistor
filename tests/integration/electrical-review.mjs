// GUI uses real native public OTA runs; no mocked response or fabricated waveform.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium} from '@playwright/test';
import {startWorker,stopWorker} from '../../scripts/worker.mjs';
import {runtimeConfig,workerRpc} from '../../scripts/runtime.mjs';
const root=process.cwd(),out=path.join(root,'docs/evidence/industry-qualification');
const previous=JSON.parse(await readFile(path.join(out,'verification.json'),'utf8')),workspace=previous.workspace;
assert(previous.completed&&previous.public_fixture&&path.resolve(workspace).startsWith(path.join(root,'.runtime/industry-qualification/')));
const config=await runtimeConfig(workspace),api=async(method,params={})=>{const r=await workerRpc(config,method,params);assert(r.ok,JSON.stringify(r.error));return r.result;};
const evidence={schema_version:1,edition:'indust',checked_at:new Date().toISOString(),scope:'Actual TT/27C/1.8V 4-sample pre/post GUI regression, separately from the 192-sample qualification',checks:[],browser_errors:[],foundry_signoff:false};
const check=(name,ok)=>{assert(ok,name);evidence.checks.push({name,pass:true});};
let worker=false,vite,browser,page;
try{
 await startWorker(workspace,{resourcesRoot:root});worker=true;
 const source=await api('project.open',{project_id:previous.source_project_id});
 const reuse=process.argv.includes('--reuse-native')?JSON.parse(await readFile(path.join(out,'ui-verification.json'),'utf8')):null;
 if(reuse)assert(reuse.completed&&reuse.edition==='indust'&&reuse.run_ids.length===2);
 let review=reuse?await api('review.status',{project_id:reuse.project_id,review_id:reuse.review_id}):await api('review.create',{project_id:source.id,expected_revision:source.revision,name:'UI · actual OTA offset · TT 4 samples',command_id:randomUUID()});const p=reuse?await api('project.open',{project_id:reuse.project_id}):review.working_project;
 evidence.reused_native_fixture=!!reuse;
 evidence.project_id=p.id;evidence.review_id=review.id;
 const identity=()=>({project_id:p.id,review_id:review.id,expected_revision:p.revision,expected_review_revision:review.review_revision,command_id:randomUUID()});
 evidence.run_ids=[];
 for(const post_layout of [false,true]){
  let run=reuse?await api('job.status',{run_id:reuse.run_ids[Number(post_layout)]}):await api('simulation.run',{project_id:p.id,expected_revision:p.revision,command_id:randomUUID(),analysis:'op',corner:'tt',temperature_C:27,supply_V:1.8,post_layout,characterization:{mode:'mismatch',samples:4,seed:729726,offset_limit_V:.01}});const deadline=Date.now()+240000;
  while(['queued','running'].includes(run.execution_status)){assert(Date.now()<deadline);await new Promise(r=>setTimeout(r,300));run=await api('job.status',{run_id:run.id});}
  check('actual '+(post_layout?'post':'pre')+' native mismatch completed',run.project_id===p.id&&run.revision===p.revision&&run.execution_status==='completed'&&run.analysis_result==='pass'&&run.freshness==='current');evidence.run_ids.push(run.id);
 }
 review=await api('review.evaluate',identity());
 const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1'],{cwd:root,env:{...process.env,RESISTOR_EDITION:'indust',MOS_WORKSPACE:workspace,REGISTER_DEV_PORT:String(port)},windowsHide:true,stdio:['ignore','pipe','pipe']});
 await new Promise((resolve,reject)=>{let output='';const timeout=setTimeout(()=>reject(Error('Test web app startup')),30000);vite.stdout.on('data',bytes=>{output+=bytes;if(output.includes('Local:')){clearTimeout(timeout);resolve();}});vite.once('error',reject);});
 browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});page=await browser.newPage({viewport:{width:1440,height:1000}});
 page.on('pageerror',e=>evidence.browser_errors.push(e.message));await page.addInitScript(id=>localStorage.setItem('mos.last_project',id),p.id);
 await page.goto('http://127.0.0.1:'+port+'/eda');await page.getByTestId('open-industry-review').waitFor({state:'attached'});await page.locator('[data-testid="design-tools-menu"] summary').click();await page.getByTestId('open-industry-review').click();await page.getByTestId('review-context').waitFor({timeout:60000});
 await page.locator('select[aria-label="검토 제약 종류"]').selectOption('matching');
 await page.getByTestId('review-matching-fill').click();const criteria=JSON.parse(await page.getByTestId('intent-criteria').inputValue());
 check('GUI fills actual candidate run IDs and PVT without inventing a result',JSON.stringify(criteria.run_ids)===JSON.stringify(evidence.run_ids)&&criteria.minimum_samples===4&&criteria.seed===729726&&criteria.require_pre_and_post===true&&criteria.conditions.length===1);
 await page.getByTestId('intent-reason').fill('Actual public native GUI regression; finite OTA offset only.');await page.getByTestId('intent-author').fill('GUI qualification');await page.getByTestId('intent-add').click();await page.getByTestId('intent-row').last().waitFor({timeout:60000});
 await page.getByTestId('review-evaluate').click();await page.getByText('현재 후보의 실제 검토 결과',{exact:true}).waitFor({timeout:120000});
 check('GUI presents native offset criterion PASS',await page.getByTestId('intent-row').last().innerText().then(t=>t.includes('지정 기준 충족')));
 await page.getByTestId('intent-row').last().click();check('GUI exposes voltage metrics and finite public scope',await page.locator('.ir-detail pre').first().innerText().then(t=>t.includes('offset_abs_max_V')&&t.includes('yield_verified')));
 await page.locator('select:has(option[value="deferred"])').selectOption('accepted_for_review_scope');await page.getByTestId('review-decision-reason').fill('Accept only actual TT 4-sample OTA offset scope; no manufacturing approval.');await page.getByTestId('review-report-save').click();await page.getByTestId('review-saved-report').waitFor({timeout:120000});
 check('Actual current GUI report saved',await page.getByTestId('review-saved-report').innerText().then(t=>t.includes('current')));
 await page.screenshot({path:path.join(out,'electrical-desktop.png')});
 await page.setViewportSize({width:390,height:844});await page.locator('.indust-review').evaluate(el=>el.scrollTop=0);check('Mobile bounds preserve viewport',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(out,'electrical-mobile.png')});
 check('No uncaught browser errors',evidence.browser_errors.length===0);
 evidence.completed=true;
}catch(error){evidence.completed=false;evidence.error=error.message;if(page){await page.screenshot({path:path.join(out,'electrical-failure.png')});evidence.body=await page.locator('body').innerText();}throw error;}
finally{
 if(browser)await browser.close();
 if(vite){vite.kill();await new Promise(resolve=>{if(vite.exitCode!==null)return resolve();vite.once('exit',resolve);setTimeout(resolve,1000);});}
 if(worker)for(let attempt=0;attempt<15;attempt++){
  try{await stopWorker(workspace);evidence.owned_worker_stopped=true;break;}
  catch(error){if(!error.message.includes('실행 중인 해석')||attempt===14)throw error;await new Promise(r=>setTimeout(r,1000));}
 }
 await mkdir(out,{recursive:true});await writeFile(path.join(out,'ui-verification.json'),JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify({completed:evidence.completed,checks:evidence.checks.length,error:evidence.error}));
}
