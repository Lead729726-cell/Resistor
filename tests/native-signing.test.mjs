import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {macSigningPolicy,windowsSigningPolicy,signingPolicyIdentity} from '../scripts/signing-policy.mjs';
import {assertMacSignature,verifyMacSignature,notarizeMacApp,macEntitlementArguments} from '../scripts/mac-signing.mjs';
import {assertWindowsSignature,verifyWindowsSignature,windowsInstallerSigningConfig} from '../scripts/windows-signing.mjs';
import {signingConfigurationStatus,signingPreflight,trustedSigningLocallyReady} from '../scripts/signing-preflight.mjs';

const certificate=Buffer.from('fixture certificate bytes; not a real certificate');
const mac={mode:'developer-id',identity:createHash('sha1').update(certificate).digest('hex'),team_id:'ABCD123456',notary_profile:'fixture-profile'};
const macDetails='Authority=Developer ID Application: Test Fixture (ABCD123456)\nTeamIdentifier=ABCD123456\nCodeDirectory v=20500 size=900 flags=0x10000(runtime) hashes=2\nTimestamp=Nov 1, 2026 at 00:00:00\n';
const windows={mode:'store',publisher:'콜드브루 Test Fixture',signtool:path.resolve('fixture-signtool.exe'),thumbprint:'A'.repeat(40),timestamp:'https://timestamp.digicert.com'};
const windowsDetails={status:'Valid',signature_type:'Authenticode',publisher:windows.publisher,signer_thumbprint:windows.thumbprint,timestamp_thumbprint:'B'.repeat(40)};

test('trusted signing is explicit and rejects incomplete identities and arbitrary Azure destinations',()=>{
 assert.deepEqual(macSigningPolicy({}),{mode:'adhoc'});assert.deepEqual(windowsSigningPolicy({}),{mode:'none'});
 assert.throws(()=>macSigningPolicy({RESISTOR_MAC_SIGNING:'developer-id'}));
 assert.throws(()=>windowsSigningPolicy({RESISTOR_WINDOWS_SIGNING:'store'}));
 const env={RESISTOR_WINDOWS_SIGNING:'azure',RESISTOR_WINDOWS_PUBLISHER:'Test Fixture',RESISTOR_SIGNTOOL_PATH:path.resolve('signtool.exe'),RESISTOR_AZURE_SIGN_DLIB:path.resolve('Azure.CodeSigning.Dlib.dll'),RESISTOR_AZURE_SIGN_ENDPOINT:'https://krc.codesigning.azure.net',RESISTOR_AZURE_SIGN_ACCOUNT:'fixture-account',RESISTOR_AZURE_SIGN_PROFILE:'public-profile'};
 assert.equal(windowsSigningPolicy(env).mode,'azure');
 for(const endpoint of ['http://krc.codesigning.azure.net','https://codesigning.azure.net.attacker.test','https://user:pass@krc.codesigning.azure.net','https://krc.codesigning.azure.net/path'])assert.throws(()=>windowsSigningPolicy({...env,RESISTOR_AZURE_SIGN_ENDPOINT:endpoint}));
 assert(!JSON.stringify(signingPolicyIdentity('win32',env)).includes('Dlib'));
});

test('Mac verification rejects ad-hoc, another team, missing runtime or missing secure timestamp',async()=>{
 assert.equal(assertMacSignature(macDetails,mac).developer_id_signed,true);
 for(const details of ['Signature=adhoc',macDetails.replace('TeamIdentifier=ABCD123456','TeamIdentifier=OTHER12345'),macDetails.replace('(runtime)','(none)'),macDetails.replace('Timestamp=Nov 1, 2026 at 00:00:00','Timestamp=none')])assert.throws(()=>assertMacSignature(details,mac));
 const calls=[];await verifyMacSignature('/fixture.app',{policy:mac,execute:async(file,args)=>{calls.push({file,args});if(args.includes('--extract-certificates')){await writeFile(args[args.indexOf('--extract-certificates')+1]+'0',certificate);return '';}return args.includes('--display')?macDetails:'';}});
 assert(calls[0].args.includes('--test-requirement'));assert(calls[0].args.some(a=>a.includes('anchor apple generic')));
});

