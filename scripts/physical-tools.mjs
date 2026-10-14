import {readFile,writeFile,mkdir,access,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {runNative} from './native-worker.mjs';
import {wslDistributions} from './wsl-worker.mjs';
import {getProductEdition,prepareEditionWorkspace} from './edition-workspace.mjs';
import {configureEngine} from './engine-settings.mjs';
import {startWorker} from './worker.mjs';
import {runtimeConfig,workerRpc} from './runtime.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),action=process.argv[2]||'status',both=process.argv.includes('--both');
const lock=JSON.parse(await readFile(path.join(root,'scripts/physical-tools-lock.json'),'utf8'));
const execute=(exe,args)=>new Promise((resolve,reject)=>{const child=spawn(exe,args,{windowsHide:true,stdio:'inherit'});child.once('error',reject);child.once('close',code=>code===0?resolve():reject(Error('Physical tool preparation exited '+code)));});
const wslexec=(args,options={})=>runNative('wsl.exe',['--distribution',lock.distribution,'--exec',...args],options);
const linuxPath=async value=>(await wslexec(['wslpath','-a','-u',path.resolve(value)])).trim();
async function installed(){try{const magic=await wslexec(['/home/resistor/.local/share/resistor/tools/bin/magic','--version']),netgen=await wslexec(['/home/resistor/.local/share/resistor/tools/bin/netgen','-batch']);await wslexec(['/home/resistor/.local/share/resistor/engine/bin/python3','-c','import klayout.db as k; assert k.__version__=="'+lock.klayout+'"']);return magic.includes(lock.magic.version)&&netgen.includes('Netgen '+lock.netgen.version);}catch{return false;}}
async function publicPdkSource(){for(const bundle of [path.join(root,'native-runtime'),path.join(root,'release/native-runtimes/win32-x64')]){try{const manifest=JSON.parse(await readFile(path.join(bundle,'manifest.json'),'utf8'));if(manifest.pdk_root&&manifest.platform==='win32')return realpath(path.join(bundle,manifest.pdk_root));}catch(e){if(e.code!=='ENOENT')throw e;}}throw Error('Prepare the bundled public PDK first: npm run native:prepare');}
async function prepare(){
 if(process.platform!=='win32'){await execute('sh',[path.join(root,'scripts/native-tools-setup.sh')]);return;}
 if(process.arch!=='x64')throw Error('The pinned Ubuntu import is for Windows x64. Use a prepared native Linux distro on other CPUs.');
 const distributions=await wslDistributions();let created=false;
 if(!distributions.includes(lock.distribution)){
  const storage=path.join(process.env.LOCALAPPDATA||path.join(homedir(),'AppData/Local'),'Resistor/wsl'),target=path.join(storage,lock.distribution),archive=path.join(storage,'downloads/ubuntu-base-'+lock.ubuntu.version+'.tar.gz');
  try{await access(target);throw Error('Existing WSL storage needs inspection; it will not be overwritten.');}catch(e){if(e.code!=='ENOENT')throw e;}
  await mkdir(path.dirname(archive),{recursive:true});const response=await fetch(lock.ubuntu.url);if(!response.ok)throw Error('Ubuntu rootfs download failed: '+response.status);const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.byteLength>100*1024*1024||createHash('sha256').update(bytes).digest('hex')!==lock.ubuntu.sha256)throw Error('Ubuntu rootfs checksum/size mismatch');await writeFile(archive,bytes);
  await execute('wsl.exe',['--import',lock.distribution,target,archive,'--version','2']);created=true;
 }
 if(!await installed()){
  if(!created)throw Error('Existing ResistorEDA is not fully prepared. Preserve it and run native-tools-setup.sh in that distro, or select another prepared distro.');
  const linuxRoot=await linuxPath(root);await execute('wsl.exe',['--distribution',lock.distribution,'--user','root','--exec','sh',linuxRoot+'/scripts/wsl-tools-bootstrap.sh']);
  await execute('wsl.exe',['--distribution',lock.distribution,'--user','resistor','--exec','env','RESISTOR_SKIP_SYSTEM_PACKAGES=1','sh',linuxRoot+'/scripts/native-tools-setup.sh']);
 }
 if(created)await execute('wsl.exe',['--terminate',lock.distribution]); // Only the newly created, unattached distro.
 if(!await installed())throw Error('Actual Magic/Netgen/KLayout probes did not pass.');
 const source=await linuxPath(await publicPdkSource());
 await wslexec(['python3','-c','import pathlib,shutil,json,sys; src=pathlib.Path(sys.argv[1]); dst=pathlib.Path.home()/".local/share/resistor/pdks"; p=json.loads((src/"provenance.json").read_text()); assert p.get("private_pdk_included") is False and p.get("source")=="installed-public-SKY130A"; shutil.copytree(src,dst) if not dst.exists() else None; d=json.loads((dst/"provenance.json").read_text()); assert d.get("open_pdks_commit")==p.get("open_pdks_commit") and d.get("private_pdk_included") is False, "Existing PDK cache is preserved; inspect its provenance"; print("Public Linux PDK cache:",dst)',source],{timeout:300000});
 console.log('Shared physical tools prepared. Availability is not a design PASS. Use tools:connect and tools:verify.');
}
async function pairs(){
 if(!both){const edition=getProductEdition({root});return [{edition,resources:root,workspace:await prepareEditionWorkspace({root,edition,workspace:process.env.MOS_WORKSPACE})}];}
 const registry=JSON.parse(await readFile(path.join(root,'.runtime/product-workspaces.json'),'utf8'));
 const result=[];for(const key of ['edu','industry']){const resources=path.resolve(registry[key].checkout),edition=getProductEdition({root:resources,env:{...process.env,RESISTOR_EDITION:key==='edu'?'edu':'indust'}});result.push({edition,resources,workspace:await prepareEditionWorkspace({root:resources,edition,workspace:key==='edu'?registry.edu.existing_demo_workspace:resources})});}return result;
}
if(action==='prepare')await prepare();
else if(['connect','status'].includes(action)){
 for(const selected of await pairs()){
  if(action==='connect'){if(process.platform==='win32'&&!await installed())throw Error('Run tools:prepare before connecting.');await configureEngine(selected.workspace,process.platform==='win32'?{mode:'wsl',distribution:lock.distribution}:{mode:'native'});await startWorker(selected.workspace,{resourcesRoot:selected.resources});}
  const config=await runtimeConfig(selected.workspace),response=await workerRpc(config,'toolchain.doctor',{refresh:true});if(!response.ok)throw Error(response.error.message);
  console.log(JSON.stringify({edition:selected.edition.edition,product_id:selected.edition.id,runner:response.result.runner,tools:response.result.tools.map(({name,available,version})=>({name,available,version})),pdk:response.result.pdk.id,drc_available:!!response.result.tools.find(t=>t.name==='Magic')?.available&&response.result.pdk.available,lvs_available:!!response.result.tools.find(t=>t.name==='Magic')?.available&&!!response.result.tools.find(t=>t.name==='Netgen')?.available&&response.result.pdk.available,pex_available:!!response.result.tools.find(t=>t.name==='Magic')?.available&&response.result.pdk.available,design_checks_executed:false},null,2));
 }
}else throw Error('Use physical-tools.mjs prepare, connect [--both], or status [--both].');
