import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,access,open,readdir,realpath} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {runtimeConfig} from './runtime.mjs';

export const runNative=(exe,args,options={})=>new Promise((resolve,reject)=>{
  const child=spawn(exe,args,{windowsHide:true,stdio:['ignore','pipe','pipe'],...options});let text='';
  const timer=setTimeout(()=>{child.kill();reject(Error('Local tool preparation timed out.'));},options.timeout??20000);
  child.stdout?.on('data',b=>text=(text+b.toString(options.encoding||'utf8')).slice(-16384));child.stderr?.on('data',b=>text=(text+b.toString(options.encoding||'utf8')).slice(-16384));
  child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('close',code=>{clearTimeout(timer);code===0?resolve(text):reject(Error(`Local tool exited ${code}: ${text.slice(-2000)}`));});
});
const exists=async file=>{try{await access(file);return true;}catch{return false;}};
export const workspaceId=workspace=>{const canonical=path.resolve(workspace).replaceAll('\\','/');return createHash('sha256').update(process.platform==='win32'?canonical.toLowerCase():canonical).digest('hex');};
export async function nativeResourcesHash(resourcesRoot){
  const files=[];for(const folder of ['workers/eda','platform/commercial','workers/eda/rtl']){for(const item of await readdir(path.join(resourcesRoot,folder),{withFileTypes:true}))if(item.isFile()&&!item.name.startsWith('test_')&&(folder.endsWith('/rtl')||item.name.endsWith('.py')||item.name==='literature.json'))files.push(folder+'/'+item.name);}
  const hashes={};for(const file of files.sort())hashes[file]=createHash('sha256').update(await readFile(path.join(resourcesRoot,file))).digest('hex');return createHash('sha256').update(JSON.stringify(hashes)).digest('hex');
}
export async function nativeSettings(workspace){
  let settings;try{settings=JSON.parse(await readFile(path.join(workspace,'.runtime/engine.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;return {};}
  if(!settings||Array.isArray(settings)||typeof settings!=='object'||Object.keys(settings).some(k=>!['mode','python','tool_paths','pdk_root','wsl_distribution'].includes(k)))throw Error('Invalid local engine configuration.');
  if(settings.mode&&!['native','wsl','docker'].includes(settings.mode))throw Error('Unknown local engine mode.');
  for(const key of ['python','pdk_root','wsl_distribution'])if(settings[key]!==undefined&&(typeof settings[key]!=='string'||!settings[key]||/[\r\n\0]/.test(settings[key])))throw Error('Invalid local engine resource setting.');
  if(settings.tool_paths!==undefined&&(!Array.isArray(settings.tool_paths)||settings.tool_paths.some(d=>typeof d!=='string'||!path.isAbsolute(d)||/[\r\n\0]/.test(d))))throw Error('Native tool directories must be absolute paths.');
  return settings;
}
export async function nativeEnvironment(workspace,{resourcesRoot=workspace,prepare=false,run=runNative}={}){
  const settings=await nativeSettings(workspace);let bundle=path.join(resourcesRoot,'native-runtime'),manifest;
  if(!await exists(path.join(bundle,'manifest.json'))){const development=path.join(resourcesRoot,'release/native-runtimes',process.platform+'-'+process.arch);if(await exists(path.join(development,'manifest.json')))bundle=development;}
  try{manifest=JSON.parse(await readFile(path.join(bundle,'manifest.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  const platform=process.platform,arch=process.arch;
  if(manifest&&(manifest.platform!==platform||manifest.arch!==arch))throw Error('Bundled native engine CPU/OS differs from this application.');
  const safeRelative=rel=>{if(typeof rel!=='string'||path.isAbsolute(rel)||rel.split(/[\\/]/).includes('..'))throw Error('Invalid bundled engine resource path');return path.join(bundle,rel);};
  let python=manifest?safeRelative(manifest.python):settings.python||process.env.REGISTER_PYTHON;
  if(manifest){const relative=path.relative(await realpath(bundle),await realpath(python));if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('Bundled Python symlink escapes the application resources.');}
  const privateRoot=path.join(workspace,'.runtime/native-python'),privatePython=path.join(privateRoot,platform==='win32'?'Scripts/python.exe':'bin/python3');
  if(!python&&await exists(privatePython))python=privatePython;
  if(!python){for(const candidate of platform==='win32'?['python']:['/opt/homebrew/bin/python3','/usr/local/bin/python3','python3']){try{const output=await run(candidate,['-c','import sys; assert sys.version_info >= (3,11); print(sys.executable)']);python=output.trim().split('\n').at(-1);break;}catch{}}}
  if(!python)throw Error('로컬 Python 3.11+ 엔진이 없습니다. 네이티브 엔진 포함 설치 파일을 사용하거나 Python을 설치하세요. Docker는 필요하지 않습니다.');
  if(!manifest){try{await run(python,['-c','import klayout.db']);}catch{
    if(!prepare)throw Error('로컬 KLayout 엔진 준비가 필요합니다.');
    await mkdir(path.dirname(privateRoot),{recursive:true});await run(python,['-m','venv',privateRoot],{timeout:60000});
    await run(privatePython,['-m','pip','install','--disable-pip-version-check','klayout==0.30.5'],{timeout:300000});python=privatePython;
  }}
  const directories=[...(manifest?.bin_dirs||[]).map(safeRelative),...(settings.tool_paths||[]),path.join((await import('node:os')).homedir(),'.local/share/resistor/tools/bin'),...(platform==='darwin'?['/opt/homebrew/bin','/usr/local/bin']:[])];
  if(directories.some(d=>typeof d!=='string'||!path.isAbsolute(d)))throw Error('Native tool directories must be absolute paths.');
  const environment={...process.env,PYTHONUTF8:'1',PYTHONUNBUFFERED:'1',PATH:[...directories,process.env.PATH||''].join(path.delimiter)};
  const pdkRoot=settings.pdk_root||(manifest?.pdk_root?safeRelative(manifest.pdk_root):path.join(workspace,'.runtime/native-pdks'));
  const extra={PDK_ROOT:pdkRoot};
  for(const [key,rel]of Object.entries(manifest?.environment||{})){if(!['SPICE_LIB_DIR','YOSYS_SIMCELLS','XSCHEM_SHARE','TCL_LIBRARY','LD_LIBRARY_PATH','DYLD_LIBRARY_PATH'].includes(key))throw Error('Unknown native bundle environment');environment[key]=safeRelative(rel);if(['YOSYS_SIMCELLS','XSCHEM_SHARE'].includes(key))extra[key]=safeRelative(rel);}
  return {python,environment,extra,manifest,settings};
}
export async function runtimeIdentity(config,fetchImpl=fetch){
  try{const response=await fetchImpl(config.url+'/rpc',{method:'POST',headers:{'Content-Type':'application/json','X-MOS-Token':config.token},body:JSON.stringify({method:'runtime.identity',params:{}}),signal:AbortSignal.timeout(2000)});
    if(response.status===401||response.status===403)throw Error('The engine port belongs to another authenticated session.');
    const body=await response.json();return response.ok&&body.ok?body.result:null;
  }catch(e){if(e.message.includes('another authenticated'))throw e;return null;}
}
export async function startNativeWorker(workspace,{resourcesRoot=workspace,prepare=true,run=runNative,fetchImpl=fetch,launch,runtimeKind='native-'+process.platform}={}){
  const config=await runtimeConfig(workspace),id=workspaceId(workspace),current=await runtimeIdentity(config,fetchImpl);
  if(current){if(current.workspace_id!==id||current.runtime_kind!==runtimeKind)throw Error('다른 경로 또는 실행 방식의 엔진이 이 포트를 사용 중입니다. 기존 작업을 보존하고 그 엔진을 종료한 뒤 다시 연결하세요.');
    if(current.engine_code_sha256===await nativeResourcesHash(resourcesRoot))return {...config,engine_mode:runtimeKind.startsWith('wsl-')?'wsl':'native'};
    await stopNativeWorker(workspace);
  }
  // A legacy authenticated Docker endpoint must never be mistaken for native.
  try{const r=await fetchImpl(config.url+'/health',{signal:AbortSignal.timeout(1000)});if(r.ok)throw Error('A different engine is still running on the local port. Stop the idle old engine before switching to native.');}catch(e){if(e.message.startsWith('A different engine'))throw e;}
  const instance=randomUUID();
  const logDir=path.join(workspace,'.runtime/native-engine');await mkdir(logDir,{recursive:true});
  const lockFile=path.join(logDir,'starting.lock');let lock;
  try{lock=await open(lockFile,'wx');}catch(e){
    if(e.code!=='EEXIST')throw e;
    let stale=false;try{const old=JSON.parse(await readFile(lockFile,'utf8'));if(old.workspace_id===id&&Number.isInteger(old.launcher_pid)){try{process.kill(old.launcher_pid,0);}catch(err){stale=err.code==='ESRCH';}}}catch{}
    if(!stale)throw Error('로컬 엔진이 이미 준비 중입니다. 잠시 뒤 다시 연결하세요.');
    const {unlink}=await import('node:fs/promises');await unlink(lockFile);lock=await open(lockFile,'wx');
  }
  await lock.writeFile(JSON.stringify({workspace_id:id,launcher_pid:process.pid,started_at:new Date().toISOString()}));
  let output,child,started=false;
  try{
    const env=launch||await nativeEnvironment(workspace,{resourcesRoot,prepare,run});
    output=await open(path.join(logDir,'engine.log'),'a');
    const entry=path.join(resourcesRoot,'workers/eda/native_entry.py');if(!await exists(entry))throw Error('Native engine entry is missing from the application resources.');
    child=spawn(env.python,env.args||[entry,'--stdin-config'],{cwd:resourcesRoot,env:env.environment,windowsHide:true,detached:true,stdio:['pipe',output.fd,output.fd]});
    await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
    child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({...env.extra,MOS_WORKSPACE:env.workspace||workspace,MOS_WORKSPACE_ID:id,MOS_TOKEN:config.token,MOS_PORT:new URL(config.url).port,MOS_BIND:'127.0.0.1',MOS_RUNTIME_KIND:runtimeKind,MOS_INSTANCE_ID:instance})+'\n');child.unref();
    for(let i=0;i<120;i++){const identity=await runtimeIdentity(config,fetchImpl);if(identity){if(identity.instance_id!==instance||identity.workspace_id!==id)throw Error('Native engine ownership mismatch.');await writeFile(path.join(logDir,'owner.json'),JSON.stringify({instance_id:instance,workspace_id:id,pid:child.pid,runtime_kind:identity.runtime_kind}));started=true;return {...config,engine_mode:runtimeKind.startsWith('wsl-')?'wsl':'native'};}if(child.exitCode!==null)break;await new Promise(r=>setTimeout(r,250));}
    const log=await readFile(path.join(logDir,'engine.log'),'utf8');throw Error('로컬 엔진 시작 실패: '+log.slice(-3000).replaceAll(config.token,'[redacted]'));
  }finally{if(child&&!started&&child.exitCode===null)child.kill();await output?.close();await lock.close();const {unlink}=await import('node:fs/promises');await unlink(lockFile);}
}
export async function stopNativeWorker(workspace){
  const config=await runtimeConfig(workspace),owner=JSON.parse(await readFile(path.join(workspace,'.runtime/native-engine/owner.json'),'utf8')),current=await runtimeIdentity(config);
  if(!current)return {stopped:true};if(current.instance_id!==owner.instance_id||current.workspace_id!==workspaceId(workspace))throw Error('Refusing to stop another engine.');
  const response=await fetch(config.url+'/rpc',{method:'POST',headers:{'Content-Type':'application/json','X-MOS-Token':config.token},body:JSON.stringify({method:'runtime.stop',params:{instance_id:owner.instance_id}}),signal:AbortSignal.timeout(5000)});const body=await response.json();if(!body.ok)throw Error(body.error.message);
  for(let i=0;i<40;i++){if(!await runtimeIdentity(config))return body.result;await new Promise(r=>setTimeout(r,250));}throw Error('로컬 엔진 종료가 완료되지 않았습니다. 실행 중인 작업을 확인하세요.');
}
