import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,readdir,mkdir,access} from 'node:fs/promises';
import {generateKeyPairSync,randomBytes,randomUUID} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import {DesktopOnlineAccess} from '../apps/desktop/online-access.mjs';
import {LicenseClient,fileLicenseVault} from '../apps/desktop/licensing.mjs';
import {createLicenseService} from '../platform/licensing/service.mjs';
import {ONLINE_ACCESS_POLICY_VERSION} from '../platform/licensing/online-access-policy.mjs';
import {requestStructured,reserveStructuredSession} from '../scripts/structured-ai.mjs';
import {review,collectEvidence} from '../scripts/design-assistant.mjs';
import {studyRpc} from '../scripts/self-study-service.mjs';
import {fixtureOnlineAcknowledgment} from './fixtures/online-access.mjs';

const declaration={age_14_or_over:true,policy_version:ONLINE_ACCESS_POLICY_VERSION};
const denied={code:'ONLINE_AGE_CONFIRMATION_REQUIRED'};
async function directory(t){const p=await mkdtemp(path.join(os.tmpdir(),'resistor-online-access-'));t.after(()=>rm(p,{recursive:true,force:true}));return p;}

test('installation acknowledgment is minimal, edition-separated, validated and reloadable',async t=>{
 const root=await directory(t),store=new DesktopOnlineAccess({directory:root,edition:'edu'});
 assert.equal((await store.status()).acknowledged,false);await assert.rejects(store.assert(),denied);
 await assert.rejects(store.acknowledge({...declaration,age_14_or_over:false}),denied);
 await assert.rejects(store.acknowledge({...declaration,dob:'2000-01-01'}),{code:'INVALID_PARAMETER'});
 await assert.rejects(store.acknowledge({...declaration,policy_version:'old'}),denied);
 assert.deepEqual(await readdir(root),[]);
 await store.rpc('online.access.acknowledge',declaration);
 const persisted=JSON.parse(await readFile(store.file,'utf8'));
 assert.deepEqual(Object.keys(persisted).sort(),['acknowledged_at','age_14_or_over','edition','policy_version','schema_version']);
 assert.equal((await new DesktopOnlineAccess({directory:root,edition:'edu'}).status()).acknowledged,true);
 const industry=new DesktopOnlineAccess({directory:root,edition:'indust'});assert.equal((await industry.status()).required,false);assert.equal((await industry.status()).acknowledged,false);await industry.assert();
 for(const bad of ['{',JSON.stringify({...persisted,edition:'indust'}),JSON.stringify({...persisted,policy_version:'old'}),JSON.stringify({...persisted,dob:'2000-01-01'}),JSON.stringify({...persisted,acknowledged_at:'2999-01-01T00:00:00.000Z'})]){await writeFile(store.file,bad);assert.equal((await store.status()).acknowledged,false);await assert.rejects(store.assert(),denied);}
});

test('automatic startup/hourly/update actions make no call until acknowledgment; Industry remains unchanged',async t=>{
 const root=await directory(t),store=new DesktopOnlineAccess({directory:root,edition:'edu'});let calls=0;
 for(let i=0;i<4;i++)assert.equal((await store.runAutomatic(()=>{calls++;})).skipped,true);
 assert.equal(calls,0);await store.acknowledge(declaration);await store.runAutomatic(()=>{calls++;});assert.equal(calls,1);
 await writeFile(store.file,'invalid');await store.runAutomatic(()=>{calls++;});assert.equal(calls,1);
 await new DesktopOnlineAccess({directory:root,edition:'indust'}).runAutomatic(()=>{calls++;});assert.equal(calls,2);
});

test('direct license requests cannot bypass age confirmation; missing confirmation never revokes an existing lease',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'resistor-online-license-')),keys=generateKeyPairSync('ed25519'),privateKey=keys.privateKey.export({type:'pkcs8',format:'pem'}),publicKey=keys.publicKey.export({type:'spki',format:'pem'});
 const service=createLicenseService({filename:path.join(root,'authority.sqlite'),masterKey:randomBytes(32),privateKey});t.after(async()=>{service.close();await rm(root,{recursive:true,force:true});});
 const order=service.issue({provider:'inflearn',purchase_ref:'isolated-test',edition:'edu',email:'fixture@example.invalid',verified:true,evidence_sha256:'b'.repeat(64),device_limit:2});const serial=service.operatorDelivery(order.delivery_id).serial;
 const store=new DesktopOnlineAccess({directory:path.join(root,'edu'),edition:'edu'});let calls=0;
 const config={schema_version:1,required:true,server_url:'https://fixture.invalid',public_keys:{'resistor-20261023':publicKey}};
 const clientDirectory=path.join(root,'license'),client=new LicenseClient({directory:clientDirectory,edition:'edu',config,...await fileLicenseVault(clientDirectory),assertOnlineAccess:()=>store.assert(),fetchImpl:async(url,options)=>{calls++;const method=new URL(url).pathname.split('/').at(-1),params=JSON.parse(options.body);assert.equal('age_14_or_over'in params,false);return {status:200,json:async()=>({ok:true,result:service[method](params)})};}});
 await assert.rejects(client.activate(serial),denied);await assert.rejects(client.request('/v1/activate',{serial}),denied);assert.equal(calls,0);
 await assert.rejects(client.rpc('license.activate',{serial,...declaration}),{code:'INVALID_PARAMETER'});assert.equal(calls,0);
 await store.acknowledge(declaration);assert.equal((await client.status()).authorized,false);await assert.rejects(client.assertActive(),{code:'LICENSE_REQUIRED'});
 const active=await client.activate(serial),before=await readFile(client.file,'utf8');assert.equal(active.authorized,true);assert.equal(calls,1);
 await rm(store.file);await assert.rejects(client.refresh(),denied);assert.equal(calls,1);assert.equal(await readFile(client.file,'utf8'),before);assert.equal((await client.assertActive()).authorized,true);
 await store.acknowledge(declaration);assert.equal((await client.refresh()).authorized,true);assert.equal(calls,2);
 await rm(store.file);assert.equal((await client.deactivate()).authorized,false);assert.equal(calls,3);
});

