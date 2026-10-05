import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {prepareDownloads} from './download-prepare.mjs';
import {dockerExecutable,dockerEnvironment} from './docker-cli.mjs';

const workspace=process.cwd(),docker=await dockerExecutable(),env=dockerEnvironment();
const run=args=>new Promise((resolve,reject)=>{const child=spawn(docker,args,{env,windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);child.once('error',reject);child.once('exit',code=>code===0?resolve(output.trim()):reject(Error(`Download service ${args[0]} failed: ${output.slice(-1500)}`)));});
const version=JSON.parse(await readFile('package.json','utf8')).version,suffix=version.replaceAll('.','-'),serverName=`register-downloads-${suffix}`,tunnelName=`register-download-tunnel-${suffix}`,network=`register-download-${suffix}`;
const label='org.register.release-downloads='+version,workspaceLabel='org.register.download-workspace='+workspace;
async function ownContainer(name){let inspect;try{inspect=JSON.parse(await run(['inspect',name]))[0];}catch(e){if(/no such/i.test(e.message))return null;throw e;}
  if(inspect.Config.Labels?.['org.register.release-downloads']!==version||inspect.Config.Labels?.['org.register.download-workspace']!==workspace)throw Error('A different service owns '+name);return inspect;}
if(process.argv[2]==='stop'){
  for(const name of [tunnelName,serverName])if(await ownContainer(name)){await run(['stop',name]);console.log('Stopped '+name);}
  process.exit(0);
}
let server=await ownContainer(serverName),tunnel=await ownContainer(tunnelName);
let staging;if(server||tunnel){
  staging={root:path.resolve('.runtime/public-download',version),version};
  if(!server||!tunnel)throw Error('Partial download service exists. Stop both owned containers and recreate them explicitly.');
}else staging=await prepareDownloads(workspace);
try{await run(['network','inspect',network]);}catch(e){if(!/No such|not found/i.test(e.message))throw e;await run(['network','create',network]);}
if(!server)await run(['run','-d','--name',serverName,'--network',network,'--restart','unless-stopped','--label',label,'--label',workspaceLabel,'--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','64','--memory','256m','--user','1000:1000','--publish','127.0.0.1:18767:8080','--mount',`type=bind,source=${staging.root},target=/downloads,readonly`,'--mount',`type=bind,source=${path.join(workspace,'scripts/download-server.mjs')},target=/service/server.mjs,readonly`,'--env','REGISTER_DOWNLOAD_ROOT=/downloads','--env','REGISTER_DOWNLOAD_BIND=0.0.0.0','node:24.16.0-bookworm-slim@sha256:2c87ef9bd3c6a3bd4b472b4bec2ce9d16354b0c574f736c476489d09f560a203','node','/service/server.mjs']);
if(server&&!server.State.Running)await run(['start',serverName]);
let ready=false;for(let i=0;i<30;i++){try{const r=await fetch('http://127.0.0.1:18767/health',{signal:AbortSignal.timeout(1000)}),h=await r.json();ready=r.ok&&h.service==='register-release-downloads'&&h.version===version;if(ready)break;}catch{}await new Promise(r=>setTimeout(r,500));}
if(!ready)throw Error('Release download origin did not become ready.');
if(!tunnel)await run(['run','-d','--name',tunnelName,'--network',network,'--restart','unless-stopped','--label',label,'--label',workspaceLabel,'--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','64','--memory','128m','cloudflare/cloudflared@sha256:072c067d25ccbe61d46e18f0d0723255f2bb5304f7317caa95b27031520ff92c','tunnel','--no-autoupdate','--protocol','http2','--url',`http://${serverName}:8080`]);
if(tunnel&&!tunnel.State.Running)await run(['start',tunnelName]);
let url;for(let i=0;i<60;i++){const logs=await run(['logs',tunnelName]);url=[...logs.matchAll(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g)].at(-1)?.[0];if(url)break;await new Promise(r=>setTimeout(r,500));}
if(!url)throw Error('Quick tunnel did not return a public hostname.');
const receipt={version,url,created_at:new Date().toISOString(),server_container:serverName,tunnel_container:tunnelName,origin:'http://127.0.0.1:18767',scope:'Release installer/ZIP files only; no EDA application/RPC or workspace access',temporary:true,public_access_verified:false};
await mkdir('docs/evidence',{recursive:true});await writeFile('.runtime/download-link.json',JSON.stringify(receipt,null,2));await writeFile(`docs/evidence/public-download-${version}.json`,JSON.stringify(receipt,null,2));
console.log('Public download page: '+url);console.log('PC/Docker and tunnel must stay running. Restarting the tunnel can change the URL.');
