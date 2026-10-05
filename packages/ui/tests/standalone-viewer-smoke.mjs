import { chromium, expect } from 'playwright/test';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import assert from 'node:assert/strict';

// This proves local visualization of explicitly supplied test vectors, not an ngspice execution.
await mkdir('packages/ui/qa', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1050 } });
const errors = [], forbiddenRequests = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (/\/api\/rpc|\/rpc(?:\/|$)|\/auth(?:\/|$)|\/events(?:\?|$)/.test(new URL(request.url()).pathname)) forbiddenRequests.push(request.url()); });
await page.routeWebSocket(/ws:\/\/127\.0\.0\.1:5173/, socket => socket.close());
try {
  await page.goto('http://127.0.0.1:5173/?mode=viewer');
  await page.getByTestId('standalone-viewer').waitFor();
  await expect(page.getByTestId('viewer-current-input')).toBeDisabled();
  await page.getByTestId('viewer-gds-input').setInputFiles('examples/sky130/inverter.gds');
  await page.getByTestId('layout-viewer-3d').waitFor();
  await expect(page.getByTestId('viewer-shape-count')).toContainText('/');
  await expect(page.getByTestId('viewer-export')).toBeEnabled();
  const initialCount = await page.getByTestId('viewer-shape-count').innerText();
  assert.ok(Number(initialCount.split('/')[0].replace(/,/g, '').trim()) > 10);
  for (const label of ['XY 이동', 'Box 추가', '배선 추가', 'Polygon / Cell 도구']) await expect(page.getByRole('button', { name: label, exact: true })).toBeDisabled();
  await page.getByTestId('viewer-sky130').click();
  await expect(page.getByTestId('viewer-notice')).toContainText('공개 SKY130');
  if (await page.getByRole('button', { name: '레이어', exact: true }).getAttribute('aria-expanded') !== 'true') await page.getByRole('button', { name: '레이어', exact: true }).click();
  await expect(page.locator('.mos-layer-row').first()).toBeVisible();
  assert.ok((await page.locator('.mos-layer-name').allTextContents()).some(text => text.includes('drawing')));
  await page.getByRole('button', { name: '레이어', exact: true }).click();
  await page.getByTestId('viewer-pdk-input').setInputFiles('adapters/pdks/sky130/sky130A.lyp');
  await expect(page.getByTestId('viewer-notice')).toContainText('layer 정의');
  await page.getByTestId('viewer-tab-2d').click(); await page.getByTestId('layout-viewer-2d').waitFor();
  await page.getByTestId('viewer-tab-3d').click(); await page.getByTestId('layout-viewer-3d').waitFor();
  const topCells = await page.getByTestId('viewer-top-cell').locator('option').allTextContents();
  if (topCells.length > 1) {
    const original = await page.getByTestId('viewer-top-cell').inputValue();
    const child = await page.getByTestId('viewer-top-cell').locator('option').first().getAttribute('value');
    await page.getByTestId('viewer-top-cell').selectOption(child);
    await expect(page.getByTestId('viewer-notice')).toContainText('형상 표시');
    await expect(page.getByTestId('viewer-export')).toBeEnabled();
    assert.notEqual(await page.getByTestId('viewer-shape-count').innerText(), initialCount, 'Choosing child cell must read its actual geometry');
    await page.getByTestId('viewer-top-cell').selectOption(original);
    await expect(page.getByTestId('viewer-shape-count')).toHaveText(initialCount);
  }
  for (const [label, value] of [['x₁', '900000'], ['y₁', '900000'], ['x₂', '901000'], ['y₂', '901000']]) await page.getByLabel(`GDS 범위 ${label}`).fill(value);
  await page.getByTestId('viewer-scope-apply').click(); await expect(page.getByTestId('viewer-shape-count')).toHaveText(/^0 \/ /);
  await page.getByRole('button', { name: '전체 범위', exact: true }).click(); await expect(page.getByTestId('viewer-shape-count')).toHaveText(initialCount);
  const current = { schema_version: 1, source: 'imported', analysis: 'visualization-test-fixture', convention: 'conventional', project_id: 'external-test-layout', revision: 9, x: [0, 1e-9, 2e-9], x_unit: 's', notes: ['시각화 회귀 검사용 입력값입니다. 실제 시뮬레이터 실행 결과가 아닙니다.'],
    branches: [{ id: 'test-branch', name: 'Imported test current', from_net: 'a', to_net: 'b', values_A: [1e-5, -2e-5, 0], source_vector: 'test-fixture-current', mapping: 'user_path', path_dbu: [['0', '0'], ['1000', '0']], layer_id: '68/20' }] };
  await page.getByTestId('viewer-current-input').setInputFiles({ name: 'current-test-fixture.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(current)) });
  await expect(page.getByTestId('viewer-current-provenance')).toContainText('불일치');
  await expect(page.getByTestId('viewer-bind-current')).toBeDisabled();
  await expect(page.locator('canvas').first()).toHaveAttribute('data-current-arrow-count', '0');
  await page.getByTestId('viewer-bind-confirm').check(); await page.getByTestId('viewer-bind-current').click();
  await expect(page.getByTestId('viewer-current-provenance')).toContainText('revision 일치');
  await expect(page.getByTestId('current-value-test-branch')).toContainText('10 µA');
  await expect(page.locator('canvas').first()).toHaveAttribute('data-current-arrow-count', '1');
  await page.getByLabel('전류 샘플', { exact: true }).fill('1');
  await expect(page.getByTestId('current-value-test-branch')).toContainText('-20 µA');
  await page.getByLabel('전류 샘플', { exact: true }).fill('2');
  await expect(page.getByTestId('current-value-test-branch')).toContainText('0 A');
  await page.getByLabel('전류 샘플', { exact: true }).fill('0');
  await page.getByLabel('레이어 분해 간격').fill('0.6');
  const downloaded = page.waitForEvent('download'); await page.getByTestId('viewer-export').click(); const file = await downloaded;
  await file.saveAs('packages/ui/qa/standalone.register-view.json');
  const bundle = JSON.parse(await readFile('packages/ui/qa/standalone.register-view.json', 'utf8'));
  assert.equal(bundle.kind, 'register-view'); assert.ok(bundle.sourceGdsBase64); assert.equal(bundle.currentFlow.source, 'imported'); assert.equal(bundle.currentFlow.revision, bundle.scene.revision); assert.equal(bundle.currentFlow.project_id, bundle.scene.project_id);
  assert.ok(bundle.currentFlow.notes.some(note => note.includes('原本') || note.includes('원본 layout/hash 검증 안 됨'))); assert.equal(bundle.display.explode, .6);
  assert.equal(bundle.pdk.compact_default_stack, true); assert.ok(Math.max(...bundle.scene.layers.map(layer => layer.z_display_um)) < 10, 'LYP display stack must use compact actually present layers');
  await page.getByTestId('viewer-bundle-input').setInputFiles('packages/ui/qa/standalone.register-view.json');
  await expect(page.getByTestId('viewer-notice')).toContainText('복원');
  await expect(page.getByLabel('레이어 분해 간격')).toHaveValue('0.6');
  await expect(page.getByTestId('viewer-current-provenance')).toContainText('revision 일치');
  await page.getByTestId('viewer-gds-input').setInputFiles({ name: 'broken.gds', mimeType: 'application/octet-stream', buffer: Buffer.from('not-gds') });
  await expect(page.getByRole('alert')).toContainText('GDS');
  await expect(page.getByTestId('layout-viewer-3d')).toBeVisible();
  await page.getByRole('button', { name: '오류 닫기' }).click();
  await page.screenshot({ path: 'packages/ui/qa/register-local-viewer.png' });
  assert.deepEqual(forbiddenRequests, [], 'Standalone viewer must not request native RPC, auth or collaboration events');
  assert.deepEqual(errors, [], 'No uncaught browser errors');
  const evidence = { mode: 'browser-local-viewer', no_native_auth_cloud_requests: true, real_gds_file: 'examples/sky130/inverter.gds', initial_shape_count: initialCount, top_cells: topCells, builtin_sky130_layers: true, real_lyp_import: true,
    readonly_mutation_controls: true, two_dimensional_and_three_dimensional_views: true, top_cell_and_exact_bounds_queries: true, current_data: 'explicit imported visualization-test-fixture, not simulator output', mismatched_provenance_arrows_withheld: true, explicit_binding_required: true, signed_and_zero_current_values: true,
    bundle_bytes: (await stat('packages/ui/qa/standalone.register-view.json')).size, source_scene_pdk_current_display_reopened: true, malformed_gds_preserved_previous_scene: true, browser_errors: errors, forbidden_requests: forbiddenRequests };
  await writeFile('packages/ui/qa/standalone-viewer-evidence.json', JSON.stringify(evidence, null, 2)); console.log(JSON.stringify(evidence, null, 2));
} catch (error) { await page.screenshot({ path: 'packages/ui/qa/standalone-viewer-failure.png' }); throw error; } finally { await browser.close(); }
