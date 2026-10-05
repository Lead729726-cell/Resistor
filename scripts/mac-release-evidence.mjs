import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const metadata=JSON.parse(await readFile('package.json','utf8')),version=metadata.version,minor=version.split('.').slice(0,2).join('.');
const json=async file=>JSON.parse(await readFile(file,'utf8'));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const archives=await json(`docs/evidence/macos-archive-${version}.json`),build=await json(`release/installers/mac-build-${version}.json`);
if(archives.archives.length!==2||new Set(archives.archives.map(a=>a.architecture)).size!==2)throw Error('Both Mac architectures must be inspected.');
const artifacts=[];
for(const a of archives.archives){
  const bytes=await readFile(a.file);
  if(a.version!==version||digest(bytes)!==a.sha256||!a.crc_checked||a.native_execution_verified)throw Error('Invalid Mac preview evidence.');
  if(!build.artifacts.some(b=>b.arch===a.architecture&&b.sha256===a.sha256))throw Error('Mac archive/build receipt differs.');
  for(const [file,sha] of Object.entries(a.source_sha256)){
    const source=file==='licenses/THIRD-PARTY-NOTICES.md'?'docs/THIRD-PARTY-NOTICES.md':file;
    if(digest(await readFile(source))!==sha)throw Error(`Current Mac resource differs: ${file}`);
  }
  artifacts.push({file:path.resolve(a.file),bytes:bytes.length,sha256:a.sha256,arch:a.architecture,minimum_macos:a.minimum_macos,native_execution_verified:false,developer_id_signed:false,notarized:false});
}
const installation=await json(`docs/evidence/windows-installation-${minor}.json`),installed=await json(`docs/evidence/installed-viewer-${minor}.json`),desktop=await json(`docs/evidence/windows-desktop-tests-${minor}.json`);
if(installation.version!==version||installation.installer_exit_code!==0||installation.uninstaller_exit_code!==0||!installation.test_user_data_marker_preserved||!installed.writable_workspace_seeded||installed.workspace_override||installed.native_session_created||desktop.stats.unexpected!==0||desktop.stats.expected!==3)throw Error('Windows regression/installation QA incomplete.');
const exe=await readFile(installation.installer);if(digest(exe)!==installation.installer_sha256)throw Error('Installer differs from actual installation QA.');
artifacts.push({file:installation.installer,bytes:exe.length,sha256:installation.installer_sha256,arch:'x64',windows_authenticode:installation.windows_authenticode,installation_verified:true});
for(const [file,count] of [[`mac-platform-tests-${minor}.tap`,14],[`mac-shortcut-unit-tests-${minor}.tap`,1]]){
  const content=await readFile(`docs/evidence/${file}`,'utf8');if(!content.includes(`# tests ${count}`)||!content.includes('# fail 0'))throw Error('Platform test evidence incomplete.');
}
const keyboard=await json('docs/evidence/mac-keyboard-logic.json');if(keyboard.version!==version||keyboard.steps.length!==5||keyboard.native_macos_execution)throw Error('Invalid renderer keyboard evidence.');
const retained=[];
for(const file of ['cpu-physical-native.json','cpu-physical-pre-400.json','digital-hierarchy-native.json']){
  const previous=await json(`docs/evidence/${file}`);
  for(const [source,sha] of Object.entries(previous.source_sha256))if(digest(await readFile(source))!==sha)throw Error(`Retained native EDA evidence differs: ${source}`);
  retained.push({file:`docs/evidence/${file}`,source_hashes_match:true,scope:'Previously executed Linux amd64 EDA evidence; not executed on a Mac in this release.'});
}
const report={schema_version:1,version,checked_at:new Date().toISOString(),actual_host:process.platform,artifacts,mac_archive_evidence:`docs/evidence/macos-archive-${version}.json`,platform_tests:15,windows_packaged_tests:3,windows_installation:installation,keyboard_logic:{actual_host:keyboard.actual_host,steps:keyboard.steps.length,native_macos_execution:false,recording:'docs/evidence/mac-keyboard-recording/keyboard-workflow.webm'},retained_native_eda:retained,mac_native_smoke:'prepared, not executed; Mac-only test skipped on Windows',mac_native_eda:'prepared, not executed',mac_dmg:'prepared for native Mac build, not generated here',internet_deployment:'deferred by user',commercial_vendor_execution:'unverified; no installed vendor executable/SDK/license evidence'};
await writeFile(`docs/evidence/release-${minor}-mac.json`,JSON.stringify(report,null,2));
await writeFile(`release/installers/SHA256SUMS-${version}.txt`,artifacts.map(a=>`${a.sha256}  ${path.basename(a.file)}`).join('\n')+'\n');
console.log(`Register ${version}: both Mac ZIPs inspected, 15 platform checks, 3 Windows packaged checks and install/uninstall/data preservation confirmed. Native Mac execution remains unverified.`);
