import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {createConnection} from 'node:net';
import {promisify} from 'node:util';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {GMAIL_SEND_SCOPE,GMAIL_EXPECTED_SENDER,GMAIL_PRIVATE_HOME,GMAIL_CONNECT_SCOPES,parseGmailDesktopClient,createGmailOAuthSession,gmailAuthorizationUrl,readGmailOAuthCallback,validateGmailGrantedScopes,verifyGmailOwnerIdToken,exchangeGmailAuthorization,startGmailLoopback,approvedGmailStoragePaths,gmailPrivateAclScript,gmailPrivateAclValidatorScript,safeGmailSetupDiagnostic} from '../scripts/license-gmail-connect.mjs';

// Entirely synthetic RSA/OAuth fixtures. Tests do not contact Google, open a
// browser, read real client JSON, or write into the authority private directory.
const client={client_id:'123456789-synthetic.apps.googleusercontent.com',client_secret:'synthetic-client-secret'},now=Date.now();
const keys=generateKeyPairSync('rsa',{modulusLength:2048});
const jwks={keys:[{...keys.publicKey.export({format:'jwk'}),kid:'synthetic-key',use:'sig',alg:'RS256'}]};
const accessToken='synthetic-access-token',refreshToken='synthetic-refresh-token';
function jwt(session,changes={},headerChanges={}){
 const header={alg:'RS256',kid:'synthetic-key',typ:'JWT',...headerChanges},payload={iss:'https://accounts.google.com',aud:client.client_id,azp:client.client_id,iat:Math.floor(now/1000),exp:Math.floor(now/1000)+3600,nonce:session.nonce,sub:'123456789',email:GMAIL_EXPECTED_SENDER,email_verified:true,at_hash:createHash('sha256').update(accessToken).digest().subarray(0,16).toString('base64url'),...changes};
 const unsigned=[header,payload].map(o=>Buffer.from(JSON.stringify(o)).toString('base64url')).join('.');return unsigned+'.'+sign('RSA-SHA256',Buffer.from(unsigned),keys.privateKey).toString('base64url');
}
const verification=session=>({clientId:client.client_id,nonce:session.nonce,expectedSender:GMAIL_EXPECTED_SENDER,accessToken,now});
const redirect='http://127.0.0.1:38080/';
const callback=(s,extra='')=>'/?state='+s.state+'&code=synthetic-code'+extra;

