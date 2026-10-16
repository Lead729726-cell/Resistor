import assert from 'node:assert/strict';
import {readFile,readdir,mkdir,mkdtemp,writeFile,cp,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {verifyEditionPackage} from './edition-native-qa.mjs';
import {getProductEdition} from './edition-workspace.mjs';
const run=(exe,args,env=process.env)=>new Promise((resolve,reject)=>{const child=spawn(exe,args,{stdio:'inherit',env,windowsHide:true});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(exe+' exited '+code)));});
const edition=getProductEdition(),target=(process.platform==='win32'?'windows':process.platform==='darwin'?'macos':'linux')+'-'+process.arch;
const input=path.resolve(process.argv[2]||'.runtime/installer-input'),output=path.resolve('.runtime/verified-installers');await mkdir(output,{recursive:true});
const files=[];async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())await walk(p);else files.push(p);}}await walk(input);
const receiptPath=files.find(p=>path.basename(p).startsWith('Resistor-'+(edition.edition==='edu'?'Edu':'Indust')+'-')&&p.endsWith('-'+target+'.json'));assert(receiptPath,'Missing installer build receipt');
const receipt=JSON.parse(await readFile(receiptPath,'utf8'));assert.equal(receipt.product_id,edition.id);assert.equal(receipt.native_qa.completed,true);assert(receipt.native_qa.checks.every(c=>c.pass));
const artifact=files.find(p=>path.basename(p)===receipt.file);assert(artifact,'Missing installer artifact');const bytes=await readFile(artifact);assert.equal(bytes.length,receipt.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),receipt.sha256);
await mkdir('.runtime/installer-execution',{recursive:true});const workspace=await mkdtemp(path.resolve('.runtime/installer-execution/'+edition.edition+'-')),name=edition.edition==='edu'?'Resistor Edu':'Resistor';
let installed;
if(process.platform==='win32'){
  // Use a fresh disposable runner's normal per-user installation path. This
  // exercises the download's default install rather than an NSIS /D parser.
  if(process.env.GITHUB_ACTIONS!=='true'||!process.env.LOCALAPPDATA)throw Error('Windows installer execution requires a disposable CI runner.');
  const inno=receipt.installer_kind==='inno';if(inno)assert.equal(receipt.default_directory,name+' ARM64');
  installed=path.join(process.env.LOCALAPPDATA,'Programs',inno?receipt.default_directory:name);
  try{await access(installed);throw Error('Refusing to replace an existing user installation during QA.');}catch(e){if(e.code!=='ENOENT')throw e;}
  // On Windows wait for the installer and all descendant processes.
  const log=path.join(workspace,'setup.log');
  try{
    await run('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',"$installerProcess = Start-Process -FilePath $env:RESISTOR_QA_INSTALLER -ArgumentList $env:RESISTOR_QA_INSTALL_ARGS -WindowStyle Hidden -Wait -PassThru; if ($installerProcess.ExitCode -ne 0) { exit $installerProcess.ExitCode }"],{...process.env,RESISTOR_QA_INSTALLER:artifact,RESISTOR_QA_INSTALL_ARGS:inno?'/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP- /LOG="'+log+'"':'/S'});
    await access(path.join(installed,name+'.exe'));
  }catch(e){console.error((await readFile(log,'utf8').catch(()=>'' )).slice(-6000));throw e;}
}else{
  const extracted=path.join(workspace,'extracted'),qaHome=path.join(workspace,'user');await mkdir(extracted);await mkdir(qaHome);
  if(process.platform==='darwin')await run('/usr/bin/ditto',['-x','-k',artifact,extracted]);else await run('tar',['-xzf',artifact,'-C',extracted]);
  const bundle=process.platform==='darwin'?extracted:path.join(extracted,path.basename(artifact,'.tar.gz'));
  const helper=path.join(bundle,process.platform==='darwin'?'Install '+edition.name+'.command':'install.sh');
  await run(process.platform==='darwin'?'/bin/zsh':'/bin/sh',[helper],{...process.env,HOME:qaHome});
  installed=process.platform==='darwin'?path.join(qaHome,'Applications',name+'.app'):path.join(qaHome,'.local/opt/resistor-'+edition.edition,receipt.version);
  if(process.platform==='darwin')await run('/usr/bin/codesign',['--verify','--deep','--strict',installed]);
  else assert.match(await readFile(path.join(qaHome,'.local/share/applications',edition.bundle_id+'.desktop'),'utf8'),new RegExp('Name='+edition.name));
}
process.env.RESISTOR_SOURCE_REVISION=receipt.source_revision;
const app=process.platform==='darwin',resources=path.join(installed,app?'Contents/Resources/app':'resources/app'),executable=path.join(installed,app?'Contents/MacOS/'+name:name+(process.platform==='win32'?'.exe':''));
const qa=await verifyEditionPackage({executable,resources});assert.equal(qa.completed,true);
receipt.installation_qa={completed:true,platform:process.platform,arch:process.arch,checked_at:new Date().toISOString(),method:process.platform==='win32'?(receipt.installer_kind==='inno'?'Inno per-user default install':'NSIS per-user default install'):app?'Extracted ZIP and bundled command helper':'Extracted tar.gz and bundled shell helper',app_execution:qa};
await cp(artifact,path.join(output,receipt.file));await writeFile(path.join(output,path.basename(receiptPath)),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({edition:edition.edition,target,installer_executed:true,installed_app_qa:true}));
