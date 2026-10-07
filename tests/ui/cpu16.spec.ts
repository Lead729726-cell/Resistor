import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {clickWorkbenchAction} from './helpers/workbench';

test('16-bit ROM validation, independent legacy range, hex values and mobile controls',async({page})=>{
  await page.goto('/eda');await expect(page.getByTestId('app-ready')).toBeVisible();
  await clickWorkbenchAction(page,'open-digital-workbench');
  await page.getByTestId('digital-cpu16').click();
  await expect(page.getByLabel('ROM 0 값',{exact:true})).toHaveValue('4660');
  await expect(page.getByLabel('ROM 0 값',{exact:true})).toHaveAttribute('max','65535');
  await expect(page.getByTestId('digital-workbench')).toContainText('0x1234');
  await expect(page.getByTestId('digital-workbench')).toContainText('4비트 PC');
  await page.getByLabel('ROM 0 값',{exact:true}).fill('65536');await expect(page.getByTestId('digital-create')).toBeDisabled();
  await page.getByLabel('ROM 0 값',{exact:true}).fill('65535');await expect(page.getByTestId('digital-create')).toBeEnabled();
  await page.getByTestId('digital-cpu4').click();await expect(page.getByLabel('ROM 0 값',{exact:true})).toHaveAttribute('max','15');
  await page.getByLabel('ROM 0 값',{exact:true}).fill('16');await expect(page.getByTestId('digital-create')).toBeDisabled();
  await page.getByTestId('digital-cpu16').click();await expect(page.getByLabel('ROM 0 값',{exact:true})).toHaveValue('4660');
  await mkdir('docs/evidence/cpu16-ui',{recursive:true});await page.screenshot({path:'docs/evidence/cpu16-ui/desktop.png'});
  await page.setViewportSize({width:390,height:844});
  expect(await page.locator('.modal').evaluate(el=>el.getBoundingClientRect().width)).toBeLessThanOrEqual(390);
  await expect(page.getByTestId('digital-create')).toBeVisible();
  expect(await page.locator('.cpu-rom-wide').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.screenshot({path:'docs/evidence/cpu16-ui/mobile.png'});
});