test('only installed desktop clients and the configured owner are accepted',()=>{
 assert.deepEqual(parseGmailDesktopClient({installed:client}),client);
 for(const value of [{web:client},{installed:{...client,client_id:'other.example'}},{installed:{...client,client_secret:'bad\nsecret'}},{installed:{...client,token_uri:'https://attacker.invalid/token'}},{installed:{...client,auth_uri:'https://attacker.invalid/auth'}}])assert.throws(()=>parseGmailDesktopClient(value));
 assert.throws(()=>createGmailOAuthSession(client.client_id,{expectedSender:'other@gmail.com'}));
});
test('authorization uses independent random state/nonce and S256 PKCE with minimal scopes',()=>{
 const a=createGmailOAuthSession(client.client_id,{now}),b=createGmailOAuthSession(client.client_id,{now});assert.notEqual(a.state,b.state);assert.notEqual(a.nonce,a.state);assert.notEqual(a.verifier,b.verifier);assert.equal(a.challenge,createHash('sha256').update(a.verifier).digest('base64url'));assert(a.verifier.length>=43&&a.verifier.length<=128);
 const u=new URL(gmailAuthorizationUrl(a,redirect));assert.equal(u.origin,'https://accounts.google.com');assert.equal(u.searchParams.get('code_challenge_method'),'S256');assert.equal(u.searchParams.get('code_verifier'),null);assert.equal(u.searchParams.get('client_secret'),null);assert.equal(u.searchParams.get('scope'),GMAIL_CONNECT_SCOPES.join(' '));assert.equal(u.searchParams.get('login_hint'),GMAIL_EXPECTED_SENDER);assert.equal(u.searchParams.get('access_type'),'offline');assert.equal(u.searchParams.get('include_granted_scopes'),null);
 for(const uri of ['http://localhost:38080/','http://127.0.0.1.attacker.invalid:38080/','http://0.0.0.0:38080/','https://127.0.0.1:38080/','http://127.0.0.1:38080/callback','http://127.0.0.1:38080/?next=x'])assert.throws(()=>gmailAuthorizationUrl(a,uri));
});
test('callback checks exact host/path/peer/state, duplicate parameters, lifetime and single use',()=>{
 const headers={host:'127.0.0.1:38080'};
 for(const mutation of [s=>({url:callback(s),headers:{host:'evil.invalid'}}),s=>({url:callback(s),headers:{...headers,remoteAddress:'192.0.2.1'}}),s=>({url:callback(s),headers:{...headers,method:'POST'}}),s=>({url:callback(s)+'&state='+s.state,headers}),s=>({url:callback(s)+'&code=second',headers}),s=>({url:'//evil.invalid'+callback(s),headers}),s=>({url:callback(s).replace(s.state,'wrong'),headers}),s=>({url:callback(s)+'&iss=https://attacker.invalid',headers})]){
  const session=createGmailOAuthSession(client.client_id,{now}),v=mutation(session);assert.throws(()=>readGmailOAuthCallback(v.url,v.headers,session,redirect,now));assert.equal(session.used,undefined);
 }
 const expired=createGmailOAuthSession(client.client_id,{now});assert.throws(()=>readGmailOAuthCallback(callback(expired),headers,expired,redirect,now+600001));
 const good=createGmailOAuthSession(client.client_id,{now});assert.equal(readGmailOAuthCallback(callback(good)+'&unrecognized=ignored',headers,good,redirect,now),'synthetic-code');assert.throws(()=>readGmailOAuthCallback(callback(good),headers,good,redirect,now));
 const denied=createGmailOAuthSession(client.client_id,{now});assert.throws(()=>readGmailOAuthCallback('/?state='+denied.state+'&error=access_denied',headers,denied,redirect,now));assert.equal(denied.used,true);
});
test('granted scope validation rejects mailbox reading, modifications and unconfirmed grants',()=>{
 assert.deepEqual(validateGmailGrantedScopes('openid https://www.googleapis.com/auth/userinfo.email '+GMAIL_SEND_SCOPE),GMAIL_CONNECT_SCOPES);
 for(const scope of [undefined,GMAIL_SEND_SCOPE,'openid email','openid email '+GMAIL_SEND_SCOPE+' profile','openid email '+GMAIL_SEND_SCOPE+' https://www.googleapis.com/auth/gmail.readonly','openid email '+GMAIL_SEND_SCOPE+' https://mail.google.com/'])assert.throws(()=>validateGmailGrantedScopes(scope));
});
test('Google ID-token evidence requires RSA signature, approved issuer/audience/account, freshness and nonce',()=>{
 const session=createGmailOAuthSession(client.client_id,{now}),good=jwt(session);assert.equal(verifyGmailOwnerIdToken(good,jwks,verification(session)).email,GMAIL_EXPECTED_SENDER);
 for(const patch of [{iss:'https://attacker.invalid'},{aud:'different-client'},{azp:'different-client'},{nonce:'wrong'},{exp:Math.floor(now/1000)-1},{iat:Math.floor(now/1000)+120},{iat:Math.floor(now/1000)-700},{email:'other@gmail.com'},{email_verified:false},{sub:''},{at_hash:'wrong'}])assert.throws(()=>verifyGmailOwnerIdToken(jwt(session,patch),jwks,verification(session)));
 for(const patch of [{alg:'none'},{alg:'HS256'},{kid:'missing'},{jku:'https://attacker.invalid/keys'},{crit:['extra']}])assert.throws(()=>verifyGmailOwnerIdToken(jwt(session,{},patch),jwks,verification(session)));
 const altered=good.split('.');altered[1]=Buffer.from(JSON.stringify({email:GMAIL_EXPECTED_SENDER})).toString('base64url');assert.throws(()=>verifyGmailOwnerIdToken(altered.join('.'),jwks,verification(session)));
 const another=generateKeyPairSync('rsa',{modulusLength:2048}),wrongKeys={keys:[{...another.publicKey.export({format:'jwk'}),kid:'synthetic-key',use:'sig',alg:'RS256'}]};assert.throws(()=>verifyGmailOwnerIdToken(good,wrongKeys,verification(session)));
});
function oauthMock(session,{tokenPatch={},discoveryPatch={}}={}){
 const calls=[];return {calls,fetchImpl:async(url,options)=>{
  calls.push({url,options});assert.equal(options.redirect,'error');
  if(url==='https://accounts.google.com/.well-known/openid-configuration')return Response.json({issuer:'https://accounts.google.com',authorization_endpoint:'https://accounts.google.com/o/oauth2/v2/auth',token_endpoint:'https://oauth2.googleapis.com/token',jwks_uri:'https://www.googleapis.com/oauth2/v3/certs',...discoveryPatch});
  if(url==='https://oauth2.googleapis.com/token'){const p=new URLSearchParams(options.body);assert.equal(p.get('code_verifier'),session.verifier);assert.equal(p.get('client_secret'),client.client_secret);assert.equal(p.get('redirect_uri'),redirect);return Response.json({access_token:accessToken,refresh_token:refreshToken,token_type:'Bearer',expires_in:3600,scope:GMAIL_CONNECT_SCOPES.join(' '),id_token:jwt(session),...tokenPatch});}
  if(url==='https://www.googleapis.com/oauth2/v3/certs')return Response.json(jwks);
  throw Error('Unexpected synthetic request');
 }};
}
test('OAuth exchange binds verified owner and preserves only refresh credentials, with honest testing lifetime',async()=>{
 const session=createGmailOAuthSession(client.client_id,{now});session.used=true;const mock=oauthMock(session),record=await exchangeGmailAuthorization(client,session,'synthetic-code',redirect,{fetchImpl:mock.fetchImpl,now,publishingStatus:'testing'});
 assert.equal(record.credentials.GMAIL_SENDER_EMAIL,GMAIL_EXPECTED_SENDER);assert.equal(record.credentials.GMAIL_REFRESH_TOKEN,refreshToken);assert.equal(record.refresh_expires_at,new Date(now+604800000).toISOString());assert.equal(record.refresh_expiry_source,'google-testing-policy');assert.equal(record.unattended_delivery_verified,false);assert.equal(JSON.stringify(record).includes(accessToken),false);assert.equal(JSON.stringify(record).includes('id_token'),false);assert.equal(mock.calls.length,3);
 for(const patch of [{refresh_token:undefined},{token_type:'DPoP'},{expires_in:0},{scope:GMAIL_SEND_SCOPE},{scope:GMAIL_CONNECT_SCOPES.join(' ')+' https://www.googleapis.com/auth/gmail.modify'},{id_token:jwt(session,{email:'different@gmail.com'})}]){
  const bad=oauthMock(session,{tokenPatch:patch});await assert.rejects(()=>exchangeGmailAuthorization(client,session,'synthetic-code',redirect,{fetchImpl:bad.fetchImpl,now}));
 }
 const wrong=oauthMock(session,{discoveryPatch:{token_endpoint:'https://attacker.invalid/token'}});await assert.rejects(()=>exchangeGmailAuthorization(client,session,'synthetic-code',redirect,{fetchImpl:wrong.fetchImpl,now}));assert.equal(wrong.calls.length,1);
 const noCalls=oauthMock(session);await assert.rejects(()=>exchangeGmailAuthorization({...client,client_id:'987-other.apps.googleusercontent.com'},session,'synthetic-code',redirect,{fetchImpl:noCalls.fetchImpl,now}));assert.equal(noCalls.calls.length,0);
});
test('loopback start route exposes no token and invalid callback cannot consume a valid session',async t=>{
 const session=createGmailOAuthSession(client.client_id),listener=await startGmailLoopback(session);t.after(()=>listener.close());assert.equal(new URL(listener.startUrl).hostname,'127.0.0.1');assert(!listener.startUrl.includes(session.state));assert(!listener.startUrl.includes(session.verifier));
 const start=await fetch(listener.startUrl,{redirect:'manual'});assert.equal(start.status,302);assert.equal(new URL(start.headers.get('location')).hostname,'accounts.google.com');assert.equal(start.headers.get('referrer-policy'),'no-referrer');
 const bad=await fetch(listener.redirectUri+'?state=wrong&code=synthetic-code');assert.equal(bad.status,400);assert.equal(session.used,undefined);
 const good=await fetch(listener.redirectUri+'?state='+session.state+'&code=synthetic-code');assert.equal(good.status,200);assert.equal(await listener.code,'synthetic-code');assert(!(await good.text()).includes('synthetic-code'));
});
test('loopback timeout and approved storage pin fail closed without writing private credentials',async()=>{
 const session=createGmailOAuthSession(client.client_id),listener=await startGmailLoopback(session,{timeoutMs:100});await assert.rejects(listener.code,/timed out/);listener.close();
 assert.equal(approvedGmailStoragePaths(GMAIL_PRIVATE_HOME).file,'D:\\Coldbrew\\Resistor\\.runtime\\licensing\\gmail-oauth\\credentials.json');
 for(const dir of ['.runtime/licensing','D:/Coldbrew/Resistor/.runtime/licensing/../other','C:/Users/example/Downloads','D:/Coldbrew/Resistor/.runtime/licensing-other'])assert.throws(()=>approvedGmailStoragePaths(dir));
});

