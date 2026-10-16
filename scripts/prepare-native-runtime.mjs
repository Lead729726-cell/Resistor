// Build-time downloads only. Installed applications launch the bundled tools
// offline and never invoke Docker, pip or a system package manager.
import {readFile,writeFile,mkdir,cp,rename,mkdtemp,access,readdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {runNative} from './native-worker.mjs';

const digest=b=>createHash('sha256').update(b).digest('hex');
async function download(item,cache){
  const name=path.basename(new URL(item.url).pathname),file=path.join(cache,name);
  let bytes;try{bytes=await readFile(file);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(!bytes||digest(bytes)!==item.sha256){const response=await fetch(item.url,{signal:AbortSignal.timeout(180000)});if(!response.ok)throw Error(`Native resource download failed: HTTP ${response.status}`);bytes=Buffer.from(await response.arrayBuffer());if(digest(bytes)!==item.sha256)throw Error(`Native resource checksum mismatch: ${name}`);await writeFile(file,bytes);}
  return file;
}
async function unpack(archive,destination){await mkdir(destination,{recursive:true});await runNative('tar',['-xf',archive,'-C',destination],{timeout:120000});}
export async function prepareNativeRuntime({workspace=process.cwd(),pdkDirectory=process.env.REGISTER_NATIVE_PDK_DIR}={}){
  if(!pdkDirectory&&!process.argv.includes('--core-only')){const {prepareNativePdk}=await import('./prepare-native-pdk.mjs');pdkDirectory=await prepareNativePdk({workspace});}
  const key=process.platform+'-'+process.arch,lock=JSON.parse(await readFile(new URL('./native-runtime-lock.json',import.meta.url),'utf8'));
  // Windows ARM64 uses a native ARM64 shell and explicitly disclosed x64
  // Python/KLayout/ngspice under Windows 11's x64 application emulation.
  const emulated=process.platform==='win32'&&process.arch==='arm64',resourceKey=emulated?'win32-x64':key;
  if(!lock.python[resourceKey]||!lock.klayout[resourceKey])throw Error('Unsupported native runtime CPU/OS.');
  const base=path.join(workspace,'release/native-runtimes'),destination=path.join(base,key);
  await mkdir(base,{recursive:true});
  try{await access(path.join(destination,'manifest.json'));return destination;}catch(e){if(e.code!=='ENOENT')throw e;}
  const cache=path.join(workspace,'.runtime/native-downloads');await mkdir(cache,{recursive:true});
  const temp=await mkdtemp(path.join(base,key+'-build-')),sdk=path.join(temp,'sdk');await mkdir(sdk);
  const pythonArchive=await download(lock.python[resourceKey],cache),wheel=await download(lock.klayout[resourceKey],cache);
  await unpack(pythonArchive,process.platform==='win32'?path.join(sdk,'python'):sdk);
  const python=path.join(sdk,process.platform==='win32'?'python/python.exe':'python/bin/python3');
  const site=path.join(sdk,process.platform==='win32'?'python/Lib/site-packages':'python/lib/python3.13/site-packages');await mkdir(site,{recursive:true});
  // Wheel is a ZIP. The bundled interpreter's stdlib checks extraction paths.
  await runNative(python,['-c','import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert all(not n.startswith(("/","\\\\")) and ".." not in n.split("/") for n in z.namelist()); z.extractall(sys.argv[2])',wheel,site],{timeout:120000});
  if(process.platform==='win32')await writeFile(path.join(sdk,'python/python313._pth'),'python313.zip\n.\nLib/site-packages\n');
  const binary=path.join(sdk,'ngspice/bin');await mkdir(binary,{recursive:true});
  if(process.platform==='win32'){
    const archive=await download(lock.ngspice.windows,cache);await unpack(archive,path.join(temp,'ngspice'));
    await cp(path.join(temp,'ngspice/Spice64'),path.join(sdk,'ngspice'),{recursive:true});
    await cp(path.join(binary,'ngspice_con.exe'),path.join(binary,'ngspice.exe'));
  }else{
    const archive=await download(lock.ngspice.source,cache);await unpack(archive,path.join(temp,'source'));
    const source=path.join(temp,'source/ngspice-47'),prefix=path.join(sdk,'ngspice');
    await runNative('./configure',[`--prefix=${prefix}`,'--disable-debug','--with-x=no','--with-readline=no','--disable-openmp','--enable-cider'],{cwd:source,timeout:180000});
    await runNative('make',['-j',String(Math.min(4,os.availableParallelism()))],{cwd:source,timeout:600000});
    await runNative('make',['install'],{cwd:source,timeout:120000});
    // A prefix compiled into ngspice is irrelevant at runtime: SPICE_LIB_DIR
    // points at the app's relocated scripts and no dynamic code models are used.
  }
  let pdk=false;if(pdkDirectory){await cp(pdkDirectory,path.join(sdk,'pdks'),{recursive:true});pdk=true;}
  const environment={SPICE_LIB_DIR:'ngspice/share/ngspice'};
  const manifest={schema_version:1,platform:process.platform,arch:process.arch,runtime_arch:emulated?'x64':process.arch,requires_emulation:emulated,...(emulated?{emulation:'Windows 11 ARM64 x64 application emulation'}:{}),python:process.platform==='win32'?'python/python.exe':'python/bin/python3',bin_dirs:['ngspice/bin'],...(pdk?{pdk_root:'pdks'}:{}),environment,versions:{python:lock.python_version,klayout:lock.klayout_version,ngspice:lock.ngspice.version},sources:{python:lock.python[resourceKey],klayout:lock.klayout[resourceKey],ngspice:process.platform==='win32'?lock.ngspice.windows:lock.ngspice.source},scope:{offline:['layout-edit','schematic-edit','gds-oasis','ideal-spice',...(pdk?['sky130-prelayout-spice']:[])],additional_tools:['magic','netgen','yosys','iverilog','xschem'],docker_required:false}};
  await runNative(python,['-c','import klayout.db as k; l=k.Layout(); assert l.dbu>0; print(k.__version__)']);
  await runNative(path.join(binary,process.platform==='win32'?'ngspice.exe':'ngspice'),['--version'],{env:{...process.env,SPICE_LIB_DIR:path.join(sdk,environment.SPICE_LIB_DIR)}});
  const inventory={};async function walk(folder){for(const item of await readdir(folder,{withFileTypes:true})){const f=path.join(folder,item.name);if(item.isDirectory())await walk(f);else if(item.isFile())inventory[path.relative(sdk,f).replaceAll('\\','/')]=digest(await readFile(f));}}
  await walk(sdk);manifest.files=inventory;await writeFile(path.join(sdk,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  await rename(sdk,destination);console.log(`Native runtime prepared: ${key}; Docker is not needed to launch it.`);return destination;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await prepareNativeRuntime();
