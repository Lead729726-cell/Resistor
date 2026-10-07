import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from '@playwright/test';

const folder=path.resolve('platform/download-site');
const config=JSON.parse(await readFile(path.join(folder,'vercel.json'),'utf8'));
const manifest=JSON.parse(await readFile(path.join(folder,'downloads.json'),'utf8'));
let server,base=process.env.REGISTER_DOWNLOAD_URL;
if(!base){
  server=createServer(async(req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    const redirect=config.redirects.find(r=>r.source===pathname);
    if(redirect){res.writeHead(307,{Location:redirect.destination});res.end();return;}
    const file=pathname==='/'?'index.html':pathname.slice(1);
    if(!/^[\w.-]+$/.test(file)){res.writeHead(404);res.end();return;}
    try{
      const body=await readFile(path.join(folder,file));
      const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
      res.writeHead(200,{'Content-Type':types[path.extname(file)]||'text/plain',...Object.fromEntries(config.headers[0].headers.map(h=>[h.key,h.value]))});res.end(body);
    }catch{res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  base=`http://127.0.0.1:${server.address().port}`;
}
const checks=[],browser=await chromium.launch({headless:true});
const check=(name,condition)=>{assert.ok(condition,name);checks.push({name,pass:true});};
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:950});await page.goto(base,{waitUntil:'networkidle'});
    for(const file of manifest.files){
      const button=page.locator(`.download .button[href="/download/${file.platform}"]`);
      check(`Visible ${file.platform} download at ${width}px`,await button.isVisible());
    }
    check(`No horizontal overflow at ${width}px`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  const before=await page.locator('html').getAttribute('data-theme');
  await page.locator('[data-theme]').click();
  const after=await page.locator('html').getAttribute('data-theme');
  check('Theme changes',after!==before);
  await page.reload();check('Theme persists',await page.locator('html').getAttribute('data-theme')===after);
  await page.getByRole('link',{name:'PDK 전체 모음집 →'}).click();
  check('PDK page opens',await page.locator('h1').innerText().then(s=>s.includes('PDK')));
  check('PDK mobile has no overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  check('No JavaScript errors',errors.length===0);
  for(const file of manifest.files){
    const response=await fetch(`${base}/download/${file.platform}`,{redirect:'manual'});
    check(`Actual ${file.platform} download redirect`,[302,303,307,308].includes(response.status)&&response.headers.get('location')===file.url);
    const remote=await fetch(file.url,{method:'HEAD',signal:AbortSignal.timeout(30000)});
    check(`Published ${file.platform} asset reachable`,remote.ok);
    check(`Published ${file.platform} size matches`,Number(remote.headers.get('content-length'))===file.bytes);
  }
  const response=await fetch(`${base}/downloads.json`);
  const publicManifest=await response.json();
  check('Public manifest matches checked release',publicManifest.version===manifest.version&&JSON.stringify(publicManifest.files)===JSON.stringify(manifest.files));
  for(const pathname of ['/.env.local','/.runtime/worker.json','/.vercel/project.json']){
    check(`Private file not exposed: ${pathname}`,(await fetch(base+pathname)).status===404);
  }
  const security=await fetch(base);
  check('Security headers applied',security.headers.get('x-content-type-options')==='nosniff'&&security.headers.get('content-security-policy')?.includes("frame-ancestors 'none'"));
  await page.setViewportSize({width:1440,height:1000});await page.goto(base);
  await mkdir('docs/evidence',{recursive:true});
  const scope=process.env.REGISTER_DOWNLOAD_URL?'public':'local';
  await page.screenshot({path:`docs/evidence/download-site-${scope}.png`,fullPage:true});
  await writeFile(`docs/evidence/download-site-${scope}.json`,JSON.stringify({schema_version:1,checked_at:new Date().toISOString(),base_url:base,version:manifest.version,passed:checks.length,checks},null,2)+'\n');
  console.log(JSON.stringify({base,version:manifest.version,passed:checks.length,errors},null,2));
}finally{await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
