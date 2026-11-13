import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {stat} from 'node:fs/promises';
import {macSigningPolicy,windowsSigningPolicy} from './signing-policy.mjs';
import {runSigningCommand} from './signing-command.mjs';
export function signingConfigurationStatus(env=process.env,platform=process.platform){
 const mac=['RESISTOR_MAC_IDENTITY','RESISTOR_APPLE_TEAM_ID','RESISTOR_NOTARY_PROFILE'];
 const windows=['RESISTOR_WINDOWS_PUBLISHER','RESISTOR_SIGNTOOL_PATH',...(env.RESISTOR_WINDOWS_SIGNING==='store'?['RESISTOR_WINDOWS_CERT_SHA1']:['RESISTOR_AZURE_SIGN_ENDPOINT','RESISTOR_AZURE_SIGN_DLIB','RESISTOR_AZURE_SIGN_ACCOUNT','RESISTOR_AZURE_SIGN_PROFILE'])];
 const status=(keys,read,enabled)=>{let valid=true;try{read(env);}catch{valid=false;}return {enabled,configuration_valid:valid,missing_names:keys.filter(key=>!env[key]),provider_authorization_checked:false};};
 return {schema_version:1,platform,mac:status(mac,macSigningPolicy,env.RESISTOR_MAC_SIGNING==='developer-id'),windows:status(windows,windowsSigningPolicy,['store','azure'].includes(env.RESISTOR_WINDOWS_SIGNING)),trusted_signing_completed:false,notarization_completed:false,note:'Reports names/counts only. Does not enroll, purchase, import credentials, submit a binary, or perform paid signing.'};
}
const isFile=async file=>{try{return typeof file==='string'&&(await stat(file)).isFile();}catch{return false;}};
const certificateInventoryScript=`$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); Import-Module (Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/Modules/Microsoft.PowerShell.Security') -ErrorAction Stop; $now=Get-Date; $eligible={ $_.HasPrivateKey -and $_.NotBefore -le $now -and $_.NotAfter -gt $now -and $_.EnhancedKeyUsageList.ObjectId -contains '1.3.6.1.5.5.7.3.3' }; $current=@(Get-ChildItem Cert:/CurrentUser/My -ErrorAction Stop | Where-Object $eligible); $machine=@(Get-ChildItem Cert:/LocalMachine/My -ErrorAction Stop | Where-Object $eligible); [ordered]@{current_user_count=$current.Count; local_machine_count=$machine.Count; selected_current_user_available=[bool]($env:RESISTOR_WINDOWS_CERT_SHA1 -and @($current | Where-Object Thumbprint -eq $env:RESISTOR_WINDOWS_CERT_SHA1).Count -gt 0)} | ConvertTo-Json -Compress`;
export function trustedSigningLocallyReady(result){
 return (result.platform==='win32'?result.windows:result.platform==='darwin'?result.mac:null)?.local_prerequisites_ready===true;
}
export async function signingPreflight({env=process.env,platform=process.platform,run=runSigningCommand,fileExists=isFile}={}){
 const result=signingConfigurationStatus(env,platform);
 if(platform==='win32'){
  let policy;try{policy=windowsSigningPolicy(env);}catch{}
  result.windows.tools={signtool_available:await fileExists(policy?.signtool),...(policy?.mode==='azure'?{azure_dlib_available:await fileExists(policy.dlib)}:{})};
  result.windows.certificate_trust_checked=false;result.windows.private_key_access_checked=false;
  try{
   const inventory=JSON.parse(await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',certificateInventoryScript],{env:{...env,RESISTOR_WINDOWS_CERT_SHA1:policy?.thumbprint??''}}));
   if(![inventory.current_user_count,inventory.local_machine_count].every(n=>Number.isSafeInteger(n)&&n>=0)||typeof inventory.selected_current_user_available!=='boolean')throw Error('Invalid certificate metadata');
   result.windows.certificate_inventory='available';
   result.windows.current_user_code_signing_certificate_count=inventory.current_user_count;
   result.windows.local_machine_code_signing_certificate_count=inventory.local_machine_count;
   result.windows.usable_code_signing_certificate_count=inventory.current_user_count+inventory.local_machine_count;
   result.windows.selected_current_user_certificate_available=inventory.selected_current_user_available;
  }catch{result.windows.certificate_inventory='unavailable';result.windows.selected_current_user_certificate_available=false;}
  result.windows.local_prerequisites_ready=result.windows.enabled&&result.windows.configuration_valid&&!result.windows.missing_names.length&&result.windows.tools.signtool_available&&(policy?.mode==='azure'?result.windows.tools.azure_dlib_available:result.windows.selected_current_user_certificate_available);
 }
 if(platform==='darwin'){
  let policy;try{policy=macSigningPolicy(env);}catch{}
  const [codesign,security,xcrun]=await Promise.all(['/usr/bin/codesign','/usr/bin/security','/usr/bin/xcrun'].map(file=>fileExists(file)));
  result.mac.tools={codesign_available:codesign,security_available:security,xcrun_available:xcrun,notarytool_available:false};
  result.mac.notary_profile_authorization_checked=false;
  try{
   const identities=await run('/usr/bin/security',['find-identity','-v','-p','codesigning',...(policy?.keychain?[policy.keychain]:[])]);
   const developerIds=identities.split('\n').filter(line=>line.includes('Developer ID Application:'));
   result.mac.certificate_inventory='available';result.mac.developer_id_identity_count=developerIds.length;
   result.mac.selected_identity_available=Boolean(policy?.identity&&developerIds.some(line=>new RegExp('\\b'+policy.identity+'\\b','i').test(line)));
  }catch{result.mac.certificate_inventory='unavailable';result.mac.selected_identity_available=false;}
  try{if(xcrun){await run('/usr/bin/xcrun',['--find','notarytool']);result.mac.tools.notarytool_available=true;}}catch{}
  result.mac.local_prerequisites_ready=result.mac.enabled&&result.mac.configuration_valid&&!result.mac.missing_names.length&&result.mac.selected_identity_available&&Object.values(result.mac.tools).every(value=>value===true);
 }
 return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=await signingPreflight();console.log(JSON.stringify(result,null,2));
 if(process.argv.includes('--require-trusted')&&!trustedSigningLocallyReady(result))process.exitCode=1;
}
