import {chromium} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=path.resolve('examples/voltage-references'),catalog=JSON.parse(await readFile(path.join(root,'catalog.json'),'utf8'));
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const proof=[];await mkdir('docs/evidence/voltage-references',{recursive:true});
try {
  for(const reference of catalog.references){
    const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[],sessions=[];page.setDefaultTimeout(30000);
    page.on('pageerror',e=>errors.push(e.message));
    page.on('response',async r=>{if(r.request().method()==='POST'&&r.url().endsWith('/api/viewer-sessions')&&r.status()===202)sessions.push(await r.json());});
    try{
      await page.goto('http://127.0.0.1:5188/');
      await page.locator('input[type=file]').nth(0).setInputFiles(path.join(root,reference.gds));
      await page.locator('input[type=file]').nth(1).setInputFiles(path.join(root,reference.stack));
      await page.getByRole('button',{name:'업로드 & 탐색',exact:true}).click();
      await page.waitForFunction(()=>{const v=window.mosMap?.viewer;return !!v?.scene&&v.loaded===v.scene.chunks.length;},null,{timeout:120000});
      const layout=await page.evaluate(()=>{const s=window.mosMap.viewer.scene;return {polygons:s.visible_polygons,top:s.top_name,dbu_um:s.dbu_um,unmapped:s.unmapped,geometry_omitted:s.geometry_omitted,chunks:s.chunks.length,layers:s.layers.map(l=>({name:l.name,key:l.key,source:l.source,z_start:l.z_start,thickness:l.thickness}))};});
      assert.ok(layout.polygons>0);assert.equal(layout.geometry_omitted,false);assert.equal(layout.unmapped.length,0);
      const sha=createHash('sha256').update(await readFile(path.join(root,reference.gds))).digest('hex');assert.equal(sha,reference.sha256);
      await page.screenshot({path:`docs/evidence/voltage-references/${reference.id}-layout.png`,fullPage:true});
      let process=null;
      if(reference.recipe){
        const recipe=JSON.parse(await readFile(path.join(root,reference.recipe),'utf8'));
        await page.getByLabel('공정 형상 검사 열기',{exact:true}).click();
        await page.waitForFunction(()=>!!window.voltageProcess?.getResult(),null,{timeout:120000});
        await page.getByRole('button',{name:'전체 공정 검사 실행',exact:true}).waitFor({state:'visible'});
        await page.locator('.process-workbench input[type=file]').nth(0).setInputFiles(path.join(root,reference.recipe));
        await page.waitForFunction(()=>document.querySelector('.process-run [role=status]')?.textContent?.includes('설정을 불러왔습니다'),null,{timeout:15000});
        const previous=await page.evaluateHandle(()=>window.voltageProcess.getResult());
        try{
          await page.getByRole('button',{name:'전체 공정 검사 실행',exact:true}).click();
          await page.waitForFunction(previous=>{const r=window.voltageProcess.getResult();return r&&r!==previous;},previous,{timeout:120000});
        }finally{await previous.dispose();}
        process=await page.evaluate(()=>{const r=window.voltageProcess.getResult();return {recipe:r.recipe,completed:r.completed,scope:r.scope,maskShapes:r.maskShapes,materials:r.summary.materials,scannedCells:r.summary.scannedCells,spacing:r.summary.spacing,voids:r.summary.voids,risks:r.summary.risks.length,warnings:r.summary.warnings};});
        assert.deepEqual(process.recipe,recipe);assert.equal(process.completed,recipe.steps.length);
        assert.equal(process.scannedCells,recipe.domain.nx*recipe.domain.ny*recipe.domain.nz);assert.ok(process.maskShapes>0);
        assert.ok(process.materials.filter(m=>m.cells>0).length>=2);
        await page.getByRole('button',{name:'투시 검토',exact:true}).click();
        await page.getByLabel('연동된 3축 단면',{exact:true}).waitFor({state:'visible'});
        await page.screenshot({path:`docs/evidence/voltage-references/${reference.id}-process.png`,fullPage:true});
        const report=page.waitForEvent('download');await page.getByRole('button',{name:'검사 보고서',exact:true}).click();
        const download=await report;const content=await readFile(await download.path(),'utf8');
        assert.ok(!/"token"|"session"/.test(content));
        await writeFile(`docs/evidence/voltage-references/${reference.id}-report.json`,content);
      }
      assert.deepEqual(errors,[]);proof.push({id:reference.id,name:reference.name,gds_sha256:sha,layout,process,browser_errors:errors});
      console.log(`Verified Voltage GDS/stack${process?'/recipe/3D/sections/report':''}: ${reference.id} (${layout.polygons} polygons)`);
    }finally{
      for(const s of sessions)await page.request.delete(`http://127.0.0.1:5188/api/viewer-sessions/${s.id}`,{headers:{Authorization:`Bearer ${s.token}`}}).catch(()=>{});
      await page.close();
    }
  }
}finally{await browser.close();}
const zip=await readFile('examples/register-voltage-references.zip');
await writeFile('docs/evidence/voltage-references.json',JSON.stringify({verified_at:new Date().toISOString(),consumer:'Voltage local app',references:proof,archive:{file:'examples/register-voltage-references.zip',bytes:zip.length,sha256:createHash('sha256').update(zip).digest('hex')},limitations:catalog.limitations},null,2));
