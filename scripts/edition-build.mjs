import {spawnSync} from 'node:child_process';
import {build} from 'esbuild';
import path from 'node:path';
const outDir=process.env.RESISTOR_BUILD_DIR;
if(!['dist-edu','dist-indust'].includes(outDir))throw Error('Select a supported edition build directory.');
for(const args of [['scripts/appearance-assets.mjs'],['node_modules/typescript/bin/tsc','--noEmit'],['node_modules/vite/bin/vite.js','build'],['scripts/normalize-debug-maps.mjs',outDir]]){
 const result=spawnSync(process.execPath,args,{stdio:'inherit',env:process.env,windowsHide:true});
 if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1);
}
await build({entryPoints:['scripts/process-run.ts'],outfile:path.join(outDir,'process-engine.mjs'),bundle:true,platform:'node',target:'node24',format:'esm',legalComments:'linked'});
