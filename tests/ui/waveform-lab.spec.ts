import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
// @ts-expect-error Main-process-only worker transport.
import { runtimeConfig, workerRpc } from '../../scripts/runtime.mjs';

test.use({ video: 'on', trace: 'on' });
test.afterEach(async ({ page }, info) => {
  const video = page.video();
  await page.close();
  if (video) await video.saveAs(`docs/evidence/eda-waveform-lab-${info.title.startsWith('native') ? 'desktop' : 'narrow'}.webm`);
});

async function api(method: string, params: Record<string, unknown> = {}) {
  const response = await workerRpc(await runtimeConfig(), method, params);
  if (!response.ok) throw new Error(response.error.message);
  return response.result;
}

test('native inverter waveform lab: cursors, timing, math, exports and stale provenance', async ({ page }) => {
  test.setTimeout(180000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const p = await api('project.create', { name: 'Waveform lab native QA', example: 'inverter' });
  let run = await api('simulation.run', { project_id: p.id, analysis: 'tran', netlister: 'native', post_layout: false });
  for (let i = 0; i < 120 && ['queued', 'running'].includes(run.execution_status); i++) {
    await new Promise(resolve => setTimeout(resolve, 500)); run = await api('job.status', { run_id: run.id });
  }
  expect(run.execution_status).toBe('completed'); expect(run.analysis_result).toBe('pass');
  expect(run.tool).toMatch(/ngspice/i); expect(run.waveforms.length).toBeGreaterThan(1);
  await page.addInitScript(id => localStorage.setItem('mos.last_project', id), p.id);
  await page.goto('/eda'); await expect(page.getByTestId('app-ready')).toBeVisible();
  await page.getByTestId('tab-simulation').click();
  const lab = page.getByTestId('waveform-workbench'); await expect(lab).toBeVisible();
  const input = run.waveforms.find((w: { name: string }) => w.name === 'Vin') || run.waveforms[0];
  const inputIndex = run.waveforms.indexOf(input);
  const outputIndex = run.waveforms.findIndex((w: { name: string }) => ['Vout', 'Y'].includes(w.name));
  await lab.getByLabel('측정 신호', { exact: true }).selectOption(`${run.id}/${inputIndex}`);
  const end = input.x.at(-1), start = input.x[0];
  await lab.getByLabel('커서 A', { exact: true }).fill(String(start));
  await lab.getByLabel('커서 B', { exact: true }).fill(String(end));
  await expect(lab.locator('[data-metric="RMS"]')).not.toContainText('NaN');
  await lab.getByText('상승·하강 시간 / 주기 / 전파 지연', { exact: true }).click();
  await expect(lab.locator('[data-metric="Rise 10–90%"]')).not.toContainText('교차 없음');
  if (outputIndex >= 0) {
    await lab.getByLabel('지연 대상 신호', { exact: true }).selectOption(`${run.id}/${outputIndex}`);
    await expect(lab.locator('[data-metric="Propagation delay"]')).not.toContainText('교차 없음');
  }
  await lab.getByLabel('커서 A', { exact: true }).fill(String(start + (end - start) * .1));
  await lab.getByLabel('커서 B', { exact: true }).fill(String(start + (end - start) * .7));
  await lab.getByLabel('A–B 확대', { exact: true }).check();
  await expect(page.locator('[data-cursor="A"]')).toHaveCount(1);
  await expect(page.locator('[data-cursor="B"]')).toHaveCount(1);
  const reportDownload = page.waitForEvent('download'); await lab.getByRole('button', { name: '측정 JSON', exact: true }).click();
  const report = JSON.parse(await readFile((await (await reportDownload).path())!, 'utf8'));
  expect(report.source.run_id).toBe(run.id); expect(report.source.freshness).toBe('current');
  expect(report.statistics.count).toBeGreaterThan(2); expect(report.statistics.rms).toBeGreaterThan(0);
  await lab.getByText('파형 연산 · 차동 전압 / 전력', { exact: true }).click();
  const existingCurrent = run.waveforms.findIndex((w: { unit: string }) => w.unit === 'A');
  const currentIndex = existingCurrent >= 0 ? existingCurrent : run.current_flow?.branches.length ? run.waveforms.length : -1;
  expect(currentIndex).toBeGreaterThanOrEqual(0);
  await lab.getByLabel('연산 대상 신호', { exact: true }).selectOption(`${run.id}/${currentIndex}`);
  await lab.getByLabel('파형 연산', { exact: true }).selectOption('multiply');
  await lab.getByLabel('연산 파형 표시', { exact: true }).check();
  await expect(page.locator('polyline[data-signal^="Math:"][data-unit="W"]')).toHaveCount(1);
  await expect(lab.locator('[data-metric="Math integral"]')).toContainText('J');
  const csvDownload = page.waitForEvent('download'); await lab.getByRole('button', { name: '구간 CSV', exact: true }).click();
  const csv = await readFile((await (await csvDownload).path())!, 'utf8');
  expect(csv).toContain('provenance_json'); expect(csv).toContain('(W)'); expect(csv).toContain(run.id);
  await lab.getByLabel('커서 B', { exact: true }).fill(String(end * 2));
  await expect(lab.getByRole('alert').first()).toContainText('범위');
  await expect(lab.getByRole('button', { name: '측정 JSON', exact: true })).toBeDisabled();
  await lab.getByRole('button', { name: '전체 구간', exact: true }).click();
  await page.screenshot({ path: 'docs/evidence/eda-waveform-lab-desktop.png', fullPage: true });
  await page.locator('.simulation-view').evaluate(el => el.scrollTo(0, 0));
  await page.screenshot({ path: 'docs/evidence/eda-waveform-lab-chart.png', fullPage: true });
  const device = p.schematic.devices[0];
  await api('schematic.apply_command', { project_id: p.id, command: { type: 'move_device', id: device.id, x: device.x + 10, y: device.y } });
  await page.reload(); await expect(page.getByTestId('app-ready')).toBeVisible(); await page.getByTestId('tab-simulation').click();
  await expect(page.getByTestId('waveform-workbench').locator('.wave-stale')).toContainText('STALE');
  expect(errors).toEqual([]);
  await writeFile('docs/evidence/eda-waveform-lab.json', JSON.stringify({ native_tool: run.tool, project_id: p.id, run_id: run.id,
    revision: run.revision, samples: input.x.length, report, power_csv_export: true, out_of_range_rejected: true,
    stale_revision_displayed: true, browser_errors: errors }, null, 2));
});

test('EDA waveform lab remains usable in a narrow window', async ({ page }) => {
  test.setTimeout(90000);
  const projects = await api('project.list');
  const p = projects.find((p: { name: string }) => p.name === 'Waveform lab native QA');
  expect(p).toBeTruthy();
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.addInitScript(id => localStorage.setItem('mos.last_project', id), p.id);
  await page.goto('/eda'); await expect(page.getByTestId('app-ready')).toBeVisible();
  await page.getByTestId('tab-simulation').click();
  const lab = page.getByTestId('waveform-workbench'); await expect(lab).toBeVisible();
  await lab.getByRole('button', { name: '측정 JSON', exact: true }).scrollIntoViewIfNeeded();
  const overflow = await lab.evaluate(el => el.scrollWidth > el.clientWidth + 1); expect(overflow).toBe(false);
  await page.screenshot({ path: 'docs/evidence/eda-waveform-lab-narrow.png', fullPage: true });
});
