import path from 'node:path';

const value=(env,key)=>typeof env[key]==='string'?env[key].trim():'';
const required=(env,key,pattern)=>{const text=value(env,key);if(!text||/[\r\n\0]/.test(text)||(pattern&&!pattern.test(text)))throw Error('Missing or invalid signing configuration: '+key);return text;};
export function macSigningPolicy(env=process.env){
 const mode=value(env,'RESISTOR_MAC_SIGNING')||'adhoc';
 if(!['adhoc','developer-id'].includes(mode))throw Error('RESISTOR_MAC_SIGNING must be adhoc or developer-id.');
 if(mode==='adhoc')return {mode};
 const keychain=value(env,'RESISTOR_MAC_KEYCHAIN');
 if(keychain&&!path.isAbsolute(keychain))throw Error('RESISTOR_MAC_KEYCHAIN must be an absolute keychain path.');
 return {mode,identity:required(env,'RESISTOR_MAC_IDENTITY',/^[a-f0-9]{40}$/i),team_id:required(env,'RESISTOR_APPLE_TEAM_ID',/^[A-Z0-9]{10}$/),notary_profile:required(env,'RESISTOR_NOTARY_PROFILE',/^[\w.-]{1,100}$/),...(keychain?{keychain}:{})};
}
export function windowsSigningPolicy(env=process.env){
 const mode=value(env,'RESISTOR_WINDOWS_SIGNING')||'none';
 if(!['none','store','azure'].includes(mode))throw Error('RESISTOR_WINDOWS_SIGNING must be none, store or azure.');
 if(mode==='none')return {mode};
 const common={mode,publisher:required(env,'RESISTOR_WINDOWS_PUBLISHER'),signtool:required(env,'RESISTOR_SIGNTOOL_PATH')};
 if(!path.isAbsolute(common.signtool))throw Error('RESISTOR_SIGNTOOL_PATH must identify an installed SignTool executable.');
 if(mode==='store')return {...common,thumbprint:required(env,'RESISTOR_WINDOWS_CERT_SHA1',/^[a-f0-9]{40}$/i).toUpperCase(),timestamp:'https://timestamp.digicert.com'};
 const endpoint=required(env,'RESISTOR_AZURE_SIGN_ENDPOINT',/^https:\/\/[a-z0-9-]+\.codesigning\.azure\.net\/?$/),dlib=required(env,'RESISTOR_AZURE_SIGN_DLIB');
 if(!path.isAbsolute(dlib))throw Error('RESISTOR_AZURE_SIGN_DLIB must identify the installed Microsoft signing client.');
 return {...common,endpoint,dlib,account:required(env,'RESISTOR_AZURE_SIGN_ACCOUNT',/^[a-zA-Z0-9-]{3,64}$/),profile:required(env,'RESISTOR_AZURE_SIGN_PROFILE',/^[a-zA-Z0-9-]{1,100}$/),timestamp:'http://timestamp.acs.microsoft.com'};
}
export function signingPolicyIdentity(platform,env=process.env){
 if(platform==='darwin'){const p=macSigningPolicy(env);return p.mode==='adhoc'?p:{mode:p.mode,identity:p.identity.toUpperCase(),team_id:p.team_id};}
 if(platform==='win32'){const p=windowsSigningPolicy(env);return p.mode==='none'?p:{mode:p.mode,publisher:p.publisher,...(p.thumbprint?{thumbprint:p.thumbprint}:{endpoint:p.endpoint,account:p.account,profile:p.profile})};}
 return {mode:'none'};
}
