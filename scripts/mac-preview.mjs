import {spawn} from 'node:child_process';
import {readFile,access} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
if(process.platform!=='darwin'||!['arm64','x64'].includes(process.arch))throw Error('Build and run the Mac preview on an arm64 or x64 Mac.');
const require=createRequire(import.meta.url),version=JSON.parse(await readFile('package.json','utf8')).version;
const run=args=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{stdio:'inherit'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('Mac preview stage failed: '+code)));});
await run(['scripts/package.mjs','--mac',...(process.arch==='arm64'?['--arm64']:[])]);
const app=path.resolve(`release/${version}/Register-darwin-${process.arch}/Register.app`);await access(app);
await run([require.resolve('@playwright/test/cli'),'test','tests/ui/desktop.spec.ts','--grep','Packaged viewer|Missing Docker|Mac native menu']);
if(process.env.REGISTER_NATIVE_QA==='1'){
  await run([require.resolve('@playwright/test/cli'),'test','tests/ui/desktop.spec.ts','--grep','real worker']);
  await run(['scripts/mac-native-qa.mjs']);
}
await run([require.resolve('electron-builder/out/cli/cli.js'),'--config','apps/desktop/builder.json','--prepackaged',app,'--mac',`--${process.arch}`,'--publish','never']);
