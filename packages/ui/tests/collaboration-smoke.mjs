import { chromium } from 'playwright';
import { mkdir, writeFile, stat, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

await mkdir('packages/ui/qa', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-webgl'] });
const owner = await browser.newPage({ viewport: { width: 1600, height: 1050 } }), editor = await browser.newPage({ viewport: { width: 1600, height: 1050 } });
const errors = []; for (const page of [owner, editor]) { page.on('pageerror', error => errors.push(error.message)); await page.routeWebSocket(/ws:\/\/127\.0\.0\.1:5173/, socket => socket.close()); }
const stamp = Date.now(), password = crypto.randomUUID() + crypto.randomUUID();
const register = async (page, name, suffix) => {
  await page.goto('http://127.0.0.1:5173'); await page.getByTestId('app-ready').waitFor({ timeout: 90000 }); await page.getByTestId('open-collaboration').click();
  await page.getByRole('button', { name: '가입', exact: true }).click(); await page.getByLabel('표시 이름', { exact: true }).fill(name); await page.getByTestId('cloud-email').fill(`ui-${suffix}-${stamp}@register.local`); await page.getByTestId('cloud-password').fill(password); await page.getByTestId('cloud-auth-submit').click();
  await page.getByText('SIGNED IN', { exact: true }).waitFor({ timeout: 45000 });
};
const closeModal = page => page.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }).click();
try {
  await register(owner, `UI Owner ${stamp}`, 'owner');
  await owner.getByTestId('cloud-publish-project').click(); await owner.locator('.collaboration-room').waitFor({ timeout: 90000 }); await owner.locator('[data-cloud-project-ready=true]').waitFor({ timeout: 90000 });
  await owner.getByTestId('cloud-create-invite').click(); await owner.locator('.invite-result code').waitFor(); const invite = await owner.locator('.invite-result code').innerText();
  await register(editor, `UI Editor ${stamp}`, 'editor'); await editor.getByTestId('cloud-invite-token').fill(invite); await editor.getByTestId('cloud-join-project').click(); await editor.locator('.collaboration-room').waitFor({ timeout: 90000 }); await editor.locator('[data-cloud-project-ready=true]').waitFor({ timeout: 90000 });
  await owner.getByRole('button', { name: '새로고침', exact: true }).click();
  await owner.getByText(`UI Editor ${stamp}`, { exact: true }).waitFor({ timeout: 30000 });
  await owner.locator('.collaboration-members').getByText('접속 중', { exact: true }).first().waitFor({ timeout: 30000 });
  await owner.screenshot({ path: 'packages/ui/qa/register-collaboration.png', mask: [owner.locator('.invite-result')] });
  await closeModal(owner); await closeModal(editor);
  for (const page of [owner, editor]) await page.locator('.instance-item').filter({ hasText: 'MN1' }).click();
  const originalRevision = Number(await owner.getByTestId('current-revision').getAttribute('data-revision'));
  // Keep an unsaved peer draft while the authoritative revision changes.
  await editor.getByLabel('MN1 w_um').fill('1.4'); await owner.getByLabel('MN1 w_um').fill('1.2'); await owner.getByRole('button', { name: '변경 적용 / Apply' }).click();
  await editor.waitForFunction(revision => Number(document.querySelector('[data-testid=current-revision]')?.getAttribute('data-revision')) > revision, originalRevision, { timeout: 45000 });
  assert.equal(await editor.getByLabel('MN1 w_um').inputValue(), '1.4', 'remote update must not overwrite dirty draft');
  await editor.getByRole('button', { name: '서버 값으로 되돌리기', exact: true }).click(); await editor.waitForFunction(() => document.querySelector('input[aria-label="MN1 w_um"]')?.value === '1.2');
  const synchronizedRevision = Number(await editor.getByTestId('current-revision').getAttribute('data-revision'));
  const gdsDownload = owner.waitForEvent('download'); await owner.getByRole('button', { name: 'GDSII', exact: true }).click(); const gds = await gdsDownload; const gdsPath = 'packages/ui/qa/shared-layout.gds'; await gds.saveAs(gdsPath); assert.ok((await stat(gdsPath)).size > 100); await owner.locator('.artifact-json').waitFor(); await closeModal(owner);
  const bundleDownload = owner.waitForEvent('download'); await owner.getByRole('button', { name: '공유 프로젝트 bundle 받기', exact: true }).click(); const bundle = await bundleDownload; await bundle.saveAs('packages/ui/qa/shared-project.bundle'); assert.ok((await stat('packages/ui/qa/shared-project.bundle')).size > 100);
  await owner.getByRole('button', { name: '파일 가져오기 / Import layout', exact: true }).click(); await owner.getByTestId('layout-import-file').setInputFiles(gdsPath); await owner.getByRole('button', { name: '파일 업로드 / Import', exact: true }).click(); await owner.getByRole('dialog').waitFor({ state: 'detached', timeout: 45000 });
  await owner.locator('[data-cloud-project-ready=true]').waitFor();
  const importRevision = Number(await owner.getByTestId('current-revision').getAttribute('data-revision'));
  await editor.waitForFunction(revision => Number(document.querySelector('[data-testid=current-revision]')?.getAttribute('data-revision')) === revision, importRevision, { timeout: 45000 });
  for (const page of [owner, editor]) await page.locator('.instance-item').filter({ hasText: 'MN1' }).click();
  // Delay a real edit in transit while another authenticated user commits first.
  let releaseEdit, intercepted = false; const editGate = new Promise(resolve => { releaseEdit = resolve; });
  await editor.route('http://127.0.0.1:18766/rpc', async route => { const body = route.request().postDataJSON(); if (!intercepted && body.method === 'cloud.native' && body.params.method === 'schematic.apply_command') { intercepted = true; await editGate; } await route.continue(); });
  await editor.getByLabel('MN1 w_um').fill('1.4'); await editor.getByRole('button', { name: '변경 적용 / Apply' }).click();
  for (let attempt = 0; attempt < 100 && !intercepted; attempt++) await editor.waitForTimeout(50); assert.ok(intercepted, 'the conflicting actual edit must be in flight');
  await owner.getByLabel('MN1 w_um').fill('1.3'); await owner.getByRole('button', { name: '변경 적용 / Apply' }).click(); await owner.waitForFunction(revision => Number(document.querySelector('[data-testid=current-revision]')?.getAttribute('data-revision')) > revision, importRevision); releaseEdit();
  await editor.locator('.error-banner').waitFor({ timeout: 45000 }); await editor.unroute('http://127.0.0.1:18766/rpc');
  await editor.getByTestId('open-collaboration').click(); await editor.locator('.sync-detail.conflict').waitFor(); await editor.getByTestId('cloud-resync').click(); await editor.getByTestId('download-preserved-edits').waitFor({ timeout: 45000 });
  const preservedDownload = editor.waitForEvent('download'); await editor.getByTestId('download-preserved-edits').click(); const preserved = await preservedDownload; await preserved.saveAs('packages/ui/qa/preserved-edits.json'); const preservedRecord = JSON.parse(await readFile('packages/ui/qa/preserved-edits.json', 'utf8')); assert.equal(preservedRecord.commands.length, 1); assert.equal(preservedRecord.commands[0].params.command.parameters.w_um, 1.4);
  await closeModal(editor); assert.equal(await editor.getByLabel('MN1 w_um').inputValue(), '1.4'); const conflictSnapshot = await editor.evaluate(async () => { const { rpc } = await import('/packages/contracts/src/index.ts'); return rpc('project.snapshot', { project_id: document.querySelector('.app-shell').dataset.projectId }); }); assert.equal(conflictSnapshot.schematic.devices.find(device => device.id === 'mn1').parameters.w_um, 1.3, 'resync must never replay the conflicting edit'); await editor.getByRole('button', { name: '서버 값으로 되돌리기', exact: true }).click(); await editor.waitForFunction(() => document.querySelector('input[aria-label="MN1 w_um"]')?.value === '1.3');
  await owner.getByTestId('open-collaboration').click(); await owner.getByLabel(`UI Editor ${stamp} 권한`).selectOption('viewer'); await editor.getByTestId('run-simulation').waitFor({ state: 'visible' });
  await editor.waitForFunction(() => /·\s*viewer\s*·/.test(document.querySelector('.status-bar')?.textContent || '') && document.querySelector('input[aria-label="MN1 w_um"]')?.disabled === true, null, { timeout: 15000 }); assert.equal(await editor.getByLabel('MN1 w_um').isDisabled(), true); assert.ok((await editor.getByTestId('run-simulation').getAttribute('title')).includes('Viewer'));
  await owner.getByLabel(`UI Editor ${stamp} 권한`).selectOption('editor'); await editor.waitForFunction(() => /·\s*editor\s*·/.test(document.querySelector('.status-bar')?.textContent || '') && document.querySelector('input[aria-label="MN1 w_um"]')?.disabled === false, null, { timeout: 15000 }); await closeModal(owner);
  await editor.getByTestId('open-collaboration').click(); await editor.getByRole('button', { name: '공유방 나가기', exact: true }).click();
  await editor.locator('.collaboration-room').waitFor({ state: 'detached' }); await closeModal(editor);
  assert.deepEqual(errors, []);
  const evidence = { mode: 'actual-local-hub', two_independent_authenticated_clients: true, owner_editor_invite_join: true, presence_verified: true, remote_parameter_edit: { parameter: 'MN1.w_um', value: 1.2, original_revision: originalRevision, synchronized_revision: synchronizedRevision }, dirty_peer_draft_preserved: true, explicit_reset_restored_authoritative_value: true, revision_conflict_preserved_without_replay: true, conflicting_command_downloaded: true, viewer_role_disabled_native_edits_and_runs: true, editor_role_restored: true, leaving_room_restored_local_project: true, actual_gds_download_bytes: (await stat(gdsPath)).size, actual_bundle_download_bytes: (await stat('packages/ui/qa/shared-project.bundle')).size, uploaded_gds_import_verified: true, browser_errors: errors };
  await writeFile('packages/ui/qa/collaboration-evidence.json', JSON.stringify(evidence, null, 2)); process.stdout.write(JSON.stringify(evidence));
} catch (cause) { process.stderr.write(JSON.stringify({ original_failure: cause.message, browser_errors: errors })); await owner.screenshot({ path: 'packages/ui/qa/collaboration-failure.png', mask: [owner.locator('.invite-result'), owner.getByTestId('cloud-password')] }); await editor.screenshot({ path: 'packages/ui/qa/collaboration-editor-failure.png', mask: [editor.locator('.invite-result'), editor.getByTestId('cloud-password')] }); process.stderr.write(JSON.stringify({owner_error: await owner.locator('.inline-error').allTextContents(), editor_error: await editor.locator('.inline-error').allTextContents(), global_errors: await owner.locator('.error-banner').allTextContents(), editor_inspector: await editor.locator('.inspector-sidebar').allTextContents(), editor_devices: await editor.locator('.instance-item').allTextContents(), editor_selected: await editor.locator('.instance-item.selected').allTextContents(), editor_tab: await editor.locator('.workspace-tabs .active').allTextContents()})); throw cause; } finally { await browser.close(); }
