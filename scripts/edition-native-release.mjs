import {readFile,writeFile,mkdir,cp,chmod,lstat,readdir,readlink} from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import path from 'node:path';
import {Zip,ZipDeflate,ZipPassThrough} from 'fflate';
import {getProductEdition} from './edition-workspace.mjs';
import {verifyEditionPackage} from './edition-native-qa.mjs';
import {buildWindowsArmInstaller} from './windows-arm-installer.mjs';
import {assertLicenseReleaseReady} from './license-release-check.mjs';
await assertLicenseReleaseReady();
const require=createRequire(import.meta.url),edition=getProductEdition(),pkg=JSON.parse(await readFile('package.json','utf8')),name=edition.edition==='edu'?'Resistor Edu':'Resistor';
const run=(exe,args,opts={})=>new Promise((resolve,reject)=>{const c=spawn(exe,args,{stdio:'inherit',windowsHide:true,...opts});c.once('error',reject);c.once('exit',code=>code===0?resolve():reject(Error(exe+' exited '+code)));});
await run(process.execPath,['scripts/package.mjs']);
const folder=path.resolve(`release/${pkg.version}/${name}-${process.platform}-${process.arch}`),app=process.platform==='darwin'?path.join(folder,name+'.app'):folder;
const resources=path.join(app,process.platform==='darwin'?'Contents/Resources/app':'resources/app'),executable=path.join(app,process.platform==='darwin'?'Contents/MacOS/'+name:name+(process.platform==='win32'?'.exe':''));
const qa=await verifyEditionPackage({executable,resources});if(!qa.completed)throw Error('Native package QA did not complete.');
const destination=path.resolve('release/edition-installers');await mkdir(destination,{recursive:true});
const slug=edition.edition==='edu'?'Edu':'Indust',platform=process.platform==='win32'?'windows':process.platform==='darwin'?'macos':'linux';
const basename=`Resistor-${slug}-${pkg.version}-${platform}-${process.arch}`;
let artifact,windowsInstaller;
if(process.platform==='win32'&&process.arch==='arm64'){
 windowsInstaller=await buildWindowsArmInstaller({edition,version:pkg.version,name,app,destination,basename});artifact=windowsInstaller.artifact;
}else if(process.platform==='win32'){
 const config={appId:edition.bundle_id,productName:name,electronVersion:'44.5.0',asar:false,directories:{app:'release/staging',output:destination},artifactName:basename+'.exe',win:{icon:'apps/desktop/assets/register.ico',target:[{target:'nsis',arch:[process.arch]}],signAndEditExecutable:false},nsis:{oneClick:false,perMachine:false,allowElevation:false,allowToChangeInstallationDirectory:true,createDesktopShortcut:true,createStartMenuShortcut:true,shortcutName:edition.name,deleteAppDataOnUninstall:false,runAfterFinish:false}};
 const cfg='.runtime/edition-nsis.json';await writeFile(cfg,JSON.stringify(config));await run(process.execPath,[require.resolve('electron-builder/out/cli/cli.js'),'--config',cfg,'--prepackaged',app,'--win','--'+process.arch,'--publish','never']);artifact=path.join(destination,basename+'.exe');
}else{
 const bundle=path.resolve('.runtime/edition-distribution/'+basename);await mkdir(bundle,{recursive:true});await cp(app,path.join(bundle,name+(process.platform==='darwin'?'.app':'')),{recursive:true,verbatimSymlinks:true});
 await cp('scripts/edition-install.cjs',path.join(bundle,'install.cjs'));
 await writeFile(path.join(bundle,'edition-installer.json'),JSON.stringify({edition:edition.edition,name:edition.name,package_name:name,version:pkg.version,bundle_id:edition.bundle_id},null,2)+'\n');
 const isMac=process.platform==='darwin',interpreter=isMac?'./'+name+'.app/Contents/MacOS/'+name:'./'+name+'/'+name;
 const helper=isMac?'Install '+edition.name+'.command':'install.sh';
 const body=(isMac?'#!/bin/zsh':'#!/bin/sh')+'\nset -eu\nlocation=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\ncd "$location"\nexport ELECTRON_RUN_AS_NODE=1\nexec "'+interpreter+'" "$location/install.cjs"\n';
 await writeFile(path.join(bundle,helper),body);await chmod(path.join(bundle,helper),0o755);
 await writeFile(path.join(bundle,'README.txt'),`${edition.name} ${pkg.version} · ${platform} ${process.arch}\n\nExtract the entire archive. Close the installed app before running ${helper}. No system Node.js, Python or Docker is required for the bundled editor and ngspice. User designs are stored separately and preserved.\n${isMac?'Developer ID / Apple notarization are not complete. Verify the archive SHA-256 and source before running. If macOS blocks the command helper, open Terminal, type /bin/zsh followed by a space, then drag this installer helper into Terminal. The helper verifies the ad-hoc bundle signature before removing quarantine from this application only.':'Run ./install.sh to install in your user applications folder. Requires a graphical x64 Linux desktop and Chromium sandbox support.'}\n\nDRC/LVS/PEX require separate additional tools and verified decks. This release does not claim foundry signoff.\n`);
 if(isMac){
   artifact=path.join(destination,basename+'.zip');const output=createWriteStream(artifact),finished=once(output,'finish');const zip=new Zip((error,data,final)=>{if(error)output.destroy(error);else{output.write(data);if(final)output.end();}});
   async function append(source,entry){const info=await lstat(source);if(info.isDirectory()){for(const child of await readdir(source))await append(path.join(source,child),entry?entry+'/'+child:child);return;}const f=info.isSymbolicLink()?new ZipPassThrough(entry):new ZipDeflate(entry,{level:6});f.os=3;f.attrs=(info.mode&0xffff)*65536;zip.add(f);if(info.isSymbolicLink())f.push(Buffer.from(await readlink(source)),true);else{for await(const chunk of createReadStream(source)){f.push(chunk,false);if(output.writableNeedDrain)await once(output,'drain');}f.push(new Uint8Array(),true);}}
   await append(bundle,'');zip.end();await finished;
 }else{artifact=path.join(destination,basename+'.tar.gz');await run('tar',['-czf',artifact,'-C',path.dirname(bundle),path.basename(bundle)]);}
}
const bytes=await readFile(artifact),overlay=JSON.parse(await readFile('.runtime/edition-build-overlay.json','utf8'));
const receipt={schema_version:1,product_id:edition.id,edition:edition.edition,version:pkg.version,platform,arch:process.arch,source_revision:overlay.source_revision,build_tools_revision:process.env.RESISTOR_BUILD_TOOLS_REVISION,build_overlay:overlay,file:path.basename(artifact),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),native_qa:qa,code_signing:{developer_id_signed:false,apple_notarized:false,windows_authenticode_signed:false},runtime_arch:qa.runtime_arch,requires_emulation:qa.requires_emulation,manufacturing_signoff:false};
if(windowsInstaller){receipt.installer_kind=windowsInstaller.kind;receipt.default_directory=windowsInstaller.default_directory;}
await writeFile(path.join(destination,basename+'.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({file:receipt.file,bytes:receipt.bytes,edition:receipt.edition,platform,arch:process.arch,qa_completed:qa.completed}));
