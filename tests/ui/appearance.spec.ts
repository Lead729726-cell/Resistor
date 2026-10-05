import { clickWorkbenchAction } from './helpers/workbench';
import { test, expect, type Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import presets from '../../packages/ui/src/appearance-presets.json' with { type: 'json' };

const qa = 'packages/ui/qa/appearance';
const choose = async (page: Page, mode: 'dark' | 'light' | 'system', skin: string) => {
  await page.getByTestId('appearance-open').click();
  await page.getByTestId(`appearance-mode-${mode}`).click();
  await page.getByTestId(`appearance-skin-${skin}`).click();
};
const close = async (page: Page) => page.getByRole('button', { name: '화면 스타일 닫기', exact: true }).click();
const bundle = async (page: Page, name: string) => {
  const download = page.waitForEvent('download'); await page.getByTestId('viewer-export').click();
  const file = await download; await file.saveAs(`${qa}/${name}.json`);
  return JSON.parse(await readFile(`${qa}/${name}.json`, 'utf8'));
};
const evidence = async (values: Record<string, unknown>) => {
  const file = `${qa}/appearance-ui.json`; let current = {};
  try { current = JSON.parse(await readFile(file, 'utf8')); } catch {}
  await writeFile(file, JSON.stringify({ ...current, ...values, checked_at: new Date().toISOString() }, null, 2));
};

test('all eight skin/mode combinations update real GDS canvas and remain readable without changing geometry or starting RPC', async ({ page }) => {
  test.setTimeout(180000); await mkdir(qa, { recursive: true });
  const errors: string[] = [], rpc: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/\/rpc|\/events/.test(new URL(request.url()).pathname)) rpc.push(request.url()); });
  await page.goto('/?mode=viewer'); await page.getByTestId('viewer-empty-gds-input').setInputFiles('examples/sky130/mosfet.gds');
  await expect(page.getByTestId('viewer-shape-count')).toHaveText('52 / 52');
  await expect(page.locator('.register-brand').getByTestId('register-logo')).toBeVisible();
  const before = await bundle(page, 'original');
  await page.locator('canvas').evaluate(canvas => { canvas.dataset.appearanceTestIdentity = 'same-camera-and-canvas'; });
  const checks = [];
  for (const mode of ['dark', 'light'] as const) for (const [skin, value] of Object.entries(presets.skins)) {
    await choose(page, mode, skin);
    await expect(page.locator('html')).toHaveAttribute('data-theme', mode); await expect(page.locator('html')).toHaveAttribute('data-skin', skin);
    await expect(page.locator('canvas')).toHaveAttribute('data-appearance-background', value[mode].canvas);
    await expect(page.locator('canvas')).toHaveAttribute('data-appearance-test-identity', 'same-camera-and-canvas');
    const colors = await page.evaluate(() => {
      const styles = getComputedStyle(document.documentElement);
      const luminance = (hex: string) => { const parts = hex.replace('#', '').match(/../g)!.map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4); return .2126 * parts[0] + .7152 * parts[1] + .0722 * parts[2]; };
      const tokens = ['--text', '--muted', '--faint', '--accent']; const backgrounds = ['--panel', '--canvas'];
      return Object.fromEntries(tokens.map(token => [token, Math.min(...backgrounds.map(background => { const a = luminance(styles.getPropertyValue(token).trim()), b = luminance(styles.getPropertyValue(background).trim()); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05); }))]));
    });
    for (const ratio of Object.values(colors)) expect(ratio).toBeGreaterThanOrEqual(4.5);
    await page.screenshot({ path: `${qa}/register-${skin}-${mode}.png` });
    await close(page);
    const pixel = await page.locator('canvas').evaluate(canvas => {
      const context = canvas.getContext('webgl2')!; const bytes = new Uint8Array(4);
      context.readPixels(0, 0, 1, 1, context.RGBA, context.UNSIGNED_BYTE, bytes); return Array.from(bytes);
    });
    const expected = value[mode].canvas.slice(1).match(/../g)!.map(value => parseInt(value, 16));
    expected.forEach((channel, index) => expect(Math.abs(pixel[index] - channel)).toBeLessThanOrEqual(2));
    checks.push({ mode, skin, background: value[mode].canvas, actual_canvas_pixel: pixel, text_contrast: colors });
  }
  const after = await bundle(page, 'all-skins');
  expect(after.scene).toEqual(before.scene); expect(after.display).toEqual(before.display);
  expect(after.sourceGdsBase64).toEqual(before.sourceGdsBase64);
  expect(createHash('sha256').update(Buffer.from(after.sourceGdsBase64, 'base64')).digest('hex')).toBe(createHash('sha256').update(await readFile('examples/sky130/mosfet.gds')).digest('hex'));
  expect(rpc).toEqual([]); expect(errors).toEqual([]);
  await evidence({ actual_GDS_shapes: 52, eight_palettes: checks, geometry_and_PDK_layer_colors_preserved: true, renderer_and_camera_preserved: true, no_native_or_cloud_requests: true, browser_errors: errors });
});

