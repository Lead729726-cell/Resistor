import { test, expect, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
// @ts-expect-error Local worker transport is a main-process module.
import { runtimeConfig, workerRpc } from '../../scripts/runtime.mjs';

test.use({ video: 'on', trace: 'on' });
test.afterEach(async ({ page }, info) => {
  const video = page.video(); await page.close();
  if (video && info.status === 'passed') await video.saveAs(`docs/evidence/eda-signal-flow-${info.title.startsWith('native inverter') ? 'digital' : 'analog'}.webm`);
});
async function api(method: string, params: Record<string, unknown> = {}) {
  const response = await workerRpc(await runtimeConfig(), method, params);
  if (!response.ok) throw new Error(response.error.message); return response.result;
}
async function simulate(id: string) {
  let run = await api('simulation.run', { project_id: id, analysis: 'tran', netlister: 'native', post_layout: false });
  for (let i = 0; i < 240 && ['queued', 'running'].includes(run.execution_status); i++) {
    await new Promise(resolve => setTimeout(resolve, 250)); run = await api('job.status', { run_id: run.id });
  }
  expect(run.execution_status, run.message).toBe('completed'); expect(run.analysis_result, run.message).toBe('pass');
  expect(run.tool).toMatch(/ngspice/i); return run;
}
async function open(page: Page, id: string) {
  await page.addInitScript((id: string) => localStorage.setItem('mos.last_project', id), id);
  await page.goto('/eda'); await expect(page.getByTestId('app-ready')).toBeVisible(); await page.getByTestId('tab-simulation').click();
  await expect(page.getByTestId('signal-flow-panel')).toBeVisible();
}
function sample(xs: number[], ys: number[], x: number) {
  const i = xs.findIndex(t => t >= x); expect(i).toBeGreaterThanOrEqual(0);
  return !i || xs[i] === x ? ys[i] : ys[i-1] + (ys[i]-ys[i-1]) * (x-xs[i-1]) / (xs[i]-xs[i-1]);
}
test('native inverter: signed currents, voltage drops, signal PASS/FAIL, export and stale gate', async ({ page }) => {
  test.setTimeout(180000); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const p = await api('project.create', { name: 'Signal flow inverter QA', example: 'inverter' });
  const run = await simulate(p.id), flow = run.current_flow;
  const volts = new Map<string, number[]>(flow.node_voltages.map((v: any) => [v.net, v.values_V]));
  for (const net of ['A', 'Y', 'VGND', 'VPWR', '0']) expect(volts.has(net)).toBe(true);
  expect(flow.x.length).toBe(volts.get('A')!.length); expect(flow.omitted_voltage_nets).toEqual([]);
  await open(page, p.id); const panel = page.getByTestId('signal-flow-panel');
  // Move the main A cursor; the flow frame uses the same actual coordinate.
  await page.getByLabel('커서 A', { exact: true }).fill('2e-9');
  const pm = flow.branches.find((b: any) => b.device_id === 'mp1');
  const row = panel.locator(`[data-branch="${pm.id}"]`);
  expect(Number(await row.getAttribute('data-current'))).toBeCloseTo(sample(flow.x, pm.values_A, 2e-9), 12);
  expect(Number(await row.getAttribute('data-drop'))).toBeCloseTo(sample(flow.x, volts.get(pm.from_net)!, 2e-9) - sample(flow.x, volts.get(pm.to_net)!, 2e-9), 12);
  await expect(row).toHaveAttribute('data-direction', 'reverse');
  await row.getByRole('button').click(); await expect(panel.getByTestId('flow-diagram')).toHaveAttribute('data-direction', 'reverse');
  expect(Number(await panel.locator('[data-net="A"]').getAttribute('data-voltage'))).toBeCloseTo(1.8, 10);
  await panel.getByLabel('흐름 해석 위치').evaluate((el: HTMLInputElement) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, '7e-9');
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const sliderTime = await panel.getByLabel('흐름 해석 위치').inputValue();
  expect(Math.abs(Number(sliderTime) - 7e-9)).toBeLessThan(30e-12);
  await expect(page.getByLabel('커서 A', { exact: true })).toHaveValue(sliderTime);
  expect(Number(await panel.locator('[data-net="Y"]').getAttribute('data-voltage'))).toBeGreaterThan(1.7);
  await panel.getByLabel('시험 입력 신호').selectOption('node:A'); await panel.getByLabel('시험 출력 신호').selectOption('node:Y');
  await panel.getByLabel('신호 시험 시간').fill('2ns, 7ns, 12ns, 17ns');
  await panel.getByLabel('시험 안정화 지연').fill('50e-12'); await panel.getByLabel('시험 구간 폭').fill('100e-12');
  await panel.getByTestId('run-signal-test').click(); await expect(panel.getByTestId('signal-test-result')).toHaveText('PASS · 4/4');
  const download = page.waitForEvent('download'); await panel.getByRole('button', { name: '신호 시험 JSON', exact: true }).click();
  const report = JSON.parse(await readFile((await (await download).path())!, 'utf8'));
  expect(report.provenance.run_id).toBe(run.id); expect(report.verification.pass).toBe(true); expect(report.output.origin).toBe('v(Y)');
  await panel.getByLabel('시험 기대 동작').selectOption('buffer'); await expect(panel.getByTestId('signal-test-result')).toHaveCount(0);
  await panel.getByTestId('run-signal-test').click(); await expect(panel.getByTestId('signal-test-result')).toHaveText('FAIL · 0/4');
  await panel.getByLabel('시험 기대 동작').selectOption('manual'); await panel.getByLabel('시험 수동 기대값').fill('0, 1, 0, 1');
  await panel.getByTestId('run-signal-test').click(); await expect(panel.getByTestId('signal-test-result')).toHaveText('PASS · 4/4');
  await panel.getByLabel('신호 시험 시간').fill('100ns'); await panel.getByLabel('시험 수동 기대값').fill('0');
  await panel.getByTestId('run-signal-test').click(); await expect(panel.getByTestId('signal-test-case')).toContainText('UNAVAILABLE');
  await panel.getByLabel('신호 시험 시간').fill('2ns, 7ns, 12ns, 17ns'); await panel.getByLabel('시험 수동 기대값').fill('0, 1, 0, 1');
  await panel.getByTestId('run-signal-test').click(); await panel.getByTestId('signal-test-result').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'docs/evidence/eda-signal-flow-digital.png', fullPage: true });
  await panel.getByRole('button', { name: '흐름 재생', exact: true }).click();
  const before = await page.getByLabel('커서 A', { exact: true }).inputValue();
  await expect.poll(() => page.getByLabel('커서 A', { exact: true }).inputValue()).not.toBe(before);
  await panel.getByRole('button', { name: '일시정지', exact: true }).click();
  await api('schematic.apply_command', { project_id: p.id, command: { type: 'move_device', id: 'mn1', x: 410, y: 360 } });
  await page.reload(); await expect(page.getByTestId('app-ready')).toBeVisible(); await page.getByTestId('tab-simulation').click();
  await expect(panel.getByTestId('run-signal-test')).toBeDisabled(); await expect(panel).toContainText('STALE');
  expect(errors).toEqual([]);
  await writeFile('docs/evidence/eda-signal-flow-digital.json', JSON.stringify({ project_id: p.id, run_id: run.id, revision: run.revision, tool: run.tool,
    node_names: [...volts.keys()], samples: flow.x.length, verified: ['native voltage/drop/current at same cursor', 'negative current reverses arrow', 'slider cursor sync', 'playback', 'NOT PASS', 'wrong buffer FAIL', 'manual PASS', 'out-of-range unavailable', 'stale test disabled'], report, browser_errors: errors }, null, 2));
});
test('native RC: analytic charge/drop/current, analog window acceptance and narrow UI', async ({ page }) => {
  test.setTimeout(180000); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const p = await api('design.create_template', { name: 'Signal flow RC QA', template_id: 'rc_lowpass', command_id: randomUUID() });
  const run = await simulate(p.id), flow = run.current_flow, tau = 10e-9;
  const node = (name: string) => flow.node_voltages.find((n: any) => n.net === name).values_V;
  const t = 11.0005e-9, out = sample(flow.x, node('OUT'), t), vin = sample(flow.x, node('IN'), t);
  expect(Math.abs(out - 1.8 * (1 - Math.exp(-1)))).toBeLessThan(.002);
  const rb = flow.branches.find((b: any) => b.device_id === 'r1');
  expect(sample(flow.x, rb.values_A, t)).toBeCloseTo((vin - out) / 10000, 10);
  await page.setViewportSize({ width: 1024, height: 768 }); await open(page, p.id);
  const panel = page.getByTestId('signal-flow-panel'); await page.getByLabel('커서 A', { exact: true }).fill(String(t));
  const row = panel.locator(`[data-branch="${rb.id}"]`);
  expect(Number(await row.getAttribute('data-drop'))).toBeCloseTo(vin-out, 10);
  await panel.getByLabel('시험 기대 동작').selectOption('analog'); await panel.getByLabel('시험 출력 신호').selectOption('node:OUT');
  await panel.getByLabel('신호 시험 시간').fill('11.0005ns'); await panel.getByLabel('시험 구간 폭').fill('1e-9');
  await panel.getByLabel('시험 아날로그 최소').fill('1.1'); await panel.getByLabel('시험 아날로그 최대').fill('1.3');
  await panel.getByTestId('run-signal-test').click(); await expect(panel.getByTestId('signal-test-result')).toHaveText('PASS · 1/1');
  await expect(panel.getByTestId('signal-test-case')).toContainText('범위 내');
  await panel.getByLabel('시험 아날로그 최대').fill('1.15'); await panel.getByTestId('run-signal-test').click(); await expect(panel.getByTestId('signal-test-result')).toHaveText('FAIL · 0/1');
  await panel.getByLabel('시험 아날로그 최대').fill('1.3'); await panel.getByTestId('run-signal-test').click();
  const download = page.waitForEvent('download'); await panel.getByRole('button', { name: '현재 흐름 JSON', exact: true }).click();
  const report = JSON.parse(await readFile((await (await download).path())!, 'utf8'));
  expect(report.provenance.run_id).toBe(run.id); expect(report.branches.find((b: any) => b.device_id === 'r1').voltage_drop_V).toBeCloseTo(vin-out, 10);
  await panel.getByTestId('signal-test-result').scrollIntoViewIfNeeded();
  expect(await panel.evaluate(el => el.scrollWidth > el.clientWidth + 1)).toBe(false);
  await page.screenshot({ path: 'docs/evidence/eda-signal-flow-analog.png', fullPage: true }); expect(errors).toEqual([]);
  await writeFile('docs/evidence/eda-signal-flow-analog.json', JSON.stringify({ project_id: p.id, run_id: run.id, tool: run.tool, tau_s: tau,
    evaluation_s: t, expected_output_V: 1.8*(1-Math.exp(-1)), measured_output_V: out, drop_V: vin-out, current_A: sample(flow.x, rb.values_A, t), analog_window_pass_and_fail: true,
    narrow_no_panel_overflow: true, flow_export: report, browser_errors: errors }, null, 2));
});
