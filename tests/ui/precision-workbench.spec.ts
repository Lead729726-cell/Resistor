import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { clickWorkbenchAction } from './helpers/workbench';
// @ts-expect-error Main-process-only authenticated transport.
import { runtimeConfig, workerRpc } from '../../scripts/runtime.mjs';

const evidence = 'docs/evidence/precision-workbench';
const records: Record<string, unknown>[] = [];
test.use({ video: 'on' });
test.beforeAll(async () => { await mkdir(evidence, { recursive: true }); });
test.afterEach(async ({ page }, info) => {
  const video = page.video(); await page.close();
  if (video && info.status === 'passed') await video.saveAs(`${evidence}/${info.title.split(':')[0]}.webm`);
});
test.afterAll(async () => {
  await writeFile(`${evidence}/verification.json`, JSON.stringify({ checked_at: new Date().toISOString(), records, scope: 'Presentation, navigation and isolated native QA projects; no user project altered', commercial_vendor_execution: false, native_Mac_execution: false }, null, 2));
});
async function api(method: string, params: Record<string, unknown> = {}) {
  const result = await workerRpc(await runtimeConfig(), method, params);
  if (!result.ok) throw new Error(result.error.message); return result.result;
}
async function openProject(page: Page, id: string) {
  await page.addInitScript(id => {
    localStorage.setItem('mos.last_project', id);
    if (!localStorage.getItem('register.appearance')) localStorage.setItem('register.appearance', JSON.stringify({ version: 1, mode: 'dark', skin: 'graphite' }));
  }, id);
  await page.goto('/eda'); await expect(page.getByTestId('app-ready')).toBeVisible({ timeout: 60000 });
}
async function appearance(page: Page, mode: string, skin: string) {
  await page.getByTestId('appearance-open').click();
  await page.getByTestId(`appearance-mode-${mode}`).click();
  await page.getByTestId(`appearance-skin-${skin}`).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('html')).toHaveAttribute('data-theme', mode);
  await expect(page.locator('html')).toHaveAttribute('data-skin', skin);
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('calculator-desktop: immediate values, invalid inputs, eight palettes and search', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/voltage-divider');
  await page.getByLabel('Input voltage', { exact: true }).fill('5');
  await page.getByLabel('Top resistor', { exact: true }).fill('10000');
  await page.getByLabel('Bottom resistor', { exact: true }).fill('10000');
  await expect(page.locator('.result-panel>strong')).toHaveText('2.5V');
  for (const mode of ['dark', 'light']) for (const skin of ['graphite', 'jade', 'copper', 'iris']) {
    await appearance(page, mode, skin);
    await expect(page.getByLabel('Top resistor', { exact: true })).toHaveValue('10000');
    await expect(page.locator('.result-panel>strong')).toHaveText('2.5V');
  }
  await appearance(page, 'dark', 'graphite');
  await page.screenshot({ path: `${evidence}/calculator-dark.png` });
  await appearance(page, 'light', 'graphite');
  await page.screenshot({ path: `${evidence}/calculator-light.png` });
  await page.getByLabel('Top resistor', { exact: true }).fill('0');
  await expect(page.locator('.result-panel')).toContainText('Invalid input');
  await expect(page.locator('.result-panel')).toContainText('greater than zero');
  await page.getByLabel('계산기 검색').fill('RLC');
  await expect(page.locator('.calculator-list button')).toHaveCount(1);
  await page.locator('.calculator-list button').click();
  await expect(page).toHaveURL(/\/rlc-resonance$/);
  await expect(page.locator('.calculator-header h1')).toHaveText('RLC resonance');
  records.push({ test: 'calculator-desktop', known_value_V: 2.5, palettes: 8, units_and_inputs_preserved: true, invalid_input_blocked: true, search_and_URL: true });
});

test('calculator-mobile: compact navigation, reachable result and no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/voltage-divider');
  await expect(page.locator('.calculator-list')).not.toBeVisible();
  await page.getByRole('button', { name: /계산기 목록/ }).click();
  await expect(page.locator('.calculator-list')).toBeVisible();
  await page.getByRole('button', { name: 'Voltage divider', exact: true }).click();
  await expect(page.locator('.calculator-list')).not.toBeVisible();
  await page.locator('.result-panel>strong').scrollIntoViewIfNeeded();
  await expect(page.locator('.result-panel>strong')).toBeInViewport();
  const box = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth, workspace: document.querySelector('.calculator-workspace')!.clientWidth, content: document.querySelector('.calculator-workspace')!.scrollWidth }));
  expect(box.document).toBeLessThanOrEqual(box.width); expect(box.content).toBeLessThanOrEqual(box.workspace + 1);
  await page.screenshot({ path: `${evidence}/calculator-mobile-result.png` });
  records.push({ test: 'calculator-mobile', ...box, result_reachable: true });
});

