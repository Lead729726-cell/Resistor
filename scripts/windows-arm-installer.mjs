import {access,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
export function windowsArmInstallerScript({edition,version,name,app,destination,basename,icon}){
  if(!['edu','indust'].includes(edition.edition)||name!==(edition.edition==='edu'?'Resistor Edu':'Resistor')||!/^\d+\.\d+\.\d+$/.test(version))throw Error('Invalid Windows ARM installer identity');
  const q=s=>'"'+s.replaceAll('"','""')+'"';
  return `[Setup]\nAppId=${edition.bundle_id}.arm64\nAppName=${edition.name}\nAppVersion=${version}\nAppPublisher=Resistor contributors\nAppPublisherURL=https://resistor.kr\nDefaultDirName={localappdata}\\Programs\\${name} ARM64\nDefaultGroupName=${edition.name} ARM64\nArchitecturesAllowed=arm64 and x64compatible\nArchitecturesInstallIn64BitMode=arm64\nMinVersion=10.0.22000\nPrivilegesRequired=lowest\nDisableProgramGroupPage=yes\nOutputDir=${destination}\nOutputBaseFilename=${basename}\nSetupIconFile=${icon}\nUninstallDisplayIcon={app}\\${name}.exe\nCompression=lzma2/fast\nSolidCompression=yes\nWizardStyle=modern\nCloseApplications=no\nRestartApplications=no\n\n[Files]\nSource: ${q(path.join(app,'*'))}; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs\n\n[Tasks]\nName: "desktopicon"; Description: "Create a desktop shortcut"; Flags: unchecked\n\n[Icons]\nName: "{autoprograms}\\${edition.name} ARM64"; Filename: "{app}\\${name}.exe"; WorkingDir: "{app}"; AppUserModelID: "${edition.bundle_id}"\nName: "{autodesktop}\\${edition.name} ARM64"; Filename: "{app}\\${name}.exe"; WorkingDir: "{app}"; Tasks: desktopicon\n\n[Run]\nFilename: "{app}\\${name}.exe"; Description: "Open ${edition.name}"; Flags: nowait postinstall skipifsilent\n`;
}
export async function buildWindowsArmInstaller(options){
  if(process.platform!=='win32'||process.arch!=='arm64')throw Error('Build this installer on a Windows ARM64 runner.');
  const candidates=[process.env['ProgramFiles(x86)'],process.env.ProgramFiles].filter(Boolean).map(dir=>path.join(dir,'Inno Setup 6','ISCC.exe'));
  let compiler;for(const file of candidates){try{await access(file);compiler=file;break;}catch(e){if(e.code!=='ENOENT')throw e;}}
  if(!compiler)throw Error('The native Windows ARM runner needs the official Inno Setup 6 compiler.');
  const script=path.resolve('.runtime/edition-arm64.iss');await writeFile(script,windowsArmInstallerScript({...options,icon:path.resolve('apps/desktop/assets/register.ico')}),'utf8');
  await new Promise((resolve,reject)=>{const c=spawn(compiler,['/Qp',script],{stdio:'inherit',windowsHide:true});c.once('error',reject);c.once('exit',code=>code===0?resolve():reject(Error('Inno compiler exited '+code)));});
  return {artifact:path.join(options.destination,options.basename+'.exe'),kind:'inno',default_directory:options.name+' ARM64'};
}
