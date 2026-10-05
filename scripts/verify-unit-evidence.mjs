import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const version = JSON.parse(await readFile('package.json', 'utf8')).version;
const evidence = { checked_at: new Date().toISOString(), version, source_sha256: {} };
for (const [suite, args] of Object.entries({
  contracts: ['--test', '--test-isolation=none', 'tests/contracts.test.mjs'],
  viewer: ['--import', 'tsx', '--test', '--test-isolation=none', 'packages/viewer/tests/*.test.ts'],
  importer: ['--import', 'tsx', '--test', '--test-isolation=none', 'packages/importer/tests/*.test.ts', 'tests/commercial/interchange.test.ts']
})) {
  let output = '';
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
    child.once('error', reject); child.once('exit', resolve);
  });
  assert.equal(code, 0, output);
  const passed = Number(output.match(/(?:#|ℹ) pass (\d+)/)?.[1]);
  const failed = Number(output.match(/(?:#|ℹ) fail (\d+)/)?.[1]);
  assert(Number.isInteger(passed) && passed > 0 && failed === 0, output);
  evidence[suite] = { passed, failed };
  console.log(`${suite}: ${passed} PASS`);
}
const sourceFiles=async directory=>(await Promise.all((await readdir(directory,{withFileTypes:true})).map(entry=>entry.isDirectory()?sourceFiles(path.join(directory,entry.name)):path.join(directory,entry.name)))).flat();
for (const file of [...await sourceFiles('packages/contracts/src'),...await sourceFiles('packages/viewer/src'),...await sourceFiles('packages/importer/src')]) {
  evidence.source_sha256[file] = createHash('sha256').update(await readFile(file)).digest('hex');
}
const filename = `docs/evidence/unit-tests-${version.split('.').slice(0, 2).join('.')}.json`;
await writeFile(filename, JSON.stringify(evidence, null, 2));
console.log(filename);
