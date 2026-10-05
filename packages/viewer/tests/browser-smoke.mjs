import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('packages/viewer/tests/evidence');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1800, height: 820 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto((process.env.REGISTER_VIEWER_TEST_URL??'http://127.0.0.1:29991')+'?annotations=0');
  await page.waitForFunction(() => document.querySelector('[data-testid="smoke-scene"]')?.textContent?.startsWith('{'));
  const scene = JSON.parse(await page.getByTestId('smoke-scene').textContent());
  assert.equal(scene.source, 'pdk');
  assert.ok(scene.shapes.length > 0);
  const xy = scene.shapes.flatMap(shape => shape.polygon.map(([x, y]) => [BigInt(x), BigInt(y)]));
  const bounds = [xy.reduce((a, p) => p[0] < a ? p[0] : a, xy[0][0]), xy.reduce((a, p) => p[1] < a ? p[1] : a, xy[0][1]),
    xy.reduce((a, p) => p[0] > a ? p[0] : a, xy[0][0]), xy.reduce((a, p) => p[1] > a ? p[1] : a, xy[0][1])];
  const origin = [(bounds[0] + bounds[2]) / 2n, (bounds[1] + bounds[3]) / 2n];
  const extent = Math.max(Number(bounds[2] - bounds[0]), Number(bounds[3] - bounds[1])) * scene.dbu_um;
  const viewer2d = page.getByTestId('layout-viewer-2d');
  const viewer3d = page.getByTestId('layout-viewer-3d');
  await viewer2d.getByRole('button', { name: '레이어', exact: true }).click();
  await viewer3d.getByRole('button', { name: '레이어', exact: true }).click();
  await viewer2d.getByRole('button', { name: '위', exact: true }).click();
  await viewer3d.getByRole('button', { name: '위', exact: true }).click();
  await page.waitForTimeout(200);
  const layerOrder = new Map(scene.layers.map((layer, i) => [layer.id, layer.z_display_um + layer.thickness_display_um]));
  const candidates = scene.shapes.filter(shape => !shape.holes?.length&&shape.cell_path==='inverter').sort((a, b) => (layerOrder.get(b.layer_id) ?? 0) - (layerOrder.get(a.layer_id) ?? 0));
  let selected, selectedPoint;
  const pointInCanvas = async (viewer, point) => {
    // Wait for resized camera scale and OrbitControls damping before deriving a pixel from the UI scale bar.
    await page.waitForTimeout(200);
    const canvas = viewer.locator('canvas'); const rect = await canvas.boundingBox();
    const local = [Number(BigInt(point[0]) - origin[0]) * scene.dbu_um, Number(BigInt(point[1]) - origin[1]) * scene.dbu_um];
    const scale = await viewer.locator('.mos-viewer-scale').evaluate(element => {
      const label = element.querySelector('span:nth-child(2)').textContent;
      return Number.parseFloat(label) * (label.includes('mm') ? 1000 : 1) / Number.parseFloat(element.querySelector('.mos-scale-bar').style.width);
    });
    return { canvas, x: rect.width / 2 + local[0] / scale, y: rect.height / 2 - local[1] / scale };
  };
  for (const shape of candidates.slice(0, 40)) {
    const point = [String(shape.polygon.reduce((a, p) => a + BigInt(p[0]), 0n) / BigInt(shape.polygon.length)), String(shape.polygon.reduce((a, p) => a + BigInt(p[1]), 0n) / BigInt(shape.polygon.length))];
    const { canvas, x, y } = await pointInCanvas(viewer2d, point);
    await canvas.click({ position: { x, y } });
    selected = await page.getByTestId('smoke-selection').textContent();
    if (selected !== 'none') { selectedPoint = point; break; }
  }
  assert.ok(selected && selected !== 'none', 'actual worker shape must be pickable in orthographic 2D');
  assert.ok(scene.shapes.some(shape => shape.id === selected));
  const stable = selected;
  assert.ok((await viewer3d.locator('.mos-viewer-status').textContent()).includes(stable), '3D shares exact stable occurrence selection');
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  const point3d = await pointInCanvas(viewer3d, selectedPoint);
  await point3d.canvas.click({ position: { x: point3d.x, y: point3d.y } });
  assert.equal(await page.getByTestId('smoke-selection').textContent(), stable, 'same world point must pick same occurrence in 3D top view');
  await viewer3d.getByRole('button', { name: '레이어', exact: true }).click();
  const clickSamePoint = async () => {
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    const p = await pointInCanvas(viewer3d, selectedPoint);
    await p.canvas.click({ position: { x: p.x, y: p.y } });
  };
  for (const layer of scene.layers) await viewer3d.locator(`[data-layer="${layer.id}"] input[type=checkbox]`).nth(0).uncheck();
  await clickSamePoint(); assert.equal(await page.getByTestId('smoke-selection').textContent(), 'none', 'hidden shapes must not pick');
  for (const layer of scene.layers) await viewer3d.locator(`[data-layer="${layer.id}"] input[type=checkbox]`).nth(0).check();
  for (const layer of scene.layers) await viewer3d.locator(`[data-layer="${layer.id}"] button`).click();
  await clickSamePoint(); assert.equal(await page.getByTestId('smoke-selection').textContent(), 'none', 'locked shapes must not pick');
  for (const layer of scene.layers) await viewer3d.locator(`[data-layer="${layer.id}"] button`).click();
  for (const layer of scene.layers) await viewer3d.locator(`[data-layer="${layer.id}"] input[type=checkbox]`).nth(1).uncheck();
  await clickSamePoint(); assert.equal(await page.getByTestId('smoke-selection').textContent(), 'none', 'non-pickable shapes must not pick');
  for (const layer of scene.layers) await viewer3d.locator(`[data-layer="${layer.id}"] input[type=checkbox]`).nth(1).check();
  await viewer3d.getByLabel('단면 축', { exact: true }).selectOption('x');
  await viewer3d.getByLabel('단면 위치', { exact: true }).focus(); await page.keyboard.press('Home');
  await clickSamePoint(); assert.equal(await page.getByTestId('smoke-selection').textContent(), 'none', 'clipped intersections must not pick');
  await viewer3d.getByLabel('단면 축', { exact: true }).selectOption('none');
  await clickSamePoint(); assert.equal(await page.getByTestId('smoke-selection').textContent(), stable);
  await viewer3d.getByRole('button', { name: '이동 값', exact: true }).click();
  await viewer3d.getByLabel('ΔX', { exact: true }).fill('1');
  await viewer3d.getByRole('button', { name: '명령 적용', exact: true }).click();
  await viewer3d.locator('.mos-viewer-error').filter({ hasText: /grid/i }).waitFor({timeout:65000});
  assert.equal(JSON.parse(await page.getByTestId('smoke-scene').textContent()).revision, 1, 'worker off-grid rejection must preserve revision');
  await viewer3d.getByLabel('ΔX', { exact: true }).fill('5');
  await viewer3d.getByRole('button', { name: '명령 적용', exact: true }).click();
  await page.waitForFunction(() => JSON.parse(document.querySelector('[data-testid="smoke-scene"]').textContent).revision === 2,null,{timeout:65000});
  const afterMove = JSON.parse(await page.getByTestId('smoke-scene').textContent());
  const beforeShape = scene.shapes.find(shape => shape.id === stable), afterShape = afterMove.shapes.find(shape => shape.id === stable);
  assert.ok(afterShape, 'worker preserves stable ID for a move');
  assert.deepEqual(afterShape.polygon, beforeShape.polygon.map(([x, y]) => [String(BigInt(x) + 5n), y]));
  await viewer3d.getByRole('button', { name: '닫기', exact: true }).click();
  const png = page.waitForEvent('download'); await viewer3d.getByRole('button', { name: 'PNG', exact: true }).click();
  await (await png).saveAs(path.join(output, 'actual-inverter-canvas.png'));
  const glb = page.waitForEvent('download'); await viewer3d.getByRole('button', { name: 'GLB', exact: true }).click();
  await (await glb).saveAs(path.join(output, 'actual-inverter-display.glb'));
  await viewer3d.getByLabel('단면 축', { exact: true }).selectOption('x');
  assert.equal(await viewer3d.getByRole('button', { name: 'GLB', exact: true }).isDisabled(), true, 'uncapped/clipped shader mesh cannot be exported as a clipped GLB');
  await viewer3d.getByLabel('단면 축', { exact: true }).selectOption('none');
  await viewer3d.getByRole('button', { name: '입체', exact: true }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(output, 'actual-worker-render.png'), fullPage: true });
  assert.deepEqual(errors, []);
  const report = { checked_at: new Date().toISOString(), project_id: scene.project_id, revision: afterMove.revision, source: scene.source, shape_count: scene.shapes.length,
    selected_stable_id: stable, renderer: 'Three.js WebGL2 / headless Chromium ANGLE SwiftShader', checks: ['real KLayout scene rendering', '2D picking', 'shared 3D stable selection', 'same point 2D/3D pick', 'hidden picking excluded', 'locked picking excluded', 'non-pickable picking excluded', 'clipped picking excluded', 'actual off-grid rejection preserves revision', 'actual XY worker move preserves stable ID and exact DBU delta', 'PNG capture', 'GLB display export', 'clipped GLB disabled'], errors };
  await writeFile(path.join(output, 'browser-smoke.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch(error) {console.log({failure:error.message,status:await page.locator('.mos-viewer-status').allTextContents()});await page.screenshot({path:path.join(output,'browser-smoke-failure.png')}).catch(()=>{});throw error;} finally { await browser.close(); }
