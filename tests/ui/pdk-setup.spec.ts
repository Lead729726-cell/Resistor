import { test, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import type { Run } from '../../packages/contracts/src/index';

test.describe.configure({ mode: 'serial' });
test.setTimeout(240000);
const qa = 'packages/ui/qa';
const close = async (page: import('@playwright/test').Page) => page.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }).click();
const validate = async (page: import('@playwright/test').Page) => { await page.getByTestId('pdk-step-0').click(); await page.getByTestId('pdk-profile-select').selectOption('sky130A'); await page.getByTestId('pdk-validate').click(); await expect(page.getByTestId('pdk-setup-state')).toContainText('통과', { timeout: 45000 }); };
const inspect = async (page: import('@playwright/test').Page) => { await page.getByTestId('pdk-step-1').click(); await page.getByTestId('pdk-inspect').click(); await expect(page.getByTestId('pdk-inspection-status')).toContainText('현재 profile', { timeout: 60000 }); };
const runAnalysis = async (page: import('@playwright/test').Page, kind: 'analysis' | 'drc' | 'pex' = 'analysis') => {
  const previous = new Set(await page.getByTestId('pdk-job-row').evaluateAll(rows => rows.map(row => row.getAttribute('data-run-id'))));
  await page.getByTestId(`pdk-run-${kind}`).click();
  let runId = '';
  await expect.poll(async () => { const ids = await page.getByTestId('pdk-job-row').evaluateAll(rows => rows.map(row => row.getAttribute('data-run-id'))); runId = ids.find(id => id && !previous.has(id)) || ''; return runId; }, { timeout: 45000 }).not.toBe('');
  return runId;
};
const resultJson = async (page: import('@playwright/test').Page, name: string, runId: string) => {
  const row = page.locator(`[data-testid="pdk-job-row"][data-run-id="${runId}"]`);
  await expect(row).toContainText('completed · pass', { timeout: 90000 }); await row.click(); await expect(row).toHaveClass('selected');
  const pending = page.waitForEvent('download'); await page.getByRole('button', { name: '실제 결과 JSON', exact: true }).click(); const file = await pending; await file.saveAs(`${qa}/${name}`);
  const run = JSON.parse(await readFile(`${qa}/${name}`, 'utf8')) as Run; expect(run.id).toBe(runId); return run;
};