test('direct Edu structured AI blocks before budget/credential reads and rechecks before provider transmission',async t=>{
 const root=await directory(t),workspace=path.join(root,'source'),request={approved:true,system:'fixture',content:{a:'fixture'},schema:{type:'object'},name:'fixture'};let calls=0;
 const fetcher=async()=>{calls++;throw Error('must not call');};
 await assert.rejects(requestStructured(workspace,request,{edition:'edu',fetcher}),denied);
 await assert.rejects(requestStructured(workspace,request,{edition:'edu',fetcher,assertOnlineAccess:async()=>({...fixtureOnlineAcknowledgment(),age_14_or_over:false})}),denied);
 assert.equal(calls,0);await assert.rejects(access(workspace));
 await mkdir(path.join(workspace,'.runtime/assistant'),{recursive:true});await writeFile(path.join(workspace,'.env.local'),'OPENAI_API_KEY=synthetic-not-a-key');await writeFile(path.join(workspace,'.runtime/assistant/settings.json'),'{"budget_usd":1}');
 let checks=0;const session=await reserveStructuredSession(workspace,.01,{approved:true,edition:'edu',fetcher,assertOnlineAccess:async()=>++checks===1?fixtureOnlineAcknowledgment():null});
 await assert.rejects(session.request(request),denied);assert.equal(checks,2);assert.equal(calls,0);
});

test('design assistant direct Edu review cannot send evidence or reserve API cost before confirmation',async t=>{
 const workspace=await directory(t),project={id:'a'.repeat(32),revision:1,runs:[]},graph={revision:1,devices:[],nets:[],issues:[],layout_binding:{status:'unknown'},scope:'fixture',limits:[]};let calls=0;
 const call=async(_w,m)=>({ok:true,result:m==='project.snapshot'?project:graph}),worker={workspace};
 const evidence=await collectEvidence(worker,{project_id:project.id,expected_revision:1},call);
 await assert.rejects(review(worker,{project_id:project.id,expected_revision:1,provider:'openai',approved:true,evidence_hash:evidence.fingerprint},{edition:'edu',call,fetcher:async()=>{calls++;}}),denied);
 assert.equal(calls,0);assert.deepEqual(await readdir(workspace),[]);
});

test('Industry structured AI keeps its separate approval/budget flow without an Edu acknowledgment',async t=>{
 const workspace=await directory(t);await mkdir(path.join(workspace,'.runtime/assistant'),{recursive:true});await writeFile(path.join(workspace,'.env.local'),'OPENAI_API_KEY=synthetic-not-a-key');await writeFile(path.join(workspace,'.runtime/assistant/settings.json'),'{"budget_usd":1}');let calls=0;
 const request={approved:true,system:'synthetic',content:{a:1},schema:{type:'object'},name:'fixture'};
 const result=await requestStructured(workspace,request,{edition:'indust',fetcher:async()=>{calls++;return {ok:true,text:async()=>JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:'{"fixture":true}'}]}]})};}});
 assert.equal(calls,1);assert.equal(result.value.fixture,true);assert(result.receipt.reservation.reserved_usd>0);await assert.rejects(access(path.join(workspace,'online-access-edu.json')));
});

test('unconfirmed learners retain local bank/objective grading; new study generation stops without booking a call',async t=>{
 const root=await directory(t),workspace=path.join(root,'edu'),source=path.join(root,'credential-reference');let calls=0;
 await mkdir(path.join(workspace,'.runtime/education/study'),{recursive:true});await mkdir(path.join(source,'.runtime/assistant'),{recursive:true});await writeFile(path.join(source,'.env.local'),'OPENAI_API_KEY=synthetic-not-a-key');await writeFile(path.join(source,'.runtime/assistant/settings.json'),'{"budget_usd":1}');await writeFile(path.join(workspace,'.runtime/education/study/provider.json'),JSON.stringify({credential_workspace:source}));
 const api=(method,params={})=>studyRpc({workspace},method,params,{edition:'edu',fetcher:async()=>{calls++;throw Error('must not call');}});
 const catalog=await api('study.catalog');assert.equal(catalog.ok,true);const q=catalog.result.questions.find(q=>q.kind==='numeric');
 const attempt=await api('study.submit',{question_id:q.id,answer:'0',approved:false,command_id:randomUUID()});assert.equal(attempt.ok,true);assert.equal(attempt.result.attempt.feedback.method,'deterministic');
 const latest=await api('study.catalog');assert.equal((await api('study.settings',{budget_usd:1,expected_revision:latest.result.study_revision})).ok,true);
 const before=await readFile(path.join(workspace,'.runtime/education/study/state.json'),'utf8');
 const blocked=await api('study.generate',{reference_id:catalog.result.references[0].id,level:1,approved:true,command_id:randomUUID()});assert.equal(blocked.error?.code,denied.code);
 assert.equal(await readFile(path.join(workspace,'.runtime/education/study/state.json'),'utf8'),before);assert.equal(calls,0);await assert.rejects(access(path.join(source,'.runtime/assistant/budget.json')));
});
