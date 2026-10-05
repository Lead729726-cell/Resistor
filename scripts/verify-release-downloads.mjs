import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const proof=JSON.parse(await readFile('docs/evidence/mac-preview-release.json','utf8'));
const link=JSON.parse(await readFile('.runtime/download-link.json','utf8'));
const origin=new URL(link.url);
if(origin.protocol!=='https:'||!origin.hostname.endsWith('.trycloudflare.com')||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw Error('Expected the existing public release-only tunnel URL.');
const request=async(resource,options={})=>fetch(new URL(resource,origin),{signal:AbortSignal.timeout(60000),...options});
const page=await request('/');if(!page.ok)throw Error(`Download page HTTP ${page.status}`);
const html=await page.text();
const report={checked_at:new Date().toISOString(),url:origin.origin,version:proof.version,build_revision:proof.build_revision,scope:'Public release downloads only',native_mac_execution_verified:false,files:[]};
for(const artifact of proof.artifacts){
  if(!/^Register-[0-9.]+-mac-(arm64|x64)-r[0-9]+\.zip$/.test(artifact.file)||!html.includes('/'+artifact.file))throw Error('Current Mac download card is absent.');
  const full=await request('/'+artifact.file);if(full.status!==200)throw Error(`Full download HTTP ${full.status}`);
  const hash=createHash('sha256');let bytes=0;
  for await(const chunk of full.body){bytes+=chunk.length;if(bytes>artifact.bytes)throw Error('Download exceeds verified archive length');hash.update(chunk);}
  const sha256=hash.digest('hex');if(bytes!==artifact.bytes||sha256!==artifact.sha256)throw Error('Public archive bytes differ from local QA.');
  const range=await request('/'+artifact.file,{headers:{Range:'bytes=0-1023'}}),data=Buffer.from(await range.arrayBuffer());
  if(range.status!==206||data.length!==1024||range.headers.get('Content-Range')!==`bytes 0-1023/${artifact.bytes}`)throw Error('Resume download check failed');
  const local=await readFile(path.join('release/installers',artifact.file));if(!data.equals(local.subarray(0,1024)))throw Error('Range bytes differ from the archive');
  report.files.push({file:artifact.file,full_status:full.status,bytes,sha256,range_status:range.status,range_bytes:data.length});console.log(`Verified public ${artifact.arch} r${proof.build_revision}: full SHA-256 and resumed transfer match.`);
}
report.private_routes=[];
for(const route of ['/rpc','/workers/eda/server.py','/.runtime/worker.json','/.git/config']){const response=await request(route);await response.body?.cancel();if(response.status!==404)throw Error('Private route exposed: '+route);report.private_routes.push({route,status:response.status});}
const folder=`docs/evidence/macos-r${proof.build_revision}`;await mkdir(folder,{recursive:true});await writeFile(path.join(folder,'public-download.json'),JSON.stringify(report,null,2)+'\n');
link.public_access_verified=true;link.verified_at=report.checked_at;link.mac_build_revision=proof.build_revision;
await writeFile('.runtime/download-link.json',JSON.stringify(link,null,2)+'\n');await writeFile(`docs/evidence/public-download-${proof.version}.json`,JSON.stringify(link,null,2)+'\n');
