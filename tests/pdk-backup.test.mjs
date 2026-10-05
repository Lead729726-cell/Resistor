import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('PDK recovery backup preserves registry and explicitly selected managed model files', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'register-pdk-backup-'));
  const eda = path.join(workspace, '.runtime/eda');
  const packageRoot = path.join(eda, 'pdks/package-example');
  await fs.mkdir(packageRoot, { recursive: true });
  const model = '* backup fixture data, not an analysis result\n.model ntest NMOS level=1 vto=0.4 kp=0.0001\n';
  await fs.writeFile(path.join(packageRoot, 'models.spice'), model);
  const nativeResources = path.join(eda, 'runs/native-job/resources');
  await fs.mkdir(nativeResources, { recursive: true });
  await fs.writeFile(path.join(nativeResources, 'operator-model.scs'), 'private resource snapshot fixture');
  await fs.writeFile(path.join(eda, 'runs/native-job/stdout.log'), 'public redacted output fixture');
  await fs.mkdir(path.join(eda, 'runs/configured-job/models'), { recursive: true });
  await fs.writeFile(path.join(eda, 'runs/configured-job/models/model.spice'), model);
  const db = new DatabaseSync(path.join(eda, 'projects.sqlite3'));
  db.exec('CREATE TABLE pdk_profiles(id TEXT PRIMARY KEY,data TEXT NOT NULL)');
  db.prepare('INSERT INTO pdk_profiles VALUES(?,?)').run('fixture', JSON.stringify({ manifest: { root: packageRoot, model_file: 'models.spice' } }));
  db.close();
  const run = args => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.resolve('scripts/cloud-backup.mjs'), ...args], {
      env: { ...process.env, MOS_WORKSPACE: workspace }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = ''; child.stdout.on('data', bytes => output += bytes); child.stderr.on('data', bytes => output += bytes);
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve(output) : reject(new Error(output)));
  });
  await run([]);
  const directory = path.join(workspace, '.runtime/backups');
  const first = (await fs.readdir(directory))[0];
  const firstRoot = path.join(directory, first);
  const metadata = JSON.parse(await fs.readFile(path.join(firstRoot, 'manifest.json'), 'utf8'));
  assert.equal(metadata.managed_pdk_resources_included, false);
  assert.equal(metadata.backend_resource_snapshots_included, false);
  await assert.rejects(fs.access(path.join(firstRoot, 'eda/runs/native-job/resources')), { code: 'ENOENT' });
  await assert.rejects(fs.access(path.join(firstRoot, 'eda/runs/configured-job/models')), { code: 'ENOENT' });
  assert.equal(await fs.readFile(path.join(firstRoot, 'eda/runs/native-job/stdout.log'), 'utf8'), 'public redacted output fixture');
  await assert.rejects(fs.access(path.join(firstRoot, 'eda/pdks')), { code: 'ENOENT' });
  const restoredRegistry = new DatabaseSync(path.join(firstRoot, 'eda/projects.sqlite3'), { readOnly: true });
  assert.equal(restoredRegistry.prepare('SELECT count(*) AS n FROM pdk_profiles').get().n, 1);
  assert.equal(restoredRegistry.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  restoredRegistry.close();
  await run(['--include-managed-pdks', '--include-backend-resources']);
  const second = (await fs.readdir(directory)).find(name => name !== first);
  assert(second);
  const secondRoot = path.join(directory, second);
  const complete = JSON.parse(await fs.readFile(path.join(secondRoot, 'manifest.json'), 'utf8'));
  assert.equal(complete.managed_pdk_resources_included, true);
  assert.equal(complete.backend_resource_snapshots_included, true);
  assert.equal(await fs.readFile(path.join(secondRoot, 'eda/runs/native-job/resources/operator-model.scs'), 'utf8'), 'private resource snapshot fixture');
  assert.equal(await fs.readFile(path.join(secondRoot, 'eda/runs/configured-job/models/model.spice'), 'utf8'), model);
  assert.equal(complete.managed_pdk_resources.length, 1);
  const resource = complete.managed_pdk_resources[0];
  const bytes = await fs.readFile(path.join(secondRoot, resource.path));
  assert.equal(bytes.toString(), model);
  assert.equal(resource.sha256, crypto.createHash('sha256').update(bytes).digest('hex'));
  await fs.mkdir('docs/evidence', { recursive: true });
  await fs.writeFile('docs/evidence/pdk-backup.json', JSON.stringify({ checked_at: new Date().toISOString(),
    database_integrity: 'ok', registry_preserved: true, models_excluded_by_default: true,
    managed_models_explicitly_included_and_hash_verified: true,
    backend_resources_excluded_by_default: true, backend_resources_explicitly_included: true }, null, 2));
});
