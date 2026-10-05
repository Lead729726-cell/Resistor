import { mkdir, cp, writeFile, stat, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import { packager } from '@electron/packager';
import { copyNotices } from './notices.mjs';
import { build } from 'esbuild';
import { signMacApp } from './mac-signing.mjs';
const release=path.resolve('release');
const stage=path.join(release,'staging');
if(path.dirname(stage)!==release||path.dirname(release)!==process.cwd())throw new Error('Packaging paths must stay inside the workspace release directory.');
await rm(stage,{recursive:true,force:true});
await mkdir(stage,{recursive:true});
await copyNotices(path.join(stage,'licenses'));
for(const folder of ['dist','apps/desktop','workers/eda','adapters','docs','platform/cloud','platform/commercial'])await cp(folder,path.join(stage,folder),{recursive:true,filter:source=>!source.includes('__pycache__')&&!source.includes('vendor')&&!source.includes('.secrets')&&!source.includes(`${path.sep}evidence${path.sep}`)&&!source.endsWith(`${path.sep}evidence`)});
// Runtime samples only; large recordings and test evidence are delivered separately.
await cp('examples/sky130',path.join(stage,'examples/sky130'),{recursive:true});
await cp('node_modules/ws',path.join(stage,'node_modules/ws'),{recursive:true});
for(const name of ['README.md','LICENSE','.dockerignore'])await cp(name,path.join(stage,name));
await mkdir(path.join(stage,'scripts'),{recursive:true});for(const name of ['runtime.mjs','worker.mjs','docker-cli.mjs','desktop-diagnostics.mjs','cloud.mjs','cloud-backup.mjs','commercial-agent.mjs'])await cp(path.join('scripts',name),path.join(stage,'scripts',name));
await build({entryPoints:['scripts/mcp.mjs'],outfile:path.join(stage,'scripts/mcp.mjs'),bundle:true,platform:'node',target:'node24',format:'esm',external:['ws'],legalComments:'linked',banner:{js:"import {createRequire as __registerCreateRequire} from 'node:module'; const require=__registerCreateRequire(import.meta.url);"}});
await build({entryPoints:['scripts/process-run.ts'],outfile:path.join(stage,'scripts/process-engine.mjs'),bundle:true,platform:'node',target:'node24',format:'esm',legalComments:'linked'});
const metadata=JSON.parse(await readFile('package.json','utf8'));
await writeFile(path.join(stage,'package.json'),JSON.stringify({name:'register-eda',productName:'Register',description:metadata.description,author:'Register contributors',license:'MIT',version:metadata.version,main:'apps/desktop/main.cjs',private:true}));
if(process.argv.includes('--stage-only')){console.log(`Staged Register ${metadata.version} resources without private runtime data.`);process.exit(0);}
const platform=process.argv.includes('--mac')?'darwin':'win32';const arch=process.argv.includes('--arm64')?'arm64':process.argv.includes('--x64')?'x64':platform==='darwin'?process.arch:'x64';
if(platform==='win32'&&arch!=='x64')throw Error('Windows release is verified for x64 only.');
const result=await packager({dir:stage,out:`release/${metadata.version}`,name:'Register',icon:platform==='win32'?'apps/desktop/assets/register.ico':'apps/desktop/assets/register.icns',platform,arch,electronVersion:'44.5.0',overwrite:true,asar:false,prune:false,appVersion:metadata.version,appBundleId:'org.register.eda',appCategoryType:'public.app-category.developer-tools',darwinDarkModeSupport:true,appCopyright:'Register contributors',win32metadata:{ProductName:'레지스터',FileDescription:'레지스터 EDA 공동 설계'}});
if(!result.length)throw Error('No package was created. Build macOS .app/DMG on the prepared macOS workflow; this Windows host cannot create the required symlinks.');
for(const folder of result){if(platform==='win32'){const exe=path.join(folder,'Register.exe');const info=await stat(exe);await writeFile(path.join(folder,'Open-Viewer.cmd'),'@echo off\r\n"%~dp0Register.exe" --viewer\r\n');console.log(`Windows executable: ${exe} (${info.size} bytes)`);}else{await signMacApp(path.join(folder,'Register.app'));console.log(`Ad-hoc signed Mac application prepared: ${folder}. Developer ID/notarization are not complete.`);}}
