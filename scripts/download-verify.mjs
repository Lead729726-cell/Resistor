import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const file='.runtime/download-link.json',link=JSON.parse(await readFile(file,'utf8')),url=new URL(link.url);
if(url.protocol!=='https:'||!url.hostname.endsWith('.trycloudflare.com')||url.pathname!=='/'||url.username||url.password||url.port)throw Error('Expected the generated public HTTPS tunnel URL.');
const staged=JSON.parse(await readFile(path.join('.runtime/public-download',link.version,'release.json'),'utf8'));
let ready=false;for(let attempt=0;attempt<20;attempt++){
  try{const response=await fetch(url,{signal:AbortSignal.timeout(8000)});const html=await response.text();if(response.ok&&html.includes('레지스터 다운로드')){ready=true;break;}}catch{}
  await new Promise(r=>setTimeout(r,1000));
}
if(!ready)throw Error('Public download page did not respond correctly.');
const probes=[];
for(const name of ['/.runtime/worker.json','/api/rpc','/scripts/download-server.mjs','/release.json']){
  const r=await fetch(new URL(name,url),{signal:AbortSignal.timeout(15000)});if(r.status!==404)throw Error('Non-release endpoint exposed: '+name);probes.push({path:name,status:r.status});await r.body?.cancel();
}
const macOnly=process.argv.includes('--mac-arm64');
const artifacts=staged.files.filter(f=>macOnly?f.platform==='macOS'&&f.architecture==='arm64':f.name.endsWith('.zip')||f.name.endsWith('.exe'));
if(!artifacts.length)throw Error('No selected public release artifacts.');
const transfers=await Promise.all(artifacts.map(async f=>{
  const start=Date.now(),r=await fetch(new URL('/'+f.name,url),{signal:AbortSignal.timeout(300000)});
  if(!r.ok||!r.headers.get('content-disposition')?.includes(f.name))throw Error('Public attachment failed: '+f.name);
  const hash=createHash('sha256');let count=0;
  for await(const chunk of r.body){hash.update(chunk);count+=chunk.length;}
  const checksum=hash.digest('hex');if(checksum!==f.sha256||count!==f.bytes)throw Error('Full public download differs: '+f.name);
  const resumeStart=f.bytes>1049599?1048576:0,resumeEnd=Math.min(f.bytes-1,resumeStart+1023);
  const resume=await fetch(new URL('/'+f.name,url),{headers:{Range:`bytes=${resumeStart}-${resumeEnd}`},signal:AbortSignal.timeout(15000)});
  const resumed=await resume.arrayBuffer();if(resume.status!==206||resumed.byteLength!==resumeEnd-resumeStart+1||resume.headers.get('content-range')!==`bytes ${resumeStart}-${resumeEnd}/${f.bytes}`)throw Error('Public resume failed: '+f.name);
  const result={name:f.name,url:new URL('/'+f.name,url).href,status:r.status,bytes:count,sha256:checksum,sha256_matches_release:true,resume_status:resume.status,resume_bytes:resumed.byteLength,elapsed_ms:Date.now()-start};
  console.log(`Verified full public download: ${f.name} (${count} bytes), SHA-256 and resume match.`);return result;
}));
const retained=macOnly?(link.artifacts??[]).filter(a=>!transfers.some(t=>t.name===a.name)&&staged.files.some(f=>f.name===a.name&&f.sha256===a.sha256&&f.bytes===a.bytes)&&a.url===new URL('/'+a.name,url).href):[];
const combined=[...retained,...transfers];
const result={...link,public_access_verified:staged.files.filter(f=>f.platform).every(f=>combined.some(a=>a.name===f.name&&a.sha256===f.sha256&&a.sha256_matches_release)),verified_at:new Date().toISOString(),verification_route:'HTTPS public Cloudflare hostname; entire file transfer and SHA-256 comparison, not a localhost-only probe',last_verified_artifacts:transfers.map(t=>t.name),artifacts:combined,private_endpoint_probes:probes};
await writeFile(file,JSON.stringify(result,null,2));await writeFile(`docs/evidence/public-download-${link.version}.json`,JSON.stringify(result,null,2));
console.log('Verified public page: '+link.url);
