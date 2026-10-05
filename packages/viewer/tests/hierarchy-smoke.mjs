import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const previous=JSON.parse(await readFile('packages/viewer/tests/evidence/advanced-tools.json','utf8'));
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
  await page.goto(`${process.env.REGISTER_VIEWER_TEST_URL??'http://127.0.0.1:29991'}?example=fixture&project_id=${previous.project_id}`);
  await page.waitForFunction(()=>document.querySelector('[data-testid="smoke-scene"]')?.textContent?.startsWith('{'));
  const source=JSON.parse(await page.getByTestId('smoke-scene').textContent()),instance=source.instances.find(i=>i.cell_name==='viewer_tools_child');
  assert.ok(instance.bbox?.every(value=>typeof value==='string'&&/^-?\d+$/.test(value)));
  const requested=page.waitForRequest(request=>{if(!request.url().endsWith('/api/rpc')||request.method()!=='POST')return false;const body=request.postDataJSON();return body.method==='view.get_scene'&&JSON.stringify(body.params.bounds)===JSON.stringify(instance.bbox);});
  await page.getByTestId('layout-viewer-3d').getByLabel('실제 계층 instance로 이동',{exact:true}).selectOption(instance.id);
  assert.deepEqual((await requested).postDataJSON().params.bounds,instance.bbox,'Worker-native bbox is sent unchanged as integer ROI');
  await page.waitForFunction(()=>document.querySelectorAll('.mos-viewer-status')[1]?.textContent.includes('정확한 worker geometry'));
  const scoped=JSON.parse(await page.getByTestId('smoke-scene').textContent());
  assert.equal(scoped.revision,source.revision);assert.equal(scoped.total_shape_count,source.total_shape_count);
  assert.ok(scoped.shapes.length<source.shapes.length);assert.ok(scoped.shapes.every(shape=>shape.instance_id===instance.id));
  assert.deepEqual(errors,[]);
  await page.screenshot({path:'packages/viewer/tests/evidence/hierarchy-focus.png',fullPage:true});
  const report={checked_at:new Date().toISOString(),project_id:source.project_id,revision:source.revision,instance_id:instance.id,bbox:instance.bbox,total_shape_count:scoped.total_shape_count,scoped_shape_count:scoped.shapes.length,checks:['exact worker bbox hierarchy fit','bbox string ROI transmitted unchanged','revision and total source count retained','fetched geometry restricted to actual instance occurrences'],errors};
  await writeFile('packages/viewer/tests/evidence/hierarchy-focus.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
