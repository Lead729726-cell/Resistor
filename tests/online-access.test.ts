import test from 'node:test';
import assert from 'node:assert/strict';
import {ONLINE_ACCESS_POLICY_VERSION as version,createOnlineAcknowledgment,validOnlineAcknowledgment,assertOnlineAccess} from '../platform/licensing/online-access-policy.mjs';
import {createOnlineAccessClient,onlineAccessStorageKey,configureOnlineAccess,acknowledgeOnlineAccess,registerOnlineAccessPrompt} from '../packages/contracts/src/online-access';
import {localRpc,rpc,setRpcOverride} from '../packages/contracts/src/index';
import {leagueClient} from '../packages/ui/src/league-device';

const now=Date.parse('2026-11-13T03:00:00.000Z');
const input={age_14_or_over:true as const,policy_version:version};
const acknowledgment=createOnlineAcknowledgment({...input,edition:'edu'},now);
function memory(){const data=new Map<string,string>();return {data,getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);}};}
const blocked={code:'ONLINE_AGE_CONFIRMATION_REQUIRED'};

test('age declaration is explicit, edition/version bound and contains no date of birth',()=>{
 assert.equal(validOnlineAcknowledgment(acknowledgment,'edu',now),true);
 assert.equal(validOnlineAcknowledgment(acknowledgment,'indust',now),false);
 for(const patch of [{policy_version:'2026-01-01'},{age_14_or_over:false},{acknowledged_at:'2026-11-14T00:00:00.000Z'},{date_of_birth:'2000-01-01'},{acknowledged_at:'2026-02-30T00:00:00.000Z'}])assert.equal(validOnlineAcknowledgment({...acknowledgment,...patch},'edu',now),false);
 for(const age of [false,undefined,'true',1])assert.throws(()=>createOnlineAcknowledgment({edition:'edu',policy_version:version,age_14_or_over:age},now),blocked);
 assert.throws(()=>createOnlineAcknowledgment({...input,edition:'edu',date_of_birth:'2000-01-01'},now),blocked);
 assert.throws(()=>assertOnlineAccess(null,'edu',now),blocked);
 assert.doesNotThrow(()=>assertOnlineAccess(null,'indust',now));
});

test('browser persistence requires an affirmative action and never changes unrelated saved data',async()=>{
 const storage=memory();storage.setItem('existing-license','preserve');storage.setItem('student-answer','preserve');let prompts=0;
 const client=createOnlineAccessClient({edition:'edu',storage:()=>storage,now:()=>now,onRequired:()=>prompts++});
 await assert.rejects(client.require(),blocked);assert.equal(prompts,1);assert.equal(storage.data.size,2);
 await client.acknowledge(input);await client.require();
 assert.equal(storage.getItem('existing-license'),'preserve');assert.equal(storage.getItem('student-answer'),'preserve');
 assert.equal(createOnlineAccessClient({edition:'edu',storage:()=>storage,now:()=>now}).inspect().acknowledged,true);
 storage.setItem(onlineAccessStorageKey('edu'),JSON.stringify({...acknowledgment,policy_version:'old'}));
 await assert.rejects(client.require({prompt:false}),blocked);assert.equal(prompts,1);
});

test('unwritable browser storage fails closed and host mode never trusts a browser acknowledgment',async()=>{
 const storage=memory();storage.setItem(onlineAccessStorageKey('edu'),JSON.stringify(acknowledgment));
 const failure=createOnlineAccessClient({edition:'edu',storage:()=>({getItem:()=>null,setItem:()=>{throw Error('blocked');}}),now:()=>now});
 await assert.rejects(failure.acknowledge(input),/저장하지 못했습니다/);await assert.rejects(failure.require(),blocked);
 const calls:string[]=[];let persisted=false;
 const host=createOnlineAccessClient({edition:'edu',storage:()=>storage,now:()=>now,hostRpc:async(method)=>{calls.push(method);if(method==='online.access.acknowledge')persisted=true;return {edition:'edu',policy_version:version,required:true,acknowledged:persisted,...(persisted?{acknowledgment}: {})};}});
 await assert.rejects(host.require(),blocked);assert.equal(host.inspect().acknowledged,false);
 await assert.rejects(host.acknowledge({...input,date_of_birth:'2000-01-01'} as typeof input),blocked);
 assert.equal(calls.includes('online.access.acknowledge'),false);
 await host.acknowledge(input);await host.require();assert.equal(host.inspect().acknowledged,true);
});

test('malformed host replies cannot authorize requests and Industry adds no restriction',async()=>{
 for(const value of [null,{edition:'edu',policy_version:version,required:true,acknowledged:true},{edition:'indust',policy_version:version,required:false,acknowledged:true,acknowledgment}]){
  const client=createOnlineAccessClient({edition:'edu',storage:()=>memory(),hostRpc:async()=>value,now:()=>now});await assert.rejects(client.require());assert.equal(client.inspect().acknowledged,false);
 }
 let calls=0;const industry=createOnlineAccessClient({edition:'indust',storage:()=>{throw Error('unavailable');},hostRpc:async()=>{calls++;throw Error();}});
 await industry.require();assert.equal(calls,0);
});

