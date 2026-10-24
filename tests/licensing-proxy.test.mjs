import test from 'node:test';
import assert from 'node:assert/strict';
import {createLicenseHttpServer} from '../platform/licensing/http.mjs';

// Transport-only fixture: these responses do not issue an entitlement or lease.
async function withHttp(trustLoopbackProxy,fn){
 const server=createLicenseHttpServer({activate:()=>({fixture:'rate-limit-only'})},{adminToken:'qa_'.repeat(20),trustLoopbackProxy});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const call=async forwarded=>{
  const r=await fetch('http://127.0.0.1:'+server.address().port+'/v1/activate',{method:'POST',headers:{'content-type':'application/json','x-forwarded-for':forwarded},body:'{}'});
  await r.arrayBuffer();return r.status;
 };
 try{await fn(call);}finally{await new Promise(r=>server.close(r));}
}
test('untrusted forwarded addresses cannot evade the native client limit',()=>withHttp(false,async call=>{
 for(let i=0;i<30;i++)assert.equal(await call('203.0.113.'+(i+1)),200);
 assert.equal(await call('198.51.100.10'),429);
}));
test('explicit loopback proxy keeps independent client limits and uses closest hop',()=>withHttp(true,async call=>{
 for(let i=0;i<30;i++)assert.equal(await call('203.0.113.1'),200);
 assert.equal(await call('203.0.113.1'),429);
 assert.equal(await call('203.0.113.2'),200);
 assert.equal(await call('198.51.100.123, 203.0.113.1'),429);
}));
test('malformed forwarded addresses fall back to the real socket client',()=>withHttp(true,async call=>{
 for(let i=0;i<30;i++)assert.equal(await call('invalid-'+i),200);
 assert.equal(await call('invalid-next'),429);
}));
