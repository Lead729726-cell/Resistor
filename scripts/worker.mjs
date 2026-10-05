import { spawn } from 'node:child_process';
import {readFile,writeFile,unlink,mkdir,readdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runtimeConfig, workerRpc } from './runtime.mjs';
import {dockerExecutable,dockerEnvironment} from './docker-cli.mjs';
import {normalizeMount} from './desktop-diagnostics.mjs';
const CONTAINER='mos-studio-eda',OWNER='mos-studio-3d';
const INSPECT='{{json .State}}\n{{json .Config.Labels}}\n{{json .Mounts}}';
export const ENGINE_FILES=['workers/eda/Dockerfile','workers/eda/bootstrap.py','workers/eda/server.py','platform/commercial/runner.py','platform/commercial/agent.py','adapters/commercial/catalog.json'];
async function exec(command,args,options={}){const executable=command==='docker'?await dockerExecutable():command;return new Promise((resolve,reject)=>{const child=spawn(executable,args,{windowsHide:true,stdio:options.capture?'pipe':'inherit',...options,env:dockerEnvironment({env:options.env??process.env})});let output='';const timer=setTimeout(()=>{child.kill();reject(new Error(`Docker ${args[0]} timed out. Check the Docker engine and reconnect.`));},options.timeout??(args[0]==='build'?1800000:30000));if(options.capture){child.stdout.on('data',b=>output=(output+b).slice(-8192));child.stderr.on('data',b=>output=(output+b).slice(-8192));}child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('exit',code=>{clearTimeout(timer);code===0?resolve(output):reject(new Error(`Docker ${args[0]} exited ${code}${output?`: ${output.trim()}`:''}`));});});}
// Docker's --mount value is CSV; quote the entire source field for comma paths.
export function workspaceMount(workspace,{readonly=false}={}){return `type=bind,"source=${workspace.replaceAll('"','""')}",target=/workspace${readonly?',readonly':''}`;}
export async function validateEngineResources(root){
  const hash=createHash('sha256');
  for(const file of ENGINE_FILES){let data;try{data=await readFile(path.join(root,file));}catch{throw Error(`엔진 실행 파일이 없습니다: ${file}. ZIP 전체를 풀고 새 Register.app을 설치하세요. 설계 저장 폴더는 삭제하지 마세요.`);}if(!data.length)throw Error(`엔진 실행 파일이 비어 있습니다: ${file}. 새 Register.app을 설치하세요.`);hash.update(file);hash.update(data);}
  // Any changed image-owned module or adapter must invalidate a stopped image,
  // not just changes to server.py. Match the Docker build's copied resources.
  const walk=async folder=>{for(const entry of (await readdir(path.join(root,folder),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
    if(['__pycache__','.secrets','vendor'].includes(entry.name)||entry.name.endsWith('.log'))continue;
    const file=`${folder}/${entry.name}`;if(entry.isDirectory())await walk(file);else if(entry.isFile()){hash.update(file);hash.update(await readFile(path.join(root,file)));}
  }};
  for(const folder of ['workers/eda','platform/commercial','adapters','examples/sky130'])await walk(folder);
  return hash.digest('hex');
}
async function health(config,fetchImpl){try{const r=await fetchImpl(`${config.url}/health`,{signal:AbortSignal.timeout(1500)});if(!r.ok)return false;const v=await r.json();return v.protocol_version===1||v.protocol===1;}catch{return false;}}
async function authenticated(config,fetchImpl){
  const response=await fetchImpl(`${config.url}/rpc`,{method:'POST',headers:{'Content-Type':'application/json','X-MOS-Token':config.token},body:JSON.stringify({method:'pdk.capabilities',params:{}}),signal:AbortSignal.timeout(5000)});
  return response.ok&&(await response.json()).ok===true;
}
async function inspect(run,container){
  try{const lines=(await run('docker',['inspect','--format',INSPECT,container],{capture:true})).trim().split('\n');const [state,labels,mounts]=lines.map(line=>JSON.parse(line));return {state,labels:labels??{},mounts};}
  catch(e){if(/No such|not found/i.test(e.message))return null;throw e;}
}
export async function probeWorkspaceMount(config,{run=exec,image='mos-studio-eda:local'}={}){
  const id=randomUUID(),relative=`.runtime/mount-probe-${id}.txt`,marker=path.join(config.workspace,relative);
  await mkdir(path.dirname(marker),{recursive:true});await writeFile(marker,id,{flag:'wx'});
  try{
    const script="import pathlib,sys; p=pathlib.Path('/workspace')/sys.argv[1]; assert p.is_file() and p.read_text()==sys.argv[2], 'REGISTER_WORKSPACE_MOUNT_MISMATCH'; assert pathlib.Path('/opt/register-engine/workers/eda/server.py').is_file(), 'REGISTER_ENGINE_IMAGE_INCOMPLETE'; print('REGISTER_MOUNT_OK')";
    const result=await run('docker',['run','--rm','--platform','linux/amd64','--entrypoint','python3','--mount',workspaceMount(config.workspace,{readonly:true}),image,'-c',script,relative,id],{capture:true});
    if(!result.includes('REGISTER_MOUNT_OK'))throw Error('REGISTER_WORKSPACE_MOUNT_MISMATCH');
  }catch{throw Error(`Docker가 설계 저장 폴더를 읽지 못했습니다: ${config.workspace}. Docker Desktop의 파일 공유 권한을 확인하고 설계 엔진 다시 연결을 누르세요.`);}
  finally{await unlink(marker);}
}
export async function startWorker(workspace=process.env.MOS_WORKSPACE??process.cwd(),{resourcesRoot=workspace,run=exec,fetchImpl=fetch,containerName=CONTAINER,image='mos-studio-eda:local',readinessMs=60000}={}){
  const config=await runtimeConfig(workspace);
  if(await health(config,fetchImpl)){if(!await authenticated(config,fetchImpl))throw Error('Worker token differs. Stop this workspace worker before restarting.');return config;}
  const fingerprint=await validateEngineResources(resourcesRoot);
  const engine=await run('docker',['info','--format','{{.OSType}}'],{capture:true});
  if(engine.trim()!=='linux')throw Error('The EDA worker requires a Docker Linux engine.');
  const existing=await inspect(run,containerName);
  if(existing){
    const mount=existing.mounts.find(m=>m.Destination==='/workspace');
    if(!mount||mount.Type!=='bind'||normalizeMount(mount.Source)!==normalizeMount(config.workspace))throw Error('기존 Docker 엔진이 다른 폴더에 연결되어 있거나 /workspace 연결이 없습니다. 해당 컨테이너를 보존한 채 이름을 변경한 뒤 다시 연결하세요. 설계 폴더는 삭제하지 마세요.');
    if(existing.labels['com.mos-studio.owner']!==OWNER)throw Error('다른 도구가 mos-studio-eda 컨테이너를 사용 중입니다. 해당 컨테이너를 보존한 채 이름을 변경한 뒤 다시 연결하세요.');
  }
  // Replace only a stopped app-owned container. Renaming retains its filesystem
  // and mounts for rollback; running workers and their jobs remain untouched.
  const replace=existing&&!existing.state.Running&&existing.labels['org.register.engine.sha256']!==fingerprint;
  if(!existing||replace){
    await run('docker',['build','--platform','linux/amd64','--label',`org.register.engine.sha256=${fingerprint}`,'-t',image,'-f','workers/eda/Dockerfile','.'],{cwd:resourcesRoot});
    await probeWorkspaceMount(config,{run,image});
    let backup;if(replace){backup=`${containerName}-backup-${Date.now()}-${randomUUID().slice(0,8)}`;await run('docker',['rename',containerName,backup],{capture:true});}
    try{
      const port=new URL(config.url).port;
      await run('docker',['run','-d','--platform','linux/amd64','--name',containerName,'--label',`com.mos-studio.owner=${OWNER}`,'--label',`org.register.engine.sha256=${fingerprint}`,'--publish',`127.0.0.1:${port}:8765`,'--mount',workspaceMount(config.workspace),'--env','MOS_TOKEN',image],{env:{...process.env,MOS_TOKEN:config.token},capture:true});
    }catch(error){
      // A failed run can leave a stopped container. Preserve it for diagnosis.
      if(backup){const failed=await inspect(run,containerName);if(failed&&!failed.state.Running)await run('docker',['rename',containerName,`${containerName}-failed-${randomUUID().slice(0,8)}`],{capture:true});if(!failed||!failed.state.Running)await run('docker',['rename',backup,containerName],{capture:true});}
      throw error;
    }
  }else if(!existing.state.Running)await run('docker',['start',containerName],{capture:true});
  const readinessDeadline=Date.now()+readinessMs;
  while(Date.now()<readinessDeadline){
    if(await health(config,fetchImpl)){if(!await authenticated(config,fetchImpl))throw Error('Worker token differs. Stop this workspace worker before restarting.');return config;}
    const current=await inspect(run,containerName);if(current&&!current.state.Running)break;
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  const logs=await run('docker',['logs','--tail','30',containerName],{capture:true});throw Error(`설계 엔진이 시작되지 않았습니다. ${logs.replaceAll(config.token,'[redacted]')}`);
}
export async function stopWorker(){await exec('docker',['stop',CONTAINER],{capture:true});}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const action=process.argv[2]??'start';
  try{if(action==='stop'){await stopWorker();console.log('MOS worker stopped. Projects and snapshots preserved.');}else{const config=await startWorker();if(action==='doctor'){const r=await workerRpc(config,'toolchain.doctor');console.log(JSON.stringify(r,null,2));}else console.log(`MOS worker ready at ${config.url}`);}}
  catch(e){console.error(e.message);process.exitCode=1;}
}
