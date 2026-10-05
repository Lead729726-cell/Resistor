// Publishable receipt for inspected cross-built ZIPs. Native execution is a
// separate macOS workflow result and can never be inferred from archive checks.
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {macBuildOptions} from './mac-build-options.mjs';
const json=async file=>JSON.parse(await readFile(file,'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const {version}=await json('package.json');
const {revision}=macBuildOptions(process.argv.length>2?process.argv.slice(2):['--revision=4']);
if(revision<3)throw Error('Use revision 3 or later for current installer QA.');
const inspected=await json(`docs/evidence/macos-r${revision}/archives.json`);
const built=await json(`release/installers/mac-build-${version}-r${revision}.json`);
const installer=await json(`docs/evidence/macos-r${revision}/installer-logic.json`);
if(installer.cases.length!==13||!installer.cases.every(c=>c.passed&&c.user_design_preserved)||installer.native_execution_verified!==false)throw Error('Installer simulation is incomplete or mislabels its host.');
if(inspected.archives.length!==2||new Set(inspected.archives.map(a=>a.architecture)).size!==2||built.artifacts.length!==2)throw Error('Both Mac architectures must be inspected.');
const artifacts=[];
for(const a of inspected.archives){
  const name=`Register-${version}-mac-${a.architecture}-r${revision}.zip`,b=built.artifacts.find(b=>b.arch===a.architecture);
  if(!['arm64','x64'].includes(a.architecture)||a.version!==version||path.basename(a.file)!==name||!a.crc_checked||!a.installer_manifest_checked||a.bundle_resource_seals.length<5||a.native_execution_verified||!b||b.file!==name||b.build_revision!==revision||!b.ad_hoc_signed||b.native_execution_verified||b.sha256!==a.sha256)throw Error('Invalid Mac preview evidence.');
  const bytes=await readFile(path.join('release/installers',name));
  if(bytes.length!==a.bytes||hash(bytes)!==a.sha256)throw Error('Current Mac ZIP differs from inspected bytes.');
  for(const [relative,sha] of Object.entries(a.source_sha256)){
    const source=relative==='licenses/THIRD-PARTY-NOTICES.md'?'docs/THIRD-PARTY-NOTICES.md':relative;
    if(hash(await readFile(source))!==sha)throw Error('Current packaged source differs: '+source);
  }
  if(a.architecture==='arm64'&&installer.archive_sha256!==a.sha256)throw Error('Installer tests used a different M1 archive.');
  artifacts.push({file:name,bytes:a.bytes,sha256:a.sha256,arch:a.architecture,minimum_macos:a.minimum_macos,build_revision:revision,ad_hoc_signed:true,crc_checked:true,installer_manifest_checked:true,bundle_resource_seals:a.bundle_resource_seals.length,native_execution_verified:false,developer_id_signed:false,notarized:false});
}
await writeFile('docs/evidence/mac-preview-release.json',JSON.stringify({version,build_revision:revision,checked_at:new Date().toISOString(),build_host:built.artifacts[0].build_host,archive_check_host:inspected.host,installer_cases_passed:13,artifacts,native_execution_verified:false,native_desktop_ci:'prepared; requires GitHub push and successful macOS jobs',native_eda_verified:false},null,2)+'\n');
await writeFile(`release/installers/SHA256SUMS-${version}-mac-r${revision}.txt`,artifacts.map(a=>`${a.sha256}  ${a.file}`).join('\n')+'\n');
console.log(`Both current r${revision} ZIPs match source and signed resources; 13 installer simulation cases passed. Native Mac execution remains unverified.`);
