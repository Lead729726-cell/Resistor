import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { _electron as electron, chromium } from 'playwright';

test('packaged logo and saved skins run in a cold desktop viewer and isolated Linux web without native access', { timeout: 180000 }, async () => {
  const root = process.cwd(), packaged = path.join(root, 'release/Register-win32-x64');
  const source = JSON.parse(await readFile('docs/evidence/brand-assets.json', 'utf8'));
  const png = await readFile('apps/desktop/assets/register.png'), ico = await readFile('apps/desktop/assets/register.ico');
  const exe = await readFile(path.join(packaged, 'Register.exe'));
  assert.equal(ico.readUInt16LE(2), 1); assert.equal(ico.readUInt16LE(4), 7);
  assert(exe.includes(png), 'The new 256 px logo must be embedded in the executable icon resources.');
  const sha = bytes => createHash('sha256').update(bytes).digest('hex');
  assert.equal(sha(await readFile(source.source)), source.source_sha256);
  assert.equal(sha(png), source.png_sha256);
  assert.equal(sha(await readFile(path.join(packaged, 'resources/app/apps/desktop/assets/register.png'))), source.png_sha256);
  assert.equal(sha(await readFile(path.join(packaged, 'resources/app/apps/desktop/assets/register.ico'))), source.ico_sha256);
  for (const file of ['appearance-init.js', 'register-symbol.svg']) assert.equal(sha(await readFile(`dist/${file}`)), sha(await readFile(path.join(packaged, 'resources/app/dist', file))));
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'register-appearance-cold-'));
  const launch = () => electron.launch({ executablePath: path.join(packaged, 'Register.exe'), args: ['--viewer', `--user-data-dir=${path.join(workspace, 'profile')}`], env: { ...process.env, MOS_WORKSPACE: workspace, PATH: path.dirname(process.execPath) }, timeout: 60000 });
  let desktop = await launch();
  const errors = [];
  try {
    assert.equal(path.resolve(await desktop.evaluate(({ app }) => app.getPath('userData'))), path.resolve(workspace, 'profile'), 'Desktop verification must use its own temporary profile.');
    let window = await desktop.firstWindow(); window.on('pageerror', error => errors.push(error.message));
    await window.getByTestId('viewer-empty-gds-input').setInputFiles(path.join(root, 'examples/sky130/mosfet.gds'));
    await window.getByTestId('viewer-shape-count').waitFor();
    await window.getByTestId('appearance-open').click(); await window.getByTestId('appearance-mode-light').click(); await window.getByTestId('appearance-skin-iris').click();
    await window.getByRole('button', { name: '화면 스타일 닫기', exact: true }).click();
    assert.deepEqual(await window.evaluate(() => ({ theme: document.documentElement.dataset.theme, skin: document.documentElement.dataset.skin, isolated: !('require' in window) })), { theme: 'light', skin: 'iris', isolated: true });
    await window.screenshot({ path: 'docs/evidence/windows-appearance-iris-light.png' });
    await desktop.close(); desktop = await launch(); window = await desktop.firstWindow(); window.on('pageerror', error => errors.push(error.message));
    await window.getByTestId('appearance-open').waitFor();
    assert.deepEqual(await window.evaluate(() => ({ theme: document.documentElement.dataset.theme, skin: document.documentElement.dataset.skin })), { theme: 'light', skin: 'iris' });
    await assert.rejects(access(path.join(workspace, '.runtime/worker.json')));
  } finally { await desktop.close(); }
  const url = process.env.REGISTER_CLOUD_TEST_URL || 'http://127.0.0.1:18767';
  for (const file of ['appearance-init.js', 'register-symbol.svg']) {
    const reply = await fetch(`${url}/${file}`); assert.equal(reply.status, 200);
    assert.equal(sha(Buffer.from(await reply.arrayBuffer())), sha(await readFile(`dist/${file}`)));
  }
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-webgl'] });
  let nativeRequests = 0;
  const palettes = JSON.parse(await readFile('packages/ui/src/appearance-presets.json', 'utf8'));
  const remote = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    page.on('pageerror', error => errors.push(error.message)); page.on('request', request => { if (/\/rpc|\/events/.test(new URL(request.url()).pathname)) nativeRequests++; });
    await page.goto(`${url}/?mode=viewer`); await page.getByTestId('viewer-empty-gds-input').setInputFiles(path.join(root, 'examples/sky130/mosfet.gds')); await page.getByTestId('viewer-shape-count').waitFor();
    for (const mode of ['dark', 'light']) for (const [skin, definition] of Object.entries(palettes.skins)) {
      await page.getByTestId('appearance-open').click(); await page.getByTestId(`appearance-mode-${mode}`).click(); await page.getByTestId(`appearance-skin-${skin}`).click();
      await page.waitForFunction(expected => document.querySelector('canvas')?.getAttribute('data-appearance-background') === expected, definition[mode].canvas);
      if (skin === 'jade' && mode === 'light') await page.screenshot({ path: 'docs/evidence/linux-appearance-jade-light.png' });
      await page.getByRole('button', { name: '화면 스타일 닫기', exact: true }).click();
      const pixel = await page.locator('canvas').evaluate(canvas => { const context = canvas.getContext('webgl2'), bytes = new Uint8Array(4); context.readPixels(0, 0, 1, 1, context.RGBA, context.UNSIGNED_BYTE, bytes); return Array.from(bytes); });
      definition[mode].canvas.slice(1).match(/../g).map(value => parseInt(value, 16)).forEach((value, index) => assert(Math.abs(pixel[index] - value) <= 2));
      remote.push({ skin, mode, actual_canvas_background: await page.locator('canvas').getAttribute('data-appearance-background'), actual_canvas_pixel: pixel });
    }
    assert.equal(await page.getByTestId('viewer-shape-count').innerText(), '52 / 52');
    await page.reload(); assert.equal(await page.locator('html').getAttribute('data-skin'), 'iris'); assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  } finally { await browser.close(); }
  assert.equal(nativeRequests, 0); assert.deepEqual(errors, []);
  const sourceFiles = ['public/register-symbol.svg', 'public/appearance-init.js', 'packages/ui/src/appearance-presets.json', 'packages/ui/src/appearance.ts', 'packages/ui/src/AppearanceControl.tsx', 'packages/ui/src/Brand.tsx', 'packages/ui/src/theme.css', 'packages/ui/src/appearance.css', 'packages/ui/src/App.tsx', 'packages/ui/src/StandaloneViewer.tsx', 'packages/ui/src/WavePlot.tsx', 'packages/ui/src/styles.css', 'packages/ui/src/integrated-tools.css', 'packages/ui/src/IntegratedTools.tsx', 'packages/ui/src/interchange.css', 'packages/ui/src/native-database.css', 'packages/ui/src/pdk-setup.css', 'packages/ui/src/commercial-backend.css', 'packages/ui/src/standalone.css', 'packages/viewer/src/LayoutViewer.tsx', 'packages/viewer/src/viewer.css', 'packages/viewer/src/review.css', 'apps/desktop/main.cjs', 'apps/desktop/assets/register.png', 'apps/desktop/assets/register.ico', 'scripts/appearance-assets.mjs', 'scripts/brand-assets.mjs', 'tests/ui/appearance.spec.ts', 'tests/appearance-release.test.mjs'];
  const hashes = Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, sha(await readFile(file))])));
  await writeFile('docs/evidence/appearance-release.json', JSON.stringify({ checked_at: new Date().toISOString(), version: JSON.parse(await readFile('package.json', 'utf8')).version, executable_logo_embedded: true, icon_sizes: source.icon_sizes, desktop_temporary_profile_verified: true, desktop_skin_restored_after_restart: true, desktop_node_isolated: true, desktop_Docker_absent_and_no_worker_session: true, remote_asset_hashes_match: true, remote_palettes: remote, remote_no_native_or_auth_requests: true, remote_actual_GDS_shapes: 52, browser_errors: errors, source_sha256: hashes }, null, 2));
});
