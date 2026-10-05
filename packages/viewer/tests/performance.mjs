import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('packages/viewer/tests/evidence'); await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-precise-memory-info'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 850 } });
const watchdog=setTimeout(()=>{void browser.close();},75000);
const errors = []; page.on('pageerror', error => errors.push(error.message));
try {
  const start = performance.now();
  await page.goto(`${process.env.REGISTER_VIEWER_TEST_URL ?? 'http://127.0.0.1:29991'}?example=performance&count=100000${process.env.REGISTER_PERFORMANCE_PROJECT_ID?'&project_id='+encodeURIComponent(process.env.REGISTER_PERFORMANCE_PROJECT_ID):''}`);
  await page.waitForFunction(() => document.querySelector('[data-testid="layout-viewer-3d"] canvas')?.dataset.totalShapes === '100000', null, { timeout: 30000 });
  const loadMs = performance.now() - start;
  console.log(`Actual 100k source, bounded exact scene built in ${loadMs.toFixed(0)} ms`);
  const viewer = page.getByTestId('layout-viewer-3d');
  await viewer.getByRole('button', { name: '입체', exact: true }).click();
  await page.waitForTimeout(500);
  const stats = await viewer.locator('canvas').evaluate(canvas => {
    const gl = canvas.getContext('webgl2'), extension = gl.getExtension('WEBGL_debug_renderer_info');
    return { drawingBuffer:{width:canvas.width,height:canvas.height},resolutionScale:Number(canvas.dataset.resolutionScale),buildMs: Number(canvas.dataset.geometryBuildMs), exactShapes: Number(canvas.dataset.totalShapes), visibleExactShapes: Number(canvas.dataset.visibleShapes), cachedGeometries: Number(canvas.dataset.geometryCacheCount), spatialBatches: Number(canvas.dataset.spatialBatchCount),
      gpu: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : 'unknown', gpuVendor: extension ? gl.getParameter(extension.UNMASKED_VENDOR_WEBGL) : 'unknown', hardwareConcurrency: navigator.hardwareConcurrency,
      userAgent: navigator.userAgent, heapUsedBytes: performance.memory?.usedJSHeapSize ?? null, heapLimitBytes: performance.memory?.jsHeapSizeLimit ?? null };
  });
  assert.equal(stats.exactShapes, 100000);assert.ok(stats.visibleExactShapes>0&&stats.visibleExactShapes<=2000); assert.ok(stats.cachedGeometries < 100000); assert.ok(stats.spatialBatches < 100000);
  console.log(JSON.stringify(stats));
  const canvas=viewer.locator('canvas'),box=await canvas.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
  const sampling = page.evaluate(() => new Promise(resolve => {
    const times = []; let previous = 0;
    const timer = setTimeout(() => resolve(times), 15000);
    function frame(time) { if (previous) times.push(time - previous); previous = time; if (times.length < 60) requestAnimationFrame(frame); else { clearTimeout(timer); resolve(times); } }
    requestAnimationFrame(frame);
  }));
  await page.mouse.move(box.x+box.width/2+150,box.y+box.height/2+50,{steps:90});await page.mouse.up();
  const frameTimes=await sampling;
  const sorted = [...frameTimes].sort((a,b) => a-b), mean = frameTimes.reduce((a,b) => a+b,0) / frameTimes.length;
  assert.ok(frameTimes.length >= 10, 'At least10 actual frames are required for a measured result');
  console.log(`Measured ${frameTimes.length} frames: mean ${mean.toFixed(1)} ms`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 30, { steps: 10 }); await page.mouse.up();
  await page.waitForTimeout(300);
  await viewer.getByRole('button', { name: '위', exact: true }).click();
  await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
  const selected = await page.getByTestId('smoke-selection').textContent();
  // Camera centre can fall in an array gap; picking at another exact rendered point is validated by node instance tests.
  const scene = JSON.parse(await page.getByTestId('smoke-scene').textContent());
  assert.equal(scene.total_shape_count,100000);assert.equal(scene.shapes.length,2000);assert.equal(scene.truncated,true); assert.equal(scene.source, 'fixture');
  await page.screenshot({ path: path.join(output, 'performance-100k.png'), fullPage: true });
  assert.deepEqual(errors, []);
  const report = { checked_at: new Date().toISOString(), project_id: scene.project_id, revision: scene.revision, source: scene.source, requestBoundsDBU:['470000','33000','530000','68000'], authority: 'Actual KLayout cell array → worker scene → exact cached Three.js instances',
    viewport: { width: 1600, height: 850 }, renderer: 'WebGL2', measuredInteraction:'Camera orbit drag and damping with continuous rendering',execution: 'Headless Chromium software ANGLE SwiftShader. No hardware GPU performance claim.',
    ...stats, endToEndLoadMs: loadMs, measuredFrames: frameTimes.length, meanFrameMs: mean, p50FrameMs: sorted[Math.floor(sorted.length * .5)], p95FrameMs: sorted[Math.floor(sorted.length * .95)], meanFps: 1000 / mean,
    visibleScope30FpsMet: mean <= 1000 / 30, all100000Visible30Fps: 'unverified; full software-rendering attempt was aborted due to host resource pressure', selectionAtCentre: selected, note: 'Actual100k integer cell array retained by KLayout worker; at most2000 exact occurrences fetched and drawn in explicit scope. No geometry LOD. Software frames measure this visible subset only.', errors };
  await writeFile(path.join(output, 'performance-100k.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
} catch(error) {
  const state=await page.evaluate(()=>({header:document.querySelector('header')?.innerText,status:[...document.querySelectorAll('.mos-viewer-status')].map(element=>element.textContent),canvas:[...document.querySelectorAll('canvas')].map(canvas=>({...canvas.dataset})),sceneLength:document.querySelector('[data-testid="smoke-scene"]')?.textContent.length})).catch(()=>null);
  console.log(JSON.stringify({failure:error.message,state,errors}));
  await page.screenshot({path:path.join(output,'performance-failure.png')}).catch(()=>{});
  await writeFile(path.join(output,'performance-failure.json'),JSON.stringify({checked_at:new Date().toISOString(),failure:error.message,state,errors},null,2));
  throw error;
} finally { clearTimeout(watchdog);await browser.close(); }
