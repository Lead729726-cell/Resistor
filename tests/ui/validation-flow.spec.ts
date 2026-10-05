import {test,expect} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
test.use({video:{mode:'on',size:{width:1600,height:1000}},trace:'on'});
test('real adder five-stage validation flow and revision-bound downloadable native evidence',async({page,request},info)=>{
  test.setTimeout(240000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto('/');await expect(page.getByTestId('app-ready')).toBeVisible();await page.getByTestId('open-digital-workbench').click();await page.getByLabel('디지털 설계 이름').fill('전가산기 · 전체 검증 흐름');await page.getByLabel('디지털 주기 ns').fill('100');await page.getByTestId('digital-run-now').uncheck();await page.getByTestId('digital-create').click();await expect(page.getByTestId('digital-workbench')).not.toBeVisible({timeout:65000});
    await page.getByTestId('open-integrated-tools').click();await page.getByTestId('integrated-tab-verification').click();await page.getByTestId('validation-start').click();
    for(const id of ['pre','drc','lvs','pex','post'])await expect(page.getByTestId(`validation-stage-${id}`)).toHaveAttribute('data-pass','true',{timeout:90000});
    await expect(page.getByTestId('validation-panel')).toContainText('5/5 단계 PASS');
    const saved=page.waitForEvent('download');await page.getByTestId('validation-export').click();const download=await saved;
    await mkdir('examples/validation',{recursive:true});await download.saveAs('examples/validation/full-adder-validation.json');const report=JSON.parse(await readFile('examples/validation/full-adder-validation.json','utf8'));expect(report.foundry_signoff).toBe(false);expect(report.stages.every((s:any)=>s.passed&&!s.stale&&s.run.revision===report.revision)).toBe(true);
    for(const stage of report.stages.filter((s:any)=>['pre','post'].includes(s.stage))){const response=await request.post('/api/rpc',{data:{method:'job.status',params:{run_id:stage.run.id}}});const actual=await response.json();expect(actual.result.unit_verification.passed_cases).toBe(8);expect(actual.result.analysis_stage).toBe(stage.stage==='post'?'post-layout':'pre-layout');expect(actual.result.measurements.solver).toBe('KLU');}
    await page.screenshot({path:'examples/validation/validation-flow.png'});expect(errors).toEqual([]);await writeFile('examples/validation/ui-verification.json',JSON.stringify({checked_at:new Date().toISOString(),project_id:report.project_id,revision:report.revision,actual_native_stages:5,actual_pre_post_cases:8,page_errors:errors},null,2));
  }finally{const video=page.video();await page.close();if(video){await mkdir('examples/validation',{recursive:true});await video.saveAs('examples/validation/validation-flow.webm');}}
});
