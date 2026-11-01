// Build and verify official Edu artifacts. Publication is a separate operation.
import {access,readFile,writeFile,mkdir,mkdtemp,cp,chmod} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {getProductEdition} from './edition-workspace.mjs';
import {assertLicenseReleaseReady} from './license-release-check.mjs';
import {eduNativePaths,eduWindowsBuilderConfig,assertEduNativeEvidence,assertEduDesktopEvidence} from './edu-native-options.mjs';
import {safeArchiveEntries,zipEntryNames,validateTree} from '../apps/desktop/update-install.mjs';

const require=createRequire(import.meta.url),root=process.cwd(),mode=process.argv[2]??'all';
if(!['build','finish','all'].includes(mode))throw Error('Use edu-native-release.mjs build, finish or all.');
if(getProductEdition().edition!=='edu')throw Error('Select RESISTOR_EDITION=edu for this release. Industry is not repackaged.');
const version=JSON.parse(await readFile('package.json','utf8')).version,paths=eduNativePaths(root,version);
const source_revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim();
if(!/^[a-f0-9]{40}$/.test(source_revision))throw Error('A committed source revision is required.');
const changed=execFileSync('git',['diff','--name-only','HEAD'],{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/).filter(Boolean).filter(file=>!file.startsWith('docs/evidence/')&&!['packages/ui/src/theme.css','public/appearance-init.js'].includes(file));
if(changed.length)throw Error('Commit release source/config before packaging: '+changed.join(', '));
const authority=await assertLicenseReleaseReady(root),env={...process.env,RESISTOR_EDITION:'edu'};
const run=(command,args,extra={})=>new Promise((resolve,reject)=>{const child=spawn(command,args,{cwd:root,env,stdio:'inherit',windowsHide:true,...extra});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(path.basename(command)+' failed with exit '+code)));});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),json=async file=>JSON.parse(await readFile(file,'utf8'));
await mkdir(paths.output,{recursive:true});
const stateFile=path.join(paths.output,paths.basename+'.build-state.json');
async function manifest(){const bytes=await readFile(path.join(paths.resources,'native-runtime/manifest.json')),value=JSON.parse(bytes);if(value.platform!==process.platform||value.arch!==process.arch||!value.pdk_root||!Object.keys(value.files??{}).length)throw Error('Packaged native runtime identity or inventory is missing.');return {value,sha256:hash(bytes)};}
async function verifyResources(){
 const marker=await json(path.join(paths.resources,'product-edition.json')),metadata=await json(path.join(paths.resources,'package.json')),renderer=await json(path.join(paths.resources,'dist/product-context.json'));
 if(marker.edition!=='edu'||metadata.productName!=='Resistor Edu'||metadata.version!==version||renderer.product_id!=='resistor.edu')throw Error('Packaged edition/renderer identity mismatch.');
 const releaseConfig=await readFile(path.join(paths.resources,'platform/licensing/public-config.json'));if(hash(releaseConfig)!==hash(await readFile('platform/licensing/public-config.json')))throw Error('Packaged license authority differs from release configuration.');
 await access(paths.executable);await validateTree(paths.app);
 const runtime=await manifest();
 for(const [file,expected]of Object.entries(runtime.value.files)){
  if(typeof expected!=='string'||!/^[a-f0-9]{64}$/.test(expected)||file.startsWith('/')||file.includes('\\')||file.split('/').some(part=>part==='..'||part==='.'))throw Error('Invalid native runtime inventory entry.');
  // Mac codesign legitimately changes Mach-O bytes after the upstream runtime
  // inventory. The final signed tree is verified by codesign, then hashed below.
  if(process.platform!=='darwin'&&hash(await readFile(path.join(paths.resources,'native-runtime',file)))!==expected)throw Error('Packaged native runtime checksum mismatch: '+file);
 }
 if(process.platform==='darwin')await run('/usr/bin/codesign',['--verify','--deep','--strict',paths.app]);
 return runtime;
}
if(mode!=='finish'){
 // Edition builds regenerate theme assets; preserve the user's existing bytes.
 const preserved=await Promise.all(['packages/ui/src/theme.css','public/appearance-init.js'].map(async file=>({file,bytes:await readFile(file)})));
 try{await run(process.execPath,['scripts/edition.mjs','build','edu']);}finally{for(const {file,bytes}of preserved)await writeFile(file,bytes);}
 await run(process.execPath,['scripts/package.mjs',...(process.platform==='darwin'?['--mac']:process.platform==='linux'?['--linux']:[])]);
 const runtime=await verifyResources();
 await run(process.execPath,['scripts/native-engine-qa.mjs'],{env:{...env,REGISTER_QA_RESOURCES:paths.resources,REGISTER_ENGINE_MODE:'native'}});
 const engine=await json(`docs/evidence/native-runtime/${process.platform}-${process.arch}.json`);
 const state={schema_version:1,edition:'edu',product_id:'resistor.edu',version,target:paths.target,source_revision,build_tools_revision:source_revision,packaged_executable_sha256:hash(await readFile(paths.executable)),license_authority:authority,runtime:{platform:process.platform,arch:process.arch,manifest_sha256:runtime.sha256,versions:runtime.value.versions,scope:runtime.value.scope},native_qa:{completed:false,edition:'edu',product_id:'resistor.edu',platform:process.platform,arch:process.arch,source_revision,engine:{...engine,completed:true,resource_scope:'packaged',runtime_manifest_sha256:runtime.sha256},desktop:null}};
 await writeFile(stateFile,JSON.stringify(state,null,2)+'\n');
 console.log(JSON.stringify({edition:'edu',target:paths.target,built:true,packaged_engine_qa:true,desktop_activation_qa:false,published:false}));
}
if(mode==='build')process.exit(0);
const state=await json(stateFile),runtime=await verifyResources();
if(state.source_revision!==source_revision||state.version!==version||state.runtime.manifest_sha256!==runtime.sha256)throw Error('Rebuild this source revision before finishing the installer.');
if(state.packaged_executable_sha256!==hash(await readFile(paths.executable)))throw Error('Packaged executable changed after engine QA.');
for(const [file,digest]of Object.entries(state.native_qa.engine.source_sha256??{}))if(hash(await readFile(path.join(paths.resources,file)))!==digest)throw Error('Packaged engine source changed after QA: '+file);
const observedIndex=process.argv.indexOf('--desktop-evidence');
if(observedIndex>=0&&!process.argv[observedIndex+1])throw Error('--desktop-evidence requires a local observation JSON file.');
if(observedIndex<0)await run(process.execPath,['scripts/edu-native-desktop-qa.mjs']);
state.native_qa.desktop=await json(observedIndex>=0?path.resolve(process.argv[observedIndex+1]):path.join(paths.output,paths.basename+'.desktop-qa.json'));
assertEduDesktopEvidence(state.native_qa.desktop,{edition:'edu',product_id:'resistor.edu',version,target:paths.target,source_revision,packaged_executable_sha256:state.packaged_executable_sha256,runtime_manifest_sha256:runtime.sha256});
if(observedIndex>=0&&state.native_qa.desktop.verification_method!=='native-cua')throw Error('Imported observation evidence must identify the native CUA method.');
assertEduNativeEvidence(state,{version,source_revision,target:paths.target,runtime_manifest_sha256:runtime.sha256});
state.native_qa.completed=true;
if(process.platform==='win32'){
 const config=path.join(paths.output,'edu-windows-builder.json');await writeFile(config,JSON.stringify(eduWindowsBuilderConfig(await json('apps/desktop/builder.json'),version),null,2));
 await run(process.execPath,[require.resolve('electron-builder/out/cli/cli.js'),'--config',config,'--prepackaged',paths.app,'--win','--publish','never']);
}else{
 const temporary=await mkdtemp(path.join(paths.output,'.archive-')),packageRoot=process.platform==='darwin'?temporary:path.join(temporary,paths.basename);
 await mkdir(packageRoot,{recursive:true});await cp(paths.app,path.join(packageRoot,process.platform==='darwin'?'Resistor Edu.app':'Resistor Edu'),{recursive:true,verbatimSymlinks:true});
 const readme=`Resistor Edu ${version} · ${paths.target}\n\nFull Edu application: circuit/layout editing, linked lessons, quizzes and shared native Python/KLayout/ngspice/public SKY130. First activation requires an Edu serial and internet. Industry requires a separate license. User data and Industry installations are preserved.\n\n${process.platform==='darwin'?'Extract the ZIP on your Mac, then drag Resistor Edu.app into your Applications folder. The app is ad-hoc signed, not Apple Developer ID signed or notarized. Follow macOS Privacy & Security guidance only after checking the official source and SHA-256; no system protection is disabled by this archive.':'Extract the entire archive and run ./install.sh, or open ./Resistor Edu/Resistor Edu directly. A graphical Linux x64 session and OS keyring are required. Do not run as root or disable the Chromium sandbox.'}\n\nNo Docker is required for bundled circuit/layout/PDK simulation. Magic/Netgen and physical-rule availability are shown separately; additional tools may need installation. Neither this package nor educational checks assert foundry signoff.\nSource: ${source_revision}\nDownload: https://resistor.kr/download/edu/\n`;
 await writeFile(path.join(packageRoot,'README.txt'),readme);
 if(process.platform==='darwin'){
  await run('/usr/bin/ditto',['-c','-k','--norsrc',packageRoot,paths.artifact]);
  safeArchiveEntries((await zipEntryNames(paths.artifact)).join('\n'),'Resistor Edu.app',{mac:true,edition:'edu'});
 }else{
  await cp('scripts/edu-linux-install.cjs',path.join(packageRoot,'install.cjs'));
  await writeFile(path.join(packageRoot,'install.sh'),'#!/bin/sh\nset -eu\nedu_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexport ELECTRON_RUN_AS_NODE=1\nexec "$edu_directory/Resistor Edu/Resistor Edu" "$edu_directory/install.cjs"\n');await chmod(path.join(packageRoot,'install.sh'),0o755);
  await run('tar',['-czf',paths.artifact,'-C',temporary,paths.basename]);
  safeArchiveEntries(execFileSync('tar',['-tzf',paths.artifact],{encoding:'utf8',maxBuffer:8*1024*1024}),paths.basename,{edition:'edu'});
 }
}
const bytes=await readFile(paths.artifact),receipt={...state,platform:paths.target.split('-')[0],arch:process.arch,file:path.basename(paths.artifact),bytes:bytes.length,sha256:hash(bytes),built_at:new Date().toISOString(),license_authority:authority,signing:{authenticode_signed:false,ad_hoc_signed:process.platform==='darwin',developer_id_signed:false,notarized:false},runtime_arch:process.arch,requires_emulation:false,physical_signoff:false,manufacturing_signoff:false};
await writeFile(paths.receipt,JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({edition:'edu',target:paths.target,artifact:paths.artifact,receipt:paths.receipt,bytes:receipt.bytes,sha256:receipt.sha256,native_qa_completed:true,published:false}));
