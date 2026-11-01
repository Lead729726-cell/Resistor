import {readFile,writeFile,mkdtemp,appendFile,access} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {windowsSigningPolicy} from './signing-policy.mjs';
import {runSigningCommand} from './signing-command.mjs';

export function assertWindowsSignature(result,policy){
 if(result?.status!=='Valid'||result.signature_type!=='Authenticode'||result.publisher!==policy.publisher||!/^[A-F0-9]{40}$/i.test(result.timestamp_thumbprint??'')||!/^[A-F0-9]{40}$/i.test(result.signer_thumbprint??'')||(policy.thumbprint&&result.signer_thumbprint.toUpperCase()!==policy.thumbprint))throw Error('Windows signature is not a trusted, timestamped signature from the configured publisher.');
 return true;
}
const inspectScript=`$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); Import-Module (Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/Modules/Microsoft.PowerShell.Security') -ErrorAction Stop; $s=Get-AuthenticodeSignature -LiteralPath $env:RESISTOR_SIGNATURE_FILE; [ordered]@{status=[string]$s.Status; signature_type=[string]$s.SignatureType; publisher=$(if($s.SignerCertificate){$s.SignerCertificate.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName,$false)}else{''}); signer_thumbprint=$(if($s.SignerCertificate){$s.SignerCertificate.Thumbprint}else{''}); timestamp_thumbprint=$(if($s.TimeStamperCertificate){$s.TimeStamperCertificate.Thumbprint}else{''})} | ConvertTo-Json -Compress`;
export async function verifyWindowsSignature(file,{policy=windowsSigningPolicy(),run=runSigningCommand,platform=process.platform}={}){
 if(platform!=='win32')throw Error('Authenticode verification requires the native Windows host.');
 const result=JSON.parse(await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',inspectScript],{env:{...process.env,RESISTOR_SIGNATURE_FILE:path.resolve(file)}}));
 if(policy.mode==='none'){if(result.status!=='NotSigned')throw Error('Unexpected signing state in an unsigned release. Select and verify the intended signing policy.');return {authenticode_signed:false,verification:'NotSigned'};}
 await run(policy.signtool,['verify','/pa','/all','/v',path.resolve(file)]);assertWindowsSignature(result,policy);
 return {authenticode_signed:true,verification:'Valid',publisher:result.publisher,signer_thumbprint:result.signer_thumbprint,timestamp_thumbprint:result.timestamp_thumbprint,sha256:createHash('sha256').update(await readFile(file)).digest('hex'),checked_at:new Date().toISOString()};
}
export async function signWindowsFile(file,{policy=windowsSigningPolicy(),run=runSigningCommand,platform=process.platform}={}){
 if(policy.mode==='none')return verifyWindowsSignature(file,{policy,run,platform});
 if(platform!=='win32')throw Error('Trusted Windows signing requires the native Windows host.');
 await access(policy.signtool);const args=['sign','/fd','SHA256','/tr',policy.timestamp,'/td','SHA256'];
 if(policy.mode==='store')args.push('/sha1',policy.thumbprint,'/s','My');
 else{
  await access(policy.dlib);const directory=await mkdtemp(path.join(os.tmpdir(),'resistor-signing-')),metadata=path.join(directory,'metadata.json');
  await writeFile(metadata,JSON.stringify({Endpoint:policy.endpoint,CodeSigningAccountName:policy.account,CertificateProfileName:policy.profile}),{mode:0o600});args.push('/dlib',policy.dlib,'/dmdf',metadata);
 }
 args.push(path.resolve(file));await run(policy.signtool,args);const evidence=await verifyWindowsSignature(file,{policy,run,platform});
 if(process.env.RESISTOR_WINDOWS_SIGN_AUDIT_FILE)await appendFile(process.env.RESISTOR_WINDOWS_SIGN_AUDIT_FILE,JSON.stringify({file:path.basename(file),sha256:createHash('sha256').update(await readFile(file)).digest('hex'),...evidence})+'\n');
 return evidence;
}
export function windowsInstallerSigningConfig(base,{policy=windowsSigningPolicy(),root=process.cwd()}={}){
 const config=structuredClone(base);config.win={...config.win,signAndEditExecutable:false,signExecutable:policy.mode!=='none'};
 if(policy.mode!=='none')config.win.signtoolOptions={sign:path.join(root,'scripts/windows-sign-hook.cjs'),signingHashAlgorithms:['sha256'],publisherName:policy.publisher};
 return config;
}