test('naked MOS GDS → exact extracted biases → saved OP/DC → real currents and explicit path', async ({ page }) => {
  await mkdir(qa, { recursive: true }); const errors: string[] = [], requests: string[] = [];
  page.on('pageerror', error => errors.push(error.message)); page.on('request', request => { if (request.url().includes('/api/rpc')) requests.push(request.postData() || ''); });
  await page.goto('/?mode=viewer'); await page.getByTestId('viewer-gds-input').setInputFiles('examples/sky130/mosfet.gds');
  await expect(page.getByTestId('viewer-export')).toBeEnabled(); expect(requests).toHaveLength(0);
  await page.getByTestId('viewer-pdk-setup').click(); await expect(page.getByTestId('pdk-profile-select').locator('option[value=sky130A]')).toHaveCount(1, { timeout: 30000 });
  await validate(page); await page.getByTestId('pdk-step-1').click(); await page.getByTestId('pdk-import-gds').click();
  await expect(page.getByTestId('pdk-setup-state')).toContainText('실제 KLayout', { timeout: 45000 }); await inspect(page);
  await page.getByTestId('pdk-step-2').click(); const ports = await page.locator('.pdk-port-table tbody code').allTextContents(); expect([...ports].sort()).toEqual(['B', 'D', 'G', 'S']);
  for (const port of ports) await expect(page.getByTestId(`pdk-port-mode-${port}`)).toHaveValue('floating');
  await page.getByTestId('pdk-step-3').click(); await page.getByTestId('pdk-save-setup').click(); await expect(page.getByTestId('pdk-setup-error')).toBeVisible();
  await page.getByTestId('pdk-step-2').click(); await page.getByTestId('pdk-mos-bias-preset').click(); await expect(page.getByTestId('pdk-port-voltage-D')).toHaveValue('1.8');
  await page.getByTestId('pdk-step-3').click(); await page.getByTestId('pdk-analysis').selectOption('op'); await page.getByTestId('pdk-save-setup').click();
  await expect(page.getByTestId('pdk-setup-state')).toContainText('해석 조건 저장됨', { timeout: 45000 });
  // A dirty bias can be explicitly discarded; no native job starts on reset.
  await page.getByTestId('pdk-step-2').click(); await page.getByTestId('pdk-port-voltage-D').fill('1.35'); await page.getByTestId('pdk-setup-reset').click(); await expect(page.getByTestId('pdk-port-voltage-D')).toHaveValue('1.8');
  await validate(page); await inspect(page);
  const pendingSetup = page.waitForEvent('download'); await page.getByTestId('pdk-setup-export').click(); await (await pendingSetup).saveAs(`${qa}/mosfet.analysis-setup.json`);
  const setup = JSON.parse(await readFile(`${qa}/mosfet.analysis-setup.json`, 'utf8')); expect(setup.settings.ports).toHaveLength(4); expect(setup.settings).not.toHaveProperty('extracted_ports'); expect(setup.settings).not.toHaveProperty('pdk_fingerprint');
  await page.getByTestId('pdk-setup-import').setInputFiles(`${qa}/mosfet.analysis-setup.json`); await expect(page.getByTestId('pdk-setup-state')).toContainText('입력 설정을 가져왔습니다.');
  await validate(page); await inspect(page); await page.getByTestId('pdk-step-3').click(); await page.getByTestId('pdk-save-setup').click(); await expect(page.getByTestId('pdk-setup-state')).toContainText('해석 조건 저장됨', { timeout: 45000 });
  // Repeat a saved setup edit: server-only metadata must never leak back into the configure request.
  await page.getByTestId('pdk-step-2').click(); await page.getByTestId('pdk-port-voltage-D').fill('1.2'); await page.getByTestId('pdk-step-3').click(); await page.getByTestId('pdk-save-setup').click(); await expect(page.getByTestId('pdk-setup-state')).toContainText('해석 조건 저장됨', { timeout: 45000 });
  await page.getByTestId('pdk-step-4').click(); const opId = await runAnalysis(page); const op = await resultJson(page, 'pdk-configured-op.json', opId);
  expect(op.current_flow?.source).toBe('ngspice'); expect(op.current_flow?.branches.length).toBeGreaterThan(0); expect(op.waveforms?.length).toBeGreaterThan(0); expect(op.analysis_result).toBe('pass');
  await page.getByTestId('pdk-step-3').click(); await page.getByTestId('pdk-analysis').selectOption('dc'); await page.getByTestId('pdk-sweep-port').selectOption('G'); await page.getByTestId('pdk-step_V').fill('0.2'); await page.getByTestId('pdk-save-setup').click(); await expect(page.getByTestId('pdk-setup-state')).toContainText('해석 조건 저장됨', { timeout: 45000 });
  await page.getByTestId('pdk-step-4').click(); const dcId = await runAnalysis(page); const dc = await resultJson(page, 'pdk-configured-dc.json', dcId); expect(dcId).not.toBe(opId); expect(dc.current_flow?.x_unit).toBe('V'); expect(dc.current_flow?.x.length).toBeGreaterThan(5);
  await expect(page.getByTestId('pdk-run-lvs')).toBeDisabled();
  const drcId = await runAnalysis(page, 'drc'), drc = await resultJson(page, 'pdk-configured-drc.json', drcId); expect(drc.kind).toBe('drc');
  const pexId = await runAnalysis(page, 'pex'), pex = await resultJson(page, 'pdk-configured-pex.json', pexId); expect(pex.kind).toBe('pex');
  await page.locator(`[data-testid="pdk-job-row"][data-run-id="${dcId}"]`).click();
  // Reopen the same persisted native setup and verify actual saved biases/history.
  await close(page); await page.getByTestId('viewer-pdk-setup').click(); await page.getByTestId('pdk-step-2').click(); await expect(page.getByTestId('pdk-port-voltage-D')).toHaveValue('1.2'); await page.getByTestId('pdk-step-4').click(); await expect(page.getByTestId('pdk-job-row')).toHaveCount(4); await close(page);
  await expect(page.getByTestId('viewer-current-provenance')).toContainText('revision 일치'); await page.getByTestId('viewer-current-path').click();
  const branch = dc.current_flow!.branches.find(item => item.values_A.some(value => Math.abs(value) > 1e-12))!; expect(branch).toBeTruthy();
  await page.getByTestId('path-branch').selectOption(branch.id); await page.getByTestId('path-points').fill('0, 0\n1000, 0'); await expect(page.getByTestId('path-apply')).toBeDisabled(); await page.getByTestId('path-confirm').check(); await page.getByTestId('path-apply').click(); await close(page);
  const pendingBundle = page.waitForEvent('download'); await page.getByTestId('viewer-export').click(); await (await pendingBundle).saveAs(`${qa}/configured-mosfet.register-view.json`);
  const bundle = JSON.parse(await readFile(`${qa}/configured-mosfet.register-view.json`, 'utf8')); expect(bundle.currentFlow.project_id).toBe(bundle.scene.project_id); expect(bundle.currentFlow.revision).toBe(bundle.scene.revision); expect(bundle.currentFlow.branches.find((item: { id: string }) => item.id === branch.id).mapping).toBe('user_path'); expect(bundle.currentFlow.branches.find((item: { id: string }) => item.id === branch.id).values_A).toEqual(branch.values_A); expect(bundle.analysisSetup.analysis).toBe('dc');
  await page.screenshot({ path: `${qa}/register-pdk-configured-current.png` }); expect(errors).toEqual([]);
  await writeFile(`${qa}/pdk-setup-evidence.json`, JSON.stringify({ source: 'actual-native-configured-GDS-analysis', naked_GDS_without_sidecar: true, zero_rpc_before_explicit_setup: true, extracted_ports: ports, missing_ground_rejected: true, dirty_reset_and_setup_json_reimport: true, repeated_saved_bias_resave: true, persisted_bias_D_V: 1.2, saved_history_reopened: true, saved_history_count: 4, op_run: { id: op.id, kind: op.kind, result: op.analysis_result }, dc_run: { id: dc.id, result: dc.analysis_result, samples: dc.current_flow!.x.length }, drc_run: { id: drc.id, kind: drc.kind, result: drc.analysis_result }, pex_run: { id: pex.id, kind: pex.kind, result: pex.analysis_result, parasitics: pex.parasitics }, lvs_disabled_without_reference: true, user_path_preserves_actual_samples: true, scene_flow_identity_revision_match: true, browser_errors: errors }, null, 2));
});

