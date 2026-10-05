import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const json=async file=>JSON.parse(await readFile(file,'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const {version}=await json('package.json');
const archive=await json('docs/evidence/mac-arm64-repair-archive.json');
const build=await json(`release/installers/mac-build-${version}-r2.json`);
if(archive.archives.length!==1||build.artifacts.length!==1)throw Error('Expected one inspected Apple Silicon repair build.');
const checked=archive.archives[0],built=build.artifacts[0];
if(checked.architecture!=='arm64'||checked.version!==version||!checked.crc_checked||!checked.installer_manifest_checked||checked.bundle_resource_seals.length<5||built.arch!=='arm64'||built.build_revision!==2||!built.ad_hoc_signed||built.hardened_runtime||built.native_execution_verified)throw Error('M1 repair validation incomplete.');
const file=`Register-${version}-mac-arm64-r2.zip`,bytes=await readFile(path.join('release/installers',file));
if(path.basename(checked.file)!==file||built.file!==file||bytes.length!==checked.bytes||hash(bytes)!==checked.sha256||built.sha256!==checked.sha256)throw Error('M1 repair archive/build receipt mismatch.');
const installer=await json('docs/evidence/mac-installer-logic.json');
if(installer.archive_sha256!==checked.sha256||installer.native_execution_verified!==false||installer.cases.length!==9||!installer.cases.every(c=>c.passed)||!installer.viewer_launch?.installed_target_used)throw Error('Current ZIP installer logic evidence is incomplete.');
for(const [relative,sha] of Object.entries(checked.source_sha256)){
  const source=relative==='licenses/THIRD-PARTY-NOTICES.md'?'docs/THIRD-PARTY-NOTICES.md':relative;
  if(hash(await readFile(source))!==sha)throw Error('M1 packaged source differs: '+source);
}
const evidence={version,build_revision:2,checked_at:new Date().toISOString(),artifact:{file,bytes:bytes.length,sha256:checked.sha256,arch:'arm64',minimum_macos:checked.minimum_macos,build_revision:2,ad_hoc_signed:true,hardened_runtime:false,developer_id_signed:false,notarized:false,native_execution_verified:false},validation:{crc_checked:true,installer_manifest_checked:true,mach_o_count:checked.mach_o_count,bundle_resource_seals:checked.bundle_resource_seals.length,source_hashes_match:true,archive_evidence:'docs/evidence/mac-arm64-repair-archive.json'},changes:['Complete ad-hoc bundle/framework/helper resource seals','JIT entitlements, hardened runtime disabled for development signing','User-approved app-scoped installer with file/symlink integrity checks, backup and logs'],native_macos_execution:'not performed on this Windows/Linux host'};
await writeFile('docs/evidence/mac-arm64-repair.json',JSON.stringify(evidence,null,2)+'\n');
console.log(`M1 r2 release metadata ready: ${bytes.length} bytes, ${checked.mach_o_count} Mach-O binaries, ${checked.bundle_resource_seals.length} resource seals. Native Mac launch is not certified.`);