test('loopback final close and timeout destroy unfinished browser connections',{timeout:10000},async t=>{
 for(const outcome of ['success','cancel','timeout'])await t.test(outcome,async t=>{
  const session=createGmailOAuthSession(client.client_id),listener=await startGmailLoopback(session,{timeoutMs:outcome==='timeout'?250:600000});
  t.after(()=>listener.close());
  const socket=createConnection({host:'127.0.0.1',port:Number(new URL(listener.redirectUri).port)});
  t.after(()=>socket.destroy());
  let closeDeadline;
  const closed=new Promise(resolve=>socket.once('close',resolve));
  await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);});
  // Deliberately omit the final header terminator, like a held browser
  // preconnect/partial request. server.close() alone does not terminate it.
  socket.write('GET /start HTTP/1.1\r\nHost: '+new URL(listener.redirectUri).host+'\r\n');
  if(outcome==='success'){
   const response=await fetch(listener.redirectUri+'?state='+session.state+'&code=synthetic-code');
   assert.equal(response.status,200);await response.text();assert.equal(await listener.code,'synthetic-code');
   assert.equal(socket.destroyed,false);listener.close();listener.close();
  }else if(outcome==='cancel'){
   listener.close();await assert.rejects(listener.code,/canceled/);
  }else await assert.rejects(listener.code,/timed out/);
  try{await Promise.race([closed,new Promise((_,reject)=>{closeDeadline=setTimeout(()=>reject(Error('Unfinished loopback connection survived cleanup')),1500);})]);}
  finally{clearTimeout(closeDeadline);}
  assert.equal(socket.destroyed,true);
 });
});
test('help is safe and documents exact identity scopes, no overwrite and testing expiry',async()=>{
 const {stdout,stderr}=await promisify(execFile)(process.execPath,['scripts/license-gmail-connect.mjs','--help']);assert.equal(stderr,'');assert(stdout.includes('openid, email and gmail.send'));assert(stdout.includes('7 days'));assert(stdout.includes('never overwrites'));assert(!stdout.includes('client_secret'));assert(!stdout.includes('refresh_token'));
});
test('setup diagnostics use only allowlisted stage names and inspect ACL script never mutates',async()=>{
 assert.equal(safeGmailSetupDiagnostic('directory_acl').stage,'directory_acl');assert.equal(safeGmailSetupDiagnostic('private-token-marker').stage,'unknown');assert(!JSON.stringify(safeGmailSetupDiagnostic('private-token-marker')).includes('private-token-marker'));
 const inspect=gmailPrivateAclScript({readOnly:true});assert(inspect.includes('Get-Acl'));assert(!inspect.includes('Set-Acl'));assert(!inspect.includes('SetOwner'));assert(inspect.includes('Owner full control missing'));
 await assert.rejects(()=>promisify(execFile)(process.execPath,['scripts/license-gmail-connect.mjs','connect','--unexpected','private-token-marker']),error=>{const diagnostic=JSON.parse(error.stderr);return diagnostic.stage==='arguments'&&!error.stderr.includes('private-token-marker')&&!error.stdout;});
});
test('Windows protected directory and child file ACL exclude unrelated principals without changing existing files',{skip:process.platform!=='win32'},async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'resistor-gmail-acl-'));
 try{
  const exec=promisify(execFile),env={...process.env,RESISTOR_GMAIL_PRIVATE_DIRECTORY:directory};
  await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',gmailPrivateAclScript()],{windowsHide:true,env});
  // Repeat the read-only preflight against an already protected directory,
  // matching the setup state after the operator saves client.json there.
  await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',gmailPrivateAclScript({readOnly:true})],{windowsHide:true,env});
  const file=path.join(directory,'synthetic.json');await writeFile(file,'synthetic fixture, no credentials',{flag:'wx',mode:0o600});await assert.rejects(()=>writeFile(file,'must not overwrite',{flag:'wx'}),{code:'EEXIST'});assert.equal(await readFile(file,'utf8'),'synthetic fixture, no credentials');
  const result=await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',gmailPrivateAclScript({readOnly:true,childFile:true})],{windowsHide:true,env:{...env,RESISTOR_GMAIL_PRIVATE_DIRECTORY:file}});assert.equal(result.stdout,'');
 }finally{assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));await rm(directory,{recursive:true,force:true});}
});
test('Windows ACL validator rejects foreign owners, noninheritable grants, propagation flags and deny rules',{skip:process.platform!=='win32'},async()=>{
 const exec=promisify(execFile);
 const cases="$ErrorActionPreference='Stop'; $sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User; "+gmailPrivateAclValidatorScript()+"foreach($case in @('foreign_owner','folder_only','container_only','object_only','inherit_only','no_propagate','deny','missing_owner','unexpected_principal','read_only')) { $acl=New-Object System.Security.AccessControl.DirectorySecurity; $acl.SetOwner($sid); $acl.SetAccessRuleProtection($true,$false); $who=$sid; $flags=[System.Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit'; $prop=[System.Security.AccessControl.PropagationFlags]::None; $rights=[System.Security.AccessControl.FileSystemRights]::FullControl; $type=[System.Security.AccessControl.AccessControlType]::Allow; switch($case) { 'foreign_owner' { $acl.SetOwner([System.Security.Principal.SecurityIdentifier]::new('S-1-5-18')) }; 'folder_only' { $flags=[System.Security.AccessControl.InheritanceFlags]::None }; 'container_only' { $flags=[System.Security.AccessControl.InheritanceFlags]::ContainerInherit }; 'object_only' { $flags=[System.Security.AccessControl.InheritanceFlags]::ObjectInherit }; 'inherit_only' { $prop=[System.Security.AccessControl.PropagationFlags]::InheritOnly }; 'no_propagate' { $prop=[System.Security.AccessControl.PropagationFlags]::NoPropagateInherit }; 'deny' { $type=[System.Security.AccessControl.AccessControlType]::Deny }; 'missing_owner' { $who=[System.Security.Principal.SecurityIdentifier]::new('S-1-5-18') }; 'unexpected_principal' { $who=[System.Security.Principal.SecurityIdentifier]::new('S-1-1-0') }; 'read_only' { $rights=[System.Security.AccessControl.FileSystemRights]::Read } }; $rule=[System.Security.AccessControl.FileSystemAccessRule]::new($who,$rights,$flags,$prop,$type); $acl.AddAccessRule($rule); $rejected=$false; try { Assert-ResistorGmailAcl -Acl $acl -OwnerSid $sid } catch { $rejected=$true }; if(-not $rejected) { throw 'Unsafe ACL fixture was accepted' } };";
 const result=await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',cases],{windowsHide:true});assert.equal(result.stdout,'');
 const directory=await mkdtemp(path.join(os.tmpdir(),'resistor-gmail-acl-negative-')),env={...process.env,RESISTOR_GMAIL_PRIVATE_DIRECTORY:directory};
 try{
  // Create the deliberately noninheritable DACL directly on a new fixture.
  // Replacing an already protected DACL requests SeSecurityPrivilege on this
  // host, which must not be enabled for either this test or the real helper.
  const strip="$ErrorActionPreference='Stop'; Import-Module (Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/Modules/Microsoft.PowerShell.Security') -ErrorAction Stop; $d=$env:RESISTOR_GMAIL_PRIVATE_DIRECTORY; $sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User; $acl=New-Object System.Security.AccessControl.DirectorySecurity; $acl.SetOwner($sid); $acl.SetAccessRuleProtection($true,$false); $acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','None','None','Allow')); Set-Acl -LiteralPath $d -AclObject $acl;";
  await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',strip],{windowsHide:true,env});
  await assert.rejects(()=>exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',gmailPrivateAclScript({readOnly:true})],{windowsHide:true,env}),error=>error.stderr.includes('Private child inheritance missing'));
 }finally{assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));await rm(directory,{recursive:true,force:true});}
});
