import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';

// Read the public manifest and stream the complete public files without storing them.
const base=process.env.REGISTER_DOWNLOAD_URL||'https://resistor-downloads.vercel.app';
const local=JSON.parse(await readFile('platform/download-site/downloads.json','utf8'));
const response=await fetch(base+'/downloads.json',{signal:AbortSignal.timeout(30000)});
assert.equal(response.status,200);
const manifest=await response.json();
assert.deepEqual(manifest.files,local.files);
const checks=[];
for(const file of manifest.files){
  const url=new URL(file.url);
  assert.equal(url.origin,'https://github.com');
  assert.ok(url.pathname.startsWith('/Lead729726-cell/Resistor/releases/download/'));
  const partial=await fetch(base+'/download/'+file.platform,{headers:{Range:'bytes=1048576-1052671'},signal:AbortSignal.timeout(60000)});
  assert.equal(partial.status,206);
  assert.equal(partial.headers.get('content-range'),`bytes 1048576-1052671/${file.bytes}`);
  assert.equal((await partial.arrayBuffer()).byteLength,4096);
  const full=await fetch(base+'/download/'+file.platform,{signal:AbortSignal.timeout(180000)});
  assert.equal(full.status,200);
  const hash=createHash('sha256');let bytes=0;
  for await(const chunk of full.body){bytes+=chunk.byteLength;hash.update(chunk);}
  const sha256=hash.digest('hex');
  assert.equal(bytes,file.bytes);assert.equal(sha256,file.sha256);
  checks.push({platform:file.platform,file:file.name,bytes,sha256,complete_download_verified:true,range_resume_verified:true});
  console.log(JSON.stringify(checks.at(-1)));
}
assert.deepEqual(checks.map(c=>c.platform).sort(),['linux','macos','windows']);
await writeFile('docs/evidence/download-assets-public.json',JSON.stringify({schema_version:1,checked_at:new Date().toISOString(),base_url:base,version:manifest.version,checks},null,2)+'\n');
