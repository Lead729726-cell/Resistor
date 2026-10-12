import {execFile} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {promisify} from 'node:util';
const execute=promisify(execFile);
await mkdir('docs/evidence/sigma-delta8',{recursive:true});
for(const [name,command] of [['mathematical-tests','cd /workspace/workers/eda && python3 -m unittest test_sigma_delta -v'],['worker-api-tests','python3 /workspace/scripts/sigma-delta-worker-test.py']]){
  const r=await execute('docker',['exec','mos-studio-eda','bash','-lc',command],{windowsHide:true,timeout:120000,maxBuffer:4*1024*1024});
  await writeFile(`docs/evidence/sigma-delta8/${name}.txt`,r.stdout+r.stderr);
  console.log(`${name}: passed`);
}
