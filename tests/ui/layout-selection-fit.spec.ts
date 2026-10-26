import {test,expect} from '@playwright/test';
// @ts-expect-error Main-process authenticated transport only.
import {runtimeConfig,workerRpc} from '../../scripts/runtime.mjs';
test('layout fit is view-only and keeps the group between 2D and 3D',async({page})=>{
 const config=await runtimeConfig();
 const api=async(method:string,params:Record<string,unknown>)=>{const result=await workerRpc(config,method,params);expect(result.ok,result.error?.message).toBe(true);return result.result;};
 let project=await api('project.create',{example:'layout',name:'QA layout selection fit'});
 for(const x of [0,10000,50000])project=await api('layout.apply_command',{project_id:project.id,expected_revision:project.revision,command:{type:'add_box',layer_id:'68/20',box:[String(x),'0',String(x+1000),'1000']}});
 const before=await api('view.get_scene',{project_id:project.id});
 await page.goto('/eda?project='+project.id);await expect(page.getByTestId('app-ready')).toBeVisible({timeout:60000});
 await page.getByTestId('tab-layout2d').click();let view=page.getByTestId('layout-viewer-2d');await view.locator('canvas').focus();await page.keyboard.press('Control+a');await expect(view).toHaveAttribute('data-selection-count','3');await page.keyboard.press('Shift+F');await expect(page.locator('.mos-viewer-status')).toContainText('선택 3개 화면 맞춤');
 await page.getByTestId('tab-layout3d').click();view=page.getByTestId('layout-viewer-3d');await expect(view).toHaveAttribute('data-selection-count','3');await page.getByTestId('layout-fit-selection').click();await expect(page.locator('.mos-viewer-status')).toContainText('현재 로드 범위');
 expect((await api('project.snapshot',{project_id:project.id})).revision).toBe(project.revision);expect((await api('view.get_scene',{project_id:project.id})).shapes).toEqual(before.shapes);
});
