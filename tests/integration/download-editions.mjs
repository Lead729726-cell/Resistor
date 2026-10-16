import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from '@playwright/test';
const site=path.resolve('platform/download-site'),config=JSON.parse(await readFile(site+'/vercel.json','utf8')),editions=JSON.parse(await readFile(site+'/edition-downloads.json','utf8')),common=JSON.parse(await readFile(site+'/downloads.json','utf8'));
let server;const external=process.env.REGISTER_DOWNLOAD_URL;
if(!external){server=createServer(async(req,res)=>{try{const p=decodeURIComponent(new URL(req.url,'http://localhost').pathname),redirect=config.redirects.find(r=>r.source===p);if(redirect){res.writeHead(307,{Location:redirect.destination});res.end();return;}const route=p==='/'?'index.html':(config.rewrites.find(r=>r.source===p)?.destination||p).replace(/^\//,'');if(route.split('/').some(p=>p.startsWith('.'))||!/^[-\w/.]+$/.test(route))throw Error('Invalid path');const b=await readFile(path.join(site,route)),mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};res.writeHead(200,{'Content-Type':mime[path.extname(route)]||'application/octet-stream',...Object.fromEntries((config.headers.find(h=>h.source==='/(.*)')?.headers||[]).map(h=>[h.key,h.value]))});res.end(req.method==='HEAD'?undefined:b);}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));}
const base=external||'http://127.0.0.1:'+server.address().port,out=path.resolve('docs/evidence/edition-downloads/'+(external?'public':'local'));await mkdir(out,{recursive:true});
const report={schema_version:1,checked_at:new Date().toISOString(),base_url:base,checks:[],browser_errors:[],native_installer_publication:editions.editions.every(e=>e.native_installer.status==='published'),source_archive_verification:'Pinned public product identity and archive HEAD; full source ZIP bytes/checksums not measured.'};
const check=(name,ok)=>{assert(ok,name);report.checks.push({name,pass:true});};let browser,page;
try{
  browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>report.browser_errors.push(e.message));
  for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:1000});await page.goto(base,{waitUntil:'networkidle'});
    check('Two distinct edition choices are visible at '+width,await page.locator('[data-edition-download]').count()===2&&await page.locator('[data-edition-download="edu"]').isVisible()&&await page.locator('[data-edition-download="indust"]').isVisible());
    check('Common OS installers remain explicit at '+width,(await page.locator('#common-downloads h2').innerText()).includes('공통 설치 파일')&&await page.locator('#common-downloads .download').count()===4);
    for(const e of editions.editions){const slug=e.edition==='edu'?'edu':'industry';
      await page.goto(base);await page.locator(`[data-edition-download="${e.edition}"]`).click();await page.locator(`[data-download-edition="${e.edition}"]`).waitFor();
      check(e.edition+' distinct page and source download at '+width,(await page.locator('h1').innerText()).includes(e.edition==='edu'?'Resistor Edu':'Resistor Industry')&&await page.locator('[data-source-download]').getAttribute('href')===`/download/${slug}/source`);
      check(e.edition+' declares installer status and actual command at '+width,await page.locator('[data-platform-target]').count()===5&&await page.locator('[data-native-download]').count()===(e.native_installer.status==='published'?5:0)&&await page.locator('.wb-pending').count()===(e.native_installer.status==='published'?0:5)&&(await page.locator('.wb-edition-source pre').textContent()).includes('npm run dev:'+e.edition));
      check(e.edition+' keyboard skip and selected navigation at '+width,await page.locator('#main-content').count()===1&&await page.locator('[data-wb-section="download"][aria-current]').count()===1);
      check(e.edition+' no horizontal overflow at '+width,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      if(width===1440||width===390)await page.screenshot({path:path.join(out,`${e.edition}-${width}.png`),fullPage:true});
    }
  }
  for(const [name,profile,expected] of [
    ['Windows ARM',{userAgent:'Windows NT 10.0; Win64; x64',platform:'Win32',hints:{platform:'Windows',architecture:'arm',bitness:'64',platformVersion:'19.0.0'}},'windows-arm64'],
    ['Safari Mac',{userAgent:'Macintosh; Intel Mac OS X 10_15_7',platform:'MacIntel',hints:null},null],
    ['Linux ARM',{userAgent:'X11; Linux aarch64',platform:'Linux aarch64',hints:null},null],
  ]){
    const context=await browser.newContext({viewport:{width:390,height:900}});
    await context.addInitScript(profile=>{Object.defineProperty(navigator,'userAgent',{value:profile.userAgent});Object.defineProperty(navigator,'platform',{value:profile.platform});Object.defineProperty(navigator,'userAgentData',{value:profile.hints?{platform:profile.hints.platform,getHighEntropyValues:async()=>profile.hints}:undefined});},profile);
    const p=await context.newPage();await p.goto(base+'/download/edu/',{waitUntil:'networkidle'});await p.locator('[data-system-label]').filter({hasNotText:'확인 중'}).waitFor();
    check(name+' picks only the matching native platform',expected?await p.locator('[data-recommended]').getAttribute('data-platform-target')===expected:await p.locator('[data-recommended]').count()===0);
    const published=editions.editions.find(e=>e.edition==='edu').native_installer.status==='published';check(name+' offers only an available installer for the detected system',expected&&published?await p.locator('[data-system-action]').getAttribute('href')===base+'/download/edu/'+expected:await p.locator('[data-system-action]').isHidden());
    await p.getByLabel('설치할 시스템',{exact:true}).selectOption('macos-arm64');check(name+' permits manual Mac selection',await p.locator('[data-recommended]').getAttribute('data-platform-target')==='macos-arm64');
    await p.goto(base+'/download/industry/',{waitUntil:'networkidle'});check(name+' keeps the manual target between edition pages',await p.getByLabel('설치할 시스템',{exact:true}).inputValue()==='macos-arm64'&&await p.locator('[data-recommended]').getAttribute('data-platform-target')==='macos-arm64');
    if(editions.editions.find(e=>e.edition==='indust').native_installer.status==='published')check(name+' manual download preserves the chosen edition',await p.locator('[data-system-action]').getAttribute('href')===base+'/download/industry/macos-arm64');
    await p.getByLabel('설치할 시스템',{exact:true}).selectOption('');check(name+' restores automatic detection',await p.locator('[data-recommended]').count()===(expected?1:0));
    await context.close();
  }
  await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/download/edu/');
  await page.locator('[data-theme]').click();const theme=await page.locator('html').getAttribute('data-theme');await page.reload();check('Theme survives reload on Edu download',await page.locator('html').getAttribute('data-theme')===theme);await page.getByRole('link',{name:'다른 에디션 다운로드',exact:true}).click();check('Cross-edition navigation keeps theme',await page.locator('[data-download-edition="indust"]').isVisible()&&await page.locator('html').getAttribute('data-theme')===theme);await page.screenshot({path:path.join(out,'industry-alternate-theme.png'),fullPage:true});
  for(const e of editions.editions){const slug=e.edition==='edu'?'edu':'industry';
    for(const suffix of ['','/'])check(e.edition+' canonical page '+suffix,(await fetch(base+`/download/${slug}${suffix}`)).ok);
    const r=await fetch(base+`/download/${slug}/source`,{redirect:'manual'});check(e.edition+' exact pinned ZIP redirect',[302,303,307,308].includes(r.status)&&r.headers.get('location')===e.source.url);
    for(const f of e.native_installer.files){const r=await fetch(base+`/download/${slug}/${f.target}`,{redirect:'manual'});check(e.edition+' '+f.target+' redirects to its verified installer',[302,303,307,308].includes(r.status)&&r.headers.get('location')===f.url);}
    const identity=await fetch(`https://raw.githubusercontent.com/Lead729726-cell/Resistor/${e.source.revision}/product-edition.json`,{signal:AbortSignal.timeout(30000)});check(e.edition+' public archive identity',identity.ok&&(await identity.json()).edition===e.edition);
    const zip=await fetch(e.source.url,{method:'HEAD',signal:AbortSignal.timeout(90000)});check(e.edition+' public source ZIP reachable',zip.ok&&zip.headers.get('content-type')?.includes('zip'));
  }
  for(const f of common.files){const r=await fetch(base+'/download/'+f.platform,{redirect:'manual'});check('Historical '+f.platform+' installer URL preserved',[302,303,307,308].includes(r.status)&&r.headers.get('location')===f.url);}
  const alias=await fetch(base+'/download/indust/',{redirect:'manual'});check('Indust alias leads to Industry page',[302,303,307,308].includes(alias.status)&&alias.headers.get('location')==='/download/industry/');
  check('Published edition metadata agrees with local verification',JSON.stringify(await (await fetch(base+'/edition-downloads.json')).json())===JSON.stringify(editions));
  for(const p of ['/.env.local','/.runtime/worker.json','/.vercel/project.json'])check('No private file '+p,(await fetch(base+p)).status===404);
  await page.goto(base);await page.evaluate(()=>{scrollTo(0,0);document.activeElement?.blur();});await page.screenshot({path:path.join(out,'home.png'),fullPage:true});check('No browser JavaScript errors',report.browser_errors.length===0);report.completed=true;
}catch(e){report.completed=false;report.error=e.message;if(page)await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});throw e;}
finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));report.passed=report.checks.length;await writeFile(path.join(out,'verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({completed:report.completed,passed:report.passed,error:report.error}));}
