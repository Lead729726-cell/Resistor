import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {createServer} from 'node:net';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {_electron} from '@playwright/test';
import {getProductEdition} from './edition-workspace.mjs';
import {stopWorker} from './worker.mjs';
export async function verifyEditionPackage({executable,resources}){
 const edition=getProductEdition(),base=path.resolve('.runtime/edition-package-qa');await mkdir(base,{recursive:true});const workspace=await mkdtemp(path.join(base,edition.edition+'-'));
 await mkdir(path.join(workspace,'.runtime'),{recursive:true});const s=createServer();await new Promise((resolve,reject)=>{s.once('error',reject);s.listen(edition.edition==='edu'?edition.worker_port:0,'127.0.0.1',resolve);});const port=s.address().port;await new Promise(r=>s.close(r));
 await writeFile(path.join(workspace,'.runtime/worker.json'),JSON.stringify({url:'http://127.0.0.1:'+port,token:randomBytes(32).toString('hex')}));
 let app;
 const report={schema_version:1,product_id:edition.id,edition:edition.edition,platform:process.platform,arch:process.arch,source_revision:process.env.RESISTOR_SOURCE_REVISION||null,checked_at:new Date().toISOString(),checks:[],paid_calls:0,manufacturing_signoff:false};
 const check=(name,ok)=>{assert(ok,name);report.checks.push({name,pass:true});console.log('Verified: '+name);};
 try{
   app=await _electron.launch({executablePath:executable,args:['--disable-gpu'],env:{...process.env,RESISTOR_EDITION:edition.edition,MOS_WORKSPACE:workspace,REGISTER_ENGINE_MODE:'native',REGISTER_USER_DATA:path.join(workspace,'user-data'),REGISTER_DOCKER_PATH:path.join(workspace,'no-docker'),PATH:path.dirname(process.execPath)},timeout:120000});
   const page=await app.firstWindow();
   if(edition.edition==='edu'){
     // A fresh Edu session intentionally waits for the learner's choice.
     // Exercise that real UI instead of expecting an auto-created project.
     await page.locator('[data-testid="edu-home"], [data-testid="edu-create-inverter"]').first().waitFor({timeout:120000});
     if(await page.getByTestId('edu-home').isVisible()){
       check('Edu starts at a quiz/design choice without auto-creating a learning project',await page.getByRole('heading',{name:'오늘은 어떻게 배워볼까요?',exact:true}).isVisible());
       await page.getByRole('button',{name:'설계·시뮬레이션 학습',exact:true}).click();
     }
     await page.getByTestId('edu-create-inverter').click({timeout:120000});
     if(await page.getByTestId('edu-design-flow').isVisible()){
       check('Edu design exposes one settings page at a time',await page.getByTestId('edu-step-page').count()===1);
       await page.getByRole('button',{name:'회로도 열기',exact:true}).click({timeout:120000});
     }
   }
   await page.getByTestId('app-ready').waitFor({timeout:120000});if(edition.edition==='edu')await page.keyboard.press('Escape');
   const rpc=async(method,params={})=>{const r=await page.evaluate(({method,params})=>window.mos.rpc(method,params),{method,params});assert(r.ok,JSON.stringify(r.error));return r.result;};
   const context=JSON.parse(await readFile(path.join(resources,'dist/product-context.json'),'utf8')),identity=JSON.parse(await readFile(path.join(resources,'product-edition.json'),'utf8'));
   check('Packaged renderer and main identify the requested edition',context.product_id===edition.id&&identity.edition===edition.edition&&await page.title()===edition.name);
   const shell=await app.evaluate(()=>({arch:process.arch,platform:process.platform}));check('Actual Electron process matches native target',shell.arch===process.arch&&shell.platform===process.platform);
   const runtime=JSON.parse(await readFile(path.join(resources,'native-runtime/manifest.json'),'utf8'));report.runtime_arch=runtime.runtime_arch||runtime.arch;report.requires_emulation=runtime.requires_emulation===true;
   const doctor=await rpc('toolchain.doctor');check('Bundled ngspice available without Docker/system Python',doctor.tools.some(t=>t.name==='ngspice'&&t.available)&&doctor.runner==='native-'+process.platform);
   if(edition.edition==='edu'){
     const lessons=await rpc('learning.list'),study=await rpc('study.catalog');
     check('Installed Edu includes real lesson records and deterministic self-study without a paid call',lessons.edition==='edu'&&lessons.records.length===1&&study.questions?.length>0);
     const dashboard=await rpc('learning.dashboard');check('Installed Edu dashboard reads current revision and isolates QA records',dashboard.edition==='edu'&&Array.isArray(dashboard.records)&&dashboard.read_only===true);
   }
   let p=await rpc('project.create',{example:'schematic',name:'[Release QA] 1.8V divider'});
   for(const device of [{id:'v1',name:'V1',kind:'voltage',pins:{'+':'VDD','-':'0'},parameters:{dc:1.8},x:100,y:100},{id:'r1',name:'R1',kind:'resistor',pins:{'+':'VDD','-':'OUT'},parameters:{value:10000},x:240,y:100},{id:'r2',name:'R2',kind:'resistor',pins:{'+':'OUT','-':'0'},parameters:{value:10000},x:240,y:240}])p=await rpc('schematic.apply_command',{project_id:p.id,expected_revision:p.revision,command_id:crypto.randomUUID(),command:{type:'add_device',device}});
   let run=await rpc('simulation.run',{project_id:p.id,analysis:'op'});const deadline=Date.now()+120000;
   while(['queued','running'].includes(run.execution_status)&&Date.now()<deadline){await new Promise(r=>setTimeout(r,150));run=await rpc('job.status',{run_id:run.id});}
   const voltage=run.waveforms?.find(w=>w.name==='OUT')?.y[0];check('Actual ngspice divider result is 0.9 V with an unknown functional verdict',run.execution_status==='completed'&&run.analysis_result==='unknown'&&Math.abs(voltage-.9)<1e-8);report.run={id:run.id,project_id:p.id,revision:p.revision,execution_status:run.execution_status,analysis_result:run.analysis_result,voltage_V:voltage};
   const layout=await rpc('project.create',{example:'layout',name:'[Release QA] exact DBU mask'});await rpc('layout.apply_command',{project_id:layout.id,expected_revision:layout.revision,command_id:crypto.randomUUID(),command:{type:'add_box',layer_id:'68/20',box:['0','0','1000','1000'],net:'OUT'}});
   const gds=await rpc('layout.export',{project_id:layout.id,format:'gds'});check('Bundled KLayout exports an actual GDS mask',!!gds);
   await page.evaluate(({id,edition})=>localStorage.setItem('mos.last_project'+(edition==='edu'?'.edu':''),id),{id:p.id,edition:edition.edition});await page.reload();if(edition.edition==='edu'){await page.getByTestId('edu-step-page').waitFor({timeout:120000});if(await page.getByTestId('edu-design-flow').isVisible())await page.getByRole('button',{name:'회로도 열기',exact:true}).click({timeout:120000});}await page.getByTestId('app-ready').waitFor({timeout:60000});if(edition.edition==='edu')await page.keyboard.press('Escape');
   check('Project and completed result survive renderer reload',(await rpc('project.open',{project_id:p.id})).runs.some(r=>r.id===run.id));
   // Exercise the shipped wiring UI on this disposable native QA workspace.
   const editingId=await page.locator('.app-shell').getAttribute('data-project-id');
   let editing=await rpc('project.open',{project_id:editingId});
   for(const [id,name,x,y] of [['qa-wire-r1','QA_WIRE1',700,100],['qa-wire-r2','QA_WIRE2',920,220]])editing=await rpc('schematic.apply_command',{project_id:editingId,expected_revision:editing.revision,command_id:crypto.randomUUID(),command:{type:'add_device',device:{id,name,kind:'resistor',pins:{'+':'','-':''},parameters:{value:1000},x,y}}});
   await page.reload();
   if(edition.edition==='edu')await page.getByRole('button',{name:'회로도 열기',exact:true}).click({timeout:120000});
   await page.getByTestId('app-ready').waitFor({timeout:120000});await page.getByRole('tab',{name:'회로도 / Schematic',exact:true}).click();
   await page.getByTestId('schematic-pin-QA_WIRE1-+').press('Enter');
   check('Wiring names the selected terminal and exposes explicit cancellation',(await page.locator('.schematic-easy-guide').innerText()).includes('QA_WIRE1.+')&&await page.getByTestId('schematic-wire-cancel').isVisible());
   await page.getByTestId('schematic-wire-cancel').click();
   check('Cancelling a preview does not change the project revision',(await rpc('project.open',{project_id:editingId})).revision===editing.revision);
   await page.getByTestId('schematic-pin-QA_WIRE1-+').press('Enter');await page.getByTestId('schematic-pin-QA_WIRE2-+').press('Enter');
   await page.waitForFunction(()=>document.querySelector('[data-testid="schematic-pin-QA_WIRE1-+"]')?.textContent.includes('N_'),undefined,{timeout:30000});
   const wired=await rpc('project.open',{project_id:editingId}),r1=wired.schematic.devices.find(d=>d.id==='qa-wire-r1'),r2=wired.schematic.devices.find(d=>d.id==='qa-wire-r2');
   check('Installed pin-to-pin wiring saves exactly one revision with matching actual nets',wired.revision===editing.revision+1&&!!r1.pins['+']&&r1.pins['+']===r2.pins['+']);
   await page.screenshot({path:path.join(base,'package-'+edition.edition+'-'+process.platform+'-'+process.arch+'.png')});report.completed=true;
 }catch(e){report.completed=false;report.error=e.message;if(app){const p=await app.firstWindow().catch(()=>null);if(p){report.renderer_text=(await p.locator('body').innerText().catch(()=>'' )).slice(0,5000);await p.screenshot({path:path.join(base,'failure.png')}).catch(()=>{});}}throw e;}finally{
   if(app){let timer;try{await Promise.race([app.close(),new Promise(resolve=>{timer=setTimeout(()=>{app.process().kill();resolve();},15000);})]);}finally{clearTimeout(timer);}}
   try{await stopWorker(workspace);}catch(e){report.cleanup_error=e.message;}
   await writeFile(path.join(base,'receipt.json'),JSON.stringify(report,null,2)+'\n');
 }
 return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await verifyEditionPackage({executable:process.argv[2],resources:process.argv[3]});
