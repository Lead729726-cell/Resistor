import {spawnSync} from 'node:child_process';
const result=spawnSync('docker',['exec','mos-studio-eda','/bin/bash','-lc','python3 /workspace/workers/eda/test_commercial_backend.py'],{encoding:'utf8',timeout:240000});
if(result.stdout)process.stdout.write(result.stdout);
if(result.stderr)process.stderr.write(result.stderr);
if(result.error)throw result.error;
if(result.status!==0)process.exit(result.status??1);
