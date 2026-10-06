import {test,expect,type Page} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
// @ts-expect-error authenticated Node-only transport
import {runtimeConfig,workerRpc} from '../../scripts/runtime.mjs';
const evidence='docs/evidence/editor-drawing';
test.use({video:'on'});
test.beforeAll(async()=>{await mkdir(evidence,{recursive:true});});
test.afterEach(async({page},info)=>{const video=page.video();await page.close();if(video&&info.status==='passed')await video.saveAs(`${evidence}/${info.title.split(':')[0]}.webm`);});
async function api(method:string,params:Record<string,unknown>={}){const r=await workerRpc(await runtimeConfig(),method,params);if(!r.ok)throw new Error(`${method}: ${r.error.message}`);return r.result;}
async function open(page:Page){const p=await api('project.create',{name:'Drawing browser QA',example:'mosfet'});await page.addInitScript(id=>{localStorage.setItem('mos.last_project',id);localStorage.setItem('register.appearance',JSON.stringify({version:1,mode:'dark',skin:'graphite'}));},p.id);await page.goto('/eda');await expect(page.getByTestId('app-ready')).toBeVisible({timeout:60000});return p;}
async function svgClick(page:Page,x:number,y:number){const p=await page.locator('.schematic-svg').evaluate((el,args)=>{const svg=el as SVGSVGElement,pt=svg.createSVGPoint();pt.x=args[0];pt.y=args[1];const p=pt.matrixTransform(svg.getScreenCTM()!);return {x:p.x,y:p.y};},[x,y]);await page.mouse.move(p.x,p.y);await page.mouse.click(p.x,p.y);}
test('schematic: repeated placement, preview, orientation, actual pins and undo',async({page})=>{
  const p=await open(page);await page.getByTestId('tab-schematic').click();
  await page.getByTestId('schematic-place-resistor').click();await page.locator('.schematic-svg').focus();await page.keyboard.press('r');
  const b=await page.locator('.schematic-svg').boundingBox();await page.mouse.move(b!.x+b!.width*.4,b!.y+b!.height*.6);await expect(page.getByTestId('schematic-placement-preview')).toBeVisible();
  await svgClick(page,200,350);await expect.poll(async()=>{const q=await api('project.open',{project_id:p.id});return q.schematic.devices.filter((d:any)=>d.kind==='resistor').length;}).toBe(1);
  await expect(page.getByTestId('schematic-place-resistor')).toHaveAttribute('aria-pressed','true');await expect(page.getByTestId('schematic-place-resistor')).toBeEnabled();
  await svgClick(page,420,350);await expect.poll(async()=>{const q=await api('project.open',{project_id:p.id});return q.schematic.devices.filter((d:any)=>d.kind==='resistor').length;}).toBe(2);await expect(page.getByTestId('schematic-place-resistor')).toBeEnabled();
  await page.locator('.schematic-svg').focus();await page.keyboard.press('Escape');const q=await api('project.open',{project_id:p.id});const r=q.schematic.devices.find((d:any)=>d.name==='R1');expect(r.rotation).toBe(90);expect([r.x,r.y]).toEqual([200,350]);expect(r.parameters.value).toBe(1000);
  await page.getByTestId('schematic-tool-wire').click();await svgClick(page,244,350);await svgClick(page,280,280);await page.keyboard.press('Space');await page.keyboard.press('Enter');
  await expect.poll(async()=>{const q=await api('project.open',{project_id:p.id});return q.schematic.wires?.length??0;}).toBe(1);
  const wired=await api('project.open',{project_id:p.id});expect(wired.schematic.wires[0].points[0]).toEqual([244,350]);
  await page.screenshot({path:`${evidence}/schematic-dark.png`});await page.getByTestId('appearance-open').click();await page.getByTestId('appearance-mode-light').click();await page.keyboard.press('Escape');await page.screenshot({path:`${evidence}/schematic-light.png`});
  await api('schematic.apply_command',{project_id:p.id,command:{type:'undo'}});const undone=await api('project.open',{project_id:p.id});expect(undone.schematic.wires?.length??0).toBe(0);expect(undone.schematic.devices.filter((d:any)=>d.kind==='resistor')).toHaveLength(2);
});
test('layout: rectangle, polygon, route, rejected width, cancel, locked layer and undo',async({page})=>{
  const p=await open(page);await page.getByTestId('tab-layout2d').click();
  const viewer=page.getByTestId('layout-viewer-2d');await expect(viewer.locator('canvas')).toBeVisible();
  const count=async()=> (await api('view.get_scene',{project_id:p.id})).shapes.length;let n=await count();
  const click=async(x:number,y:number)=>{const b=await viewer.locator('canvas').boundingBox();await page.mouse.click(b!.x+b!.width*x,b!.y+b!.height*y);};
  await viewer.getByTestId('layout-draw-box').click();await viewer.getByLabel('그리기 레이어').selectOption('68/20');await click(.2,.25);await click(.4,.45);await expect.poll(count).toBe(n+1);n++;
  let scene=await api('view.get_scene',{project_id:p.id});for(const shape of scene.shapes)for(const point of shape.polygon)for(const c of point)expect(BigInt(c)%BigInt(scene.grid_dbu)).toBe(0n);
  await viewer.getByTestId('layout-draw-polygon').click();await click(.3,.3);await click(.48,.3);await click(.48,.5);await viewer.locator('canvas').focus();await page.keyboard.press('Enter');await expect.poll(count).toBe(n+1);n++;
  await viewer.getByTestId('layout-draw-route').click();await viewer.getByLabel('그리기 배선 폭').fill('205');await click(.3,.35);await click(.6,.55);await viewer.getByTestId('layout-draw-finish').click();await expect(viewer.locator('.mos-viewer-error')).toContainText('양의 배수');expect(await count()).toBe(n);
  await viewer.getByLabel('그리기 배선 폭').fill('200');await viewer.getByTestId('layout-draw-finish').click();await expect.poll(count).toBe(n+1);n++;
  await click(.3,.3);await viewer.locator('canvas').focus();await page.keyboard.press('Backspace');await expect(viewer.getByTestId('layout-drawing-status')).toContainText('0 points');await page.keyboard.press('Escape');expect(await count()).toBe(n);
  await viewer.getByTestId('layout-draw-box').click();const layer=viewer.getByLabel('그리기 레이어');await layer.selectOption('68/20');const row=viewer.locator('[data-layer="68/20"]');await row.getByRole('button').click();await click(.2,.25);await click(.4,.45);await expect(viewer.locator('.mos-viewer-error')).toContainText('잠금');expect(await count()).toBe(n);await row.getByRole('button').click();await viewer.locator('canvas').focus();await page.keyboard.press('Escape');
  await page.screenshot({path:`${evidence}/layout-dark.png`});await viewer.getByTestId('layout-draw-polygon').click();await click(.2,.3);await click(.4,.3);await page.getByTestId('appearance-open').click();await page.getByTestId('appearance-mode-light').click();await page.keyboard.press('Escape');await click(.4,.5);await expect(viewer.getByTestId('layout-drawing-status')).toContainText('미저장');await page.screenshot({path:`${evidence}/layout-light-draft.png`});await viewer.locator('canvas').focus();await page.keyboard.press('Escape');expect(await count()).toBe(n);
  await api('layout.apply_command',{project_id:p.id,command:{type:'undo'}});expect(await count()).toBe(n-1);
});
