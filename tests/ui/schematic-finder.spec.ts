import {test,expect,type Page} from '@playwright/test';
// @ts-expect-error Main-process-only authenticated engine transport.
import {runtimeConfig,workerRpc} from '../../scripts/runtime.mjs';

async function api(method:string,params:Record<string,unknown>={}){
  const result=await workerRpc(await runtimeConfig(),method,params);
  expect(result.ok,result.error?.message).toBe(true);return result.result;
}
async function fixture(page:Page){
  let project=await api('project.create',{example:'schematic',name:'QA schematic finder '+crypto.randomUUID().slice(0,8)});
  for(const [id,x] of [['r1',100],['r2',10000]] as const)project=await api('schematic.apply_command',{project_id:project.id,expected_revision:project.revision,command:{type:'add_device',device:{id,name:id.toUpperCase(),kind:'resistor',x,y:200,pins:{'+':'OUT','-':'0'},parameters:{value:1000}}}});
  project=await api('schematic.apply_command',{project_id:project.id,expected_revision:project.revision,command:{type:'add_wire',wire:{id:'wire',net:'OUT',points:[[100,156],[10000,156]]}}});
  project=await api('schematic.apply_command',{project_id:project.id,expected_revision:project.revision,command:{type:'add_junction',junction:{id:'junction',net:'OUT',x:5000,y:156}}});
  await page.goto('/eda?project='+project.id);
  await expect(page.getByTestId('app-ready')).toBeVisible({timeout:60000});
  await page.getByTestId('tab-schematic').click();return project;
}
const canvas=(page:Page)=>page.locator('.schematic-svg');
const input=(page:Page)=>page.getByRole('combobox',{name:'소자·넷 검색',exact:true});

test('finder keyboard navigation and selection fit never edit or run the project',async({page})=>{
  await page.setViewportSize({width:1280,height:720});const project=await fixture(page);
  await canvas(page).focus();await page.keyboard.press('Control+f');await expect(input(page)).toBeFocused();
  await input(page).fill('R');await input(page).press('ArrowDown');await input(page).press('Enter');
  await expect(page.getByTestId('schematic-finder')).toHaveCount(0);await expect(canvas(page)).toBeFocused();
  await expect(page.locator('.schematic-device.selected')).toHaveAttribute('aria-label','R2 resistor');
  const selected=(await canvas(page).getAttribute('viewBox'))!.split(' ').map(Number);expect(selected[0]).toBeGreaterThan(9000);
  await page.keyboard.press('f');expect(Number((await canvas(page).getAttribute('viewBox'))!.split(' ')[2])).toBeGreaterThan(9000);
  await page.keyboard.press('Shift+F');expect((await canvas(page).getAttribute('viewBox'))!.split(' ').map(Number)).toEqual(selected);
  await page.keyboard.press('Control+f');await expect(input(page)).toHaveValue('R');await input(page).press('Escape');
  const bounds=await canvas(page).boundingBox();expect(bounds!.height).toBeGreaterThanOrEqual(140);
  const snapshot=await api('project.snapshot',{project_id:project.id});expect(snapshot.revision).toBe(project.revision);expect(snapshot.runs).toEqual([]);
});

test('net selection includes mixed items, and search preserves an unfinished wire',async({page})=>{
  const project=await fixture(page);await canvas(page).focus();await page.keyboard.press('Control+f');
  await input(page).fill('OUT');await page.getByLabel('회로도 검색 종류',{exact:true}).selectOption('net');await input(page).press('Enter');
  await expect(canvas(page)).toHaveAttribute('data-selection-count','4');await expect(page.locator('.drawn-wire.selected')).toHaveCount(1);await expect(page.locator('.drawn-junction.selected')).toHaveCount(1);
  await canvas(page).press('Control+f');await page.getByLabel('회로도 검색 종류',{exact:true}).selectOption('device');await input(page).fill('R2');await input(page).press('Enter');
  await page.getByRole('button',{name:'R2 + 연결',exact:true}).click();await canvas(page).press('Control+f');await input(page).fill('R1');await input(page).press('Enter');
  await expect(page.locator('.schematic-finder-warning')).toBeVisible();await expect(page.locator('.schematic-pin.wire-start')).toHaveCount(1);
  await input(page).press('Escape');await expect(page.locator('.schematic-pin.wire-start')).toHaveCount(1);
  await expect(canvas(page)).toBeFocused();expect((await api('project.snapshot',{project_id:project.id})).revision).toBe(project.revision);
});

