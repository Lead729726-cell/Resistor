import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {localEngineFetch} from '../scripts/local-http.mjs';

test('loopback RPC preserves Unicode bytes, token headers and exact numerical JSON',async()=>{
  const server=http.createServer(async(req,res)=>{let text='';for await(const chunk of req)text+=chunk;assert.equal(Number(req.headers['content-length']),Buffer.byteLength(text));assert.equal(req.headers['x-mos-token'],'local-fixture');res.setHeader('Content-Type','application/json');res.end(JSON.stringify({name:JSON.parse(text).name,voltage:.9,current:90e-6}));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{const r=await localEngineFetch(`http://127.0.0.1:${server.address().port}/rpc`,{method:'POST',headers:{'X-MOS-Token':'local-fixture'},body:JSON.stringify({name:'회로 공간'})});assert.equal(r.status,200);assert.deepEqual(await r.json(),{name:'회로 공간',voltage:.9,current:90e-6});}finally{await new Promise(r=>server.close(r));}
});
test('a restarted endpoint uses new connections rather than reusing closed pooled sockets',async()=>{
  let port=0;for(let n=0;n<3;n++){const server=http.createServer((_req,res)=>res.end(JSON.stringify({generation:n})));await new Promise(r=>server.listen(port,'127.0.0.1',r));port=server.address().port;const r=await localEngineFetch(`http://127.0.0.1:${port}/health`);assert.equal((await r.json()).generation,n);await new Promise(r=>server.close(r));}
});
test('local transport rejects public origins, credentials and unrecognized endpoints before connecting',()=>{
  for(const url of ['https://127.0.0.1/rpc','http://example.com/rpc','http://user@127.0.0.1/rpc','http://127.0.0.1/files','http://127.0.0.1/rpc?token=bad'])assert.throws(()=>localEngineFetch(url),/loopback endpoint/);
});
test('an aborted request terminates its owned socket',async()=>{
  const server=http.createServer(()=>{});await new Promise(r=>server.listen(0,'127.0.0.1',r));try{await assert.rejects(localEngineFetch(`http://127.0.0.1:${server.address().port}/health`,{signal:AbortSignal.timeout(20)}),/abort/i);}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
