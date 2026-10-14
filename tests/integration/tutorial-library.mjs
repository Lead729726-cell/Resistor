import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile,stat,access} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {chromium} from '@playwright/test';
import {calculators,displayNumber} from '../../packages/calculators/src/index.ts';
const root=path.resolve('platform/download-site'),config=JSON.parse(await readFile(root+'/vercel.json','utf8'));
const catalog=JSON.parse(await readFile(root+'/learning-catalog.json','utf8')),manifest=JSON.parse(await readFile(root+'/learning-assets.json','utf8'));
const records=JSON.parse(await readFile(root+'/learning-records.json','utf8')).records;
const checks=[],check=(name,condition)=>{assert.ok(condition,name);checks.push({name,pass:true});};
const hash=body=>createHash('sha256').update(body).digest('hex');
const resolveRoute=p=>p==='/'?'index.html':(config.rewrites.find(r=>r.source===p)?.destination||p).replace(/^\//,'');
const extensions={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.mp4':'video/mp4','.vtt':'text/vtt; charset=utf-8','.md':'text/markdown; charset=utf-8'};
let server;
const publicBase=process.env.REGISTER_LEARNING_URL;
if(!publicBase){server=createServer(async(req,res)=>{try{const route=new URL(req.url,'http://localhost').pathname;const file=resolveRoute(route);if(!/^[\w/.-]+$/.test(file)||file.split('/').includes('..'))throw Error('Invalid route');const absolute=path.join(root,file),s=await stat(absolute);if(!s.isFile())throw Error('Not a file');const h=Object.fromEntries((config.headers.find(h=>h.source==='/(.*)')?.headers||[]).map(h=>[h.key,h.value]));h['Content-Type']=extensions[path.extname(file)]||'application/octet-stream';h['Accept-Ranges']='bytes';const range=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);if(range){const start=Number(range[1]),end=Math.min(Number(range[2]||s.size-1),s.size-1);if(start>end||start>=s.size){res.writeHead(416);res.end();return;}res.writeHead(206,{...h,'Content-Range':`bytes ${start}-${end}/${s.size}`,'Content-Length':end-start+1});if(req.method==='HEAD')res.end();else createReadStream(absolute,{start,end}).pipe(res);}else{res.writeHead(200,{...h,'Content-Length':s.size});if(req.method==='HEAD')res.end();else createReadStream(absolute).pipe(res);}}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));}
const base=publicBase||'http://127.0.0.1:'+server.address().port;
let browser;
try{
 check('112 unique lessons',catalog.counts.total===112&&catalog.lessons.length===112&&new Set(catalog.lessons.map(l=>l.id)).size===112);
 check('Document update does not claim new recordings',catalog.new_video_recorded===false);
 const sourceCatalog=JSON.parse(await readFile('examples/research-20261013/latest-catalog.json','utf8'));
 const designs=JSON.parse(await readFile('examples/research-20261013/'+sourceCatalog.catalog,'utf8')).templates;
 for(const d of [...designs,...['full_adder','adder4','cpu4','adder16','cpu16'].map(id=>({id}))])check('Authored steps and historical evidence '+d.id,catalog.lessons.some(l=>l.design_id===d.id&&l.steps.length>=6)&&records[d.id]?.length>0);
 for(const source of catalog.source_hashes)check('Source hash matches '+source.file,hash(await readFile(source.file))===source.sha256);
 for(const f of manifest.files){const b=await readFile(path.join(root,f.file));check('Generated file SHA '+f.file,b.length===f.bytes&&hash(b)===f.sha256);}
 const links=new Set(),externalRepo=new Set();
 for(const l of catalog.lessons){const html=await readFile(path.join(root,l.file),'utf8');check('Lesson has required practical sections '+l.id,['시작 전에','따라 하기','확인할 결과와 한계','막혔을 때','原文'.replace('原文','원문')].every(s=>html.includes(s)));for(const m of html.matchAll(/(?:href|src)="([^"]+)"/g)){const u=m[1].replaceAll('&amp;','&');if(u.startsWith('/'))links.add(u.split('#')[0]);if(u.startsWith('https://github.com/Lead729726-cell/Resistor/blob/main/'))externalRepo.add(decodeURIComponent(u.split('/blob/main/')[1]));}}
 for(const f of externalRepo){await access(f);check('GitHub source target exists '+f,true);}
 for(const u of links){const r=await fetch(base+u,{method:'HEAD',signal:AbortSignal.timeout(20000)});check('Lesson link works '+u,r.status===200);}
 const actualSource=JSON.parse(await readFile('examples/research-20261013/'+sourceCatalog.evidence,'utf8'));
 for(const row of actualSource.rows){const record=records[row.id].find(r=>r.case===row.key&&r.source_file==='examples/research-20261013/'+sourceCatalog.evidence);check('Engine verdict retained '+row.key,record&&JSON.stringify(record.stages.map(s=>[s.run_id,s.execution_status,s.analysis_result]))===JSON.stringify(row.stages.map(s=>[s.run_id,s.execution_status,s.analysis_result])));}
 check('PLL original post fail remains visible',records.chip_pll.some(r=>r.source_file.includes('physical-library')&&r.stages.some(s=>s.stage==='post'&&s.analysis_result==='fail')));
 check('OTA experiments retain fail',records.soc_miller_ota.some(r=>r.stages.some(s=>s.analysis_result==='fail')));
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/tutorial/library/',{waitUntil:'networkidle'});
 check('All tutorials visible',await page.locator('[data-entry]:visible').count()===112);
 await page.locator('input[name=q]').fill('sar');check('SAR search includes 8 block lessons',await page.locator('[data-entry][data-group="SAR ADC"]:visible').count()===8);
 await page.locator('select[name=kind]').selectOption('design');check('Search and kind intersect',await page.locator('[data-entry]:visible').count()===8);
 await page.reload();check('Shareable filters survive reload',await page.locator('[data-entry]:visible').count()===8);
 await page.getByRole('button',{name:'초기화',exact:true}).click();await page.waitForTimeout(100);check('Filter reset restores all',await page.locator('[data-entry]:visible').count()===112);
 await page.locator('input[name=q]').fill('no-such-scheme-xyz');check('Empty search explained',await page.locator('[data-empty]').isVisible());
 await page.getByRole('button',{name:'초기화',exact:true}).click();await page.waitForTimeout(100);
 await page.locator('h1').click();await page.keyboard.press('/');check('Keyboard search shortcut',await page.locator('input[name=q]').evaluate(e=>e===document.activeElement));
 await page.goto(base+'/tutorial/learn/blank-divider/');await page.getByRole('button',{name:'읽음·실습 완료 표시'}).click();check('Learning check is not PASS',await page.locator('[data-learn-complete]').getAttribute('aria-pressed')==='true'&&(await page.locator('.status-note').innerText()).includes('PASS'));
 await page.reload();check('Learning check persists locally',await page.locator('[data-learn-complete]').getAttribute('aria-pressed')==='true');
 await page.goto(base+'/tutorial/library/');check('Completed lesson shown in hub',await page.locator('[data-progress-id=blank-divider]').getAttribute('data-complete')==='true');
 await page.getByRole('button',{name:'학습 체크 초기화'}).click();check('Learning reset works',await page.locator('[data-progress-id=blank-divider]').getAttribute('data-complete')==='false');
 for(const c of calculators){await page.goto(base+'/tutorial/learn/calc-'+c.id+'/');await page.locator('[data-calc-example]').click();const expected=c.calculate(c.examples[0].inputs);check('Browser uses original formula '+c.id,(await page.locator('.calc-result strong').innerText())===(displayNumber(expected.primaryValue)+' '+(expected.primaryUnit||'')).trim());}
 await page.goto(base+'/tutorial/learn/calc-parallel-resistor/');await page.evaluate(()=>{for(const name of ['r1','r2','r3','r4'])document.querySelector(`[name=${name}]`).value='0';document.querySelector('.calculator-practice form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});check('Invalid network blocks numeric result',await page.locator('.calc-error').isVisible()&&(await page.locator('.calc-result').innerText())==='');
 for(const width of [1440,768,390,320]){await page.setViewportSize({width,height:950});for(const route of ['/tutorial/library/','/tutorial/learn/workbench/','/tutorial/learn/design-sar-adc8/','/tutorial/learn/calc-unit-converter/']){await page.goto(base+route);check('No overflow '+width+' '+route,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}}
 await page.goto(base+'/tutorial/library/');const old=await page.locator('html').getAttribute('data-theme');await page.locator('[data-theme]').click();const next=await page.locator('html').getAttribute('data-theme');check('Light/dark selection changes',next!==old);await page.reload();check('Theme choice persists',await page.locator('html').getAttribute('data-theme')===next);
 const videos=[['/tutorial/','guide-ko-v1.mp4'],['/tutorial/physical-logic/','physical-logic.mp4'],['/tutorial/physical-chips/','physical-chips.mp4']];
 for(const [route,file]of videos){await page.goto(base+route);const video=page.locator('video');await video.evaluate(v=>v.load());await page.waitForFunction(()=>{const v=document.querySelector('video');return v&&v.readyState>=1&&v.duration>0;},{},{timeout:30000});const meta=await video.evaluate(v=>({width:v.videoWidth,height:v.videoHeight,duration:v.duration,tracks:v.querySelectorAll('track').length,src:v.currentSrc,error:v.error?.message}));check('Preserved 1080p tutorial '+file,meta.width===1920&&meta.height===1080&&meta.duration>60&&meta.tracks>=1&&!meta.error);}
 check('No browser script errors',errors.length===0);
 await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/tutorial/library/');await mkdir('docs/evidence/tutorial-library',{recursive:true});await page.screenshot({path:'docs/evidence/tutorial-library/'+(publicBase?'public':'local')+'-desktop.png',fullPage:false});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'docs/evidence/tutorial-library/'+(publicBase?'public':'local')+'-mobile.png',fullPage:false});
 const result={schema_version:1,checked_at:new Date().toISOString(),base_url:base,guide_version:catalog.guide_version,counts:catalog.counts,passed:checks.length,checks,browser_errors:errors,new_video_recorded:false};await writeFile('docs/evidence/tutorial-library/'+(publicBase?'public':'local')+'-verification.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({base,counts:catalog.counts,passed:checks.length,browser_errors:errors},null,2));
}finally{await browser?.close();if(server)await new Promise(r=>server.close(r));}
