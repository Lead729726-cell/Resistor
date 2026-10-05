import { clickWorkbenchAction } from './helpers/workbench';
import {test,expect} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
test.use({video:{mode:'on',size:{width:1600,height:1000}},trace:'on'});
test('updated physical MUX: real signed current, vector slider, export and offline reopen',async({page,browser,request})=>{
  const receipt=JSON.parse(await readFile('docs/evidence/mux4-ui.json','utf8')),runId=receipt.native_run_ids[0],errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));await mkdir('examples/mux4',{recursive:true});
  try{
    const response=await request.post('/api/rpc',{data:{method:'job.status',params:{run_id:runId}}});const actual=await response.json();expect(actual.ok).toBe(true);const flow=actual.result.current_flow;
    const branch=flow.branches.find((b:any)=>b.mapping==='device_terminals'&&b.values_A.some((v:number)=>Math.abs(v)>1e-6));expect(branch).toBeTruthy();
    const sample=branch.values_A.reduce((best:number,v:number,i:number)=>Math.abs(v)>Math.abs(branch.values_A[best])?i:best,0);
    await page.addInitScript(id=>localStorage.setItem('mos.last_project',id),receipt.project_id);await page.goto('/eda');await expect(page.getByTestId('app-ready')).toBeVisible();
    await page.getByTestId('tab-layout3d').click();await page.getByLabel('뷰어 전류 결과').selectOption(runId);await page.getByLabel('전류 가지 선택').selectOption(branch.id);
    await page.getByLabel('전류 샘플',{exact:true}).fill(String(sample));await expect(page.getByTestId(`current-value-${branch.id}`)).not.toHaveText('자료 없음');
    await expect(page.getByTestId('layout-viewer-3d').locator('canvas')).toHaveAttribute('data-current-arrow-count',/^[1-9]\d*$/);
    await page.screenshot({path:'examples/mux4/current-viewer-3d.png'});
    const saved=page.waitForEvent('download');await clickWorkbenchAction(page, "export-viewer-bundle");await (await saved).saveAs('examples/mux4/mux4.register-view.json');
    const bytes=await readFile('examples/mux4/mux4.register-view.json'),bundle=JSON.parse(bytes.toString());expect(bundle.currentFlow.run_id).toBe(runId);expect(bundle.scene.project_id).toBe(receipt.project_id);expect(bundle.scene.truncated).toBe(false);
    const portable=await browser.newPage(),nativeRequests:string[]=[];portable.on('request',r=>{if(/\/api\/rpc|\/rpc|\/events/.test(r.url()))nativeRequests.push(r.url());});
    try{
      await portable.goto('/?mode=viewer');await portable.getByTestId('viewer-bundle-input').setInputFiles({name:'mux4.register-view.json',mimeType:'application/json',buffer:bytes});
      await expect(portable.getByTestId('viewer-shape-count')).toHaveText(`${bundle.scene.shapes.length.toLocaleString()} / ${bundle.scene.total_shape_count.toLocaleString()}`);
      await portable.getByLabel('전류 가지 선택').selectOption(branch.id);await portable.getByLabel('전류 샘플',{exact:true}).fill(String(sample));
      await expect(portable.locator('canvas').first()).toHaveAttribute('data-current-arrow-count',/^[1-9]\d*$/);expect(nativeRequests).toEqual([]);
      await portable.screenshot({path:'examples/mux4/current-viewer-offline.png'});
    }finally{await portable.close();}
    expect(errors).toEqual([]);await writeFile('examples/mux4/current-viewer-verification.json',JSON.stringify({checked_at:new Date().toISOString(),project_id:receipt.project_id,run_id:runId,actual_shapes:bundle.scene.shapes.length,branches:flow.branches.length,samples:flow.x.length,selected_branch:branch.id,selected_sample:sample,signed_current_A:branch.values_A[sample],from_net:branch.from_net,to_net:branch.to_net,native_requests_in_offline_viewer:nativeRequests,browser_errors:errors},null,2));
  }finally{const video=page.video();await page.close();if(video)await video.saveAs('examples/mux4/current-viewer-workflow.webm');}
});
