import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
import {build} from 'esbuild';

const compiled=await build({stdin:{contents:`export {cloud} from './packages/cloud/src/index';export {rpc} from './packages/contracts/src/index';export {configureOnlineAccess,acknowledgeOnlineAccess,onlineAccessStorageKey,ONLINE_ACCESS_POLICY_VERSION,registerOnlineAccessPrompt} from './packages/contracts/src/online-access';`,resolveDir:process.cwd()},bundle:true,write:false,format:'cjs',platform:'node',define:{__RESISTOR_EDITION__:'"edu"','import.meta.env.DEV':'false'},logLevel:'silent'});
function fixture(){
 const local=new Map([['register.cloud.url.edu','https://cloud.example.test']]),session=new Map([['register.cloud.session.edu','synthetic-session'],['register.cloud.room.edu','saved-room']]);
 const store=map=>({getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)});
 const calls=[],native=[],sockets=[];const module={exports:{}};
 class Socket{static OPEN=1;readyState=1;sends=[];constructor(){sockets.push(this);}send(value){this.sends.push(value);}close(){this.closed=true;}}
 const room={id:'saved-room',name:'Fixture',role:'owner',revision:2};
 runInNewContext(compiled.outputFiles[0].text,{module,exports:module.exports,crypto:webcrypto,URL,URLSearchParams,Response,AbortSignal,Event,WebSocket:Socket,localStorage:store(local),sessionStorage:store(session),location:{origin:'https://app.example.test',protocol:'https:',hostname:'app.example.test',port:''},window:{dispatchEvent(){},mos:{rpc:async(method)=>{native.push(method);return {ok:true,result:{local:true}};}}},setTimeout,clearTimeout,setInterval,clearInterval,fetch:async(url,options)=>{const body=options?.body?JSON.parse(options.body):{};calls.push({url,body});const result=body.method==='cloud.auth.status'?{user:{id:'fixture'}}:body.method==='cloud.open'?{room,project:{id:'fixture',revision:2}}:{mode:'self-hosted',capabilities:{}};return new Response(JSON.stringify({ok:true,result}));}});
 const api=module.exports;api.configureOnlineAccess({edition:'edu',host:'browser'});return {api,local,session,calls,native,sockets};
}

test('saved cloud credentials do not reconnect, upload, clear or route local work remotely before acknowledgment',async()=>{
 const f=fixture(),{cloud,rpc}=f.api;await cloud.status();
 for(const operation of [()=>cloud.signIn({email:'synthetic@example.test',password:'never-sent'}),()=>cloud.joinProject({token:'never-sent'}),()=>cloud.configure({url:'https://different.example.test'}),()=>cloud.downloadExport({format:'gds'}),()=>cloud.downloadArtifact({run_id:'private',key:'report'})])await assert.rejects(operation(),{code:'ONLINE_AGE_CONFIRMATION_REQUIRED'});
 const local=await rpc('project.snapshot');assert.equal(local.local,true);assert.deepEqual(f.native,['project.snapshot']);
 assert.equal(f.calls.length,0);assert.equal(f.sockets.length,0);
 assert.equal(f.session.get('register.cloud.session.edu'),'synthetic-session');assert.equal(f.session.get('register.cloud.room.edu'),'saved-room');assert.equal(f.local.get('register.cloud.url.edu'),'https://cloud.example.test');
});

test('explicit acknowledgment resumes the preserved cloud session; subsequent guard blocks authenticated downloads and presence',async()=>{
 const f=fixture(),{cloud}=f.api;await cloud.status();
 await f.api.acknowledgeOnlineAccess({age_14_or_over:true,policy_version:f.api.ONLINE_ACCESS_POLICY_VERSION});
 await cloud.status();await new Promise(setImmediate);
 assert(f.calls.some(call=>call.body.method==='cloud.auth.status'));assert(f.calls.some(call=>call.body.method==='cloud.open'));assert.equal(f.sockets.length,1);
 const socket=f.sockets[0];socket.onopen();assert.equal(socket.sends.length,1);
 f.local.delete(f.api.onlineAccessStorageKey('edu'));const before=f.calls.length;
 await assert.rejects(cloud.downloadExport({format:'gds'}),{code:'ONLINE_AGE_CONFIRMATION_REQUIRED'});await assert.rejects(cloud.downloadArtifact({run_id:'fixture',key:'report'}),{code:'ONLINE_AGE_CONFIRMATION_REQUIRED'});
 cloud.updatePresence({selection:'private-selection'});assert.equal(socket.sends.length,1);assert.equal(socket.closed,true);assert.equal(f.calls.length,before);
 assert.equal(f.session.get('register.cloud.session.edu'),'synthetic-session');await cloud.leaveProject();
});

test('automatic cloud restore stays silent while a deliberate login waits and cancellation sends no credentials',async()=>{
 const f=fixture();let prompts=0,finish;
 const unregister=f.api.registerOnlineAccessPrompt(done=>{prompts++;finish=done;});
 try{
  await f.api.cloud.status();assert.equal(prompts,0);assert.equal(f.calls.length,0);assert.equal(f.sockets.length,0);
  const login=f.api.cloud.signIn({email:'synthetic@example.test',password:'never-transmitted'}).catch(error=>error.code);await new Promise(setImmediate);assert.equal(prompts,1);assert.equal(f.calls.length,0);
  finish(false);assert.equal(await login,'ONLINE_ACCESS_CANCELLED');assert.equal(f.calls.length,0);assert.equal(f.session.get('register.cloud.session.edu'),'synthetic-session');
 }finally{unregister();}
});
