import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startHub } from '../platform/cloud/hub.mjs';
import { runtimeConfig, workerRpc } from '../scripts/runtime.mjs';

test('shared backend setup executes actual open source calibration with role and artifact isolation', { timeout: 150000 }, async t => {
  const config = await runtimeConfig();
  const manifest = JSON.parse(await fs.readFile('adapters/commercial/calibration-ngspice.manifest.json', 'utf8'));
  const registration = await workerRpc(config, 'backend.register', { manifest });
  assert.equal(registration.ok, true, JSON.stringify(registration.error));
  const profile = registration.result;
  assert.equal(profile.available, true);
  const hub = await startHub({ port: 0, stateDirectory: path.resolve('.runtime/backend-cloud-tests', crypto.randomUUID()) });
  t.after(() => hub.close());
  const endpoint = `http://127.0.0.1:${hub.port}`, users = {}, checks = [];
  const call = async (method, params = {}, identity = 'owner') => {
    const response = await fetch(`${endpoint}/rpc`, { method: 'POST', headers: {
      'Content-Type': 'application/json', ...(users[identity] ? { Authorization: `Bearer ${users[identity].token}` } : {})
    }, body: JSON.stringify({ method, params }) });
    const data = await response.json();
    if (!data.ok) throw Object.assign(new Error(data.error.message), data.error);
    return data.result;
  };
  for (const identity of ['owner', 'editor', 'viewer']) users[identity] = await call('cloud.auth.signUp', {
    email: `${identity}-${crypto.randomUUID()}@test.invalid`, name: identity, password: crypto.randomBytes(24).toString('base64url')
  }, identity);
  let shared = await call('cloud.create', { name: 'Backend calibration collaboration', example: 'mosfet' });
  const roomId = shared.room.id;
  for (const role of ['editor', 'viewer']) {
    const invite = await call('cloud.invite', { room_id: roomId, role });
    await call('cloud.join', { token: invite.token }, role);
  }
  const native = (method, params = {}, identity = 'editor', base = shared.project.revision, commandId = crypto.randomUUID()) => call('cloud.native', {
    room_id: roomId, method, params: { ...params, project_id: shared.project.id }, base_revision: base, command_id: commandId
  }, identity);
  await t.test('shared catalogue and validation expose safe metadata only', async () => {
    const catalog = await native('backend.catalog', {}, 'viewer');
    assert(catalog.tools.some(tool => tool.id === 'virtuoso'));
    assert(catalog.tools.some(tool => tool.id === 'custom_compiler'));
    const listed = await native('backend.list_profiles', {}, 'viewer');
    const publicProfile = listed.find(item => item.id === manifest.id);
    assert(publicProfile);
    for (const key of ['executable', 'resources', 'token_file', 'url', 'recipes']) assert(!JSON.stringify(publicProfile).includes(`"${key}":`));
    const validation = await native('backend.validate', { profile_id: manifest.id }, 'viewer');
    assert.equal(validation.valid, true);
    await assert.rejects(native('backend.validate', { profile_id: manifest.id, manifest: {} }, 'viewer'), { code: 'REMOTE_BACKEND' });
    await assert.rejects(native('backend.register', { manifest }, 'owner'), { code: 'UNSUPPORTED_METHOD' });
    checks.push('shared safe catalogue; private operator registration and validation parameter gates');
  });
  const settings = { profile_id: manifest.id, profile_hash: profile.fingerprint, operation: 'simulation', top_cell: shared.project.cell, parameters: {} };
  await t.test('viewer cannot configure, run, or import native artifacts', async () => {
    for (const [method, params] of [['backend.configure', { settings }], ['backend.run', {}], ['backend.import_layout', { run_id: 'unavailable', key: 'exchange' }]]) {
      await assert.rejects(native(method, params, 'viewer'), { code: 'READ_ONLY' });
    }
    checks.push('viewer mutation and job submission denied');
  });
  await t.test('setup persists once and stale shared forms conflict', async () => {
    const base = shared.project.revision, commandId = crypto.randomUUID();
    const configured = await native('backend.configure', { settings }, 'editor', base, commandId);
    assert.equal(configured.revision, base + 1);
    assert.equal(configured.active_backend, 'commercial');
    assert.equal(configured.backend_setup.profile_id, manifest.id);
    const replay = await native('backend.configure', { settings }, 'editor', base, commandId);
    assert.equal(replay.revision, configured.revision);
    await assert.rejects(native('backend.configure', { settings }, 'owner', base), { code: 'EDIT_CONFLICT' });
    shared = await call('cloud.open', { id: roomId });
    await assert.rejects(native('backend.run', { expected_revision: base }), { code: 'EDIT_CONFLICT' });
    const exported = await native('project.export_bundle', {}, 'viewer');
    // Public bundle metadata may name the selected profile, but never contains private recipes or credentials.
    assert(!JSON.stringify(exported).includes('token_file'));
    checks.push('persisted backend setup; exactly once receipt; stale form/run conflict');
  });
  let completed;
  await t.test('actual ngspice bridge currents and artifacts stay in the authorized room', async () => {
    const commandId = crypto.randomUUID(), started = await native('backend.run', {}, 'editor', undefined, commandId);
    const replay = await native('backend.run', {}, 'editor', undefined, commandId);
    assert.equal(replay.id, started.id);
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      completed = await native('job.status', { run_id: started.id }, 'viewer');
      if (!['queued', 'running'].includes(completed.execution_status)) break;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    assert.equal(completed.execution_status, 'completed', JSON.stringify(completed));
    assert.equal(completed.analysis_result, 'pass', completed.message);
    assert.equal(completed.current_flow.source, 'ngspice');
    assert(completed.current_flow.branches.every(branch => branch.mapping === 'unmapped'));
    assert(completed.current_flow.branches.some(branch => branch.values_A.some(value => Math.abs(Math.abs(value) - 0.001) < 1e-10)));
    assert.notEqual(completed.current_flow.geometry_linkage, 'verified');
    const artifact = await native('backend.read_artifact', { run_id: started.id, key: 'currents' }, 'viewer');
    assert(Buffer.from(artifact.base64, 'base64').length > 0);
    const other = await call('cloud.create', { name: 'Other backend room', example: 'mosfet' });
    for (const method of ['job.status', 'backend.read_artifact', 'backend.import_layout']) {
      await assert.rejects(call('cloud.native', { room_id: other.room.id, method, params: { run_id: started.id, key: 'currents', project_id: other.project.id }, base_revision: other.project.revision, command_id: crypto.randomUUID() }), { code: 'FORBIDDEN' });
    }
    checks.push('actual open source 1mA calibration; run receipt; member output; cross-room output/import denial');
  });
  await fs.mkdir('docs/evidence', { recursive: true });
  await fs.writeFile('docs/evidence/commercial-cloud.json', JSON.stringify({ checked_at: new Date().toISOString(), checks,
    project_id: shared.project.id, revision: shared.project.revision, run_id: completed.id,
    actual_current_source: completed.current_flow.source, actual_engine: 'ngspice public resistor calibration',
    vendor_execution_verified: false, geometry_linkage: completed.current_flow.geometry_linkage ?? 'unverified', public_hosting: 'not_provisioned' }, null, 2));
});
