import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base='https://resistor-downloads.vercel.app',folder='platform/download-site',checks=[];
const evidenceFolder=process.argv.find(a=>a.startsWith('--evidence='))?.slice(11)||'docs/evidence/physical-site';
if(!/^docs\/evidence\/[a-z0-9-]+$/.test(evidenceFolder))throw Error('Evidence must be an owned docs/evidence folder.');
const deployment=JSON.parse(await readFile(evidenceFolder+'/deployment.json','utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
for(const entry of deployment.inventory){
 if(entry.file==='vercel.json')continue; // Deployment configuration is not a public asset.
 const video=entry.file.endsWith('.mp4'),r=await fetch(base+'/'+entry.file,{headers:video?{Range:'bytes=0-1023'}:{},signal:AbortSignal.timeout(30000)});
 if(r.status!==(video?206:200))throw Error(entry.file+' HTTP '+r.status);
 if(entry.file.endsWith('.vtt')&&!r.headers.get('content-type')?.startsWith('text/vtt'))throw Error('Subtitle MIME differs');
 const body=Buffer.from(await r.arrayBuffer());
 if(video){if(body.length!==1024||r.headers.get('content-range')!==`bytes 0-1023/${entry.bytes}`)throw Error('Video range differs');const local=await readFile(folder+'/'+entry.file);if(!body.equals(local.subarray(0,1024)))throw Error('Remote media prefix differs');}
 else if(body.length!==entry.bytes||sha(body)!==entry.sha256)throw Error(entry.file+' public digest mismatch');
 checks.push({file:entry.file,http_status:r.status,checked:video?'range length, total length and prefix':'full size and SHA-256'});
}
const routes=['/','/tutorial/','/tutorial/physical-logic','/tutorial/physical-chips','/references/','/pdk-links.html',...(deployment.inventory.some(e=>e.file==='layout-editor.html')?['/layout-editor/']:[]),...(deployment.inventory.some(e=>e.file==='shortcuts.html')?['/shortcuts/']:[]),...(deployment.inventory.some(e=>e.file==='sigma-delta8.html')?['/tutorial/sigma-delta8/']:[])];
if(deployment.inventory.some(e=>e.file==='analog-soc.html'))routes.push('/tutorial/analog-soc/');
if(deployment.inventory.some(e=>e.file==='sar-adc8.html'))routes.push('/tutorial/sar-adc8/');
if(deployment.inventory.some(e=>e.file==='updates.html'))routes.push('/updates/');
if(deployment.inventory.some(e=>e.file==='research.html'))routes.push('/research/');
if(deployment.inventory.some(e=>e.file==='schematic-guide.html'))routes.push('/tutorial/schematic/');
for(const route of routes){const r=await fetch(base+route,{signal:AbortSignal.timeout(15000)});if(r.status!==200)throw Error('Route unavailable: '+route);checks.push({route,http_status:200});}
const downloads=JSON.parse(await readFile(folder+'/downloads.json','utf8'));
for(const file of downloads.files){const r=await fetch(base+'/download/'+file.platform,{redirect:'manual',signal:AbortSignal.timeout(15000)});if(![302,307].includes(r.status)||r.headers.get('location')!==file.url)throw Error('OS redirect differs');const target=await fetch(file.url,{headers:{Range:'bytes=0-1023'},signal:AbortSignal.timeout(30000)});if(target.status!==206||target.headers.get('content-range')!==`bytes 0-1023/${file.bytes}`)throw Error('OS asset range unavailable');await target.arrayBuffer();checks.push({platform:file.platform,redirect:r.status,asset_range_status:206,bytes:file.bytes});}
const library='https://github.com/Lead729726-cell/Resistor/releases/download/v0.17.0/Resistor-Physical-Library.zip';
const r=await fetch(library,{signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('Library download unavailable');const b=Buffer.from(await r.arrayBuffer()),local=await readFile('examples/Resistor-Physical-Library.zip');if(sha(b)!==sha(local))throw Error('Published library digest differs');checks.push({file:'Resistor-Physical-Library.zip',bytes:b.length,sha256:sha(b),checked:'complete external download'});
const htmlFiles=deployment.inventory.filter(e=>e.file.endsWith('.html'));
const available=new Set(deployment.inventory.map(e=>'/'+e.file));for(const route of [...routes,...downloads.files.map(f=>'/download/'+f.platform)])available.add(route);
for(const {file} of htmlFiles){const html=await readFile(folder+'/'+file,'utf8');for(const [,link] of html.matchAll(/(?:href|src)="([^"#]+)(?:#[^"]*)?"/g)){if(link.startsWith('/')&&!available.has(link))throw Error(file+' references an unpublished asset '+link);}}
await mkdir(evidenceFolder,{recursive:true});await writeFile(evidenceFolder+'/http-verification.json',JSON.stringify({verified_at:new Date().toISOString(),base,checks,internal_links_pass:true,external_library_hash_pass:true,eda_server_deployed:false},null,2)+'\n');
console.log(JSON.stringify({public_checks:checks.length,internal_links_pass:true,library_complete_download_sha256:sha(b)}));
