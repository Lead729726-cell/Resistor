const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{Readable}=require('node:stream');
const {makeUpdateFetch}=require('../apps/desktop/update-network.cjs');
function mock(task){const requests=[];return {requests,net:{request(options){const r=new EventEmitter();r.options=options;r.setHeader=()=>{};r.abort=()=>{r.aborted=true;r.emit('error',Error('Redirect was cancelled'));};r.end=()=>queueMicrotask(()=>task(r));requests.push(r);return r;}}};}
test('Electron manual redirect is returned to verifier without following it or emitting cancellation failure',async()=>{
  const {net,requests}=mock(r=>r.emit('redirect',302,'GET','https://release-assets.githubusercontent.com/file',{}));const response=await makeUpdateFetch(net)('https://github.com/file',{redirect:'manual'});
  assert.equal(response.status,302);assert.equal(response.headers.get('location'),'https://release-assets.githubusercontent.com/file');assert.equal(requests[0].aborted,true);assert.equal(requests[0].options.credentials,'omit');
});
test('metadata redirects fail instead of sending a follow-up request',async()=>{
  const {net,requests}=mock(r=>r.emit('redirect',302,'GET','https://elsewhere.test',{}));await assert.rejects(makeUpdateFetch(net)('https://api.github.com'));assert.equal(requests.length,1);
});
test('Electron IncomingMessage streams exact response bytes into a standard readable Response',async()=>{
  const {net}=mock(r=>{const incoming=Readable.from([Buffer.from('alpha'),Buffer.from('beta')]);incoming.statusCode=200;incoming.headers={'content-length':['9']};r.emit('response',incoming);});const r=await makeUpdateFetch(net)('https://github.com/file');assert.equal(r.headers.get('content-length'),'9');assert.equal(await r.text(),'alphabeta');
});
test('already aborted requests never reach Electron network stack',async()=>{
  const {net,requests}=mock(()=>{}),signal=AbortSignal.abort();await assert.rejects(makeUpdateFetch(net)('https://github.com',{signal}));assert.equal(requests.length,0);
});
test('bodyless HTTP responses remain controlled failures for the updater, not uncaught Response constructor errors',async()=>{
  const {net}=mock(r=>{const incoming=Readable.from([]);incoming.statusCode=204;incoming.headers={};r.emit('response',incoming);});const r=await makeUpdateFetch(net)('https://github.com/file');assert.equal(r.status,204);assert.equal(r.body,null);
});
