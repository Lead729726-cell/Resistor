import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createDownloadServer} from '../scripts/download-server.mjs';

async function fixture(){
  const root=await mkdtemp(path.join(os.tmpdir(),'register-public-download-'));
  const data=Buffer.from('0123456789abcdefghij'),sha=createHash('sha256').update(data).digest('hex');
  for(const name of ['Register-0.14.0-win-x64.exe','index.html'])await writeFile(path.join(root,name),data);
  await writeFile(path.join(root,'private.txt'),'not part of public manifest');
  const files=['Register-0.14.0-win-x64.exe','index.html'].map(name=>({name,bytes:data.length,sha256:sha,content_type:'application/octet-stream',download:name.endsWith('.exe')}));
  await writeFile(path.join(root,'release.json'),JSON.stringify({version:'0.14.0',files}));
  const server=await createDownloadServer(root);await new Promise(r=>server.listen(0,'127.0.0.1',r));
  return {root,data,sha,server,url:'http://127.0.0.1:'+server.address().port,close:()=>new Promise(r=>{server.closeAllConnections();server.close(r);})};
}
test('actual GET/HEAD deliver exact bytes and attachment metadata without executing an installer',async()=>{
  const f=await fixture();try{const r=await fetch(f.url+'/Register-0.14.0-win-x64.exe');assert.equal(r.status,200);assert.deepEqual(Buffer.from(await r.arrayBuffer()),f.data);assert(r.headers.get('content-disposition').includes('attachment'));const h=await fetch(f.url+'/Register-0.14.0-win-x64.exe',{method:'HEAD'});assert.equal(h.headers.get('content-length'),'20');assert.equal((await h.arrayBuffer()).byteLength,0);assert.equal(h.headers.get('accept-ranges'),'bytes');}finally{await f.close();}
});
test('resume/suffix ranges return exactly the requested bytes; stale If-Range falls back to full download',async()=>{
  const f=await fixture();try{for(const [range,expected] of [['bytes=4-8','45678'],['bytes=10-','abcdefghij'],['bytes=-3','hij']]){const r=await fetch(f.url+'/Register-0.14.0-win-x64.exe',{headers:{Range:range}});assert.equal(r.status,206);assert.equal(await r.text(),expected);}const full=await fetch(f.url+'/Register-0.14.0-win-x64.exe',{headers:{Range:'bytes=10-','If-Range':'"old"'}});assert.equal(full.status,200);assert.deepEqual(Buffer.from(await full.arrayBuffer()),f.data);}finally{await f.close();}
});
test('invalid/multiple/overflow ranges fail without returning arbitrary file contents',async()=>{
  const f=await fixture();try{for(const range of ['bytes=2-1','bytes=30-','bytes=0-1,3-4','bytes=-0','bytes=999999999999999999999999-']){const r=await fetch(f.url+'/Register-0.14.0-win-x64.exe',{headers:{Range:range}});assert.equal(r.status,416);assert.equal(r.headers.get('content-range'),'bytes */20');}}finally{await f.close();}
});
test('public service denies private files, RPC, source/configuration, traversal and writes',async()=>{
  const f=await fixture();try{for(const name of ['/private.txt','/release.json','/api/rpc','/.runtime/worker.json','/scripts/download-server.mjs','/%2e%2e/private.txt','/../worker.json','/%2e%2e%2fprivate.txt'])assert.equal((await fetch(f.url+name)).status,404,name);assert.equal((await fetch(f.url+'/',{method:'POST',body:'not a command'})).status,405);assert.equal((await fetch(f.url+'/')).status,200);}finally{await f.close();}
});
test('release hash ETag supports conditional requests; health is minimal and contains no filesystem paths',async()=>{
  const f=await fixture();try{const r=await fetch(f.url+'/Register-0.14.0-win-x64.exe',{headers:{'If-None-Match':'"'+f.sha+'"'}});assert.equal(r.status,304);const health=await(await fetch(f.url+'/health')).json();assert.deepEqual(health,{service:'register-release-downloads',version:'0.14.0',ready:true});}finally{await f.close();}
});
test('unsafe manifest names cannot be used to publish files outside the download snapshot',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'register-unsafe-download-'));
  await writeFile(path.join(root,'release.json'),JSON.stringify({version:'0.14.0',files:[{name:'../private.txt'}]}));
  await assert.rejects(createDownloadServer(root),/Unsafe/);
});
