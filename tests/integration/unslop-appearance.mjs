// Appearance qualification against an explicitly isolated local Indust preview.
// Uses a public GDS file and native readbacks. No mutation or engine dispatch.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {chromium} from '@playwright/test';
import {runtimeConfig,workerRpc} from '../../scripts/runtime.mjs';

const out=path.resolve(process.env.RESISTOR_UI_QA_OUTPUT||'docs/evidence/unslop-20261110/appearance');
await mkdir(out,{recursive:true});
const capture=process.env.RESISTOR_QA_CAPTURE!=='0',priorEvidence=capture?null:JSON.parse(await readFile(path.join(out,'ui-verification.json'),'utf8'));

const preview=JSON.parse(await readFile(process.env.RESISTOR_UI_QA_PREVIEW||'.runtime/guided-preview-info.json','utf8'));
assert(path.resolve(preview.workspace).startsWith(path.resolve('.runtime/guided-preview')+path.sep),'Only a dedicated QA preview workspace is permitted');
assert.match(preview.scope,/Isolated Indust UI preview/);
const endpoint=new URL(preview.url);assert.equal(endpoint.hostname,'127.0.0.1');
const config=await runtimeConfig(preview.workspace),presets=JSON.parse(await readFile('packages/ui/src/appearance-presets.json','utf8'));
const api=async(method,params={})=>{assert(['project.open','view.get_scene','job.status'].includes(method));const response=await workerRpc(config,method,params);assert(response.ok,JSON.stringify(response.error));return response.result;};
const poll=async(fn,message,timeout=30000)=>{const deadline=Date.now()+timeout;while(!await fn()){assert(Date.now()<deadline,message);await new Promise(resolve=>setTimeout(resolve,80));}};
const report={schema_version:1,edition:'indust',checked_at:new Date().toISOString(),completed:false,paid_calls:0,screenshots_captured_this_run:capture,workspace:preview.workspace,project_id:preview.project_id,cases:[],browser_errors:[],ui_methods:[],palettes:[]};
const check=(name,condition,details={})=>{assert(condition,name);report.cases.push({name,pass:true,...details});console.log('PASS '+name);};
const sourceFiles=['packages/ui/src/App.tsx','packages/ui/src/TaskChooser.tsx','packages/ui/src/appearance-presets.json','packages/ui/src/AppearanceControl.tsx','packages/ui/src/appearance.css','packages/ui/src/styles.css','packages/ui/src/guided-workbench.css','packages/ui/src/precision-workbench.css','packages/ui/src/schematic-guided.css','packages/ui/src/starter-flow.css','packages/ui/src/pdk-guided.css','packages/ui/src/hardware-guided.css','packages/ui/src/integrated-guided.css','packages/viewer/src/LayoutViewer.tsx','packages/viewer/src/viewer.css','packages/viewer/src/layout-guided.css','tests/integration/unslop-appearance.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(sourceFiles.map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')])));
const initialHashes=await hashes();
if(!capture){const uiOnly=values=>Object.fromEntries(Object.entries(values).filter(([file])=>!file.startsWith('tests/')));assert.deepEqual(uiOnly(initialHashes),uiOnly(priorEvidence.source_sha256),'Cannot reuse screenshots from different UI source');report.reused_screenshot_source_sha256=uiOnly(priorEvidence.source_sha256);}

