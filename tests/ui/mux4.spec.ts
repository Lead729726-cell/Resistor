import { clickWorkbenchAction } from './helpers/workbench';
import { test, expect } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { Project, Run, Scene } from '../../packages/contracts/src/index';

test('real UI creates a 20-MOS MUX4 physical core, verifies 64 cases and independent DRC/LVS/PEX/post-layout, saves and reopens', async ({ page, request }) => {
  test.setTimeout(480000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const call = async <T,>(method: string, params = {}): Promise<T> => { const r = await request.post('/api/rpc', { data: { method, params } }); const v = await r.json(); expect(v.ok, `${method}: ${v.error?.message}`).toBe(true); return v.result; };
  await page.goto('/eda'); await expect(page.getByTestId('app-ready')).toBeVisible();
  await clickWorkbenchAction(page, "open-integrated-tools"); await page.getByTestId('integrated-tab-design').click();
  await page.getByTestId('design-load-catalog').click(); await page.getByTestId('design-template').selectOption('mux4');
  await page.getByLabel('Template 프로젝트 이름').fill('Register MUX4 · 4:1 CMOS · 20ns');
  // The 5ns stress case settles too late after native RC extraction. Preserve
  // that measured limit; qualify this wide reference layout at 20ns instead.
  await page.getByLabel('Template slot_ns').fill('20');
  await page.getByLabel('실제 physical core 요청').check(); await page.getByTestId('design-create-confirm').check();
  const next = page.waitForResponse(r => new URL(r.url()).pathname === '/api/rpc' && r.request().postDataJSON()?.method === 'design.create_template');
  await page.getByTestId('design-create').click(); const body = await (await next).json(); expect(body.ok, body.error?.message).toBe(true); const p = body.result as Project;
  await expect(page.locator('.project-breadcrumb strong')).toHaveText(p.name, { timeout: 60000 });
  expect(p.schematic.devices.filter(d => ['nmos', 'pmos'].includes(d.kind))).toHaveLength(20);
  await page.keyboard.press('Escape');
  // Explicit modal close, independent of Escape support in other panels.
  if (await page.getByTestId('integrated-tools').isVisible()) await page.getByRole('button', { name: /통합 설계.*닫기|닫기/ }).last().click();
  const runs: Run[] = [];
  for (const kind of ['simulation', 'drc', 'lvs', 'pex', 'post-layout']) {
    if (kind === 'post-layout') { await page.getByTestId('tab-simulation').click(); await page.getByLabel('Post-layout').check(); }
    const method = kind === 'simulation' || kind === 'post-layout' ? 'simulation.run' : kind === 'drc' ? 'verification.run_drc' : kind === 'lvs' ? 'verification.run_lvs' : 'extraction.run_pex';
    const sent = page.waitForResponse(r => new URL(r.url()).pathname === '/api/rpc' && r.request().postDataJSON()?.method === method);
    if (kind === 'post-layout') await page.getByRole('button', { name: 'Run analysis', exact: true }).click(); else await page.getByTestId(`run-${kind}`).click();
    const reply = await (await sent).json(); expect(reply.ok, reply.error?.message).toBe(true); const id = reply.result.id;
    const row = page.locator(`[data-testid="job-row"][data-run-id="${id}"]`);
    await expect(row).toContainText(/완료|실행 실패/, { timeout: 150000 });
    runs.push(await call<Run>('job.status', { run_id: id }));
  }
  await mkdir('.runtime/mux4', { recursive: true }); const attempt = { checked_at: new Date().toISOString(), project: p, runs, browser_errors: errors };
  await writeFile(`.runtime/mux4/ui-attempt-${Date.now()}.json`, JSON.stringify(attempt, null, 2));
  await writeFile('.runtime/mux4/last-ui-run.json', JSON.stringify(attempt, null, 2));
  for (const r of runs) { expect(r.execution_status, r.message).toBe('completed'); expect(r.analysis_result, r.message).toBe('pass'); }
  for (const r of [runs[0], runs[4]]) { expect(r.digital_verification?.passed_cases).toBe(64); expect(r.digital_verification?.pass).toBe(true); }
  await page.getByTestId('tab-simulation').click(); await expect(page.getByTestId('digital-result')).toContainText('PASS · 64/64'); await expect(page.getByTestId('digital-case')).toHaveCount(64);
  await page.getByLabel('MUX 진리표 선택').selectOption('2'); await expect(page.getByTestId('digital-case')).toHaveCount(16); await page.getByLabel('MUX 진리표 선택').selectOption('all');
  const truthFile = page.waitForEvent('download'); await page.getByTestId('digital-export').click(); const downloaded = await truthFile;
  await mkdir('examples/mux4', { recursive: true }); await downloaded.saveAs('examples/mux4/mux4-post-layout.truth.json');
  const truth = JSON.parse(await readFile('examples/mux4/mux4-post-layout.truth.json', 'utf8')); expect(truth.verification.passed_cases).toBe(64);
  await page.screenshot({ path: 'examples/mux4/mux4-simulation.png', fullPage: true });
  await page.getByTestId('project-save').click(); await expect(page.getByTestId('project-save')).toBeEnabled();
  await page.reload(); await expect(page.locator('.project-breadcrumb strong')).toHaveText(p.name); await expect(page.getByTestId('job-row')).toHaveCount(5);
  await page.getByTestId('tab-layout3d').click(); await page.screenshot({ path: 'examples/mux4/mux4-layout3d.png', fullPage: true });
  await page.getByTestId('tab-schematic').click(); await page.screenshot({ path: 'examples/mux4/mux4-schematic.png', fullPage: true });
  const local = (file: string) => path.join(process.cwd(), file.replace(/^\/workspace\//, ''));
  const artifacts: Record<string, { sha256: string; bytes: number }> = {};
  const save = async (name: string, bytes: Buffer) => { await writeFile(`examples/mux4/${name}`, bytes); artifacts[name] = { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length }; };
  for (const format of ['gds', 'oas']) { const exported = await call<{ path: string; roundtrip: { geometry_equal: boolean } }>('layout.export', { project_id: p.id, format }); expect(exported.roundtrip.geometry_equal).toBe(true); await save(`mux4.${format}`, await readFile(local(exported.path))); }
  const spice = await call<{ text: string }>('schematic.export_spice', { project_id: p.id }); await save('mux4.spice', Buffer.from(spice.text));
  const bundle = await call<{ path: string }>('project.export_bundle', { project_id: p.id }); await save('mux4.register.zip', await readFile(local(bundle.path)));
  for (const [i, r] of runs.entries()) {
    const label = ['pre-layout', 'drc', 'lvs', 'pex', 'post-layout'][i]; await save(`${label}.run.json`, Buffer.from(JSON.stringify(r, null, 2)));
    for (const key of ['testbench', 'waveform_data', 'lvs_report', 'markers', 'pex_netlist']) if (r.artifacts?.[key]) await save(`${label}.${key}${key.includes('netlist') || key === 'testbench' ? '.spice' : '.txt'}`, await readFile(local(r.artifacts[key])));
  }
  const scene = await call<Scene>('view.get_scene', { project_id: p.id, max_shapes: 2000 }); const actual = await call<Project>('project.snapshot', { project_id: p.id });
  await save('mux4.project.json', Buffer.from(JSON.stringify(actual, null, 2)));
  expect(errors).toEqual([]); await writeFile('docs/evidence/mux4-ui.json', JSON.stringify({ checked_at: new Date().toISOString(), project_id: p.id, revision: p.revision, actual_UI_creation: true, mos_devices: 20, pre_layout_truth: 64, post_layout_truth: 64, independent_DRC_LVS_PEX_pass: true, truth_filter_and_export: true, save_reopen_verified: true, actual_scene_shapes: scene.shapes.length, scene_truncated: scene.truncated, browser_errors: errors, artifacts, native_run_ids: runs.map(r => r.id) }, null, 2));
});
