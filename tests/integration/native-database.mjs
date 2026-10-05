import {spawnSync} from 'node:child_process';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

// Separate SQLite/state; never restarts or changes existing main projects.
const result=spawnSync('docker',['exec','mos-studio-eda','/bin/bash','-lc','python3 /workspace/workers/eda/test_native_database.py'],{encoding:'utf8',timeout:90000});
if(result.status!==0){process.stderr.write(result.stdout+result.stderr);throw new Error('Native database regression failed');}
const report=JSON.parse(await fs.readFile('.runtime/evidence/native-database.json','utf8'));
assert.ok(report.case_count>=41);assert.equal(report.passed,report.case_count);assert.equal(report.vendor_execution_verified,false);
for(const [name,expected] of Object.entries(report.source_sha256))assert.equal(createHash('sha256').update(await fs.readFile(name)).digest('hex'),expected);
await fs.mkdir('docs/evidence',{recursive:true});await fs.copyFile('.runtime/evidence/native-database.json','docs/evidence/native-database.json');
console.log(JSON.stringify({native_cases:report.case_count,passed:report.passed,vendor_execution_verified:false,evidence:'docs/evidence/native-database.json',raw_folder:report.raw_folder}));