test('confirmation cannot substitute for persisted host authority or replay a pending action after cancellation',async()=>{
 let prompts=0,sends=0;
 const client=createOnlineAccessClient({edition:'edu',storage:()=>memory(),now:()=>now,hostRpc:async()=>({edition:'edu',policy_version:version,required:true,acknowledged:false}),onRequired:async()=>{prompts++;return true;}});
 await assert.rejects(client.require().then(()=>sends++),blocked);assert.equal(prompts,1);assert.equal(sends,0);
 const silent=createOnlineAccessClient({edition:'edu',storage:()=>memory(),now:()=>now,onRequired:()=>{throw Error('Background must not prompt');}});
 await assert.rejects(silent.require({prompt:false}),blocked);
 const cancelled=createOnlineAccessClient({edition:'edu',storage:()=>memory(),now:()=>now,onRequired:async()=>false});
 await assert.rejects(cancelled.require().then(()=>sends++),{code:'ONLINE_ACCESS_CANCELLED'});assert.equal(sends,0);
});

test('confirmation retains the initiating element captured before an asynchronous host status lookup disables it',async()=>{
 const previous={document:globalThis.document,HTMLElement:globalThis.HTMLElement};class Element{};const origin=new Element(),body=new Element();let complete!:(value:unknown)=>void,seen:unknown;
 Object.assign(globalThis,{HTMLElement:Element,document:{activeElement:origin,body}});
 try{
  const client=createOnlineAccessClient({edition:'edu',storage:()=>memory(),now:()=>now,hostRpc:()=>new Promise(resolve=>{complete=resolve;}),onRequired:captured=>{seen=captured;return false;}});
  const waiting=client.require().catch(error=>error.code);
  Object.assign(globalThis.document,{activeElement:body});
  complete({edition:'edu',policy_version:version,required:true,acknowledged:false});
  assert.equal(await waiting,'ONLINE_ACCESS_CANCELLED');assert.equal(seen,origin);
 }finally{Object.assign(globalThis,previous);}
});

test('real RPC and league clients send no activation, approved AI payload or registration before explicit acknowledgment',async()=>{
 const prior={window:globalThis.window,localStorage:globalThis.localStorage,fetch:globalThis.fetch};const storage=memory();const sent:string[]=[];let leagueFetches=0,overrideCalls=0;
 try{
  Object.assign(globalThis,{localStorage:storage,window:{dispatchEvent(){},mos:{rpc:async(method:string)=>{sent.push(method);return {ok:true,result:{local:true}};}}},fetch:async()=>{leagueFetches++;return new Response(JSON.stringify({ok:true,result:{schema_version:1,edition:'edu',server_time:Date.now()}}));}});
  configureOnlineAccess({edition:'edu',host:'browser'});
  for(const [method,params] of [['license.activate',{serial:'synthetic-never-sent'}],['license.refresh',{}],['desktop.update.check',{}],['desktop.update.download',{}],['assistant.review',{provider:'openai'}],['study.generate',{approved:true}],['study.submit',{approved:true}],['study.coach.run',{approved:true}],['study.puzzle.tutor',{mode:'ai',approved:true}]] as const)await assert.rejects(localRpc(method,params),blocked);
  setRpcOverride(async()=>{overrideCalls++;return {};});await assert.rejects(rpc('study.generate',{approved:true}),blocked);setRpcOverride(undefined);
  const league=leagueClient('https://league.example.test/api/league');
  await assert.rejects(league.call('league.enroll',{},true),blocked);await assert.rejects(league.call('league.info'),blocked);
  assert.equal(sent.length,0);assert.equal(leagueFetches,0);assert.equal(overrideCalls,0);
  for(const method of ['license.status','license.deactivate','project.snapshot'])await localRpc(method);
  await localRpc('study.generate',{approved:false});await localRpc('study.puzzle.tutor',{mode:'coach',approved:false});assert.deepEqual(sent,['license.status','license.deactivate','project.snapshot','study.generate','study.puzzle.tutor']);
  await acknowledgeOnlineAccess(input);await localRpc('license.activate',{serial:'synthetic-allowed'});await league.call('league.info');
  assert.equal(sent.at(-1),'license.activate');assert.equal(leagueFetches,1);
  configureOnlineAccess({edition:'indust',host:'browser'});await localRpc('license.refresh');assert.equal(sent.at(-1),'license.refresh');
 }finally{setRpcOverride(undefined);configureOnlineAccess({edition:'indust',host:'browser'});Object.assign(globalThis,prior);}
});

test('signed league background polls never open the contextual prompt, whereas an explicit registration can cancel before key access',async()=>{
 const previous={localStorage:globalThis.localStorage,fetch:globalThis.fetch};let prompts=0,sent=0,finish:((confirmed:boolean)=>void)|undefined;
 Object.assign(globalThis,{localStorage:memory(),fetch:async()=>{sent++;throw Error('No request expected');}});configureOnlineAccess({edition:'edu',host:'browser'});
 const unregister=registerOnlineAccessPrompt(done=>{prompts++;finish=done;});
 try{
  const league=leagueClient('https://league.example.test/api/league');
  await assert.rejects(league.call('league.snapshot',{},true,{prompt:false}),blocked);await assert.rejects(league.call('league.board',{},true,{prompt:false}),blocked);assert.equal(prompts,0);assert.equal(sent,0);
  const register=league.call('league.enroll',{},true).catch(error=>error.code);await new Promise(setImmediate);assert.equal(prompts,1);assert.equal(sent,0);finish!(false);assert.equal(await register,'ONLINE_ACCESS_CANCELLED');assert.equal(sent,0);
 }finally{unregister();configureOnlineAccess({edition:'indust',host:'browser'});Object.assign(globalThis,previous);}
});