test('notarization flags require Accepted, staple validation and Gatekeeper, not submit success alone',async()=>{
 const fake=(status,assessment='accepted\nsource=Notarized Developer ID')=>{const calls=[];return {calls,execute:async(file,args)=>{calls.push(args.join(' '));if(args.includes('--extract-certificates')){await writeFile(args[args.indexOf('--extract-certificates')+1]+'0',certificate);return '';}if(args.includes('--display'))return macDetails;if(args.includes('notarytool'))return JSON.stringify({status,id:'12345678-1234-1234-1234-123456789abc'});if(file.endsWith('spctl'))return assessment;return '';}};};
 const accepted=fake('Accepted');const result=await notarizeMacApp('/fixture.app',{policy:mac,execute:accepted.execute});assert.equal(result.notarized,true);assert(accepted.calls.some(c=>c==='stapler validate /fixture.app'));
 for(const status of ['Invalid','In Progress','Rejected']){const rejected=fake(status);await assert.rejects(()=>notarizeMacApp('/fixture.app',{policy:mac,execute:rejected.execute}));assert(!rejected.calls.some(c=>c.startsWith('stapler')));}
 await assert.rejects(()=>notarizeMacApp('/fixture.app',{policy:mac,execute:fake('Accepted','rejected').execute}));
 const adhocCalls=[];const adhoc=await notarizeMacApp('/fixture.app',{policy:{mode:'adhoc'},execute:async(_file,args)=>{adhocCalls.push(args);return args.includes('--display')?'Signature=adhoc':'';}});assert.equal(adhoc.notarized,false);assert(!adhocCalls.some(args=>args.includes('notarytool')));
});

test('Windows publication signing evidence requires trust, publisher, timestamp and exact certificate',async()=>{
 assert(assertWindowsSignature(windowsDetails,windows));
 for(const patch of [{status:'NotTrusted'},{signature_type:'Catalog'},{publisher:'Other publisher'},{timestamp_thumbprint:''},{signer_thumbprint:'C'.repeat(40)}])assert.throws(()=>assertWindowsSignature({...windowsDetails,...patch},windows));
 const folder=await mkdtemp(path.join(os.tmpdir(),'resistor-signing-test-')),fixture=path.join(folder,'fixture.exe');await writeFile(fixture,'test binary fixture');
 const calls=[];const result=await verifyWindowsSignature(fixture,{platform:'win32',policy:windows,run:async(file,args)=>{calls.push([file,args]);return file==='powershell.exe'?JSON.stringify(windowsDetails):'Verified';}});assert.equal(result.authenticode_signed,true);assert(calls[1][1].includes('/pa'));assert.equal(result.sha256,createHash('sha256').update('test binary fixture').digest('hex'));
 assert(calls[0][1].at(-1).includes('[Console]::OutputEncoding=[System.Text.UTF8Encoding]'));assert.equal(result.publisher,'콜드브루 Test Fixture');
 await assert.rejects(()=>verifyWindowsSignature('/fixture.exe',{platform:'win32',policy:{mode:'none'},run:async()=>JSON.stringify(windowsDetails)}));
});

test('Windows installer hook does not rewrite the already QA-verified application executable',()=>{
 const base={win:{signAndEditExecutable:false},nsis:{deleteAppDataOnUninstall:false}},before=structuredClone(base);
 const disabled=windowsInstallerSigningConfig(base,{policy:{mode:'none'}});assert.equal(disabled.win.signExecutable,false);
 const signed=windowsInstallerSigningConfig(base,{policy:windows});assert.equal(signed.win.signAndEditExecutable,false);assert.equal(signed.win.signExecutable,true);assert.deepEqual(signed.win.signtoolOptions.signingHashAlgorithms,['sha256']);assert(signed.win.signtoolOptions.sign.endsWith('windows-sign-hook.cjs'));assert.deepEqual(base,before);
});

test('preflight exposes missing names and status only; hardened runtime retains JIT but no blanket disables',async()=>{
 const marker='private-fixture-value';const status=signingConfigurationStatus({RESISTOR_MAC_IDENTITY:marker,AZURE_CLIENT_SECRET:marker},'win32');assert(!JSON.stringify(status).includes(marker));assert.equal(status.trusted_signing_completed,false);assert(status.mac.missing_names.includes('RESISTOR_APPLE_TEAM_ID'));
 const entitlements=await readFile('apps/desktop/mac-entitlements.plist','utf8');assert(entitlements.includes('com.apple.security.cs.allow-jit'));for(const dangerous of ['disable-library-validation','allow-unsigned-executable-memory','get-task-allow','disable-executable-page-protection'])assert(!entitlements.includes(dangerous));
 assert.deepEqual(macEntitlementArguments('/App.app/Contents/Resources/app/native-runtime/python/bin/python3','/App.app','jit.plist'),[]);
 assert.deepEqual(macEntitlementArguments('/App.app/Contents/Frameworks/Helper.app','/App.app','jit.plist'),['--entitlements','jit.plist']);
});

