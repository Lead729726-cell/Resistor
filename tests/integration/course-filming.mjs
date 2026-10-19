// Run after course:prepare and course:serve. Private evidence never enters public Git.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from '@playwright/test';
import {runtimeConfig,workerRpc} from '../../scripts/runtime.mjs';
const base=path.resolve('teaching-private/inflearn-resistor'),out=path.join(base,'rehearsal');await mkdir(out,{recursive:true});
const readiness=JSON.parse(await readFile(path.join(base,'demo-readiness.json'),'utf8'));
const config=await runtimeConfig(path.join(base,'workspace'));
const api=async(method,params={})=>{const r=await workerRpc(config,method,params);assert(r.ok,JSON.stringify(r.error));return r.result;};
const report={edition:'Resistor Indust',checked_at:new Date().toISOString(),cases:[],errors:[],recording:'silent automated app operation rehearsal; not a completed lecture',microphone:'not-tested'};
const check=(name,pass)=>{assert(pass,name);report.cases.push({name,pass:true});console.log('PASS '+name);};
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1920,height:1080},recordVideo:{dir:path.join(out,'raw'),size:{width:1920,height:1080}},deviceScaleFactor:1});
const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
try{
  await page.goto('http://127.0.0.1:5189/');
  check('Instructor console has all 18 lessons',(await page.locator('.lesson-card').count())===18);
  await page.screenshot({path:path.join(out,'instructor-console-1080p.png')});
  const links=await page.locator('a[href]').evaluateAll(as=>as.map(a=>a.href).filter(u=>u.startsWith('http://127.0.0.1:5189/')));
  for(const url of links)assert.equal((await context.request.get(url)).status(),200,url);
  check('Console links serve actual local scripts, cards, worksheets and student ZIP',true);
  await page.getByText('대본·조작 순서',{exact:true}).nth(9).click();
  await page.locator('[data-prompter]').click();check('Prompter switches to readable large text',await page.locator('body').getAttribute('class').then(v=>v?.includes('prompter')));
  await page.screenshot({path:path.join(out,'ring-script-1080p.png')});
  await page.goto('http://127.0.0.1:5189/cards/EP10.html');await page.screenshot({path:path.join(out,'ring-keywords-1080p.png')});
  await page.goto('http://127.0.0.1:5189/student/workbook.html');check('Student workbook has 18 exercises and no answer key',(await page.locator('.worksheet').count())===18&&!(await page.locator('body').innerText()).includes('강사용 과제 해설'));
  await page.screenshot({path:path.join(out,'student-workbook-1080p.png')});
  await page.goto('http://127.0.0.1:5189/');await page.setViewportSize({width:390,height:844});
  check('Console fits a mobile viewport',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(out,'instructor-console-mobile.png')});await page.setViewportSize({width:1920,height:1080});
  const ring=readiness.demos.find(d=>d.id==='ring'),original=await api('project.open',{project_id:ring.project_id});
  await page.goto(`http://127.0.0.1:5188/eda?project=${ring.project_id}&lecture=osc-ring`);await page.getByTestId('app-ready').waitFor({timeout:60000});await page.getByTestId('lecture-studio').waitFor();
  check('Direct lesson link opens its actual project and selected oscillator plan',await page.getByTestId('app-ready').getAttribute('data-project-id')===ring.project_id&&await page.getByTestId('lecture-plan').inputValue()==='osc-ring');
  check('Eight plans include four oscillators and a blank divider',(await page.getByTestId('lecture-plan').locator('option').count())===8);
  await page.screenshot({path:path.join(out,'oscillator-studio-1080p.png')});
  await page.getByTestId('lecture-create-demo').click();await page.waitForFunction(id=>document.querySelector('[data-testid=app-ready]')?.getAttribute('data-project-id')!==id,ring.project_id);
  const id=await page.getByTestId('app-ready').getAttribute('data-project-id');let p=await api('project.open',{project_id:id});
  check('New demo is an actual editable oscillator and does not run automatically',p.design_template.id==='osc_ring5'&&p.runs.length===0);
  await page.getByLabel('강의용 글자 크게',{exact:false}).check();await page.getByTestId('lecture-present').click();
  await page.screenshot({path:path.join(out,'ring-workbench-1080p.png')});
  const svg=page.locator('svg.schematic-svg');
  const canvas=await svg.boundingBox();assert(canvas);await page.mouse.move(canvas.x+canvas.width/2,canvas.y+canvas.height/2);await page.mouse.wheel(0,-450);await page.waitForTimeout(300);
  await page.getByTestId('schematic-tool-pan').click();await page.mouse.move(canvas.x+80,canvas.y+45);await page.mouse.down();await page.mouse.move(canvas.x+80,canvas.y+145,{steps:12});await page.mouse.up();await page.waitForTimeout(500);
  await page.screenshot({path:path.join(out,'ring-device-closeup-1080p.png')});
  await page.getByRole('button',{name:'Fit',exact:true}).click();
  await page.getByLabel('다음 강의 단계',{exact:true}).click();await page.getByLabel('다음 강의 단계',{exact:true}).click();
  check('Lecture steps retain circuit revision and do not fabricate results',(await api('project.open',{project_id:id})).revision===p.revision&&(await api('project.open',{project_id:id})).runs.length===0);
  await page.keyboard.press('F8');
  // Simulate through the visible app control, not the private helper API.
  const simulate=page.getByRole('button',{name:'Simulate',exact:true});await simulate.click();
  const deadline=Date.now()+150000;let job;
  while(Date.now()<deadline){p=await api('project.open',{project_id:id});job=p.runs.at(-1);if(job&&!['queued','running'].includes(job.execution_status))break;await page.waitForTimeout(300);}
  check('Visible Simulate invokes ngspice and completes current oscillator criteria',job?.execution_status==='completed'&&job.analysis_result==='pass'&&job.freshness==='current');
  await page.waitForTimeout(3500);await page.screenshot({path:path.join(out,'ring-actual-result-1080p.png')});
  check('Prepared instructor project was not modified',JSON.stringify(await api('project.open',{project_id:ring.project_id}))===JSON.stringify(original));
  for(const d of readiness.demos){await page.goto(`http://127.0.0.1:5188/eda?project=${d.project_id}&lecture=${({divider:'divider',rc:'rc',inverter:'inverter',layout:'layout',ring:'osc-ring',sensor:'osc-sensor',beat:'osc-beat',burst:'osc-burst'})[d.id]}`);await page.getByTestId('app-ready').waitFor();assert.equal(await page.getByTestId('app-ready').getAttribute('data-project-id'),d.project_id);await page.getByTestId('lecture-studio').waitFor();}
  check('All eight prepared projects open through the instructor deep links',true);
  check('Vite does not expose private course manuscripts',(await context.request.get('http://127.0.0.1:5188/teaching-private/inflearn-resistor/course.json')).status()===403);
  check('Browser completed without JavaScript errors',report.errors.length===0);report.completed=true;report.actual_run={project_id:id,run_id:job.id,revision:job.revision};
}catch(e){report.completed=false;report.error=e.message;await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});report.body=await page.locator('body').innerText().catch(()=>'');throw e;}
finally{const video=page.video();await context.close();if(video)await video.saveAs(path.join(out,'actual-app-rehearsal-1080p.webm'));await browser.close();await writeFile(path.join(out,'ui-verification.json'),JSON.stringify(report,null,2)+'\n');}