test('PDK manifest / ZIP filenames and actual bad resource validation', async ({ page }) => {
  await page.goto('/?mode=viewer'); await page.getByTestId('viewer-pdk-setup').click(); await expect(page.getByTestId('pdk-profile-select').locator('option[value=sky130A]')).toHaveCount(1, { timeout: 30000 });
  await page.getByTestId('pdk-new-profile').click();
  const manifest = { schema_version: 1, id: `invalid-resources-${Date.now()}`, name: '실제 누락 리소스 검사', version: 'test', root: '/foss/pdks/register-not-installed', magic_rc: 'missing.magicrc', magic_tech: 'missing.tech', model_file: 'missing.lib', model_mode: 'lib', corners: ['tt'], spice_scale: 1e-6 };
  await page.getByTestId('pdk-manifest-file').setInputFiles({ name: 'my-foundry.manifest.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(manifest)) }); await expect(page.locator('.pdk-manifest-files')).toContainText('my-foundry.manifest.json'); await expect(page.getByTestId('pdk-manifest-model_file')).toHaveValue('missing.lib');
  await page.getByTestId('pdk-package-file').setInputFiles({ name: 'not-a-zip.txt', mimeType: 'text/plain', buffer: Buffer.from('wrong') }); await expect(page.getByTestId('pdk-setup-error')).toContainText('.zip');
  await page.getByTestId('pdk-package-file').setInputFiles({ name: 'corrupt-package.zip', mimeType: 'application/zip', buffer: Buffer.from('not zip bytes') }); await expect(page.locator('.pdk-manifest-files')).toContainText('corrupt-package.zip'); await page.getByTestId('pdk-register').click(); await expect(page.getByTestId('pdk-setup-error')).toBeVisible({ timeout: 30000 });
  await page.getByTestId('pdk-package-file').setInputFiles([]); await page.getByTestId('pdk-register').click(); await expect.poll(async () => await page.getByTestId('pdk-setup-error').isVisible() || await page.locator('.pdk-checks>[data-check-status=fail]').count() > 0, { timeout: 30000 }).toBe(true); await page.getByTestId('pdk-step-4').click(); await expect(page.getByTestId('pdk-run-analysis')).toBeDisabled();
  await page.setViewportSize({ width: 1280, height: 640 });
  await expect.poll(async () => { const footer = await page.locator('.pdk-setup-footer').boundingBox(); return !!footer && footer.y >= 0 && footer.y + footer.height <= 640; }).toBe(true);
  await page.screenshot({ path: `${qa}/register-pdk-setup-short-height.png` });
});

// Two actual MOS cells are copied from the real source records; no geometry or simulated values are invented.
async function twoTopMos() {
  const source = await readFile('examples/sky130/mosfet.gds'), records: Buffer[] = []; for (let offset = 0; offset < source.length;) { const length = source.readUInt16BE(offset); records.push(source.subarray(offset, offset + length)); offset += length; }
  const structures = records.filter(record => record[2] === 6).map(record => record.subarray(4).toString('ascii').replace(/\0+$/, ''));
  const rename = new Map(structures.map(name => [name, `${name}_B`])), start = records.findIndex(record => record[2] === 5), end = records.findIndex(record => record[2] === 4);
  const duplicates = records.slice(start, end).map(record => { if (![6, 18].includes(record[2])) return record; const text = record.subarray(4).toString('ascii').replace(/\0+$/, ''), value = rename.get(text) || text, data = Buffer.from(value.length % 2 ? value + '\0' : value, 'ascii'), replacement = Buffer.alloc(4 + data.length); replacement.writeUInt16BE(replacement.length); replacement[2] = record[2]; replacement[3] = record[3]; data.copy(replacement, 4); return replacement; });
  return { buffer: Buffer.concat([...records.slice(0, end), ...duplicates, records[end]]), topB: `${structures.at(-1)}_B` };
}

test('configured alternate top cell uses that native cell for scene/current and later scope', async ({ page }) => {
  const source = await twoTopMos(); await page.goto('/?mode=viewer'); await page.getByTestId('viewer-gds-input').setInputFiles({ name: 'actual-mos-two-top.gds', mimeType: 'application/octet-stream', buffer: source.buffer }); await expect(page.getByTestId('viewer-export')).toBeEnabled();
  await page.getByTestId('viewer-pdk-setup').click(); await expect(page.getByTestId('pdk-profile-select').locator('option[value=sky130A]')).toHaveCount(1, { timeout: 30000 }); await validate(page); await page.getByTestId('pdk-step-1').click(); await page.getByTestId('pdk-import-gds').click(); await expect(page.getByTestId('pdk-setup-state')).toContainText('실제 KLayout', { timeout: 45000 });
  await page.getByTestId('pdk-top-cell').fill(source.topB); await inspect(page); await page.getByTestId('pdk-step-2').click(); await page.getByTestId('pdk-mos-bias-preset').click(); await page.getByTestId('pdk-step-3').click(); await page.getByTestId('pdk-save-setup').click(); await expect(page.getByTestId('pdk-setup-state')).toContainText('해석 조건 저장됨', { timeout: 45000 }); await page.getByTestId('pdk-step-4').click(); const runId = await runAnalysis(page); await resultJson(page, 'pdk-alternate-top-op.json', runId); await close(page);
  await expect(page.getByTestId('viewer-top-cell')).toHaveValue(source.topB); const pending = page.waitForEvent('download'); await page.getByTestId('viewer-export').click(); await (await pending).saveAs(`${qa}/alternate-top.register-view.json`); const bundle = JSON.parse(await readFile(`${qa}/alternate-top.register-view.json`, 'utf8')); expect(bundle.topCell).toBe(source.topB); expect(bundle.analysisSetup.top_cell).toBe(source.topB); expect(bundle.scene.shapes.every((shape: { cell_path: string }) => shape.cell_path.startsWith(source.topB))).toBe(true); expect(bundle.currentFlow.project_id).toBe(bundle.scene.project_id);
  await page.getByRole('button', { name: '전체 범위', exact: true }).click(); await expect(page.getByTestId('viewer-current-provenance')).toContainText('revision 일치');
  const original = source.topB.slice(0, -2); await page.getByTestId('viewer-top-cell').selectOption(original); await expect(page.getByTestId('viewer-current-provenance')).toContainText('STALE');
});

