import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {generateKeyPairSync,createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {eduNativeTarget,eduNativePaths,eduWindowsBuilderConfig,assertEduNativeEvidence,assertEduDesktopEvidence} from '../scripts/edu-native-options.mjs';
import {assertLicenseReleaseReady} from '../scripts/license-release-check.mjs';
import {nativePackageCopyOptions,nativeArchiveCommand,signableMachOHeader} from '../scripts/native-package-options.mjs';

test('native Edu paths keep product, CPU, updater names and Industry installation isolated',()=>{
 for(const [platform,arch,target]of [['win32','x64','windows-x64'],['darwin','arm64','macos-arm64'],['darwin','x64','macos-x64'],['linux','x64','linux-x64']]){
  const p=eduNativePaths('/fixture','0.32.0',platform,arch);assert.equal(p.target,target);assert(p.executable.includes('Resistor Edu'));assert(p.resources.endsWith(path.join('Resources','app'))||p.resources.endsWith(path.join('resources','app')));assert(path.basename(p.artifact).startsWith('Resistor-Edu-0.32.0-'+target+'.'));
 }
 for(const [platform,arch]of [['win32','arm64'],['linux','arm64'],['darwin','ia32']])assert.throws(()=>eduNativeTarget(platform,arch));
 assert.throws(()=>eduNativePaths('/fixture','../next','win32','x64'));
 const base={appId:'org.register.eda',productName:'Resistor',directories:{output:'release/installers'},nsis:{shortcutName:'Resistor',deleteAppDataOnUninstall:false},win:{signAndEditExecutable:false,target:'nsis'}};
 const snapshot=structuredClone(base),edu=eduWindowsBuilderConfig(base,'0.32.0');assert.deepEqual(base,snapshot);assert.equal(edu.appId,'org.resistor.edu');assert.equal(edu.productName,'Resistor Edu');assert.equal(edu.nsis.shortcutName,'Resistor Edu');assert.equal(edu.nsis.deleteAppDataOnUninstall,false);assert.equal(edu.artifactName,'Resistor-Edu-0.32.0-windows-x64.exe');assert.equal(edu.directories.output,'release/edu-installers');
});

test('public installer readiness requires matching signing identity and a durable production database',async t=>{
 const folder=await mkdtemp(path.join(os.tmpdir(),'resistor-edu-release-'));t.after(async()=>{assert.equal(path.dirname(folder),os.tmpdir());await rm(folder,{recursive:true,force:true});});
 const {publicKey}=generateKeyPairSync('ed25519'),key=publicKey.export({format:'pem',type:'spki'}),fingerprint=createHash('sha256').update(publicKey.export({format:'der',type:'spki'})).digest('hex');
 await mkdir(path.join(folder,'platform/licensing'),{recursive:true});await writeFile(path.join(folder,'platform/licensing/public-config.json'),JSON.stringify({schema_version:1,required:true,server_url:'https://license.example.test/',public_keys:{fixture:key},deployment_status:'production_ready'}));
 const healthy={service:'resistor-licensing',key_id:'fixture',public_key_fingerprint:fingerprint,database_ready:true,storage_backend:'cloudflare-durable-object-sqlite',authority_id:'production-v1',storage_schema_version:1};
 const fetcher=health=>async url=>{assert.equal(url,'https://license.example.test/health');return {ok:true,json:async()=>({result:health})};};
 assert.equal((await assertLicenseReleaseReady(folder,fetcher(healthy))).database_ready,true);
 for(const patch of [{database_ready:false},{database_ready:undefined},{storage_backend:'memory'},{authority_id:'development'},{storage_schema_version:2},{public_key_fingerprint:'0'.repeat(64)}])await assert.rejects(()=>assertLicenseReleaseReady(folder,fetcher({...healthy,...patch})));
});

test('archive gate rejects stale, partial, source-only, unactivated and failed native QA evidence',()=>{
 const context={version:'0.32.0',source_revision:'a'.repeat(40),target:'windows-x64',runtime_manifest_sha256:'b'.repeat(64)};
 const evidence={edition:'edu',product_id:'resistor.edu',...context,native_qa:{engine:{completed:true,resource_scope:'packaged',runtime_manifest_sha256:context.runtime_manifest_sha256,docker_used:false,public_pdk_available:true,cases:[{name:'actual ideal-circuit OP: 0.9 V and 90 uA; functional verdict UNKNOWN',passed:true,voltage_V:.9,run_id:'fixture-op'},{name:'GDSII and OASIS actual engine round trips',passed:true},{name:'actual SKY130 inverter model transient with signed currents',passed:true,run_id:'fixture-inverter'}]},desktop:{activation_checked:true,edition_title:'Resistor Edu',window_loaded:true,license_required_before_activation:true,engine_rpc_checked:true,lease_released:true}}};
 assert(assertEduNativeEvidence(evidence,context));
 for(const mutate of [e=>e.edition='indust',e=>e.source_revision='c'.repeat(40),e=>e.target='macos-arm64',e=>e.native_qa.engine.resource_scope='source',e=>e.native_qa.engine.runtime_manifest_sha256='wrong',e=>e.native_qa.engine.cases[0].passed=false,e=>e.native_qa.engine.cases[0].voltage_V=1.8,e=>e.native_qa.engine.cases.pop(),e=>e.native_qa.desktop.activation_checked=false,e=>e.native_qa.desktop.lease_released=false]){const changed=structuredClone(evidence);mutate(changed);assert.throws(()=>assertEduNativeEvidence(changed,context));}
});

test('native CUA observations must bind every actual result to the exact packaged build',()=>{
 const binding={edition:'edu',product_id:'resistor.edu',version:'0.32.0',target:'windows-x64',source_revision:'a'.repeat(40),packaged_executable_sha256:'b'.repeat(64),runtime_manifest_sha256:'c'.repeat(64)};
 const checks=['activation_checked','window_loaded','license_required_before_activation','engine_rpc_checked','lease_released'];
 const observed={...binding,verification_method:'native-cua',checked_at:new Date().toISOString(),edition_title:'Resistor Edu',...Object.fromEntries(checks.map(name=>[name,true])),observations:checks.map(check=>({check,evidence:'Unit fixture observation; not product QA'}))};
 assert(assertEduDesktopEvidence(observed,binding));
 for(const mutate of [d=>d.source_revision='d'.repeat(40),d=>d.packaged_executable_sha256='e'.repeat(64),d=>d.runtime_manifest_sha256='f'.repeat(64),d=>d.target='macos-arm64',d=>d.observations.pop(),d=>d.activation_checked=false,d=>d.verification_method='assumed',d=>d.checked_at='not-a-date']){const changed=structuredClone(observed);mutate(changed);assert.throws(()=>assertEduDesktopEvidence(changed,binding));}
});

test('real packager copy filter preserves the entire curated SDK including Python object files',async()=>{
 const require=createRequire(import.meta.url),module=path.join(path.dirname(require.resolve('@electron/packager')),'copy-filter.js');
 const {populateIgnoredPaths,userPathFilter}=await import(pathToFileURL(module).href);
 const directory=path.resolve('fixture-staging'),options={dir:directory,out:path.resolve('fixture-artifact'),prune:false,...nativePackageCopyOptions()};
 const filter=userPathFilter({...options,...populateIgnoredPaths(options)});
 for(const name of ['native-runtime/python/lib/python3.13/config-3.13-x86_64-linux-gnu/python.o','native-runtime/python/lib/python3.13/config/python.obj','native-runtime/python/bin/python3','native-runtime/manifest.json','native-runtime/curated/Thumbs.db'])assert.equal(await filter(path.join(directory,name)),true,name);
 for(const name of ['compiler.o','.git/config','.secrets/signing.key','node_modules/.bin/cli','package-lock.json'])assert.equal(await filter(path.join(directory,name)),false,name);
});

test('Windows 7z extraction does not depend on tar LZMA support or shell interpolation',()=>{
 const archive=path.resolve('cached sdk/ngspice.7z'),destination=path.resolve('output sdk');
 assert.deepEqual(nativeArchiveCommand(archive,destination,{platform:'win32',sevenZip:'C:/Program Files/7-Zip/7z.exe'}),{executable:'C:/Program Files/7-Zip/7z.exe',args:['x','-y','-o'+destination,archive]});
 for(const platform of ['win32','darwin','linux'])assert.equal(nativeArchiveCommand('python.tar.gz',destination,{platform}).executable,'tar');
 assert.throws(()=>nativeArchiveCommand(archive,destination,{platform:'win32',sevenZip:'bad\npath'}));
});

test('Mac signing keeps relocatable Python object files as resources and signs runtime code',()=>{
 for(const [magic,little]of [['cffaedfe',true],['cefaedfe',true],['feedfacf',false],['feedface',false]]){
  const bytes=Buffer.alloc(16);Buffer.from(magic,'hex').copy(bytes);
  for(const type of [1,9,10]){little?bytes.writeUInt32LE(type,12):bytes.writeUInt32BE(type,12);assert.equal(signableMachOHeader(bytes),false);}
  for(const type of [2,6,8]){little?bytes.writeUInt32LE(type,12):bytes.writeUInt32BE(type,12);assert.equal(signableMachOHeader(bytes),true);}
 }
 assert.equal(signableMachOHeader(Buffer.from('ordinary text resource')),false);
 assert.equal(signableMachOHeader(Buffer.from('cffaedfe','hex')),false);
});