test('eda-navigation: compact actions, pane controls, precision and geometry preservation', async ({ page }) => {
  test.setTimeout(180000);
  const project = await api('project.create', { name: 'Precision workbench navigation QA', example: 'inverter' });
  const source = await api('view.get_scene', { project_id: project.id });
  await page.setViewportSize({ width: 1600, height: 1000 }); await openProject(page, project.id);
  await expect(page.locator('.verification-list .status')).toHaveText(['미실행', '미실행', '미실행']);
  const before = await page.locator('.primary-viewport').boundingBox();
  expect(before!.height).toBeGreaterThan(549);
  for (const id of ['project-tools-menu', 'design-tools-menu', 'setup-tools-menu']) {
    await page.getByTestId(id).locator('summary').focus(); await page.keyboard.press('Enter');
    await expect(page.getByTestId(id)).toHaveAttribute('open', '');
    await page.keyboard.press('Escape'); await expect(page.getByTestId(id)).not.toHaveAttribute('open', '');
    await expect(page.getByTestId(id).locator('summary')).toBeFocused();
  }
  await clickWorkbenchAction(page, 'open-pdk-setup'); await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }).click();
  await appearance(page, 'light', 'graphite'); await page.screenshot({ path: `${evidence}/eda-light.png` });
  await appearance(page, 'dark', 'graphite');
  await page.locator('.instance-item').filter({ hasText: 'MN1' }).click();
  await expect(page.locator('.inspector-device')).toContainText('MN1');
  const selection = await page.locator('.app-shell').getAttribute('data-selected-device');
  await page.getByTestId('toggle-inspector').click(); await expect(page.locator('.inspector-sidebar')).not.toBeVisible();
  await page.getByTestId('toggle-explorer').click(); await expect(page.locator('.project-sidebar')).not.toBeVisible();
  await page.getByTestId('toggle-results').click(); await expect(page.locator('.results-panel')).not.toBeVisible();
  const expanded = await page.locator('.primary-viewport').boundingBox();
  expect(expanded!.height).toBeGreaterThan(before!.height + 180); expect(expanded!.width).toBeGreaterThan(before!.width + 450);
  await expect(page.locator('.app-shell')).toHaveAttribute('data-selected-device', selection!);
  await page.reload(); await expect(page.getByTestId('app-ready')).toBeVisible({ timeout: 60000 });
  await expect(page.getByTestId('toggle-results')).toHaveAttribute('aria-expanded', 'false');
  for (const id of ['toggle-inspector', 'toggle-explorer', 'toggle-results']) await page.getByTestId(id).click();
  await page.setViewportSize({ width: 1366, height: 768 });
  const toolbar = await page.locator('.main-toolbar').evaluate(el => ({ width: el.clientWidth, content: el.scrollWidth }));
  expect(toolbar.content).toBeLessThanOrEqual(toolbar.width);
  for (const id of ['run-simulation', 'run-drc', 'run-lvs', 'run-pex']) await expect(page.getByTestId(id)).toBeInViewport();
  await expect(page.locator('.mos-viewer-controls')).toBeInViewport();
  await page.screenshot({ path: `${evidence}/eda-laptop.png` });
  await page.setViewportSize({ width: 1600, height: 1000 }); await page.screenshot({ path: `${evidence}/eda-dark.png` });
  const after = await api('project.snapshot', { project_id: project.id });
  const scene = await api('view.get_scene', { project_id: project.id });
  expect(after.revision).toBe(project.revision); expect(hash(scene.shapes)).toBe(hash(source.shapes));
  expect(after.schematic).toEqual(project.schematic);
  records.push({ test: 'eda-navigation', project_id: project.id, source_revision: after.revision, shapes_sha256: hash(source.shapes), selection, toolbar, viewport_before: before, viewport_expanded: expanded, numeric_geometry_and_schematic_preserved: true });
});