test('saved appearance restores across viewer/design startup, keyboard selection, live system mode and another tab', async ({ page, context }) => {
  await mkdir(qa, { recursive: true });
  await page.addInitScript(() => { if (!localStorage.getItem('register.appearance')) localStorage.setItem('mos.theme', '"light"'); });
  await page.goto('/?mode=viewer'); await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await choose(page, 'system', 'iris');
  await page.emulateMedia({ colorScheme: 'dark' }); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' }); await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByTestId('appearance-skin-iris').focus(); await page.keyboard.press('Home'); await expect(page.getByTestId('appearance-skin-graphite')).toBeFocused();
  await page.keyboard.press('ArrowRight'); await expect(page.getByTestId('appearance-skin-jade')).toBeFocused(); await expect(page.locator('html')).toHaveAttribute('data-skin', 'jade');
  await page.keyboard.press('Escape'); await expect(page.getByTestId('appearance-panel')).not.toBeVisible(); await expect(page.getByTestId('appearance-open')).toBeFocused();
  await page.reload(); await expect(page.locator('html')).toHaveAttribute('data-skin', 'jade'); await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const peer = await context.newPage(); await peer.goto('/?mode=viewer'); await choose(peer, 'dark', 'copper'); await close(peer);
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'copper'); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('register.appearance')!)); expect(stored).toEqual({ version: 1, mode: 'dark', skin: 'copper' });
  await page.setViewportSize({ width: 800, height: 600 }); await page.getByTestId('appearance-open').click();
  await page.getByTestId('appearance-panel').evaluate(dialog => { dialog.scrollTop = dialog.scrollHeight; });
  await expect(page.getByTestId('appearance-current')).toBeInViewport(); await page.screenshot({ path: `${qa}/register-appearance-narrow.png` });
  await page.keyboard.press('Escape'); await peer.close();
  await evidence({ legacy_theme_migrated: true, saved_appearance_restored: true, system_mode_changes_live: true, keyboard_radio_and_focus_return: true, cross_tab_appearance_sync: true, narrow_dialog_footer_reachable: true });
});

test('workspace branding and all EDA setting panels use the shared light skin without mutating the project', async ({ page }) => {
  test.setTimeout(180000); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/eda'); await expect(page.getByTestId('app-ready')).toBeVisible();
  const revision = await page.getByTestId('current-revision').innerText(), shapes = await page.getByTestId('scene-loaded-count').getAttribute('data-count');
  await choose(page, 'light', 'jade'); await close(page);
  await expect(page.locator('.register-brand').getByTestId('register-logo')).toBeVisible();
  const panels = [];
  for (const id of ['open-integrated-tools', 'open-interchange', 'open-native-database', 'open-design-review', 'open-commercial-backend', 'open-pdk-setup']) {
    await clickWorkbenchAction(page, id); const modal = page.getByRole('dialog'); await expect(modal).toBeVisible();
    const styles = await modal.evaluate(element => ({ background: getComputedStyle(element).backgroundColor, foreground: getComputedStyle(element).color }));
    expect(styles.background).toBe('rgb(248, 252, 249)'); expect(styles.foreground).toBe('rgb(38, 54, 73)');
    const primaryActions = await modal.locator('button.primary').evaluateAll(buttons => buttons.map(button => {
      const luminance = (color: string) => { const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4); return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2]; };
      const style = getComputedStyle(button), a = luminance(style.color), b = luminance(style.backgroundColor);
      return { name: button.textContent!.trim(), contrast: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
    }));
    primaryActions.forEach(action => expect(action.contrast).toBeGreaterThanOrEqual(4.5));
    if (id === 'open-integrated-tools') { await page.getByTestId('integrated-tab-routing').click(); await page.getByTestId('integrated-tab-design').click(); }
    if (id === 'open-interchange') await page.getByTestId('interchange-tab-native').click();
    if (id === 'open-pdk-setup') await page.screenshot({ path: `${qa}/register-workspace-jade-light.png` });
    panels.push({ id, ...styles, primary_actions: primaryActions }); await modal.getByRole('button', { name: '닫기', exact: true }).click();
  }
  await expect(page.getByTestId('current-revision')).toHaveText(revision); await expect(page.getByTestId('scene-loaded-count')).toHaveAttribute('data-count', shapes!);
  expect(panels.flatMap(panel => panel.primary_actions).length).toBeGreaterThan(0);
  expect(errors).toEqual([]); await evidence({ workspace_panels: panels, primary_actions_readable: true, workspace_project_revision_preserved: true, workspace_geometry_count_preserved: true, browser_errors: errors });
});
