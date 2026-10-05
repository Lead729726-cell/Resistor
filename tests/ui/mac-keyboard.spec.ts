import {test,expect} from '@playwright/test';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';

test('Mac keyboard logic: actual save, safe input Backspace, circuit delete and undo/redo on isolated inverter',async({browser})=>{
  const dir='docs/evidence/mac-keyboard-recording';await mkdir(dir,{recursive:true});
  const context=await browser.newContext({viewport:{width:1600,height:1000},recordVideo:{dir,size:{width:1600,height:1000}}});
  await context.addInitScript(()=>Object.defineProperty(navigator,'platform',{value:'MacIntel'}));
  const page=await context.newPage(),video=page.video(),steps:unknown[]=[];
  const responseFor=(method:string,type?:string)=>page.waitForResponse(r=>{if(new URL(r.url()).pathname!=='/api/rpc')return false;try{const q=r.request().postDataJSON();return q.method===method&&(!type||q.params.command?.type===type);}catch{return false;}});
  try{
    await page.goto('http://127.0.0.1:5173/');await expect(page.getByTestId('app-ready')).toBeVisible();
    await page.getByRole('button',{name:'새 프로젝트',exact:true}).first().click();
    const dialog=page.getByRole('dialog');await dialog.getByLabel('프로젝트 이름').fill('Mac keyboard isolated QA');await dialog.getByRole('button',{name:/CMOS inverter/}).click();await page.getByTestId('project-create').click();await expect(dialog).not.toBeVisible();
    await expect(page.getByTestId('project-save')).toHaveAttribute('title','⌘S');
    const saved=responseFor('project.save');await page.keyboard.press('Meta+s');const p=await(await saved).json();expect(p.ok).toBe(true);steps.push({action:'Command+S',project_id:p.result.id,revision:p.result.revision});
    await page.getByTestId('tab-schematic').click();await expect(page.locator('.schematic-device').first()).toBeVisible();
    const objects=page.locator('.schematic-device'),count=await objects.count();expect(count).toBeGreaterThan(1);
    const nmos=page.locator('.schematic-svg').getByRole('button',{name:'MN1 nmos',exact:true});await nmos.click();
    const input=page.getByLabel('MN1 w_um');await input.fill('1.3');await input.press('Backspace');await expect(input).toHaveValue('1');await expect(objects).toHaveCount(count);steps.push({action:'input Backspace',device_count:count,preserved:true});
    await nmos.focus();const removed=responseFor('schematic.apply_command','delete_device');await page.keyboard.press('Backspace');expect((await(await removed).json()).ok).toBe(true);await expect(objects).toHaveCount(count-1);steps.push({action:'Mac Delete/Backspace',device_count:count-1});
    const restored=responseFor('schematic.apply_command','undo');await page.keyboard.press('Meta+z');expect((await(await restored).json()).ok).toBe(true);await expect(objects).toHaveCount(count);steps.push({action:'Command+Z',device_count:count});
    const redone=responseFor('schematic.apply_command','redo');await page.keyboard.press('Meta+Shift+z');expect((await(await redone).json()).ok).toBe(true);await expect(objects).toHaveCount(count-1);steps.push({action:'Command+Shift+Z',device_count:count-1});
    const restore=responseFor('schematic.apply_command','undo');await page.keyboard.press('Meta+z');await restore;await expect(objects).toHaveCount(count);
    await page.screenshot({path:'docs/evidence/mac-keyboard-logic.png'});
    await writeFile('docs/evidence/mac-keyboard-logic.json',JSON.stringify({version:'0.14.0',actual_host:process.platform,navigator_platform_override:'MacIntel',native_macos_execution:false,scope:'Renderer Mac shortcuts with actual native backend edits on a new QA project; no native Cocoa menu or Mac GPU claim',steps},null,2));
  }finally{await context.close();if(video)await copyFile(await video.path(),dir+'/keyboard-workflow.webm');}
});
