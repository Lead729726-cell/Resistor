import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {dockerExecutable,dockerEnvironment} from './docker-cli.mjs';

const run=(exe,args,options={})=>new Promise((resolve,reject)=>{
  const child=spawn(exe,args,{stdio:'inherit',windowsHide:true,...options});
  child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(`Mac ZIP stage failed: ${code}`)));
});
await run(process.execPath,['scripts/package.mjs','--stage-only']);
if(process.platform==='win32'){
  const root=process.cwd(),output=path.join(root,'release/installers');await mkdir(output,{recursive:true});
  const docker=await dockerExecutable();
  // The Linux temporary filesystem retains .app symlinks. Only final ZIP bytes
  // cross the Windows bind mount; the native EDA container is never modified.
  await run(docker,['run','--rm','--name',`register-mac-package-${process.pid}`,'--mount',`type=bind,source=${root},target=/src,readonly`,'--mount',`type=bind,source=${output},target=/output`,'--workdir','/src','--env','REGISTER_MAC_OUTPUT=/output','node:24.16.0-bookworm-slim@sha256:2c87ef9bd3c6a3bd4b472b4bec2ce9d16354b0c574f736c476489d09f560a203','node','scripts/mac-cross-build.mjs',...process.argv.slice(2)],{env:dockerEnvironment()});
}else await run(process.execPath,['scripts/mac-cross-build.mjs',...process.argv.slice(2)]);
console.log('Mac ZIPs are preview artifacts. Run native Mac smoke/EDA QA before certifying Mac execution.');
