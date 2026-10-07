import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {dockerExecutable,dockerEnvironment} from './docker-cli.mjs';
const run=(exe,args,options={})=>new Promise((resolve,reject)=>{
  const child=spawn(exe,args,{stdio:'inherit',windowsHide:true,...options});
  child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(`Linux package stage failed: ${code}`)));
});
if(!process.argv.includes('--skip-stage'))await run(process.execPath,['scripts/package.mjs','--stage-only']);
if(process.platform==='linux')await run(process.execPath,['scripts/linux-cross-build.mjs']);
else{
  const root=process.cwd(),output=path.join(root,'release/installers');await mkdir(output,{recursive:true});
  await run(await dockerExecutable(),['run','--rm','--name',`register-linux-package-${process.pid}`,'--mount',`type=bind,source=${root},target=/src,readonly`,'--mount',`type=bind,source=${output},target=/output`,'--workdir','/src','--env','REGISTER_LINUX_OUTPUT=/output','node:24.16.0-bookworm-slim@sha256:2c87ef9bd3c6a3bd4b472b4bec2ce9d16354b0c574f736c476489d09f560a203','node','scripts/linux-cross-build.mjs'],{env:dockerEnvironment()});
}
