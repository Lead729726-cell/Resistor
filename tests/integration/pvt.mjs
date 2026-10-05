import {spawnSync} from 'node:child_process';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

// Uses a separate SQLite/state directory. Existing projects and the main server
// process remain intact; run this sequentially with other physical regressions.
const verifyOnly=process.argv.includes('--verify-evidence');
if(!verifyOnly){
  const result=spawnSync('docker',['exec','mos-studio-eda','/bin/bash','-lc','python3 /workspace/workers/eda/test_pvt.py'],{encoding:'utf8',timeout:240000});
  if(result.status!==0){process.stderr.write(result.stdout+result.stderr);throw new Error('Actual PVT native regression failed');}
}
const report=JSON.parse(await fs.readFile('.runtime/evidence/pvt.json','utf8'));
assert.ok(report.case_count>=33);assert.equal(report.passed,report.case_count);assert.equal(report.vendor_execution_verified,false);
for(const [name,expected] of Object.entries(report.source_sha256))assert.equal(createHash('sha256').update(await fs.readFile(name)).digest('hex'),expected,`Evidence source changed: ${name}`);
await fs.mkdir('docs/evidence',{recursive:true});await fs.copyFile('.runtime/evidence/pvt.json','docs/evidence/pvt.json');
console.log(JSON.stringify({execution:verifyOnly?'validated-existing-evidence':'executed-isolated-suite',native_cases:report.case_count,passed:report.passed,vendor_execution_verified:false,evidence:'docs/evidence/pvt.json',raw_folder:report.raw_folder}));
