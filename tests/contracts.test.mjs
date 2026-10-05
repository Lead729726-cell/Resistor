import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runtimeConfig,workerRpc } from '../scripts/runtime.mjs';
test('Session config survives reopen and confines server to loopback',async()=>{
  const folder=await mkdtemp(path.join(os.tmpdir(),'mos-session-'));
  const first=await runtimeConfig(folder);const second=await runtimeConfig(folder);assert.equal(first.token,second.token);assert.equal(first.token.length,64);assert.equal(first.url,'http://127.0.0.1:18765');
  await writeFile(first.file,JSON.stringify({url:'http://example.com:18765',token:first.token}));await assert.rejects(runtimeConfig(folder),/loopback/);
});
test('Arbitrary command and shell access cannot pass transport allowlist',async()=>{
  for(const method of ['shell.exec','system.eval','__proto__','constructor','process.spawn']){
    const response=await workerRpc({url:'http://127.0.0.1:1',token:'unused'},method,{cmd:'whoami'});assert.equal(response.ok,false);assert.equal(response.error.code,'UNSUPPORTED_METHOD');
  }
});
test('Token has no renderer code path or VITE environment prefix',async()=>{
  const contents=await readFile('packages/contracts/src/index.ts','utf8');assert.doesNotMatch(contents,/MOS_TOKEN|worker\.json|VITE_.*TOKEN/);assert.match(contents,/window\.mos/);
});
