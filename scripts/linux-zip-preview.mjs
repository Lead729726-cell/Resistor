import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
const run=(exe,args,options={})=>new Promise((resolve,reject)=>{
  const child=spawn(exe,args,{stdio:'inherit',windowsHide:true,...options});
  child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(`Linux package stage failed: ${code}`)));
});
if(process.platform!=='linux')throw Error('Build the Docker-free Linux package on Linux or use the native-linux GitHub workflow.');
if(!process.argv.includes('--skip-stage'))await run(process.execPath,['scripts/package.mjs','--stage-only','--linux']);
await run(process.execPath,['scripts/linux-cross-build.mjs']);
