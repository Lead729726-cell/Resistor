import { test, expect } from '@playwright/test';

test('Actual MOS current curve remains readable beside a voltage trace', async ({page}) => {
  test.setTimeout(180000);
  await page.goto('/eda');
  await expect(page.getByTestId('app-ready')).toBeVisible();
  await page.getByRole('button',{name:'새 프로젝트',exact:true}).first().click();
  const dialog=page.getByRole('dialog');
  await dialog.getByLabel('프로젝트 이름').fill('Native MOS axis regression');
  await dialog.getByRole('button',{name:/MOSFET characterization/}).click();
  await page.getByTestId('project-create').click();
  await expect(dialog).not.toBeVisible({timeout:65000});
  await page.getByTestId('tab-simulation').click();
  await page.getByRole('combobox',{name:'Analysis',exact:true}).selectOption('dc',{timeout:15000});
  await page.getByRole('button',{name:'Run analysis',exact:true}).click();
  await expect(page.getByTestId('job-row')).toHaveCount(1,{timeout:90000});
  await expect(page.getByTestId('job-row').first()).toContainText('PASS',{timeout:90000});
  const plot=page.getByRole('img',{name:'실제 ngspice 파형'});
  await expect(plot.locator('[data-axis-unit="V"]')).toBeVisible();
  await expect(plot.locator('[data-axis-unit="A"]')).toBeVisible();
  const current=plot.locator('polyline[data-signal="Id"][data-unit="A"]');
  const extent=await current.evaluate(element => {
    const ys=(element.getAttribute('points')||'').split(' ').map(point=>Number(point.split(',')[1]));
    return Math.max(...ys)-Math.min(...ys);
  });
  expect(extent).toBeGreaterThan(220);
  await page.locator('.wave-legend button').filter({hasText:'Vgs'}).click();
  await expect(plot.locator('[data-axis-unit="V"]')).toHaveCount(0);
  await expect(current).toBeVisible();
  await expect(plot.locator('[data-axis-unit="A"]')).toBeVisible();
});
