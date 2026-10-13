import path from 'node:path';
import {nativeSettings,startNativeWorker,runNative} from './native-worker.mjs';
import {access,readFile} from 'node:fs/promises';
import {localEngineFetch} from './local-http.mjs';

export async function wslDistributions(run=runNative){
  if(process.platform!=='win32')return [];
  try{return (await run('wsl.exe',['--list','--quiet'],{encoding:'utf16le'})).replaceAll('\0','').split(/[\r\n]+/).map(v=>v.trim()).filter(v=>v&&!v.toLowerCase().startsWith('docker-desktop'));}catch{return [];}
}
export async function startWslWorker(workspace,{resourcesRoot=workspace,run=runNative,fetchImpl=localEngineFetch}={}){
  if(process.platform!=='win32')throw Error('WSL mode is available on Windows only. Use native mode on Mac/Linux.');
  const settings=await nativeSettings(workspace),distributions=await wslDistributions(run),distribution=settings.wsl_distribution;
  if(!distribution||!distributions.includes(distribution))throw Error('Docker와 독립된 WSL 배포판을 선택하세요. Ubuntu에서 docs/native-runtime.md의 도구 준비를 완료한 뒤 다시 연결하세요.');
  const prefix=['--distribution',distribution,'--exec'];
  const convert=async value=>(await run('wsl.exe',[...prefix,'wslpath','-a','-u',path.resolve(value)])).trim();
  const linuxWorkspace=await convert(workspace),linuxRoot=await convert(resourcesRoot);
  let pdk=settings.pdk_root;
  if(!pdk){const bundle=path.join(resourcesRoot,'native-runtime');try{const manifest=JSON.parse(await readFile(path.join(bundle,'manifest.json'),'utf8'));if(manifest.pdk_root)pdk=path.join(bundle,manifest.pdk_root);}catch(e){if(e.code!=='ENOENT')throw e;}}
  if(!pdk){const development=path.join(resourcesRoot,'release/native-runtimes/win32-x64/pdks');try{await access(development);pdk=development;}catch{pdk=path.join(workspace,'.runtime/native-pdks');}}
  const python=(await run('wsl.exe',[...prefix,'python3','-c','import pathlib; p=pathlib.Path.home()/".local/share/resistor/engine/bin/python3"; assert p.is_file(), "Run native-tools-setup.sh inside WSL first"; print(p)'])).trim();
  await run('wsl.exe',[...prefix,python,'-c','import klayout.db']);
  const linuxPdk=await convert(pdk);
  // All paths are argv entries; no caller data is interpolated into shell code.
  return startNativeWorker(workspace,{resourcesRoot,fetchImpl,runtimeKind:'wsl-linux',launch:{python:'wsl.exe',args:[...prefix,'env',`PATH=${(await run('wsl.exe',[...prefix,'python3','-c','import pathlib,os; print(str(pathlib.Path.home()/".local/share/resistor/tools/bin")+":"+os.environ["PATH"])'])).trim()}`, 'PYTHONUTF8=1',python,'-B',linuxRoot+'/workers/eda/native_entry.py','--detach','--stdin-config'],environment:process.env,extra:{PDK_ROOT:linuxPdk},workspace:linuxWorkspace}});
}
