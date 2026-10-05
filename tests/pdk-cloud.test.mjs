import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startHub } from '../platform/cloud/hub.mjs';

test('configured PDK analysis keeps shared roles, revision conflicts, receipts and run isolation', { timeout: 180000 }, async t => {
  const hub = await startHub({ port: 0, stateDirectory: path.resolve('.runtime/pdk-cloud-tests', crypto.randomUUID()) });
  t.after(() => hub.close());
  const endpoint = `http://127.0.0.1:${hub.port}`;
  const users = {};
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
  let shared = await call('cloud.create', { name: 'PDK configured shared MOS', example: 'mosfet' });
  const roomId = shared.room.id;
  for (const role of ['editor', 'viewer']) {
    const invite = await call('cloud.invite', { room_id: roomId, role });
    await call('cloud.join', { token: invite.token }, role);
  }
  const native = (method, params = {}, identity = 'editor', base = shared.project.revision, commandId = crypto.randomUUID()) => call('cloud.native', {
    room_id: roomId, method, params: { ...params, project_id: shared.project.id }, base_revision: base, command_id: commandId
  }, identity);
  const checks = [];
  await t.test('shared viewers can inspect installed profiles but cannot submit installation paths', async () => {
    const profiles = await native('pdk.list_profiles', {}, 'viewer');
    assert(profiles.some(profile => profile.id === 'sky130A'));
    const validated = await native('pdk.validate', { profile_id: 'sky130A' }, 'viewer');
    assert.equal(validated.valid, true);
    await assert.rejects(native('pdk.validate', { manifest: { root: '/workspace/.runtime/worker.json' } }, 'viewer'), { code: 'REMOTE_PDK' });
    await assert.rejects(native('pdk.register', { manifest: {} }, 'owner'), { code: 'UNSUPPORTED_METHOD' });
    checks.push('installed-profile inspection and operator-only PDK registration');
  });
  const inspection = await native('analysis.inspect', { profile_id: 'sky130A' }, 'viewer');
  assert(inspection.ports.includes('D') && inspection.ports.includes('S') && inspection.ports.includes('G'));
  const settings = {
    profile_id: 'sky130A', top_cell: inspection.top_cell, corner: 'tt', temperature_C: 27, analysis: 'op', pex: false,
    ports: inspection.ports.map(name => ({ name, mode: name === 'S' ? 'ground' : 'voltage', dc_V: name === 'D' ? 1.8 : name === 'G' ? 0.9 : 0 }))
  };
  await t.test('viewer configure/run/verify are rejected before native execution', async () => {
    for (const [method, params] of [['analysis.configure', { settings }], ['analysis.run', {}], ['analysis.verify', { kind: 'drc' }]]) {
      await assert.rejects(native(method, params, 'viewer'), { code: 'READ_ONLY' });
    }
    checks.push('read-only analysis role gates');
  });
  await t.test('configured revision is persisted and command retry is exactly once', async () => {
    const base = shared.project.revision, commandId = crypto.randomUUID();
    const configured = await native('analysis.configure', { settings }, 'editor', base, commandId);
    assert.equal(configured.revision, base + 1);
    assert.equal(configured.analysis_setup.profile_id, 'sky130A');
    const replay = await native('analysis.configure', { settings }, 'editor', base, commandId);
    assert.equal(replay.revision, configured.revision);
    await assert.rejects(native('analysis.configure', { settings: { ...settings, temperature_C: 28 } }, 'owner', base), { code: 'EDIT_CONFLICT' });
    shared = await call('cloud.open', { id: roomId });
    assert.equal(shared.project.analysis_setup.ports.length, inspection.ports.length);
    await assert.rejects(native('analysis.run', { expected_revision: base }, 'editor'), { code: 'EDIT_CONFLICT' });
    checks.push('persisted setup, one-time receipt and stale setup conflict');
  });
  let completed;
  await t.test('actual configured ngspice currents are readable by project members only', async () => {
    const started = await native('analysis.run');
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      completed = await native('job.status', { run_id: started.id }, 'viewer');
      if (!['queued', 'running'].includes(completed.execution_status)) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.equal(completed.execution_status, 'completed', JSON.stringify(completed));
    assert.equal(completed.analysis_result, 'pass', completed.message);
    assert.equal(completed.current_flow.source, 'ngspice');
    assert(completed.current_flow.branches.some(branch => branch.values_A.some(value => Math.abs(value) > 1e-6)));
    assert(completed.current_flow.branches.every(branch => branch.mapping === 'unmapped'));
    const other = await call('cloud.create', { name: 'other PDK room', example: 'mosfet' });
    await assert.rejects(call('cloud.native', { room_id: other.room.id, method: 'job.status', params: { run_id: started.id } }), { code: 'FORBIDDEN' });
    const artifactKey = Object.keys(completed.artifacts).find(key => /netlist|current/.test(key));
    assert(artifactKey);
    const query = new URLSearchParams({ room_id: roomId, run_id: started.id, key: artifactKey });
    const artifact = await fetch(`${endpoint}/artifact?${query}`, { headers: { Authorization: `Bearer ${users.viewer.token}` } });
    assert.equal(artifact.status, 200);
    assert((await artifact.arrayBuffer()).byteLength > 0);
    checks.push('actual extracted circuit current, member artifact and cross-room denial');
  });
  await fs.mkdir('docs/evidence', { recursive: true });
  await fs.writeFile('docs/evidence/pdk-cloud.json', JSON.stringify({ checked_at: new Date().toISOString(), checks,
    project_id: shared.project.id, revision: shared.project.revision, run_id: completed.id,
    actual_current_source: completed.current_flow.source, public_hosting: 'not_provisioned' }, null, 2));
});
