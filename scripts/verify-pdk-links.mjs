import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from '@playwright/test';
import {loadPdkCatalog} from './download-pdk-catalog.mjs';

const catalog=await loadPdkCatalog(),digest=bytes=>createHash('sha256').update(bytes).digest('hex');
await mkdir('docs/evidence',{recursive:true});
if(process.argv.includes('--external')){
  const links=[...new Set(catalog.resources.flatMap(r=>r.links.map(l=>l.url)))],results=[];
  let next=0;
  await Promise.all(Array.from({length:4},async()=>{
    while(next<links.length){
      const url=links[next++],started=Date.now();
      try{
        const response=await fetch(url,{signal:AbortSignal.timeout(30000),headers:{'User-Agent':'Register-PDK-Link-Check/1.0'}});
        await response.body?.cancel();
        results.push({url,status:response.status,final_url:response.url,reachable:response.ok,elapsed_ms:Date.now()-started});
        console.log(`${response.status} ${url}`);
      }catch(error){results.push({url,reachable:false,error:error.message,elapsed_ms:Date.now()-started});console.log(`UNVERIFIED ${url}: ${error.message}`);}
    }
  }));
  results.sort((a,b)=>links.indexOf(a.url)-links.indexOf(b.url));
  const evidence={checked_at:new Date().toISOString(),resources:catalog.resources.length,unique_links:links.length,reachable:results.filter(r=>r.reachable).length,results};
  await writeFile('docs/evidence/open-pdk-external-links.json',JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify({resources:evidence.resources,unique_links:evidence.unique_links,reachable:evidence.reachable}));
  if(results.some(r=>r.status===404||r.status===410))process.exitCode=1;
}else{
  const receipt=JSON.parse(await readFile('.runtime/download-link.json','utf8'));
  const release=JSON.parse(await readFile(`.runtime/public-download/${receipt.version}/release.json`,'utf8'));
  const origin=receipt.url.replace(/\/$/,''),url=`${origin}/pdk-links.html`;
  const expected=catalog.resources.flatMap(r=>r.links.map(l=>({url:l.url,label:l.label})));
  const browser=await chromium.launch({headless:true}),views=[];
  try{
    for(const [name,width,height] of [['desktop',1280,1000],['mobile',390,844]]){
      const page=await browser.newPage({viewport:{width,height}});
      let response=await page.goto(origin,{waitUntil:'networkidle',timeout:45000});
      assert.equal(response.status(),200);
      assert.equal(await page.locator('.cards a.download').count(),3);
      const currentMac=release.files.find(f=>f.platform==='macOS'&&f.architecture==='arm64');
      assert.equal(await page.locator('.cards a.download').first().getAttribute('href'),'/'+currentMac.name);
      if(currentMac.build_revision===2){assert.ok(await page.locator('#mac-install').isVisible());assert.match(await page.locator('#mac-install').textContent(),/Install Register\.command/);}
      assert.equal(await page.locator('.reference-download').getAttribute('href'),'/register-voltage-references.zip');
      assert.equal(await page.locator('#pdk-library h2').textContent(),catalog.title);
      assert.equal(await page.locator('.pdk-library-link').getAttribute('href'),'/pdk-links.html');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:`docs/evidence/public-download-0.14.0-${name}.png`,fullPage:true});
      await page.locator('.pdk-library-link').click();
      await page.waitForURL(url);
      assert.equal(await page.title(),`${catalog.title} · 레지스터`);
      assert.equal(await page.locator('.resource-grid article').count(),catalog.resources.length);
      const links=await page.locator('.resource-links a').evaluateAll(nodes=>nodes.map(a=>({url:a.href,label:a.textContent,target:a.target,rel:a.rel})));
      assert.equal(links.length,expected.length);
      assert.deepEqual(links.map(l=>l.url),expected.map(l=>l.url));
      assert.ok(links.every(l=>l.target==='_blank'&&l.rel.includes('noopener')&&l.rel.includes('noreferrer')));
      assert.equal(await page.locator('.register-note.verified').count(),1);
      assert.ok(await page.locator('header img').evaluate(img=>img.complete&&img.naturalWidth>0));
      assert.equal(await page.locator('script').count(),0);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:`docs/evidence/open-pdk-catalog-${name}-top.png`});
      await page.screenshot({path:`docs/evidence/open-pdk-catalog-${name}.png`,fullPage:true});
      await page.locator('nav a[href="#setup"]').click();
      await page.waitForURL(`${url}#setup`);
      assert.ok(await page.locator('#setup h2').isVisible());
      await page.locator('.back').click();
      await page.waitForURL(`${origin}/`);
      views.push({name,width,height,screenshot:`docs/evidence/public-download-0.14.0-${name}.png`,catalog_screenshot:`docs/evidence/open-pdk-catalog-${name}.png`,catalog_top_screenshot:`docs/evidence/open-pdk-catalog-${name}-top.png`,home_catalog_link:true,installer_links:3,reference_zip_link:true,resource_cards:catalog.resources.length,external_links:links.length,category_navigation:true,back_navigation:true,horizontal_overflow:false,logo_loaded:true});
      await page.close();
    }
  }finally{await browser.close();}
  const downloads=[];
  for(const name of ['pdk-links.html','open-pdk-links.json','open-pdk-links.md']){
    const file=release.files.find(f=>f.name===name);assert.ok(file);
    const response=await fetch(`${origin}/${name}`,{signal:AbortSignal.timeout(30000)}),bytes=Buffer.from(await response.arrayBuffer());
    assert.equal(response.status,200);assert.equal(bytes.length,file.bytes);assert.equal(digest(bytes),file.sha256);
    if(file.download)assert.match(response.headers.get('content-disposition'),/attachment/);
    if(name.endsWith('.json'))assert.deepEqual(JSON.parse(bytes.toString('utf8')),catalog);
    downloads.push({name,status:response.status,bytes:bytes.length,sha256:digest(bytes),matches_snapshot:true});
  }
  const privateProbes=[];
  for(const privatePath of ['/.runtime/worker.json','/api/rpc','/scripts/download-server.mjs','/docs/open-pdk-links.json','/release.json']){
    const response=await fetch(origin+privatePath,{signal:AbortSignal.timeout(15000)});await response.body?.cancel();assert.equal(response.status,404);
    privateProbes.push({path:privatePath,status:response.status});
  }
  const verifiedAt=new Date().toISOString();
  await writeFile('docs/evidence/open-pdk-public-page.json',JSON.stringify({url,verified_at:verifiedAt,views,downloads,private_endpoint_probes:privateProbes},null,2)+'\n');
  await writeFile('docs/evidence/public-download-page-0.14.0.json',JSON.stringify({url:origin,verified_at:verifiedAt,views},null,2)+'\n');
  console.log(`Public PDK collection verified: ${catalog.resources.length} resources, ${expected.length} links, desktop + mobile, 3 downloads, private routes 404.`);
}
