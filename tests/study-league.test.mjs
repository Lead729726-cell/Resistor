import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,mkdir,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash,generateKeyPairSync,randomUUID,sign} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {canonical,leagueEmojis} from '../packages/education/src/league-protocol.ts';
import {leagueQuestion,buildLeagueQuestions,gradeLeague,publicLeagueQuestion,leagueKinds} from '../packages/education/src/league-problems.ts';
import {createLeague,calendar} from '../platform/league/service.mjs';
import {startLeagueServer,clientIP} from '../platform/league/http.mjs';
import {generateLeaguePack} from '../platform/league/generate.mjs';
import {prepareLeagueSite} from '../platform/league/site.mjs';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';

const recipes=leagueKinds.slice(0,5).map(kind=>({kind,variants:[0,0,0]}));
function device(){const {publicKey,privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),der=publicKey.export({format:'der',type:'spki'});return {public_key:der.toString('base64url'),id:createHash('sha256').update(der).digest('hex'),privateKey};}
function envelope(d,method,params,now,nonce=randomUUID()){const e={schema_version:1,device_id:d.id,method,params:method==='league.enroll'?{public_key:d.public_key,...params}:params,issued_at:now,nonce};return {...e,signature:sign('sha256',Buffer.from(canonical(e)),{key:d.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url')};}
const good=r=>{assert.equal(r.ok,true,r.error?.code+': '+r.error?.message);return r.result;};
async function fixture(fn){const directory=await mkdtemp(path.join(os.tmpdir(),'resistor-league-'));let clock=Date.parse('2026-10-16T10:00:00+09:00'),service=await createLeague({directory,now:()=>clock,mode:'qa',maxEnrollmentsPerIP:3});const api=(method,params={},d)=>service.request(d?envelope(d,method,params,clock):{method,params},{ip:d?.id||'public'});const enroll=(d=device())=>{good(api('league.enroll',{},d));return d;};try{await fn({directory,get service(){return service;},api,enroll,clock:()=>clock,advance:ms=>{clock+=ms;},setClock:v=>{clock=v;},reopen:async()=>{service.close();service=await createLeague({directory,now:()=>clock,mode:'qa',maxEnrollmentsPerIP:3});}});}finally{service.close();await rm(directory,{recursive:true,force:true});}}
const answers=()=>Object.fromEntries(buildLeagueQuestions(recipes).map(q=>[q.id,`${q.expected} ${q.unit}`]));

test('league formulas reuse known equations, declared units and SI conversion across every variant',()=>{
 const expected={'voltage-divider':.9,'parallel-resistor':500,'ohms-law':1,'rc-time-constant':.00001,'power-dissipation':.00324,'frequency-period':.01};
 for(const kind of leagueKinds){const q=leagueQuestion({kind,variants:[0,0,0]},0);assert.equal(q.expected,expected[kind]);for(let a=0;a<16;a++)for(let b=0;b<16;b++)for(let c=0;c<16;c++){const v=leagueQuestion({kind,variants:[a,b,c]},0);assert.ok(Number.isFinite(v.expected)&&v.expected>0);assert.ok(!('expected' in publicLeagueQuestion(v)));}}
 const qs=buildLeagueQuestions(recipes),as=answers();as.q1='900 mV';as.q2='.5 kΩ';as.q4='10 us';as.q5='3.24 mW';assert.equal(gradeLeague(qs,as).score,100);assert.equal(gradeLeague(qs,{...as,q1:'0 V'}).score,80);
 for(const invalid of ['NaN V','1 A','Infinity','1 V extra'])assert.throws(()=>gradeLeague(qs,{...as,q1:invalid}));
 assert.throws(()=>gradeLeague(qs,{q1:'1 V'}));assert.throws(()=>buildLeagueQuestions(Array(5).fill(recipes[0])));assert.throws(()=>leagueQuestion({kind:'ohms-law',variants:[16,0,0]},0));
 assert.equal(canonical({b:2,a:{z:0,x:1}}),'{"a":{"x":1,"z":0},"b":2}');assert.throws(()=>canonical(NaN));
});
test('device identity is signed, immutable and persistent; forged and replay-conflicting writes fail',()=>fixture(async f=>{
 const d=f.enroll(),name=good(f.api('league.me',{},d)).nickname;assert.match(name,/^.+ .+ #\d{4}$/);assert.equal(good(f.api('league.enroll',{},d)).nickname,name);
 assert.equal(f.api('league.enroll',{nickname:'hacked'},d).error.code,'INVALID_INPUT');
 let e=envelope(d,'league.start',{},f.clock());e.params={unexpected:1};assert.equal(f.service.request(e).ok,false);
 e=envelope(d,'league.me',{},f.clock());e.signature='A'.repeat(86);assert.equal(f.service.request(e).error.code,'BAD_SIGNATURE');
 e=envelope(device(),'league.me',{},f.clock());e.device_id=d.id;assert.equal(f.service.request(e).error.code,'BAD_SIGNATURE');
 e=envelope(d,'league.start',{},f.clock());const start=good(f.service.request(e));assert.equal(good(f.service.request(e)).replayed,true);
 const conflict=envelope(d,'league.emoji',{emoji:'⚡'},f.clock(),e.nonce);assert.equal(f.service.request(conflict).error.code,'REPLAY_CONFLICT');
 await f.reopen();assert.equal(good(f.api('league.me',{},d)).nickname,name);assert.equal(good(f.api('league.start',{},d)).attempt.id,start.attempt.id);
 const db=new DatabaseSync(path.join(f.directory,'league.sqlite3'));assert.throws(()=>db.prepare('UPDATE devices SET nickname=? WHERE id=?').run('changed',d.id),/immutable/);db.close();
 f.advance(181000);assert.equal(f.service.request(e).error.code,'CLOCK_SKEW');assert.equal(f.api('__proto__').error.code,'UNSUPPORTED');
}));
test('daily server timer, ownership, scoring, review embargo and encrypted storage survive reopening',()=>fixture(async f=>{
 const d=f.enroll(),other=f.enroll();f.service.publish(calendar(f.clock()).day,recipes);const a=good(f.api('league.start',{},d)).attempt;
 const dto=JSON.stringify(a);for(const forbidden of ['"expected"','"formula"','"inputs"','"solution"'])assert.ok(!dto.includes(forbidden));
 assert.equal(f.api('league.submit',{attempt_id:a.id,answers:answers()},other).error.code,'NOT_FOUND');assert.equal(f.api('league.submit',{attempt_id:a.id,answers:answers(),score:100},d).error.code,'INVALID_INPUT');
 assert.equal(f.api('league.submit',{attempt_id:a.id,answers:{...answers(),q1:'.9 A'}},d).ok,false);
 f.advance(15000);assert.equal(good(f.api('league.start',{},d)).attempt.deadline,a.deadline);
 assert.equal(good(f.api('league.submit',{attempt_id:a.id,answers:answers()},d)).score,100);
 let me=good(f.api('league.me',{},d));assert.equal(me.attempt.elapsed_ms,15000);assert.equal(me.attempt.review,null);assert.equal(f.api('league.submit',{attempt_id:a.id,answers:answers()},d).error.code,'ALREADY_SUBMITTED');
 await f.reopen();me=good(f.api('league.me',{},d));assert.equal(me.attempt.score,100);const db=new DatabaseSync(path.join(f.directory,'league.sqlite3'));for(const r of db.prepare('SELECT answers_cipher FROM attempts WHERE answers_cipher IS NOT NULL').all())assert.ok(!r.answers_cipher.includes('q1'));for(const r of db.prepare('SELECT cipher FROM packs').all())assert.ok(!r.cipher.includes('expected'));db.close();
 f.setClock(Date.parse('2026-10-17T00:00:00+09:00'));me=good(f.api('league.me',{},d));assert.equal(me.attempt,null);assert.equal(me.history[0].review.questions[0].expected,.9);assert.deepEqual(me.history[0].review.answers,answers());assert.notEqual(good(f.api('league.start',{},d)).attempt.id,a.id);
}));
test('deadline uses KST midnight and elapsed server time, never a client duration',()=>fixture(async f=>{
 assert.equal(calendar(Date.parse('2026-10-16T15:00:00Z')).day,'2026-10-17');const d=f.enroll();f.setClock(Date.parse('2026-10-16T23:59:55+09:00'));const a=good(f.api('league.start',{},d)).attempt;assert.equal(a.deadline-f.clock(),5000);f.advance(5000);assert.equal(f.api('league.submit',{attempt_id:a.id,answers:answers()},d).error.code,'DEADLINE');
 f.advance(1000);const b=good(f.api('league.start',{},d)).attempt;assert.equal(b.deadline-f.clock(),600000);f.advance(600000);assert.equal(good(f.api('league.me',{},d)).attempt.status,'expired');assert.equal(good(f.api('league.start',{},d)).attempt.id,b.id);
}));
test('daily and weekly standings rank actual submissions; only current top three can set one allowed emoji',()=>fixture(async f=>{
 f.service.publish(calendar(f.clock()).day,recipes);const ds=Array.from({length:4},()=>f.enroll());for(let i=0;i<ds.length;i++){const a=good(f.api('league.start',{},ds[i])).attempt;f.advance((4-i)*1000);good(f.api('league.submit',{attempt_id:a.id,answers:answers()},ds[i]));if(i===0)good(f.api('league.emoji',{emoji:'⚡'},ds[i]));}
 const board=good(f.api('league.board',{period:'today'},ds[3]));assert.equal(board.participants,4);assert.equal(board.mine.rank,1);assert.equal(good(f.api('league.board',{period:'today'},ds[0])).mine.rank,4);assert.ok(board.entries.every(r=>!r.emoji));assert.equal(f.api('league.emoji',{emoji:'⚡'},ds[0]).error.code,'TOP_THREE_ONLY');
 for(const d of ds.slice(1))good(f.api('league.emoji',{emoji:leagueEmojis[2]},d));assert.equal(f.api('league.emoji',{emoji:'⚡⚡'},ds[3]).error.code,'INVALID_INPUT');assert.equal(good(f.api('league.board',{period:'today'})).entries[0].emoji,'🚀');assert.ok(!JSON.stringify(board).includes(ds[0].id));
 f.advance(86400000);f.service.publish(calendar(f.clock()).day,recipes);const a=good(f.api('league.start',{},ds[0])).attempt;good(f.api('league.submit',{attempt_id:a.id,answers:answers()},ds[0]));const week=good(f.api('league.board',{period:'week'},ds[0]));assert.equal(week.mine.score,200);assert.equal(week.mine.days,2);assert.equal(week.mine.rank,1);assert.equal(week.mine.emoji,'');
 f.service.moderate({device_id:ds[0].id,blocked:true,reason:'QA moderation'});assert.equal(f.api('league.me',{},ds[0]).error.code,'DEVICE_RESTRICTED');assert.equal(good(f.api('league.board',{period:'week'})).participants,3);
}));
test('community persists literal text, paged threads, reversible reactions, unique reports and audited moderation',()=>fixture(async f=>{
 const author=f.enroll(),ds=Array.from({length:3},()=>f.enroll());const body='<script>alert("literal")</script> 오늘 배운 것';const post=good(f.api('community.post',{body,category:'reflection'},author)).post_id;
 assert.equal(good(f.api('community.feed')).posts[0].body,body);assert.equal(f.api('community.post',{body:'too soon',category:'tip'},author).error.code,'RATE_LIMIT');
 good(f.api('community.react',{post_id:post,active:true},ds[0]));good(f.api('community.react',{post_id:post,active:true},ds[0]));assert.equal(good(f.api('community.feed')).posts[0].reactions,1);good(f.api('community.react',{post_id:post,active:false},ds[0]));assert.equal(good(f.api('community.feed')).posts[0].reactions,0);
 const reply=good(f.api('community.post',{body:'다음 조건도 비교해요',category:'question',parent_id:post},ds[0])).post_id;assert.equal(good(f.api('community.thread',{post_id:post})).replies[0].id,reply);f.advance(10000);assert.equal(f.api('community.post',{body:'nested reply',category:'tip',parent_id:reply},ds[0]).ok,false);
 assert.equal(f.api('community.hide',{post_id:post,hidden:true},ds[0]).error.code,'FORBIDDEN');good(f.api('community.hide',{post_id:post,hidden:true},author));assert.equal(good(f.api('community.feed')).posts.length,0);good(f.api('community.hide',{post_id:post,hidden:false},author));
 good(f.api('community.report',{post_id:post,reason:'spoiler'},ds[0]));good(f.api('community.report',{post_id:post,reason:'spam'},ds[0]));assert.equal(good(f.api('community.feed')).posts.length,1);
 for(const d of ds.slice(1))good(f.api('community.report',{post_id:post,reason:'spoiler'},d));assert.equal(good(f.api('community.feed')).posts.length,0);assert.equal(f.api('community.hide',{post_id:post,hidden:false},author).error.code,'MODERATED');
 f.service.moderate({post_id:post,blocked:false,reason:'QA restore'});assert.equal(good(f.api('community.feed')).posts.length,1);
 for(let i=0;i<21;i++){f.advance(10000);good(f.api('community.post',{body:'페이지 '+i,category:'tip'},author));}const first=good(f.api('community.feed')),second=good(f.api('community.feed',{before:first.next_before}));assert.equal(first.posts.length,20);assert.equal(second.posts.length,2);assert.equal(new Set([...first.posts,...second.posts].map(p=>p.id)).size,22);
 for(let i=0;i<21;i++){f.advance(10000);good(f.api('community.post',{body:'답글 '+i,category:'tip',parent_id:post},ds[1]));}const thread=good(f.api('community.thread',{post_id:post}));assert.equal(thread.replies.length,20);assert.equal(good(f.api('community.thread',{post_id:post,before:thread.next_before})).replies.length,2);
 await f.reopen();assert.equal(good(f.api('community.feed')).posts.length,20);const db=new DatabaseSync(path.join(f.directory,'league.sqlite3'));assert.ok(db.prepare("SELECT count(*) n FROM audit WHERE event='post.moderated'").get().n>0);db.close();
}));
test('registration limits, request limits, fixed packs and future AI reservations fail closed',()=>fixture(async f=>{
 for(let i=0;i<3;i++)good(f.service.request(envelope(device(),'league.enroll',{},f.clock()),{ip:'shared'}));assert.equal(f.service.request(envelope(device(),'league.enroll',{},f.clock()),{ip:'shared'}).error.code,'RATE_LIMIT');
 const d=f.enroll();for(let i=0;i<89;i++)good(f.api('league.me',{},d));assert.equal(f.api('league.me',{},d).error.code,'RATE_LIMIT');f.advance(60001);good(f.api('league.me',{},d));
 const today=calendar(f.clock()).day;good(f.api('league.info'));assert.throws(()=>f.service.publish(today,recipes),/교체/);assert.throws(()=>f.service.reserveAI(today),/다음/);f.service.reserveAI('2026-10-17');assert.throws(()=>f.service.reserveAI('2026-10-17'));f.service.finishAI('2026-10-17','error',{message:'fixture'});assert.throws(()=>f.service.reserveAI('2026-10-17'));
}));
test('proxy headers are ignored unless a loopback Cloudflare tunnel is explicitly trusted',()=>{
 const req={socket:{remoteAddress:'127.0.0.1'},headers:{'cf-connecting-ip':'203.0.113.5','x-forwarded-for':'203.0.113.6'}};assert.equal(clientIP(req),'127.0.0.1');assert.equal(clientIP(req,true),'203.0.113.5');assert.equal(clientIP({...req,socket:{remoteAddress:'192.0.2.1'}},true),'192.0.2.1');assert.equal(clientIP({...req,headers:{'cf-connecting-ip':'malformed'}},true),'127.0.0.1');
});
test('one approved AI recipe set is validated, cached for everyone and never called by participant APIs',()=>fixture(async f=>{
 await mkdir(path.join(f.directory,'.runtime/education/study'),{recursive:true});await writeFile(path.join(f.directory,'.runtime/education/study/provider.json'),JSON.stringify({credential_workspace:'existing-credential-reference'}));let calls=0;
 const provider=async(workspace,request)=>{calls++;assert.equal(workspace,'existing-credential-reference');assert.ok(!JSON.stringify(request.content).includes('device'));assert.ok(!JSON.stringify(request.content).includes('answer'));return {value:{problems:recipes},receipt:{provider:'fixture',upper_bound_usd:.01}};},statusReader=async()=>({configured:true,remaining_usd:1});
 const args={league:f.service,workspace:f.directory,day:'2026-10-17',cap:.05};await assert.rejects(generateLeaguePack(args,{provider,statusReader}));await assert.rejects(generateLeaguePack({...args,approved:true,cap:1e-9},{provider,statusReader}));assert.equal(calls,0);
 await generateLeaguePack({...args,approved:true},{provider,statusReader});await assert.rejects(generateLeaguePack({...args,approved:true},{provider,statusReader}));assert.equal(calls,1);
 f.advance(86400000);assert.equal(good(f.api('league.snapshot',{period:'today'})).info.origin,'openai-recipe-selection');for(let i=0;i<10;i++)good(f.api('league.info'));assert.equal(calls,1);await assert.rejects(generateLeaguePack({...args,approved:true,day:'2027-02-31'},{provider,statusReader}));assert.equal(calls,1);
 await assert.rejects(generateLeaguePack({...args,approved:true,day:'2026-10-18'},{provider:async()=>{calls++;return {value:{problems:Array(5).fill(recipes[0])}};},statusReader}));await assert.rejects(generateLeaguePack({...args,approved:true,day:'2026-10-18'},{provider,statusReader}));assert.equal(calls,2);
}));
test('standalone HTTP shares actual signed submissions and serves only the league shell and public assets',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'resistor-league-http-')),staticDirectory=path.join(directory,'dist');await mkdir(staticDirectory);await writeFile(path.join(staticDirectory,'league.html'),'<title>QA league</title>');const app=await startLeagueServer({directory:path.join(directory,'data'),staticDirectory,port:0,mode:'qa'});
 const call=async body=>{const r=await fetch(app.url+'/api/league',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(r.headers.get('Access-Control-Allow-Origin'),'*');return r.json();};
 try{const a=device(),b=device();good(await call(envelope(a,'league.enroll',{},Date.now())));good(await call(envelope(b,'league.enroll',{},Date.now())));const aa=good(await call(envelope(a,'league.start',{},Date.now()))).attempt,bb=good(await call(envelope(b,'league.start',{},Date.now()))).attempt;assert.deepEqual(aa.questions,bb.questions);assert.notEqual(aa.id,bb.id);
  const r=await fetch(app.url+'/');assert.match(await r.text(),/QA league/);assert.match(r.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/);assert.equal((await fetch(app.url+'/health')).status,200);
  for(const route of ['/api/rpc','/.env','/server-secret','/league.sqlite3','/assets/source.js.map','/platform/league/service.mjs'])assert.equal((await fetch(app.url+route)).status,404);
  assert.equal((await fetch(app.url+'/api/league',{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(40000)})).status,413);
  assert.equal((await fetch(app.url+'/api/league',{method:'POST',body:'bad'})).status,415);
  assert.equal(good(await call({method:'league.info',params:{}})).automatic_ai_calls,false);
 }finally{await app.close();await rm(directory,{recursive:true,force:true});}
});
test('public site packaging follows only league dependencies and excludes maps and EDA files',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'resistor-league-site-')),build=path.join(dir,'build'),target=path.join(dir,'site');try{await mkdir(path.join(build,'assets'),{recursive:true});await writeFile(path.join(build,'league.html'),'<script type="module" src="./assets/league-123.js"></script><link rel="stylesheet" href="./assets/league-123.css">');await writeFile(path.join(build,'assets/league-123.js'),'import{x}from"./shared-123.js";\n//# sourceMappingURL=private.map');await writeFile(path.join(build,'assets/shared-123.js'),'export const x=1;');await writeFile(path.join(build,'assets/league-123.css'),'body{}');await writeFile(path.join(build,'assets/app-private.js'),'EDA source');const r=await prepareLeagueSite({buildDirectory:build,targetDirectory:target,endpoint:'https://study.example.org/api/league'});assert.equal(r.files,6);assert.deepEqual(r.assets,['league-123.css','league-123.js','shared-123.js']);assert.ok(!(await readFile(path.join(target,'assets/league-123.js'),'utf8')).includes('sourceMappingURL'));await assert.rejects(readFile(path.join(target,'assets/app-private.js')));const c=JSON.parse(await readFile(path.join(target,'league-config.json'),'utf8'));assert.equal(c.edition,'edu');assert.ok(c.identity_namespace);await assert.rejects(prepareLeagueSite({buildDirectory:build,targetDirectory:target,endpoint:'http://remote.example.org/api/league'}));}finally{await rm(dir,{recursive:true,force:true});}
});
test('browser client uses a nonextractable signing key, synchronizes server time and rejects invalid responses',()=>fixture(async f=>{
 const d=f.enroll(),publicKey=await crypto.subtle.importKey('spki',Buffer.from(d.public_key,'base64url'),{name:'ECDSA',namedCurve:'P-256'},true,['verify']),privateKey=await crypto.subtle.importKey('pkcs8',d.privateKey.export({type:'pkcs8',format:'der'}),{name:'ECDSA',namedCurve:'P-256'},false,['sign']),draftKey=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 const identity={signing:{publicKey,privateKey},draftKey},keys=[];assert.equal(privateKey.extractable,false);
 const idb={transaction(){return {objectStore(){return {get(key){keys.push(key);const r={result:identity};queueMicrotask(()=>r.onsuccess());return r;}};}};}};
 const originalFetch=globalThis.fetch,originalIDB=globalThis.indexedDB,calls=[];globalThis.indexedDB={open(){const r={result:idb};queueMicrotask(()=>r.onsuccess());return r;}};
 try{
  const output=path.join(f.directory,'browser-client.mjs');await build({entryPoints:['packages/ui/src/league-device.ts'],bundle:true,platform:'node',format:'esm',outfile:output,logLevel:'silent'});const {leagueClient,leagueEndpoint}=await import(pathToFileURL(output).href);
  for(const bad of ['http://remote.example.org','https://user:pass@example.org','https://example.org?q=1','https://example.org/not-api'])assert.throws(()=>leagueEndpoint(bad));
  globalThis.fetch=async(url,options)=>{const body=JSON.parse(options.body);calls.push(body);assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');return Response.json(f.service.request(body,{ip:d.id}));};
  const client=leagueClient('https://study.example.org/api/league','stable-publisher');assert.equal((await client.call('league.me',{},true)).device_id,d.id);assert.deepEqual(calls.slice(0,2).map(c=>c.method),['league.info','league.me']);assert.ok(keys.every(k=>k==='publisher:stable-publisher'));assert.ok(!JSON.stringify(calls).includes('privateKey'));
  f.advance(181000);await assert.rejects(client.call('league.me',{},true),e=>e.code==='CLOCK_SKEW');assert.equal((await client.call('league.me',{},true)).device_id,d.id);assert.deepEqual(calls.slice(-2).map(c=>c.method),['league.info','league.me']);
  const bad=leagueClient('https://other.example.org/api/league');globalThis.fetch=async()=>Response.json({ok:true,result:{edition:'indust',schema_version:1,server_time:Date.now()}});await assert.rejects(bad.call('league.info'),/Resistor Edu/);
  globalThis.fetch=async()=>new Response('x'.repeat(1000001));await assert.rejects(bad.call('league.info'),/크기/);
  let sent=0;globalThis.fetch=async()=>{sent++;throw Error('Network uncertain');};await assert.rejects(client.call('community.post',{body:'QA only',category:'tip'},true),/새로고침/);assert.equal(sent,1);
 }finally{globalThis.fetch=originalFetch;if(originalIDB===undefined)delete globalThis.indexedDB;else globalThis.indexedDB=originalIDB;}
}));
