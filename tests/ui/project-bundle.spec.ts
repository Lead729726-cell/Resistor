import { clickWorkbenchAction } from './helpers/workbench';
import {test,expect} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
test.use({video:{mode:'on',size:{width:1600,height:1000}},trace:'on'});
test('workspace UI rejects invalid ZIP, imports qualified CPU, exports and reopens a new copy',async({page,request})=>{
  test.setTimeout(420000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await mkdir('examples/cpu4',{recursive:true});
  const api=async(method:string,params={})=>{const response=await request.post('/api/rpc',{data:{method,params},timeout:180000});const result=await response.json();expect(result.ok,result.error?.message).toBe(true);return result.result;};
  const reply=(method:string)=>page.waitForResponse(r=>new URL(r.url()).pathname==='/api/rpc'&&r.request().postDataJSON()?.method===method);
  try{
    const isolated=await api('project.create',{name:'Workspace bundle isolated QA',example:'fixture'});await page.addInitScript(id=>localStorage.setItem('mos.last_project',id),isolated.id);
    await page.goto('/eda');await expect(page.getByTestId('app-ready')).toBeVisible({timeout:60000});await page.getByTestId('tab-layout2d').click();await clickWorkbenchAction(page, "workspace-manager");await expect(page.getByTestId('workspace-import')).toBeEnabled();
    const original=await api('project.list',{metadata_only:true});await page.getByTestId('workspace-bundle-input').setInputFiles({name:'invalid.zip',mimeType:'application/zip',buffer:Buffer.from('invalid zip')});await expect(page.getByRole('alert')).toBeVisible();expect((await api('project.list',{metadata_only:true})).length).toBe(original.length);
    const pending=reply('project.import_bundle');await page.getByTestId('workspace-bundle-input').setInputFiles('examples/cpu4/cpu4-rc-400ns.register-project.zip');const imported=await(await pending).json();expect(imported.ok,imported.error?.message).toBe(true);const p=imported.result;
    expect(p.digital_unit.period_ns).toBe(400);expect(p.runs).toEqual([]);expect(original.some((old:any)=>old.id===p.id)).toBe(false);await expect(page.locator('.project-breadcrumb strong')).toHaveText(p.name,{timeout:120000});await expect(page.getByTestId('scene-loaded-count')).toHaveAttribute('data-count','73005');
    await clickWorkbenchAction(page, "workspace-manager");await page.getByTestId('workspace-search').fill(p.id);await expect(page.getByTestId(`workspace-export-${p.id}`)).toBeEnabled();
    const saved=page.waitForEvent('download'),exportedReply=reply('project.export_bundle');await page.getByTestId(`workspace-export-${p.id}`).click();const exported=await(await exportedReply).json(),download=await saved;await download.saveAs('examples/cpu4/cpu4-rc-400ns-ui-copy.register-project.zip');const bytes=await readFile('examples/cpu4/cpu4-rc-400ns-ui-copy.register-project.zip');expect(createHash('sha256').update(bytes).digest('hex')).toBe(exported.result.sha256);
    const reopened=reply('project.import_bundle');await page.getByTestId('workspace-bundle-input').setInputFiles({name:'cpu-ui-copy.zip',mimeType:'application/zip',buffer:bytes});const body=await(await reopened).json();expect(body.ok,body.error?.message).toBe(true);const copy=body.result;expect(copy.id).not.toBe(p.id);expect(copy.digital_unit.period_ns).toBe(400);expect(copy.runs).toEqual([]);const roundtrip=await api('project.export_bundle',{project_id:copy.id});expect(roundtrip.geometry_hash).toBe(exported.result.geometry_hash);expect((await api('project.list',{metadata_only:true})).some((old:any)=>old.id===p.id)).toBe(true);
    await page.getByTestId('tab-layout2d').click();await page.screenshot({path:'examples/cpu4/bundle-reopen.png'});expect(errors).toEqual([]);
    await writeFile('examples/cpu4/bundle-ui-verification.json',JSON.stringify({checked_at:new Date().toISOString(),project_id:p.id,reopened_project_id:copy.id,period_ns:400,invalid_zip_rejected_without_project_change:true,original_preserved:true,geometry_hash:roundtrip.geometry_hash,actual_shapes:73005,imported_analysis_jobs:0,browser_errors:errors},null,2));
  }finally{const video=page.video();await page.close();if(video)await video.saveAs('examples/cpu4/recording/bundle-open-save.webm');}
});
