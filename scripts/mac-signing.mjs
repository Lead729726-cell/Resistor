import {readFile,writeFile,mkdtemp,readdir,open} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {signableMachOHeader} from './native-package-options.mjs';
import {macSigningPolicy} from './signing-policy.mjs';
import {runSigningCommand as run} from './signing-command.mjs';

let signer;
async function linuxSigner(){
  if(process.platform!=='linux'||process.arch!=='x64')throw Error('Cross signing is pinned for the Linux x64 builder.');
  const name='apple-codesign-0.29.0-x86_64-unknown-linux-musl';
  const url=`https://github.com/indygreg/apple-platform-rs/releases/download/apple-codesign/0.29.0/${name}.tar.gz`;
  const response=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error(`Signing tool download failed (${response.status}).`);
  const bytes=Buffer.from(await response.arrayBuffer());
  if(createHash('sha256').update(bytes).digest('hex')!=='dbe85cedd8ee4217b64e9a0e4c2aef92ab8bcaaa41f20bde99781ff02e600002')throw Error('Signing tool checksum mismatch.');
  const temporary=await mkdtemp(path.join(os.tmpdir(),'register-signer-')),archive=path.join(temporary,'tool.tar.gz');
  await writeFile(archive,bytes);await run('tar',['-xzf',archive,'-C',temporary]);
  return path.join(temporary,name,'rcodesign');
}
export function assertMacSignature(details,policy){
  if(policy.mode==='adhoc'){if(!/^Signature=adhoc$/m.test(details))throw Error('Expected an ad-hoc Mac signature.');return {ad_hoc_signed:true,developer_id_signed:false,hardened_runtime:false,notarized:false};}
  if(!/^Authority=Developer ID Application:/m.test(details)||!new RegExp('^TeamIdentifier='+policy.team_id+'$','m').test(details)||!/^CodeDirectory .*flags=.*\(.*runtime.*\)/m.test(details)||!/^Timestamp=(?!none|not set).+/im.test(details))throw Error('Mac signature requires the expected Developer ID team, hardened runtime and secure timestamp.');
  return {ad_hoc_signed:false,developer_id_signed:true,hardened_runtime:true,notarized:false,team_id:policy.team_id,secure_timestamp:details.match(/^Timestamp=(.+)$/m)[1],authority:details.match(/^Authority=(Developer ID Application:.+)$/m)[1]};
}
export async function verifyMacSignature(app,{policy=macSigningPolicy(),execute=run}={}){
  const requirement=policy.mode==='developer-id'?['--test-requirement','anchor apple generic and certificate leaf[field.1.2.840.113635.100.6.1.13] exists and certificate leaf[subject.OU] = "'+policy.team_id+'"']:[];
  await execute('/usr/bin/codesign',['--verify','--deep','--strict','--verbose=2',...requirement,app]);
  const result=assertMacSignature(await execute('/usr/bin/codesign',['--display','--verbose=4',app]),policy);
  if(policy.mode==='developer-id'){
    const directory=await mkdtemp(path.join(os.tmpdir(),'resistor-certificate-')),prefix=path.join(directory,'codesign');
    await execute('/usr/bin/codesign',['--display','--extract-certificates',prefix,app]);
    const fingerprint=createHash('sha1').update(await readFile(prefix+'0')).digest('hex').toUpperCase();
    if(fingerprint!==policy.identity.toUpperCase())throw Error('Mac signing certificate does not match the selected identity.');
    result.signer_thumbprint=fingerprint;result.apple_chain_verified=true;
  }
  return {...result,checked_at:new Date().toISOString()};
}
export function macEntitlementArguments(file,app,entitlements){
  const runtime=path.resolve(app,'Contents/Resources/app/native-runtime')+path.sep;
  return path.resolve(file).startsWith(runtime)?[]:['--entitlements',entitlements];
}
export async function signMacApp(app){
  const policy=macSigningPolicy();
  const entitlements=path.resolve('apps/desktop/mac-entitlements.plist');await readFile(entitlements);
  if(process.platform==='darwin'){
    if(policy.mode==='developer-id'){
      const identities=await run('/usr/bin/security',['find-identity','-v','-p','codesigning',...(policy.keychain?[policy.keychain]:[])]);
      if(!identities.split('\n').some(line=>line.toUpperCase().includes(policy.identity.toUpperCase())&&line.includes('Developer ID Application:')))throw Error('The selected Developer ID Application private key is not available in the keychain.');
    }
    // codesign --deep does not necessarily sign loose embedded dylibs.
    // Sign actual Mach-O leaves first, then seal helpers/frameworks/app.
    const binaries=[],bundles=[];
    async function walk(folder){for(const item of await readdir(folder,{withFileTypes:true})){const file=path.join(folder,item.name);if(item.isDirectory()){await walk(file);if(/\.(app|framework)$/.test(item.name))bundles.push(file);}else if(item.isFile()){const handle=await open(file,'r');try{const bytes=Buffer.alloc(16),{bytesRead}=await handle.read(bytes,0,16,0);if(signableMachOHeader(bytes.subarray(0,bytesRead)))binaries.push(file);}finally{await handle.close();}}}}
    await walk(app);
    const deepestFirst=(a,b)=>b.split(path.sep).length-a.split(path.sep).length||a.localeCompare(b);
    const flags=policy.mode==='developer-id'?['--sign',policy.identity,'--options','runtime','--timestamp',...(policy.keychain?['--keychain',policy.keychain]:[])]:['--sign','-','--timestamp=none'];
    for(const file of [...binaries.sort(deepestFirst),...bundles.sort(deepestFirst),app])await run('/usr/bin/codesign',['--force',...flags,...macEntitlementArguments(file,app,entitlements),file]);
    return {...await verifyMacSignature(app,{policy}),signing_tool:'macOS codesign'};
  }else{
    if(policy.mode!=='adhoc')throw Error('Developer ID signing/notarization requires a native Mac host.');
    signer??=linuxSigner();
    await run(await signer,['--config-file','/dev/null','sign','--timestamp-url','none','--entitlements-xml-file',entitlements,'--entitlements-xml-file',`Contents/Frameworks/Resistor Helper.app:${entitlements}`,'--entitlements-xml-file',`Contents/Frameworks/Resistor Helper (GPU).app:${entitlements}`,'--entitlements-xml-file',`Contents/Frameworks/Resistor Helper (Renderer).app:${entitlements}`,'--entitlements-xml-file',`Contents/Frameworks/Resistor Helper (Plugin).app:${entitlements}`,app]);
  }
  return {ad_hoc_signed:true,hardened_runtime:false,developer_id_signed:false,notarized:false,signing_tool:process.platform==='darwin'?'macOS codesign':'apple-codesign 0.29.0'};
}
export async function verifyNotarizedMacApp(app,{policy=macSigningPolicy(),execute=run}={}){
  const signed=await verifyMacSignature(app,{policy,execute});
  if(!signed.developer_id_signed)throw Error('Notarized verification requires Developer ID.');
  await execute('/usr/bin/xcrun',['stapler','validate',app]);
  const assessment=await execute('/usr/sbin/spctl',['--assess','--type','execute','--verbose=2',app]);
  if(!/accepted/i.test(assessment)||!assessment.includes('source=Notarized Developer ID'))throw Error('Gatekeeper did not confirm Notarized Developer ID.');
  return {...signed,notarized:true,stapled:true,gatekeeper_assessment:'accepted',checked_at:new Date().toISOString()};
}
export async function notarizeMacApp(app,{policy=macSigningPolicy(),execute=run}={}){
  const signed=await verifyMacSignature(app,{policy,execute});if(policy.mode==='adhoc')return signed;
  const directory=await mkdtemp(path.join(os.tmpdir(),'resistor-notary-')),archive=path.join(directory,'submission.zip');
  await execute('/usr/bin/ditto',['-c','-k','--keepParent',app,archive]);
  const response=JSON.parse(await execute('/usr/bin/xcrun',['notarytool','submit',archive,'--keychain-profile',policy.notary_profile,...(policy.keychain?['--keychain',policy.keychain]:[]),'--wait','--timeout','45m','--output-format','json'],{timeout:48*60*1000}));
  if(response.status!=='Accepted'||!/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/.test(response.id??''))throw Error('Apple notarization has not returned Accepted; no notarized release will be produced.');
  await execute('/usr/bin/xcrun',['stapler','staple',app]);
  return {...await verifyNotarizedMacApp(app,{policy,execute}),notarization_status:'Accepted',notarization_submission_id:response.id};
}