const storeEnvironment={RESISTOR_WINDOWS_SIGNING:'store',RESISTOR_WINDOWS_PUBLISHER:'Private Fixture Publisher',RESISTOR_SIGNTOOL_PATH:path.resolve('fixture-sign-tool.exe'),RESISTOR_WINDOWS_CERT_SHA1:'A'.repeat(40)};
const inventory=selected=>JSON.stringify({current_user_count:1,local_machine_count:2,selected_current_user_available:selected});
test('trusted preflight requires the selected CurrentUser certificate and actual SignTool file, not other store counts',async()=>{
 const run=async()=>inventory(false);
 const otherStore=await signingPreflight({platform:'win32',env:storeEnvironment,run,fileExists:async()=>true});
 assert.equal(otherStore.windows.usable_code_signing_certificate_count,3);assert.equal(trustedSigningLocallyReady(otherStore),false);
 const noTool=await signingPreflight({platform:'win32',env:storeEnvironment,run:async()=>inventory(true),fileExists:async()=>false});
 assert.equal(noTool.windows.selected_current_user_certificate_available,true);assert.equal(trustedSigningLocallyReady(noTool),false);
 const ready=await signingPreflight({platform:'win32',env:storeEnvironment,run:async()=>inventory(true),fileExists:async()=>true});
 assert.equal(trustedSigningLocallyReady(ready),true);assert.equal(ready.windows.provider_authorization_checked,false);assert.equal(ready.windows.certificate_trust_checked,false);assert.equal(ready.trusted_signing_completed,false);
 for(const value of Object.values(storeEnvironment).slice(1))assert(!JSON.stringify(ready).includes(value));
});

test('unavailable or malformed certificate inspection cannot pass store preflight or disclose command failures',async()=>{
 for(const run of [async()=>{throw Error('private failure details');},async()=>'{invalid}',async()=>JSON.stringify({current_user_count:-1,local_machine_count:0,selected_current_user_available:true})]){
  const result=await signingPreflight({platform:'win32',env:storeEnvironment,run,fileExists:async()=>true});
  assert.equal(result.windows.certificate_inventory,'unavailable');assert.equal(trustedSigningLocallyReady(result),false);assert(!JSON.stringify(result).includes('private failure'));
 }
});

test('Azure preflight checks local Dlib but never mistakes local configuration for provider authorization',async()=>{
 const env={RESISTOR_WINDOWS_SIGNING:'azure',RESISTOR_WINDOWS_PUBLISHER:'Fixture',RESISTOR_SIGNTOOL_PATH:path.resolve('signtool.exe'),RESISTOR_AZURE_SIGN_ENDPOINT:'https://krc.codesigning.azure.net',RESISTOR_AZURE_SIGN_DLIB:path.resolve('dlib.dll'),RESISTOR_AZURE_SIGN_ACCOUNT:'fixture-account',RESISTOR_AZURE_SIGN_PROFILE:'fixture-profile'};
 const calls=[];const options={platform:'win32',env,run:async(file,args)=>{calls.push([file,args]);return JSON.stringify({current_user_count:0,local_machine_count:0,selected_current_user_available:false});}};
 const missing=await signingPreflight({...options,fileExists:async file=>file!==env.RESISTOR_AZURE_SIGN_DLIB});assert.equal(trustedSigningLocallyReady(missing),false);
 const ready=await signingPreflight({...options,fileExists:async()=>true});assert.equal(trustedSigningLocallyReady(ready),true);assert.equal(ready.windows.provider_authorization_checked,false);
 assert(calls.every(([file])=>file==='powershell.exe'));assert(!calls.some(([,args])=>args.includes('sign')));
});

test('Mac preflight requires the selected Developer ID and notarytool instead of any unrelated identity',async()=>{
 const env={RESISTOR_MAC_SIGNING:'developer-id',RESISTOR_MAC_IDENTITY:'A'.repeat(40),RESISTOR_APPLE_TEAM_ID:'ABCD123456',RESISTOR_NOTARY_PROFILE:'private-profile',RESISTOR_MAC_KEYCHAIN:path.resolve('private.keychain-db')};
 const execute=(identity,tool=true)=>async(file,args)=>{if(file.endsWith('security')){assert.equal(args.at(-1),env.RESISTOR_MAC_KEYCHAIN);return `1) ${identity} "Developer ID Application: Private Publisher (ABCD123456)"`;}
  assert.deepEqual(args,['--find','notarytool']);if(!tool)throw Error('missing tool');return '/private/developer/notarytool';};
 const wrong=await signingPreflight({platform:'darwin',env,run:execute('B'.repeat(40)),fileExists:async()=>true});assert.equal(wrong.mac.developer_id_identity_count,1);assert.equal(trustedSigningLocallyReady(wrong),false);
 const noTool=await signingPreflight({platform:'darwin',env,run:execute(env.RESISTOR_MAC_IDENTITY,false),fileExists:async()=>true});assert.equal(trustedSigningLocallyReady(noTool),false);
 const ready=await signingPreflight({platform:'darwin',env,run:execute(env.RESISTOR_MAC_IDENTITY),fileExists:async()=>true});assert.equal(trustedSigningLocallyReady(ready),true);assert.equal(ready.mac.notary_profile_authorization_checked,false);assert.equal(ready.notarization_completed,false);
 assert(!JSON.stringify(ready).includes('private'));assert.equal(trustedSigningLocallyReady(await signingPreflight({platform:'linux',env:{}})),false);
});
