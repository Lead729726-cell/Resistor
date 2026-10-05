import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runtimeConfig, workerRpc } from './runtime.mjs';
import {dockerExecutable,dockerEnvironment} from './docker-cli.mjs';
import {normalizeMount} from './desktop-diagnostics.mjs';
const CONTAINER='mos-studio-eda';
async function exec(command,args,options={}){const executable=command==='docker'?await dockerExecutable():command;return new Promise((resolve,reject)=>{const child=spawn(executable,args,{windowsHide:true,stdio:options.capture?'pipe':'inherit',...options,env:dockerEnvironment({env:options.env??process.env})});let output='';const timer=setTimeout(()=>{child.kill();reject(new Error(`Docker ${args[0]} timed out. Check the Docker engine and reconnect.`));},options.timeout??(args[0]==='build'?1800000:30000));if(options.capture){child.stdout.on('data',b=>output=(output+b).slice(-8192));child.stderr.on('data',b=>output=(output+b).slice(-8192));}child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('exit',code=>{clearTimeout(timer);code===0?resolve(output):reject(new Error(`Docker ${args[0]} exited ${code}${output?`: ${output.trim()}`:''}`));});});}
async function health(config){try{const r=await fetch(`${config.url}/health`,{signal:AbortSignal.timeout(1500)});if(!r.ok)return false;const v=await r.json();return v.protocol_version===1||v.protocol===1;}catch{return false;}}
export async function startWorker(workspace=process.env.MOS_WORKSPACE??process.cwd()){
  const config=await runtimeConfig(workspace);
  if(await health(config)){const check=await workerRpc(config,'pdk.capabilities');if(!check.ok)throw new Error('Worker token differs. Stop this workspace worker before restarting.');return config;}
  const engine=await exec('docker',['info','--format','{{.OSType}}'],{capture:true});
  if(engine.trim()!=='linux')throw Error('The EDA worker requires a Docker Linux engine.');
  let existing=false;try{await exec('docker',['inspect','--format','{{.Name}}',CONTAINER],{capture:true});existing=true;}catch{}
  if(existing){
    const mount=await exec('docker',['inspect','--format','{{range .Mounts}}{{if eq .Destination "/workspace"}}{{.Source}}{{end}}{{end}}',CONTAINER],{capture:true});
    if(normalizeMount(mount)!==normalizeMount(config.workspace))throw new Error('A MOS worker from another workspace owns the container name. Stop that worker first.');
    await exec('docker',['start',CONTAINER],{capture:true});
  }else{
    await readFile(path.join(config.workspace,'workers/eda/Dockerfile'));
    // The pinned native EDA image is amd64. Apple Silicon uses Docker's explicit
    // amd64 emulation; the Electron viewer itself remains a native arm64 build.
    await exec('docker',['build','--platform','linux/amd64','-t','mos-studio-eda:local','-f','workers/eda/Dockerfile','.'],{cwd:config.workspace});
    const port=new URL(config.url).port;
    await exec('docker',['run','-d','--platform','linux/amd64','--name',CONTAINER,'--label','com.mos-studio.owner=mos-studio-3d','--publish',`127.0.0.1:${port}:8765`,'--mount',`type=bind,source=${config.workspace},target=/workspace`,'--env','MOS_TOKEN','mos-studio-eda:local'],{env:{...process.env,MOS_TOKEN:config.token},capture:true});
  }
  // Large native waveform history can need longer than the initial startup
  // window. Preserve the workspace and keep a bounded recovery wait.
  const readinessDeadline=Date.now()+60000;
  while(Date.now()<readinessDeadline){if(await health(config))return config;await new Promise(r=>setTimeout(r,500));}
  const logs=await exec('docker',['logs','--tail','30',CONTAINER],{capture:true});throw new Error(`Worker did not become healthy. ${logs}`);
}
export async function stopWorker(){await exec('docker',['stop',CONTAINER],{capture:true});}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const action=process.argv[2]??'start';
  try{if(action==='stop'){await stopWorker();console.log('MOS worker stopped. Projects and snapshots preserved.');}else{const config=await startWorker();if(action==='doctor'){const r=await workerRpc(config,'toolchain.doctor');console.log(JSON.stringify(r,null,2));}else console.log(`MOS worker ready at ${config.url}`);}}
  catch(e){console.error(e.message);process.exitCode=1;}
}