let browser,context,page;
try{
 let run=await api('job.status',{run_id:preview.run_id});
 await poll(async()=>{run=await api('job.status',{run_id:preview.run_id});return !['queued','running'].includes(run.execution_status);},'Preview must become idle before appearance qualification',180000);
 report.actual_run={id:run.id,revision:run.revision,tool:run.tool,execution_status:run.execution_status,analysis_result:run.analysis_result};
 const before=await api('project.open',{project_id:preview.project_id}),scene=await api('view.get_scene',{project_id:preview.project_id});
 browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.addInitScript(({id,origin})=>{if(location.origin!==origin)return;localStorage.setItem('mos.last_project',id);if(!localStorage.getItem('register.appearance'))localStorage.setItem('register.appearance',JSON.stringify({version:1,mode:'dark',skin:'graphite'}));},{id:preview.project_id,origin:endpoint.origin});
 page=await context.newPage();
 context.on('page',next=>next.on('pageerror',e=>report.browser_errors.push({message:e.message,stack:e.stack,url:next.url()})));
 page.on('pageerror',e=>report.browser_errors.push({message:e.message,stack:e.stack,url:page.url()}));
 page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/api/rpc'))report.ui_methods.push(r.postDataJSON()?.method);});
 const choose=async(mode,skin)=>{if(!await page.getByTestId('appearance-panel').isVisible())await page.getByTestId('appearance-open').click();await page.getByTestId('appearance-mode-'+mode).click();await page.getByTestId('appearance-skin-'+skin).click();};
 const closeStyle=async()=>{await page.getByRole('button',{name:'화면 스타일 닫기',exact:true}).click();await page.getByTestId('appearance-panel').waitFor({state:'hidden'});};
 const readBundle=async()=>{const waiting=page.waitForEvent('download');await page.getByTestId('viewer-export').click();const file=await waiting;return JSON.parse(await readFile(await file.path(),'utf8'));};
 await page.goto(endpoint.origin+'/?mode=viewer');await page.getByTestId('viewer-empty-gds-input').setInputFiles('examples/sky130/mosfet.gds');
 await poll(async()=>await page.getByTestId('viewer-shape-count').innerText()==='52 / 52','Expected actual GDS geometry');
 const initialBundle=await readBundle();await page.locator('canvas').evaluate(canvas=>{canvas.dataset.qaIdentity='preserved-renderer';});
 for(const mode of ['dark','light'])for(const [skin,value] of Object.entries(presets.skins)){
  await choose(mode,skin);
  await poll(async()=>await page.locator('html').getAttribute('data-theme')===mode&&await page.locator('html').getAttribute('data-skin')===skin,'Palette did not apply');
  assert.equal(await page.locator('canvas').getAttribute('data-appearance-background'),value[mode].canvas);
  assert.equal(await page.locator('canvas').getAttribute('data-qa-identity'),'preserved-renderer');
  const ratios=await page.evaluate(()=>{
   const style=getComputedStyle(document.documentElement),luminance=color=>{const numbers=color.startsWith('#')?color.slice(1).match(/../g).map(v=>parseInt(v,16)):color.match(/[\d.]+/g).slice(0,3).map(Number);const rgb=numbers.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];};
   return Object.fromEntries(['--text','--muted','--faint','--accent'].map(token=>[token,Math.min(...['--panel','--canvas'].map(bg=>{const a=luminance(style.getPropertyValue(token).trim()),b=luminance(style.getPropertyValue(bg).trim());return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);} ))]));
  });
  for(const [token,ratio] of Object.entries(ratios))assert(ratio>=4.5,`${mode}/${skin}/${token} contrast ${ratio}`);
  await closeStyle();report.palettes.push({mode,skin,ratios,canvas:value[mode].canvas});
 }
 check('Eight retained palettes update the same real GDS renderer with readable text',report.palettes.length===8);
 const finalBundle=await readBundle();assert.deepEqual(finalBundle.scene,initialBundle.scene);assert.deepEqual(finalBundle.display,initialBundle.display);assert.equal(finalBundle.sourceGdsBase64,initialBundle.sourceGdsBase64);
 const gdsHash=createHash('sha256').update(await readFile('examples/sky130/mosfet.gds')).digest('hex');assert.equal(createHash('sha256').update(Buffer.from(finalBundle.sourceGdsBase64,'base64')).digest('hex'),gdsHash);
 check('Theme changes preserve actual GDS geometry, layer colors, display and source bytes',true,{gds_sha256:gdsHash});
 check('Standalone viewer appearance sends no engine requests',report.ui_methods.every(method=>method==='license.status'),{license_status_reads:report.ui_methods.length});
 await choose('system','iris');await page.emulateMedia({colorScheme:'dark'});await poll(async()=>await page.locator('html').getAttribute('data-theme')==='dark','System dark mode');await page.emulateMedia({colorScheme:'light'});await poll(async()=>await page.locator('html').getAttribute('data-theme')==='light','System light mode');
 check('System mode follows live OS appearance changes',true);
 await page.getByTestId('appearance-skin-iris').focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');
 check('Skin choices retain keyboard navigation',await page.getByTestId('appearance-skin-jade').evaluate(e=>e===document.activeElement)&&await page.locator('html').getAttribute('data-skin')==='jade');
 await page.keyboard.press('Escape');await page.getByTestId('appearance-panel').waitFor({state:'hidden'});
 await poll(async()=>await page.getByTestId('appearance-open').evaluate(e=>e===document.activeElement),'Appearance focus return');
 check('Escape closes appearance and returns keyboard focus',await page.getByTestId('appearance-open').evaluate(e=>e===document.activeElement));
 await page.reload();await poll(async()=>await page.locator('html').getAttribute('data-skin')==='jade','Stored skin restore');
 check('Stored appearance restores after reload',await page.locator('html').getAttribute('data-theme')==='light');
 const peer=await context.newPage();await peer.goto(endpoint.origin+'/?mode=viewer');await peer.getByTestId('appearance-open').click();await peer.getByTestId('appearance-mode-dark').click();await peer.getByTestId('appearance-skin-copper').click();
 await poll(async()=>await page.locator('html').getAttribute('data-skin')==='copper'&&await page.locator('html').getAttribute('data-theme')==='dark','Cross-tab appearance sync');await peer.close();check('Existing cross-tab appearance synchronization remains active',true);
 await page.goto(preview.url);await page.getByTestId('app-ready').waitFor({timeout:60000});await choose('dark','graphite');await closeStyle();
 const canvasBox=await page.locator('.schematic-svg').boundingBox();check('Desktop workbench retains at least60percent height for the circuit canvas',canvasBox.height>=600,{canvas:canvasBox});
 check('Correct Indust project remains open after viewer and theme changes',await page.getByTestId('app-ready').getAttribute('data-project-id')===before.id);
 if(capture)await page.screenshot({path:path.join(out,'desktop-workbench-dark.png')});
 await page.getByTestId('guided-task-open').click();await page.getByTestId('guided-category-setup').click();await page.getByTestId('guided-parent-back').click();await page.getByTestId('guided-close').click();
 await poll(async()=>await page.getByTestId('guided-task-open').evaluate(e=>e===document.activeElement),'Task focus return');
 check('Task depths still return to the workbench trigger',await page.getByTestId('guided-task-open').evaluate(e=>e===document.activeElement));
 await choose('light','graphite');await closeStyle();await page.getByTestId('guided-run-open').click();
 const actionRatios=await page.getByRole('dialog').locator('button.primary:visible:not(:disabled)').evaluateAll(nodes=>nodes.map(button=>{const s=getComputedStyle(button),luma=c=>{const v=c.match(/[\d.]+/g).slice(0,3).map(Number).map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);return.2126*v[0]+.7152*v[1]+.0722*v[2];},a=luma(s.color),b=luma(s.backgroundColor);return{name:button.textContent.trim(),ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};}));
 check('Enabled primary action has readable foreground contrast',actionRatios.length>0&&actionRatios.every(item=>item.ratio>=4.5),{actions:actionRatios});
 if(capture)await page.screenshot({path:path.join(out,'desktop-run-setup-light.png')});await page.getByTestId('guided-close').click();
 await page.setViewportSize({width:390,height:844});
 const mobileActions=await Promise.all(['appearance-open','guided-task-open','guided-run-open','toggle-inspector'].map(async id=>({id,...await page.getByTestId(id).evaluate(el=>{const b=el.getBoundingClientRect();return{left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height};})})));
 check('Mobile workbench entry actions remain reachable',mobileActions.every(b=>b.left>=0&&b.right<=390&&b.top>=0&&b.bottom<=844&&b.width>0&&b.height>0),{actions:mobileActions});
 await page.getByTestId('guided-task-open').click();
 check('Mobile task popup and page remain inside the viewport',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)&&await page.getByRole('dialog').evaluate(el=>{const b=el.getBoundingClientRect();return b.left>=0&&b.right<=innerWidth&&b.top>=0&&b.bottom<=innerHeight;}));
 if(capture)await page.screenshot({path:path.join(out,'mobile-task-light.png')});await page.getByTestId('guided-close').click();
 await page.getByTestId('appearance-open').click();await page.getByTestId('appearance-panel').evaluate(el=>{el.scrollTop=el.scrollHeight;});
 check('Mobile appearance controls and footer stay reachable',await page.getByTestId('appearance-current').evaluate(el=>{const a=el.getBoundingClientRect(),b=el.closest('dialog').getBoundingClientRect();return a.top>=b.top&&a.bottom<=b.bottom&&b.left>=0&&b.right<=innerWidth;}));await page.keyboard.press('Escape');
 await page.emulateMedia({reducedMotion:'reduce'});await page.getByTestId('guided-task-open').click();
 check('Reduced-motion preference suppresses long UI transitions',await page.getByRole('dialog').evaluate(el=>getComputedStyle(el).transitionDuration.split(',').every(v=>parseFloat(v)<=.01)));await page.getByTestId('guided-close').click();
 await page.setViewportSize({width:320,height:568});await page.getByTestId('guided-task-open').click();
 check('Small 320px task popup remains bounded and scrollable',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)&&await page.getByRole('dialog').evaluate(el=>{const b=el.getBoundingClientRect();return b.left>=0&&b.right<=innerWidth&&b.top>=0&&b.bottom<=innerHeight;}));await page.getByTestId('guided-close').click();
 const after=await api('project.open',{project_id:before.id}),afterScene=await api('view.get_scene',{project_id:before.id});
 assert.deepEqual(after,before);assert.deepEqual(afterScene,scene);
 check('Appearance and popup navigation preserve native project, run history and scene',true,{revision:after.revision});
 check('No appearance navigation dispatches a mutation or numerical engine',!report.ui_methods.some(m=>/^(?:simulation\.run|analysis\.(?:configure|run|verify)|verification\.run_|extraction\.run_|starter\.create|design\.create_|project\.(?:create|import|save)|schematic\.apply_|layout\.(?:apply_|generate_|import))/.test(m)));
 check('Appearance qualification finishes without browser errors',report.browser_errors.length===0);assert.deepEqual(await hashes(),initialHashes,'Appearance source changed during qualification; rerun after edits stop');report.completed=true;
}catch(e){report.error=e.message;throw e;}
finally{
 if(context)await context.close();if(browser)await browser.close();
 report.source_sha256=await hashes();
 await writeFile(path.join(out,'ui-verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({completed:report.completed,cases:report.cases.length,error:report.error}));
}
