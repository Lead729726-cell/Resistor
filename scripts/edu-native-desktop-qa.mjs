// Actual packaged Edu app QA. A short-lived operator QA serial is required;
// there is no test-only activation bypass in the app or license client.
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {_electron as electron} from '@playwright/test';
import {eduNativePaths} from './edu-native-options.mjs';
import {stopNativeWorker} from './native-worker.mjs';
import {runtimeConfig} from './runtime.mjs';
import {createHash} from 'node:crypto';
import {desktopQaDiagnostics,redactDesktopQaText} from './edu-native-diagnostics.mjs';
import {inspectEduDesktopSession} from './edu-native-desktop-flow.mjs';

const root=process.cwd(),version=JSON.parse(await readFile('package.json','utf8')).version,paths=eduNativePaths(root,version);
const serial=process.env.RESISTOR_EDU_QA_SERIAL;
if(typeof serial!=='string'||!/^RS1-(?:[A-F0-9]{8}-){4}[A-F0-9]{8}$/.test(serial))throw Error('Provide a short-lived operator QA serial in RESISTOR_EDU_QA_SERIAL. Do not use a buyer serial.');
await mkdir('.runtime/edu-native-qa',{recursive:true});
const directory=await mkdtemp(path.join(root,'.runtime/edu-native-qa',paths.target+'-')),workspace=path.join(directory,'workspace');await mkdir(workspace);
const state=JSON.parse(await readFile(path.join(paths.output,paths.basename+'.build-state.json'),'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const report={edition:'edu',product_id:'resistor.edu',version,target:paths.target,source_revision:state.source_revision,packaged_executable_sha256:hash(await readFile(paths.executable)),runtime_manifest_sha256:hash(await readFile(path.join(paths.resources,'native-runtime/manifest.json'))),verification_method:'automated-electron',checked_at:new Date().toISOString(),activation_checked:false,edition_title:null,window_loaded:false,license_required_before_activation:false,engine_rpc_checked:false,lease_released:false};
let app,window,activated=false,primaryError;
const storageStatus=()=>app.evaluate(({safeStorage})=>({selected_backend:process.platform==='linux'?safeStorage.getSelectedStorageBackend():process.platform,encryption_available:safeStorage.isEncryptionAvailable()}));
try{
 const env={...process.env,RESISTOR_EDITION:'edu',REGISTER_USER_DATA:path.join(directory,'profile'),MOS_WORKSPACE:workspace,REGISTER_ENGINE_MODE:'native'};
 delete env.RESISTOR_EDU_QA_SERIAL;delete env.MOS_DEV_URL;delete env.REGISTER_NATIVE_QA;delete env.DEBUG;delete env.PWDEBUG;
 const gnomeQa=process.platform==='linux'&&process.env.RESISTOR_EDU_QA_GNOME_KEYRING==='1';
 app=await electron.launch({executablePath:paths.executable,env,args:gnomeQa?['--password-store=gnome-libsecret']:[],timeout:60000});window=await app.firstWindow();
 await window.getByRole('heading',{name:'Resistor Edu 시리얼 인증',exact:true}).waitFor({timeout:30000});
 report.storage=desktopQaDiagnostics({storage:await storageStatus()}).storage;
 assert.equal(report.storage.encryption_available,true,'The operating-system encrypted key store is unavailable.');
 assert.notEqual(report.storage.selected_backend,'basic_text','Plaintext storage is not an official activation backend.');
 if(gnomeQa)assert.equal(report.storage.selected_backend,'gnome_libsecret','Linux CI must use the unlocked Secret Service keyring.');
 const initial=await window.evaluate(()=>window.mos.rpc('license.status',{}));assert.equal(initial.ok,true);assert.equal(initial.result.authorized,false);assert.equal(initial.result.edition,'edu');
 const blocked=await window.evaluate(()=>window.mos.rpc('project.list',{}));assert.equal(blocked.ok,false);assert.equal(blocked.error.code,'LICENSE_REQUIRED');report.license_required_before_activation=true;
 await window.getByLabel('구매 시 받은 시리얼 코드',{exact:true}).fill(serial);await window.getByRole('button',{name:'이 기기 인증',exact:true}).click();
 Object.assign(report,await inspectEduDesktopSession(window));activated=true;
 const doctor=await window.evaluate(()=>window.mos.rpc('toolchain.doctor',{}));assert.equal(doctor.ok,true,doctor.error?.message);assert.equal(doctor.result.runner,'native-'+process.platform);assert.equal(doctor.result.runtime_image,null);assert(doctor.result.tools.find(t=>t.name==='ngspice')?.available);report.engine_rpc_checked=true;
 await window.screenshot({path:path.join(directory,'activated-edu.png')});
}catch(error){
 primaryError=error;
 const [license,storage,alerts]=await Promise.allSettled([
  window?window.evaluate(()=>window.mos.rpc('license.status',{})):Promise.resolve(null),
  app?storageStatus():Promise.resolve(null),
  window?window.locator('.license-card [role="alert"]').allTextContents():Promise.resolve([])
 ]);
 report.failure=desktopQaDiagnostics({licenseResponse:license.status==='fulfilled'?license.value:null,storage:storage.status==='fulfilled'?storage.value:null,alerts:alerts.status==='fulfilled'?alerts.value:[],error:String(error?.message??error)},[serial]);
 console.error(JSON.stringify({target:paths.target,desktop_qa:'failed',diagnostics:report.failure}));
}
finally{
 if(window)try{const current=await window.evaluate(()=>window.mos.rpc('license.status',{}));if(current.ok&&current.result.authorized){const released=await window.evaluate(()=>window.mos.rpc('license.deactivate',{}));assert.equal(released.ok,true);assert.equal(released.result.authorized,false);report.lease_released=true;}else report.lease_released=!activated;}catch(error){primaryError??=error;}
 if(app)await app.close().catch(error=>{primaryError??=error;});
 try{await runtimeConfig(workspace);await stopNativeWorker(workspace);}catch{/* Only this isolated QA workspace is inspected. */}
 await mkdir(paths.output,{recursive:true});await writeFile(path.join(paths.output,paths.basename+'.desktop-qa.json'),JSON.stringify(report,null,2)+'\n');
}
if(primaryError){
 // Playwright action errors may echo the fill argument. Never expose the QA serial.
 const safeError=new Error(redactDesktopQaText(String(primaryError?.message??primaryError),[serial]));
 safeError.stack=redactDesktopQaText(String(primaryError?.stack??safeError.stack),[serial]);throw safeError;
}
console.log(JSON.stringify({target:paths.target,desktop_qa:'passed',production_activation:true,qa_seat_released:report.lease_released}));
