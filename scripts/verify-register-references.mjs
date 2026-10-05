import {chromium,expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve('examples/voltage-references'),catalog=JSON.parse(await readFile(path.join(root,'catalog.json'),'utf8'));
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const proof=[];
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000},colorScheme:'dark'});page.setDefaultTimeout(30000);
  for(const reference of catalog.references.filter(r=>r.register_view)){
    await page.goto('http://127.0.0.1:5173/?mode=viewer');
    await page.getByTestId('viewer-bundle-input').setInputFiles(path.join(root,reference.register_view));
    await expect(page.getByTestId('viewer-export')).toBeEnabled();
    assert.equal(await page.locator('[role=alert]').count(),0);
    await expect(page.getByLabel('레지스터 Register',{exact:true}).getByTestId('register-logo')).toBeVisible();
    const pending=page.waitForEvent('download');await page.getByTestId('viewer-export').click();
    const saved=JSON.parse(await readFile(await (await pending).path(),'utf8'));
    assert.equal(saved.scene.shapes.length,reference.shapes);
    assert.equal(saved.scene.source,'fixture');
    proof.push({id:reference.id,shapes:saved.scene.shapes.length,reopen_and_export_verified:true});
  }
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.screenshot({path:'docs/evidence/voltage-references/register-resistor-logo-dark.png',fullPage:true});
  await page.evaluate(()=>localStorage.setItem('register.appearance',JSON.stringify({version:1,mode:'light',skin:'graphite'})));
  await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await page.screenshot({path:'docs/evidence/voltage-references/register-resistor-logo-light.png',fullPage:true});
}finally{await browser.close();}
const receipt=JSON.parse(await readFile('docs/evidence/voltage-references.json','utf8')),zip=await readFile('examples/register-voltage-references.zip');
receipt.register_view_verification=proof;
receipt.archive={file:'examples/register-voltage-references.zip',bytes:zip.length,sha256:createHash('sha256').update(zip).digest('hex')};
await writeFile('docs/evidence/voltage-references.json',JSON.stringify(receipt,null,2));
console.log('Verified four Register viewer reopen/export flows and resistor logo in dark/light themes.');