test('eda-native-results: actual ngspice PASS, stale revision, DRC FAIL, logs and artifact paths', async ({ page }) => {
  test.setTimeout(240000);
  const project = await api('project.create', { name: 'Precision workbench native result QA', example: 'inverter' });
  await page.setViewportSize({ width: 1600, height: 1000 }); await openProject(page, project.id);
  await page.getByTestId('run-simulation').click();
  const row = page.getByTestId('job-row').first(); await expect(row).toBeVisible();
  const runId = await row.getAttribute('data-run-id');
  await expect(row.locator('[data-execution="completed"][data-result="pass"]')).toBeVisible({ timeout: 120000 });
  const run = await api('job.status', { run_id: runId });
  expect(run.tool).toMatch(/ngspice/i); expect(run.execution_status).toBe('completed'); expect(run.analysis_result).toBe('pass');
  await expect(page.getByTestId('selected-run-evidence')).toContainText('PASS');
  await page.getByTestId('selected-run-evidence').getByRole('button', { name: '결과 파일 위치' }).click();
  const paths = page.getByRole('dialog').locator('pre');
  await expect(paths).toContainText(run.manifest_path); await expect(paths).toContainText(run.id);
  await page.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }).click();
  await page.getByTestId('selected-run-evidence').getByRole('button', { name: '로그 보기' }).click();
  await expect(page.locator('.job-log')).toContainText(/ngspice|transient/i);
  await page.screenshot({ path: `${evidence}/native-simulation.png` });
  const layer = project.layers.find((layer: any) => layer.gds[0] === 68 && layer.gds[1] === 20);
  expect(layer).toBeTruthy();
  await api('layout.apply_command', { project_id: project.id, command: { type: 'add_box', layer_id: layer.id, box: ['25000', '25000', '25010', '25010'] } });
  await page.reload(); await expect(page.getByTestId('app-ready')).toBeVisible({ timeout: 60000 });
  await expect(page.getByTestId('selected-run-evidence')).toContainText('STALE');
  await page.getByTestId('run-drc').click();
  const drcRow = page.getByTestId('job-row').first();
  await expect(drcRow.locator('.job-kind')).toHaveText('drc');
  await expect(drcRow.locator('[data-execution="completed"][data-result="fail"]')).toBeVisible({ timeout: 120000 });
  const drc = await api('job.status', { run_id: await drcRow.getAttribute('data-run-id') });
  expect(drc.markers.length).toBeGreaterThan(0);
  await expect(page.getByTestId('selected-run-evidence').locator('.run-cause')).toContainText(drc.message);
  await expect(page.locator('.verification-list').first()).toContainText('FAIL');
  await expect(page.locator('.mos-current-panel')).toContainText('STALE');
  const flowLayout = await page.locator('.mos-viewer-stage').boundingBox();
  expect(flowLayout!.height).toBeGreaterThan(200);
  await page.screenshot({ path: `${evidence}/native-drc-failure.png` });
  records.push({ test: 'eda-native-results', project_id: project.id, simulation: { id: run.id, tool: run.tool, revision: run.revision, execution: run.execution_status, result: run.analysis_result }, drc: { id: drc.id, tool: drc.tool, revision: drc.revision, execution: drc.execution_status, result: drc.analysis_result, markers: drc.markers.length, message: drc.message }, actual_engine_jobs: true });
});

test('workspace-pending-list: read latency does not lock independent creation or file import', async ({ page }) => {
  const project = await api('project.create', { name: 'Workspace loading state isolated QA', example: 'fixture' });
  await openProject(page, project.id);
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/rpc', async route => {
    if (route.request().postDataJSON()?.method === 'project.list') {
      await pending;
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, result: [] }) });
    } else await route.continue();
  });
  try {
    await clickWorkbenchAction(page, 'workspace-manager');
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('status')).toContainText('프로젝트 목록을 읽는 중');
    await expect(page.getByTestId('workspace-import')).toBeEnabled();
    await expect(dialog.getByRole('button', { name: '새 프로젝트', exact: true })).toBeEnabled();
    await expect(dialog.getByRole('button', { name: '새로고침', exact: true })).toBeDisabled();
    await page.screenshot({ path: `${evidence}/workspace-pending-list.png` });
    release();
    await expect(dialog.getByRole('status')).not.toBeVisible();
    records.push({ test: 'workspace-pending-list', fixture: 'held project.list transport response only', independent_import_and_create_available: true, read_status_visible: true });
  } finally { release(); }
});

test('eda-unavailable: isolated transport fixture shows cause and no false PASS', async ({ page }) => {
  await page.route('**/api/rpc', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: false, error: { code: 'WORKER_UNAVAILABLE', message: 'UI harness: isolated unavailable engine' } }) }));
  await page.goto('/eda');
  await expect(page.locator('.error-banner')).toContainText('UI harness: isolated unavailable engine');
  await expect(page.getByTestId('open-runtime-diagnostics')).toContainText('Worker 연결 실패');
  await expect(page.locator('.status.pass')).toHaveCount(0);
  await expect(page.locator('.status-bar')).toContainText('요청 실패');
  await page.screenshot({ path: `${evidence}/unavailable-fixture.png` });
  records.push({ test: 'eda-unavailable', fixture: 'isolated transport error only; no engine execution claim', no_false_PASS: true, cause_visible: true });
});
