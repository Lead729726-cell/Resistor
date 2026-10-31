// Real browser + native engine. The loopback model is an explicitly labelled
// provider fixture, not an LLM quality or paid OpenAI execution test.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {createServer as httpServer} from 'node:http';
import {createServer as netServer} from 'node:net';
import {randomUUID,createHash} from 'node:crypto';
import path from 'node:path';
import {chromium} from '@playwright/test';
import {startWorker,stopWorker} from '../../scripts/worker.mjs';
import {runtimeConfig,workerRpc} from '../../scripts/runtime.mjs';
import {collectEvidence} from '../../scripts/design-assistant.mjs';
import {configureEngine} from '../../scripts/engine-settings.mjs';
import {disposableUiLicense} from './disposable-ui-license.mjs';
process.env.RESISTOR_EDITION='indust';
const root=process.cwd(),out=path.resolve(process.env.RESISTOR_UI_QA_OUTPUT||'docs/evidence/assistant-chat');await mkdir(out,{recursive:true});await mkdir('.runtime/assistant-qa',{recursive:true});
const workspace=await mkdtemp(path.join(root,'.runtime/assistant-qa/ui-'));
const free=async()=>{const s=netServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const port=s.address().port;await new Promise(r=>s.close(r));return port;};
const config=await runtimeConfig(workspace);config.url='http://127.0.0.1:'+await free();await writeFile(config.file,JSON.stringify({url:config.url,token:config.token}));
const api=async(method,params={})=>{const r=await workerRpc(config,method,params);assert(r.ok,JSON.stringify(r.error));return r.result;};
const apply=(p,command,cell_name)=>api('schematic.apply_command',{project_id:p.id,expected_revision:p.revision,command_id:randomUUID(),command,...(cell_name?{cell_name}:{})});
const report={schema_version:1,edition:'indust',checked_at:new Date().toISOString(),workspace,provider:'explicit-loopback-qa-fixture',model_inference_verified:false,paid_calls:0,cases:[],browser_errors:[]};
const check=(name,ok,details={})=>{assert(ok,name);report.cases.push({name,pass:true,...details});console.log('PASS '+name);};
let calls=0,badReply=false,modelServer,worker=false,vite,browser,context,page,licenseQa;
try{
  licenseQa=await disposableUiLicense(workspace,'indust');report.licensing='isolated synthetic QA authority; production configuration unchanged';
  modelServer=httpServer(async(req,res)=>{
    res.setHeader('Content-Type','application/json');
    if(req.url==='/api/tags'){res.end(JSON.stringify({models:[{name:'resistor-qa-fixture'}]}));return;}
    if(req.url!=='/api/chat'){res.writeHead(404);res.end('{}');return;}
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>250000){res.writeHead(413);res.end('{}');return;}}
    const body=JSON.parse(raw),input=body.messages.find(m=>m.role==='user'&&m.content.startsWith('{"design_evidence"')),data=JSON.parse(input.content),e=data.design_evidence;
    calls++;const selected=e.references.find(r=>r.kind==='device'),ids=badReply?['invented-reference']:[selected?.id||'connectivity'];
    report.last_history_window=data.history_window;
    const reply={answer:'QA 모델 fixture 응답입니다. 실제 native 연결 근거를 받았으며, 이 문장은 모델 추론 품질 검증에 사용하지 않습니다.',evidence_ids:ids,findings:[],follow_up_questions:['이 회로에서 다음에 어떤 검사를 확인할까?'],limitations:['제공자 경계 테스트용 고정 응답입니다. 새 엔진 검증을 수행하지 않았습니다.']};
    res.end(JSON.stringify({done:true,message:{content:JSON.stringify(reply)},prompt_eval_count:20,eval_count:30}));
  });await new Promise(r=>modelServer.listen(0,'127.0.0.1',r));
  await mkdir(path.join(workspace,'.runtime/assistant'),{recursive:true});await writeFile(path.join(workspace,'.runtime/assistant/settings.json'),JSON.stringify({budget_usd:0,ollama_url:'http://127.0.0.1:'+modelServer.address().port,ollama_model:'resistor-qa-fixture'}));
  if(process.platform==='win32'&&process.env.REGISTER_ASSISTANT_QA_WSL==='1')await configureEngine(workspace,{mode:'wsl',distribution:'ResistorEDA'});
  await startWorker(workspace,{resourcesRoot:root,prepare:false});worker=true;
  let p=await api('project.create',{example:'layout',name:'[Indust QA] AI 대화 · 공개 연결 fixture'});
  p=await apply(p,{type:'add_device',device:{id:'r1',name:'R1',kind:'resistor',x:300,y:240,pins:{'1':'IN','2':'OUT'},parameters:{value:1000}}});
  p=await api('layout.apply_command',{project_id:p.id,expected_revision:p.revision,command_id:randomUUID(),command:{type:'add_box',layer_id:'68/20',box:['0','0','1000','1000'],net:'OUT'}});
  p=await apply(p,{type:'add_cell',name:'child',ports:['A','B']});p=await apply(p,{type:'add_device',device:{id:'child-r',name:'RC',kind:'resistor',x:300,y:240,pins:{'1':'A','2':'B'},parameters:{value:2000}}},'child');
  const child=await collectEvidence(config,{project_id:p.id,expected_revision:p.revision,context:{cell_name:'child',device_ids:['child-r']}});check('Actual native child-cell evidence excludes root-only devices',child.connectivity.devices.length===1&&child.connectivity.devices[0].id==='child-r'&&child.context.cell_name==='child');
  const port=await free(),url='http://127.0.0.1:'+port+'/eda';
  vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1'],{cwd:root,env:{...process.env,RESISTOR_EDITION:'indust',MOS_WORKSPACE:workspace,REGISTER_DEV_PORT:String(port),RESISTOR_LICENSE_CONFIG:licenseQa.configFile},windowsHide:true,stdio:['ignore','pipe','pipe']});
  // Readiness is an HTTP response, not an English console label (CI can
  // suppress or redirect the banner). Preserve stderr and early process exits.
  let appOutput='',appFailure;
  const capture=b=>{appOutput=(appOutput+b.toString()).slice(-8000);};
  vite.stdout.on('data',capture);vite.stderr.on('data',capture);
  vite.once('error',e=>{appFailure=e.message;});vite.once('exit',(code,signal)=>{appFailure=`App exited (${code??signal})`;});
  const appDeadline=Date.now()+60000;
  while(true){
    if(appFailure)throw Error(`${appFailure}\n${appOutput}`);
    try{const response=await fetch(url,{signal:AbortSignal.timeout(1500)});if(response.ok)break;}catch{}
    if(Date.now()>=appDeadline)throw Error(`App HTTP startup timed out\n${appOutput}`);
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:path.join(workspace,'recording'),size:{width:1440,height:1000}}});page=await context.newPage();page.on('pageerror',e=>report.browser_errors.push(e.message));
  const poll=async(fn,timeout=30000)=>{const deadline=Date.now()+timeout;while(!await fn()){assert(Date.now()<deadline,'Expected native/UI state timed out');await new Promise(r=>setTimeout(r,100));}};
  const openAssistant=async()=>{const action=page.getByTestId('open-design-assistant');const parent=await action.evaluate(e=>{const d=e.closest('details');return d&&!d.open?d.dataset.testid:null;});if(parent)await page.getByTestId(parent).locator('summary').click();await action.click();await page.getByTestId('assistant-preview').waitFor();};
  await page.goto(url);await page.evaluate(id=>{localStorage.setItem('mos.last_project',id);localStorage.setItem('register.appearance',JSON.stringify({version:1,mode:'dark',skin:'graphite'}));},p.id);await page.reload();await page.getByTestId('app-ready').waitFor({timeout:60000});await page.getByTestId('tab-schematic').click();await page.locator('.schematic-svg').focus();await page.keyboard.press('Control+a');await openAssistant();
  await page.getByTestId('assistant-diagnose').click();await poll(async()=>await page.getByTestId('design-assistant').innerText().then(t=>t.includes('규칙 기반 안내')));check('Rules-only diagnosis reads native evidence without a model request',calls===0);check('Schematic selection is passed into actual evidence',await page.getByTestId('design-assistant').innerText().then(t=>t.includes('선택 소자 1개')));
  await page.getByTestId('assistant-preview').click();await poll(async()=>await page.getByLabel('AI 제공자',{exact:true}).count()===1);await poll(async()=>await page.getByTestId('assistant-preview').isEnabled());await page.getByTestId('assistant-question').fill('선택한 R1과 실제 실행 근거를 설명해줘.');check('Question entry never sends a provider request',calls===0&&await page.getByTestId('assistant-chat-send').isDisabled());
  await page.getByTestId('assistant-chat-approve').check();await page.getByTestId('assistant-chat-send').click();await poll(async()=>await page.locator('.assistant-chat-turn').count()===1);await poll(async()=>await page.getByTestId('assistant-preview').isEnabled());check('Approved UI question uses the real backend and stores a conversation',calls===1);check('One-call consent resets after the answer',!await page.getByTestId('assistant-chat-approve').isChecked());
  await page.getByRole('button',{name:'이 회로에서 다음에 어떤 검사를 확인할까?',exact:true}).click();check('Suggested follow-up fills a draft without sending',calls===1);await page.getByTestId('assistant-chat-approve').check();await page.getByTestId('assistant-chat-send').click();await poll(async()=>await page.locator('.assistant-chat-turn').count()===2);await poll(async()=>await page.getByTestId('assistant-preview').isEnabled());check('Follow-up contains the validated saved first turn',calls===2&&report.last_history_window.included_turns===1);
  await page.screenshot({path:path.join(out,'chat-desktop.png')});
  badReply=true;const draft='존재하지 않는 근거를 반환하면 어떻게 되지?';await page.getByTestId('assistant-question').fill(draft);await page.getByTestId('assistant-chat-approve').check();await page.getByTestId('assistant-chat-send').click();await page.getByRole('alert').waitFor();check('Unknown model references are rejected and the question draft survives',await page.getByTestId('assistant-question').inputValue()===draft&&await page.locator('.assistant-chat-turn').count()===2);badReply=false;
  await page.getByTestId('assistant-new-chat').click();await page.getByTestId('assistant-chat-history').click();await page.getByLabel('저장된 설계 대화',{exact:true}).selectOption({index:1});await poll(async()=>await page.locator('.assistant-chat-turn').count()===2);check('Conversation restore makes no model request',calls===3);
  await page.locator('.assistant-chat-turn').first().locator('.assistant-references button').first().click();await page.getByTestId('design-assistant').waitFor({state:'detached'});check('Evidence reference opens the actual schematic device',await page.locator('.schematic-device.selected').count()===1);
  await page.locator('.schematic-svg').focus();await page.keyboard.press('ArrowRight');await poll(async()=>(await api('project.open',{project_id:p.id})).revision>p.revision);await poll(async()=>await page.getByTestId('schematic-tool-select').isEnabled());await openAssistant();await page.getByTestId('assistant-chat-history').click();await page.getByLabel('저장된 설계 대화',{exact:true}).selectOption({index:1});await poll(async()=>await page.locator('.assistant-stale').count()===1);check('A real design edit marks restored advice stale and disables continuation',await page.getByTestId('assistant-chat-send').isDisabled());await page.screenshot({path:path.join(out,'stale-desktop.png')});
  await page.setViewportSize({width:390,height:844});check('Mobile workbench stays inside the viewport',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));check('Mobile assistant dialog is bounded',(await page.locator('.modal').boundingBox()).width<=390);await page.screenshot({path:path.join(out,'chat-mobile.png')});
  await page.setViewportSize({width:1440,height:1000});await page.reload();await page.getByTestId('app-ready').waitFor();await page.getByTestId('tab-layout2d').click();const viewer=page.getByTestId('layout-viewer-2d');await viewer.locator('canvas').waitFor();await page.waitForTimeout(500);await viewer.locator('canvas').focus();await page.keyboard.press('Control+a');await poll(async()=>await viewer.getAttribute('data-selection-count')==='1');await openAssistant();await page.getByTestId('assistant-diagnose').click();await poll(async()=>await page.getByTestId('assistant-preview').isEnabled());const current=await api('project.open',{project_id:p.id}),shapeEvidence=await collectEvidence(config,{project_id:p.id,expected_revision:current.revision,context:{shape_ids:[(await api('view.get_scene',{project_id:p.id})).shapes[0].id]}});check('Actual layout selection resolves to exact native bbox metadata',shapeEvidence.selection.shapes.length===1&&shapeEvidence.selection.shapes[0].bbox_dbu.join(',')==='0,0,1000,1000'&&await page.getByTestId('design-assistant').innerText().then(t=>t.includes('선택 도형 1개')));
  await page.evaluate(()=>localStorage.setItem('register.appearance',JSON.stringify({version:1,mode:'light',skin:'graphite'})));await page.reload();await page.getByTestId('app-ready').waitFor();await openAssistant();await page.getByTestId('assistant-diagnose').click();await poll(async()=>await page.getByTestId('assistant-preview').isEnabled());check('Saved light theme is applied to the assistant',await page.locator('html').getAttribute('data-theme')==='light');await page.screenshot({path:path.join(out,'diagnosis-light.png')});
  const doctor=await api('toolchain.doctor');report.actual_ngspice_ui=false;
  if(doctor.tools.some(t=>t.name==='ngspice'&&t.available)){
    // This UI assertion checks actual terminal signs and voltage differences,
    // independent of a foundry PDK. Use explicit ideal R/C and numeric excitation.
    let rc=await api('project.create',{example:'schematic',name:'[Indust QA] 실제 ideal-RC ngspice 전류·전압 요약'});
    for(const device of [
      {id:'vin',name:'VIN',kind:'voltage',x:100,y:200,pins:{'+':'IN','-':'0'},parameters:{dc:0},stimulus:{kind:'pulse',low:0,high:1.8,delay_s:2e-9,rise_s:100e-12,fall_s:100e-12,width_s:4.9e-9,period_s:10e-9}},
      {id:'r1',name:'R1',kind:'resistor',x:300,y:200,pins:{'+':'IN','-':'OUT'},parameters:{value:1000}},
      {id:'c1',name:'C1',kind:'capacitor',x:500,y:200,pins:{'+':'OUT','-':'0'},parameters:{value:1e-12}},
      {id:'pin',name:'PORT_IN',kind:'port',x:100,y:100,pins:{P:'IN'},parameters:{}},
      {id:'pout',name:'PORT_OUT',kind:'port',x:500,y:100,pins:{P:'OUT'},parameters:{}}
    ])rc=await apply(rc,{type:'add_device',device});
    rc=await apply(rc,{type:'update_testbench',settings:{analysis:'tran',duration_s:40e-9,step_s:5e-12}});
    let run=await api('simulation.run',{project_id:rc.id,analysis:'tran',netlister:'native'});report.actual_run={project_id:rc.id,run_id:run.id};console.log('Waiting for the actual isolated ngspice job.');await poll(async()=>{run=await api('job.status',{run_id:run.id});return !['queued','running'].includes(run.execution_status);},120000);assert.equal(run.execution_status,'completed');
    await page.evaluate(id=>localStorage.setItem('mos.last_project',id),rc.id);await page.reload();await page.getByTestId('app-ready').waitFor();await openAssistant();await page.getByTestId('assistant-diagnose').click();await poll(async()=>await page.getByTestId('assistant-preview').isEnabled());await page.getByText('실제 전압·전류·전압 강하 요약',{exact:false}).click();await poll(async()=>await page.locator('.assistant-measurements tbody tr').count()>2);
    const summary=await collectEvidence(config,{project_id:rc.id,expected_revision:rc.revision}),measured=summary.runs.find(r=>r.id===run.id),first=measured.current_flow_summary.branches.find(b=>b.device_id==='r1');check('Actual ngspice branch signs and node differences reach the assistant table',first.current.max===Math.max(...run.current_flow.branches.find(b=>b.device_id==='r1').values_A)&&first.voltage_drop.available&&await page.locator('.assistant-measurements').innerText().then(t=>t.includes('(A)')&&t.includes('IN − OUT (V)')));
    await page.screenshot({path:path.join(out,'measurements-desktop.png')});report.actual_ngspice_ui=true;report.actual_run={project_id:rc.id,run_id:run.id,revision:run.revision,tool:run.tool,current_max_A:first.current.max,drop_max_V:first.voltage_drop.max};
  }
  check('Dark and light assistant screens render without browser errors',report.browser_errors.length===0);report.completed=true;report.model_fixture_requests=calls;
}catch(e){report.completed=false;report.error=e.message;if(page){await page.screenshot({path:path.join(out,'failure.png')});report.body=await page.locator('body').innerText();}throw e;}
finally{
  if(context){const video=page?.video();await context.close();if(video)await video.saveAs(path.join(out,'assistant-workflow.webm'));}if(browser)await browser.close();if(vite)vite.kill();if(worker)await stopWorker(workspace);if(modelServer)await new Promise(r=>modelServer.close(r));if(licenseQa)await licenseQa.close();
  report.source_sha256=Object.fromEntries(await Promise.all(['scripts/design-assistant.mjs','packages/ui/src/DesignAssistantWorkbench.tsx','packages/ui/src/App.tsx','packages/contracts/src/assistant.ts'].map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')])));await writeFile(path.join(out,'ui-verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({completed:report.completed,cases:report.cases.length,error:report.error}));
}
