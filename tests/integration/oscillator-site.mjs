import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from '@playwright/test';

const site=path.resolve('platform/download-site'),config=JSON.parse(await readFile(site+'/vercel.json','utf8'));
const external=process.env.REGISTER_OSCILLATOR_URL;
let server;
if(!external){server=createServer(async(req,res)=>{try{
  const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const route=name==='/'?'index.html':(config.rewrites.find(r=>r.source===name)?.destination||name).replace(/^\//,'');
  if(route.split('/').some(p=>p.startsWith('.'))||!/^[-\w/.]+$/.test(route))throw Error('Invalid path');
  const body=await readFile(path.join(site,route));
  const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webm':'video/webm'};
  res.writeHead(200,{'Content-Type':types[path.extname(route)]||'application/octet-stream'});res.end(req.method==='HEAD'?undefined:body);
}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));}
const origin=external||'http://127.0.0.1:'+server.address().port,out='docs/evidence/oscillator-lab';await mkdir(out,{recursive:true});
const report={schema_version:1,checked_at:new Date().toISOString(),origin,completed:false,checks:[],browser_errors:[]};
const check=(name,yes)=>{assert(yes,name);report.checks.push({name,passed:true});};let browser,page;
try{
  browser=await chromium.launch({headless:true});page=await browser.newPage();
  page.on('pageerror',e=>report.browser_errors.push(e.message));
  for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:1000});await page.goto(origin+'/tutorial/oscillators/',{waitUntil:'networkidle'});
    check('four project guides at '+width,await page.locator('[data-oscillator-project]').count()===4);
    check('four editable project downloads at '+width,await page.getByRole('link',{name:'편집 가능한 프로젝트 ↓'}).count()===4);
    check('selected tutorial nav and keyboard skip at '+width,await page.locator('[data-wb-section="tutorial"][aria-current]').count()===1&&await page.locator('#main-content').count()===1);
    check('no horizontal page overflow at '+width,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    check('old installer compatibility is explicit at '+width,(await page.locator('main').innerText()).includes('0.28 설치 파일에는 이 네 프로젝트가 아직 포함되지 않았습니다'));
    await page.screenshot({path:path.join(out,`site-${external?'public':'local'}-${width}.png`)});
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('#osc_rc_sensor').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`site-${external?'public':'local'}-sensor.png`)});
  await page.locator('button[data-theme]').click();
  check('dark theme remains usable',await page.evaluate(()=>document.documentElement.dataset.theme==='dark'));
  await page.screenshot({path:path.join(out,`site-${external?'public':'local'}-dark.png`)});
  await page.locator('button[data-theme]').click();
  check('light theme remains usable',await page.evaluate(()=>document.documentElement.dataset.theme==='light'));
  const video=page.locator('video');await video.scrollIntoViewIfNeeded();
  await video.evaluate(v=>new Promise((resolve,reject)=>{if(v.readyState>=1)return resolve(true);v.addEventListener('loadedmetadata',()=>resolve(true),{once:true});v.addEventListener('error',()=>reject(Error('Recorded workflow video failed to load')),{once:true});setTimeout(()=>reject(Error('Video metadata timeout')),15000);}));
  check('actual app recording has usable video metadata',await video.evaluate(v=>v.duration>1&&v.videoWidth===1600&&v.videoHeight===1000));
  const expected=JSON.parse(await readFile(site+'/oscillator-assets/SHA256SUMS.json','utf8'));
  for(const [file,item] of Object.entries(expected)){
    const response=await fetch(origin+'/oscillator-assets/'+file);assert(response.ok,file);const bytes=Buffer.from(await response.arrayBuffer());
    check('download bytes and SHA256: '+file,bytes.length===item.bytes&&createHash('sha256').update(bytes).digest('hex')===item.sha256);
  }
  check('no browser runtime errors',report.browser_errors.length===0);report.completed=true;
}finally{
  if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));
  await writeFile(path.join(out,`site-${external?'public':'local'}-verification.json`),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({completed:report.completed,checks:report.checks.length,errors:report.browser_errors}));
}