test('unapplied device values survive selection, and explicit read detects a conflicting server value',async({page})=>{
  const project=await fixture(page);
  const find=async(name:string)=>{await canvas(page).press('Control+f');await input(page).fill(name);await input(page).press('Enter');};
  await find('R2');await page.getByLabel('R2 value',{exact:true}).fill('1234');await find('R1');await expect(page.getByLabel('R1 value',{exact:true})).toHaveValue('1000');await find('R2');await expect(page.getByLabel('R2 value',{exact:true})).toHaveValue('1234');
  const changed=await api('schematic.apply_command',{project_id:project.id,expected_revision:project.revision,command:{type:'update_device',id:'r2',parameters:{value:3000}}});
  await page.getByTestId('inspector-refresh-values').click();await expect(page.getByLabel('R2 value',{exact:true})).toHaveValue('1234');await expect(page.locator('.inspector-draft-conflict')).toContainText('value');await expect(page.getByRole('button',{name:'변경 적용 / Apply',exact:true})).toBeDisabled();
  await page.locator('.inspector-draft-comparison summary').click();await expect(page.locator('.inspector-draft-comparison')).toContainText('3000');
  const after=await api('project.snapshot',{project_id:project.id});expect(after.revision).toBe(changed.revision);expect(after.runs).toEqual([]);
  await page.getByRole('button',{name:'서버 값으로 되돌리기',exact:true}).click();await expect(page.getByLabel('R2 value',{exact:true})).toHaveValue('3000');await find('R1');await find('R2');await expect(page.getByLabel('R2 value',{exact:true})).toHaveValue('3000');
});

test('mobile panels are exclusive, keep draft values and preserve desktop choices',async({page})=>{
  await page.setViewportSize({width:1280,height:720});await fixture(page);
  // Establish explicit desktop choices irrespective of earlier local preferences.
  for(const name of ['explorer','inspector'])if(await page.getByTestId('toggle-'+name).getAttribute('aria-expanded')!=='true')await page.getByTestId('toggle-'+name).click();
  await page.setViewportSize({width:390,height:844});
  await expect(page.getByTestId('toggle-explorer')).toHaveAttribute('aria-expanded','false');await expect(page.getByTestId('toggle-inspector')).toHaveAttribute('aria-expanded','false');
  await page.getByTestId('toggle-explorer').click();await page.getByTestId('toggle-inspector').click();
  await expect(page.getByTestId('toggle-explorer')).toHaveAttribute('aria-expanded','false');await expect(page.getByTestId('toggle-inspector')).toHaveAttribute('aria-expanded','true');
  await page.getByRole('button',{name:'속성 패널 닫기',exact:true}).click();
  await canvas(page).press('Control+f');await input(page).fill('R2');await input(page).press('Enter');
  await page.getByTestId('toggle-inspector').click();await page.getByLabel('R2 value',{exact:true}).fill('1234');await page.getByRole('button',{name:'속성 패널 닫기',exact:true}).click();await page.getByTestId('toggle-inspector').click();
  await expect(page.getByLabel('R2 value',{exact:true})).toHaveValue('1234');await page.getByLabel('R2 value',{exact:true}).press('Escape');await expect(page.getByTestId('toggle-inspector')).toBeFocused();
  await canvas(page).press('Control+f');await expect(page.getByTestId('schematic-finder')).toBeInViewport();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.setViewportSize({width:1280,height:720});await expect(page.getByTestId('toggle-explorer')).toHaveAttribute('aria-expanded','true');await expect(page.getByTestId('toggle-inspector')).toHaveAttribute('aria-expanded','true');
});
