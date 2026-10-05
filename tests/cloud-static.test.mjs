import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';
import {startHub} from '../platform/cloud/hub.mjs';import {runtimeConfig} from '../scripts/runtime.mjs';
import {WebSocket} from 'ws';
test('packaged frontend works separately from a new data workspace',async t=>{
  const workspace=path.resolve('.runtime/static-client-tests',crypto.randomUUID()),staticDirectory=path.resolve('release/Register-win32-x64/resources/app/dist');
  const hub=await startHub({workspace,staticDirectory,workerConfig:await runtimeConfig(),port:0});t.after(()=>hub.close());
  await assert.rejects(fs.access(path.join(workspace,'dist')));
  const response=await fetch(`http://127.0.0.1:${hub.port}/`);assert.equal(response.status,200);const html=await response.text();assert.equal(html,await fs.readFile(path.join(staticDirectory,'index.html'),'utf8'));
  const asset=html.match(/src="([^"]+\.js)"/)[1],actual=await fetch(new URL(asset,`http://127.0.0.1:${hub.port}/`)).then(r=>r.text());assert.equal(actual,await fs.readFile(path.join(staticDirectory,asset),'utf8'));
  const info=await fetch(`http://127.0.0.1:${hub.port}/rpc`,{method:'POST',headers:{Origin:'http://localhost:18766','Content-Type':'application/json'},body:JSON.stringify({method:'cloud.info',params:{}})}).then(r=>r.json());assert.equal(info.ok,true);
  const denied=await fetch(`http://127.0.0.1:${hub.port}/rpc`,{method:'POST',headers:{Origin:'https://untrusted.example','Content-Type':'application/json'},body:JSON.stringify({method:'cloud.info',params:{}})});assert.equal(denied.status,403);
  const ws=new WebSocket(`ws://127.0.0.1:${hub.port}/events`,{origin:'http://localhost:18766'});t.after(()=>ws.close());
  const authError=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Localhost websocket did not reach authentication')),3000);ws.on('open',()=>ws.send(JSON.stringify({type:'subscribe',token:'invalid-session',room_id:'invalid'})));ws.once('message',data=>{clearTimeout(timer);resolve(JSON.parse(data));});ws.once('error',reject);});assert.equal(authError.error.code,'AUTH_EXPIRED');ws.close();
  await fs.writeFile('docs/evidence/portable-cloud-web.json',JSON.stringify({checked_at:new Date().toISOString(),workspace_has_no_dist:true,actual_packaged_index_and_js_served:true,localhost_origin_rpc_and_ws_reach_auth:true,untrusted_origin_rejected:true,checks:6},null,2));
});
