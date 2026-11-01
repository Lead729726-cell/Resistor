import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {macSigningPolicy,windowsSigningPolicy} from './signing-policy.mjs';
import {runSigningCommand} from './signing-command.mjs';
export function signingConfigurationStatus(env=process.env,platform=process.platform){
 const mac=['RESISTOR_MAC_IDENTITY','RESISTOR_APPLE_TEAM_ID','RESISTOR_NOTARY_PROFILE'];
 const windows=['RESISTOR_WINDOWS_PUBLISHER','RESISTOR_SIGNTOOL_PATH',...(env.RESISTOR_WINDOWS_SIGNING==='store'?['RESISTOR_WINDOWS_CERT_SHA1']:['RESISTOR_AZURE_SIGN_ENDPOINT','RESISTOR_AZURE_SIGN_DLIB','RESISTOR_AZURE_SIGN_ACCOUNT','RESISTOR_AZURE_SIGN_PROFILE'])];
 const status=(keys,read,enabled)=>{let valid=true;try{read(env);}catch{valid=false;}return {enabled,configuration_valid:valid,missing_names:keys.filter(key=>!env[key]),provider_authorization_checked:false};};
 return {schema_version:1,platform,mac:status(mac,macSigningPolicy,env.RESISTOR_MAC_SIGNING==='developer-id'),windows:status(windows,windowsSigningPolicy,['store','azure'].includes(env.RESISTOR_WINDOWS_SIGNING)),trusted_signing_completed:false,notarization_completed:false,note:'Reports names/counts only. Does not enroll, purchase, import credentials, submit a binary, or perform paid signing.'};
}
export async function signingPreflight(){
 const result=signingConfigurationStatus();
 if(process.platform==='win32'){
  try{const count=await runSigningCommand('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Import-Module (Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/Modules/Microsoft.PowerShell.Security') -ErrorAction Stop; @(Get-ChildItem Cert:/CurrentUser/My,Cert:/LocalMachine/My -ErrorAction Stop | Where-Object { $_.HasPrivateKey -and $_.NotAfter -gt (Get-Date) -and $_.EnhancedKeyUsageList.ObjectId -contains '1.3.6.1.5.5.7.3.3' }).Count"]);if(!/^\d+$/.test(count.trim()))throw Error('Unexpected certificate count');result.windows.usable_code_signing_certificate_count=Number(count.trim());}catch{result.windows.certificate_inventory='unavailable';}
 }
 if(process.platform==='darwin'){
  try{const identities=await runSigningCommand('/usr/bin/security',['find-identity','-v','-p','codesigning']);result.mac.developer_id_identity_count=identities.split('\n').filter(line=>line.includes('Developer ID Application:')).length;}catch{result.mac.certificate_inventory='unavailable';}
 }
 return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=await signingPreflight();console.log(JSON.stringify(result,null,2));
 if(process.argv.includes('--require-trusted')&&((process.platform==='darwin'&&(!result.mac.enabled||!result.mac.configuration_valid||result.mac.missing_names.length||!result.mac.developer_id_identity_count))||(process.platform==='win32'&&(!result.windows.enabled||!result.windows.configuration_valid||result.windows.missing_names.length))))process.exitCode=1;
}
