// Operator-only OAuth setup. No learner authorization, mailbox reading, mail
// sending, production deployment, or automatic browser/account interaction.
// https://developers.google.com/identity/protocols/oauth2/native-app
// https://developers.google.com/identity/openid-connect/openid-connect
import {createServer} from 'node:http';
import {randomBytes,createHash,createPublicKey,verify,timingSafeEqual} from 'node:crypto';
import {readFile,lstat,realpath,mkdir,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const GMAIL_SEND_SCOPE='https://www.googleapis.com/auth/gmail.send';
export const GMAIL_CONNECT_SCOPES=Object.freeze(['openid','email',GMAIL_SEND_SCOPE]);
export const GMAIL_PRIVATE_HOME='D:/Coldbrew/Resistor/.runtime/licensing';
export const GMAIL_EXPECTED_SENDER='creditlsh00726@gmail.com';
const GOOGLE=Object.freeze({discovery:'https://accounts.google.com/.well-known/openid-configuration',authorization:'https://accounts.google.com/o/oauth2/v2/auth',token:'https://oauth2.googleapis.com/token',jwks:'https://www.googleapis.com/oauth2/v3/certs'});
const run=promisify(execFile),deny=message=>{throw Error(message);};
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const token=value=>typeof value==='string'&&value.length>0&&value.length<=8192&&/^[\x21-\x7e]+$/.test(value);
const issuer=value=>value==='https://accounts.google.com'||value==='accounts.google.com';
const setupStages=new Set(['arguments','source_path','source_read','client_validation','destination_path','destination_existing_file','git_ignore','directory_create','directory_links','directory_acl','session_create','loopback_bind','oauth_callback','google_token_verification','credential_write']);
let setupStage='arguments';
export function safeGmailSetupDiagnostic(stage){return {ok:false,stage:setupStages.has(stage)?stage:'unknown',message:'Gmail setup did not complete. No credential contents were logged. Existing credentials are never overwritten.'};}

export function parseGmailDesktopClient(value){
 const c=value?.installed;
 if(!c||value.web||typeof c.client_id!=='string'||!/^\d+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(c.client_id)||!token(c.client_secret))deny('An approved Google Desktop app OAuth client JSON is required.');
 if(c.token_uri&&c.token_uri!==GOOGLE.token)deny('OAuth client uses an unexpected token endpoint.');
 if(c.auth_uri&&!['https://accounts.google.com/o/oauth2/auth',GOOGLE.authorization].includes(c.auth_uri))deny('OAuth client uses an unexpected authorization endpoint.');
 return {client_id:c.client_id,client_secret:c.client_secret};
}
export function createGmailOAuthSession(clientId,{expectedSender=GMAIL_EXPECTED_SENDER,now=Date.now()}={}){
 if(!/^\d+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId)||expectedSender!==GMAIL_EXPECTED_SENDER)deny('This helper is limited to the configured single owner.');
 const verifier=randomBytes(48).toString('base64url');
 return {clientId,expectedSender,verifier,challenge:createHash('sha256').update(verifier).digest('base64url'),state:randomBytes(32).toString('base64url'),nonce:randomBytes(32).toString('base64url'),createdAt:now,expiresAt:now+600000};
}
export function gmailAuthorizationUrl(session,redirectUri){
 const redirect=new URL(redirectUri);
 if(redirect.protocol!=='http:'||redirect.hostname!=='127.0.0.1'||!redirect.port||redirect.pathname!=='/'||redirect.search||redirect.hash||redirect.username||redirect.password)deny('Exact loopback OAuth callback required.');
 const u=new URL(GOOGLE.authorization);
 u.search=new URLSearchParams({client_id:session.clientId,redirect_uri:redirectUri,response_type:'code',scope:GMAIL_CONNECT_SCOPES.join(' '),state:session.state,nonce:session.nonce,code_challenge:session.challenge,code_challenge_method:'S256',access_type:'offline',prompt:'consent select_account',login_hint:session.expectedSender}).toString();
 return u.toString();
}
export function readGmailOAuthCallback(requestUrl,{host,method='GET',remoteAddress='127.0.0.1'},session,redirectUri,now=Date.now()){
 const expected=new URL(redirectUri);
 if(now>=session.expiresAt||session.used)deny('OAuth session expired or already consumed.');
 if(method!=='GET'||remoteAddress!=='127.0.0.1'||host!==expected.host||typeof requestUrl!=='string'||!requestUrl.startsWith('/?')||requestUrl.length>16384)deny('Unexpected OAuth callback.');
 const u=new URL(requestUrl,expected.origin);
 if(u.origin!==expected.origin||u.pathname!=='/'||u.hash||u.searchParams.getAll('state').length!==1||!equal(u.searchParams.get('state'),session.state)||u.searchParams.getAll('code').length>1||u.searchParams.getAll('error').length>1)deny('OAuth callback state or route mismatch.');
 if(u.searchParams.has('iss')&&!issuer(u.searchParams.get('iss')))deny('OAuth issuer mismatch.');
 if(u.searchParams.has('error')){session.used=true;deny('Google authorization was declined; nothing was saved.');}
 const code=u.searchParams.get('code');if(!token(code)||code.length>4096)deny('Authorization code is missing or invalid.');
 session.used=true;return code;
}
export function validateGmailGrantedScopes(scope){
 if(typeof scope!=='string')deny('Google did not confirm granted scopes.');
 const allowed=new Set(['openid','email','https://www.googleapis.com/auth/userinfo.email',GMAIL_SEND_SCOPE]);
 const granted=new Set(scope.split(/\s+/).filter(Boolean));
 if(!granted.has('openid')||!granted.has(GMAIL_SEND_SCOPE)||(!granted.has('email')&&!granted.has('https://www.googleapis.com/auth/userinfo.email'))||[...granted].some(s=>!allowed.has(s)))deny('OAuth grant must contain only gmail.send and openid/email identity permissions.');
 return [...GMAIL_CONNECT_SCOPES];
}
function decodeJwtPart(part){
 if(typeof part!=='string'||!part||!/^[a-zA-Z0-9_-]+$/.test(part))deny('Invalid Google ID token.');
 try{const bytes=Buffer.from(part,'base64url');if(bytes.toString('base64url')!==part)deny('Invalid Google ID token.');return JSON.parse(bytes.toString('utf8'));}catch{deny('Invalid Google ID token.');}
}
export function verifyGmailOwnerIdToken(jwt,jwks,{clientId,nonce,expectedSender=GMAIL_EXPECTED_SENDER,accessToken,now=Date.now()}){
 if(typeof jwt!=='string'||jwt.length>16384||expectedSender!==GMAIL_EXPECTED_SENDER)deny('Invalid Google ID token.');
 const parts=jwt.split('.');if(parts.length!==3)deny('Invalid Google ID token.');
 const header=decodeJwtPart(parts[0]),claims=decodeJwtPart(parts[1]);
 if(header.alg!=='RS256'||typeof header.kid!=='string'||header.kid.length>200||header.crit||header.jku||header.x5u||header.jwk||header.b64!==undefined||!Array.isArray(jwks?.keys))deny('Unsupported Google ID-token signature.');
 const keys=jwks.keys.filter(k=>k.kid===header.kid&&k.kty==='RSA'&&k.alg==='RS256'&&k.use==='sig');if(keys.length!==1)deny('Google ID-token signing key is unavailable.');
 let publicKey;try{publicKey=createPublicKey({key:keys[0],format:'jwk'});}catch{deny('Invalid Google signing key.');}
 if(publicKey.asymmetricKeyDetails?.modulusLength<2048||!/^[a-zA-Z0-9_-]+$/.test(parts[2])||!verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),publicKey,Buffer.from(parts[2],'base64url')))deny('Google ID-token signature verification failed.');
 const seconds=Math.floor(now/1000);
 if(!issuer(claims.iss)||claims.aud!==clientId||(claims.azp!==undefined&&claims.azp!==clientId)||!Number.isSafeInteger(claims.exp)||claims.exp<=seconds||!Number.isSafeInteger(claims.iat)||claims.iat>seconds+60||claims.iat<seconds-600||claims.exp<=claims.iat||claims.exp-claims.iat>7200||!equal(claims.nonce,nonce))deny('Google ID-token audience, freshness or nonce mismatch.');
 if(typeof claims.sub!=='string'||!/^[a-zA-Z0-9_-]{1,255}$/.test(claims.sub)||![true,'true'].includes(claims.email_verified)||typeof claims.email!=='string'||claims.email.toLowerCase()!==expectedSender)deny('The verified Google account is not the approved sender.');
 if(claims.at_hash!==undefined&&(!token(accessToken)||!equal(claims.at_hash,createHash('sha256').update(accessToken).digest().subarray(0,16).toString('base64url'))))deny('Google identity and access token do not match.');
 return {email:expectedSender,subject:claims.sub,identity_verified:true,verification:'google-rs256-id-token',verified_at:new Date(now).toISOString()};
}
async function readGoogleJson(url,options={},fetchImpl=fetch){
 let response;try{response=await fetchImpl(url,{...options,redirect:'error',signal:AbortSignal.timeout(20000)});}catch{deny('Google OAuth network request failed; nothing was saved.');}
 if(!response.ok)deny('Google OAuth rejected the request; nothing was saved.');
 const reader=response.body?.getReader();if(!reader)deny('Google returned an invalid response.');
 let size=0,chunks=[];while(true){const item=await reader.read();if(item.done)break;size+=item.value.byteLength;if(size>65536){await reader.cancel();deny('Google response exceeded the safe size limit.');}chunks.push(item.value);}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{deny('Google returned invalid JSON.');}
}
export async function exchangeGmailAuthorization(client,session,code,redirectUri,{fetchImpl=fetch,now=Date.now(),publishingStatus='unknown'}={}){
 if(!session.used||now>=session.expiresAt||client.client_id!==session.clientId||!token(code)||!['testing','production','unknown'].includes(publishingStatus))deny('A current, consumed OAuth callback is required.');
 gmailAuthorizationUrl(session,redirectUri);
 const discovery=await readGoogleJson(GOOGLE.discovery,{},fetchImpl);
 if(discovery.issuer!=='https://accounts.google.com'||discovery.authorization_endpoint!==GOOGLE.authorization||discovery.token_endpoint!==GOOGLE.token||discovery.jwks_uri!==GOOGLE.jwks)deny('Google discovery endpoints do not match the supported secure configuration.');
 const tokens=await readGoogleJson(GOOGLE.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:client.client_id,client_secret:client.client_secret,code,redirect_uri:redirectUri,grant_type:'authorization_code',code_verifier:session.verifier})},fetchImpl);
 if(client.client_id!==session.clientId||tokens.token_type!=='Bearer'||!token(tokens.access_token)||!token(tokens.refresh_token)||!Number.isSafeInteger(tokens.expires_in)||tokens.expires_in<1||tokens.expires_in>86400)deny('A valid offline Gmail token grant is required; nothing was saved.');
 const scopes=validateGmailGrantedScopes(tokens.scope),jwks=await readGoogleJson(GOOGLE.jwks,{},fetchImpl);
 const owner=verifyGmailOwnerIdToken(tokens.id_token,jwks,{clientId:client.client_id,nonce:session.nonce,expectedSender:session.expectedSender,accessToken:tokens.access_token,now});
 if(tokens.refresh_token_expires_in!==undefined&&(!Number.isSafeInteger(tokens.refresh_token_expires_in)||tokens.refresh_token_expires_in<1))deny('Invalid refresh-token lifetime.');
 const expiry=tokens.refresh_token_expires_in??(publishingStatus==='testing'?604800:null);
 return {schema_version:1,provider:'gmail',...owner,scopes,publishing_status:publishingStatus,publishing_status_source:'operator_declared',refresh_expires_at:expiry===null?null:new Date(now+expiry*1000).toISOString(),refresh_expiry_source:tokens.refresh_token_expires_in!==undefined?'google-token-response':publishingStatus==='testing'?'google-testing-policy':'unknown',unattended_delivery_verified:false,credentials:{GMAIL_CLIENT_ID:client.client_id,GMAIL_CLIENT_SECRET:client.client_secret,GMAIL_REFRESH_TOKEN:tokens.refresh_token,GMAIL_SENDER_EMAIL:owner.email}};
}

export async function startGmailLoopback(session,{timeoutMs=600000}={}){
 if(!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>600000)deny('Invalid OAuth waiting period.');
 let resolveCode,rejectCode,redirectUri,started=false,timer;
 const sockets=new Set();
 const code=new Promise((resolve,reject)=>{resolveCode=resolve;rejectCode=reject;});code.catch(()=>{});
 const server=createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'");res.setHeader('X-Content-Type-Options','nosniff');
  const expected=new URL(redirectUri);
  if(req.method==='GET'&&req.url==='/start'&&req.headers.host===expected.host&&req.socket.remoteAddress==='127.0.0.1'&&!started&&!session.used){started=true;res.writeHead(302,{Location:gmailAuthorizationUrl(session,redirectUri)});res.end();return;}
  try{const value=readGmailOAuthCallback(req.url,{host:req.headers.host,method:req.method,remoteAddress:req.socket.remoteAddress},session,redirectUri);clearTimeout(timer);res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'});res.end('Google authorization received. Account verification and protected storage continue in the local helper. You may close this tab.');resolveCode(value);server.close();}
  catch{res.writeHead(400,{'Content-Type':'text/plain; charset=utf-8'});res.end('Authorization was declined or the callback is invalid. No token has been saved.');if(session.used){clearTimeout(timer);rejectCode(Error('Google authorization declined.'));server.close();}}
 });
 server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});
 // server.close() stops accepting connections but may leave an unfinished
 // browser/preconnect request alive indefinitely. Final cleanup must also
 // destroy accepted sockets, including any not managed as HTTP connections.
 function closeConnections(){server.close();server.closeAllConnections?.();for(const socket of sockets)socket.destroy();}
 await new Promise((resolve,reject)=>{server.once('error',()=>reject(Error('Cannot bind local OAuth callback.')));server.listen(0,'127.0.0.1',resolve);});
 redirectUri='http://127.0.0.1:'+server.address().port+'/';
 timer=setTimeout(()=>{session.used=true;closeConnections();rejectCode(Error('Google authorization timed out; nothing was saved.'));},timeoutMs);
 return {redirectUri,startUrl:redirectUri+'start',code,close(){clearTimeout(timer);closeConnections();session.used=true;rejectCode(Error('Google authorization canceled.'));}};
}

export function approvedGmailStoragePaths(approvedHome,{credentialSuffix}={}){
 const expected=path.win32.resolve(GMAIL_PRIVATE_HOME);
 if(typeof approvedHome!=='string'||!path.win32.isAbsolute(approvedHome)||path.win32.resolve(approvedHome).toLowerCase()!==expected.toLowerCase())deny('Approve the existing authority private directory explicitly; other destinations are not allowed.');
 if(credentialSuffix!==undefined&&(typeof credentialSuffix!=='string'||!/^[a-z0-9][a-z0-9-]{0,47}$/.test(credentialSuffix)))deny('Credential suffix must be a short lowercase identifier.');
 const filename=credentialSuffix===undefined?'credentials.json':'credentials-'+credentialSuffix+'.json';
 return {home:expected,directory:path.win32.join(expected,'gmail-oauth'),file:path.win32.join(expected,'gmail-oauth',filename)};
}
async function assertNoLinks(file){
 let current=file;for(;;){const info=await lstat(current);if(info.isSymbolicLink())deny('Secret paths cannot contain links or reparse points.');const parent=path.dirname(current);if(parent===current)break;current=parent;}
}
export function gmailPrivateAclValidatorScript(){
 return "function Assert-ResistorGmailAcl { param([System.Security.AccessControl.FileSystemSecurity]$Acl,[System.Security.Principal.SecurityIdentifier]$OwnerSid,[bool]$Directory=$true); if($Acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -ne $OwnerSid.Value) { throw 'Unexpected owner' }; if($Directory -and -not $Acl.AreAccessRulesProtected) { throw 'Unprotected ACL' }; $rules=$Acl.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier]); $hasOwner=$false; foreach($r in $rules) { if($r.IdentityReference.Value -notin @($OwnerSid.Value,'S-1-5-18','S-1-5-32-544')) { throw 'Unexpected principal' }; if($r.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow -or $r.PropagationFlags -ne [System.Security.AccessControl.PropagationFlags]::None) { throw 'Unsafe ACL propagation or deny rule' }; if(($r.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl) -ne [System.Security.AccessControl.FileSystemRights]::FullControl) { throw 'Private full control missing' }; if($Directory -and ($r.IsInherited -or $r.InheritanceFlags -ne ([System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit))) { throw 'Private child inheritance missing' }; if($r.IdentityReference.Value -eq $OwnerSid.Value) { $hasOwner=$true } }; if(-not $hasOwner) { throw 'Owner full control missing' } }; ";
}
export function gmailPrivateAclScript({readOnly=false,childFile=false}={}){
 if(childFile&&!readOnly)deny('Child file ACL checks are read-only.');
 const prefix="$ErrorActionPreference='Stop'; Import-Module (Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/Modules/Microsoft.PowerShell.Security') -ErrorAction Stop; $d=$env:RESISTOR_GMAIL_PRIVATE_DIRECTORY; $sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User; ";
 const protect="$acl=New-Object System.Security.AccessControl.DirectorySecurity; $acl.SetOwner($sid); $acl.SetAccessRuleProtection($true,$false); foreach($id in @($sid.Value,'S-1-5-18','S-1-5-32-544')) { $rule=New-Object System.Security.AccessControl.FileSystemAccessRule([System.Security.Principal.SecurityIdentifier]::new($id),'FullControl','ContainerInherit,ObjectInherit','None','Allow'); $acl.AddAccessRule($rule) }; Set-Acl -LiteralPath $d -AclObject $acl; ";
 return prefix+gmailPrivateAclValidatorScript()+(readOnly?'':protect)+"Assert-ResistorGmailAcl -Acl (Get-Acl -LiteralPath $d) -OwnerSid $sid -Directory $"+(childFile?'false':'true')+';';
}
async function checkPrivateAcl(file,{childFile=false}={}){await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',gmailPrivateAclScript({readOnly:true,childFile})],{windowsHide:true,env:{...process.env,RESISTOR_GMAIL_PRIVATE_DIRECTORY:file},timeout:20000});}
async function preparePrivateStorage(approvedHome,{readOnly=false,credentialSuffix}={}){
 setupStage='destination_path';
 if(process.platform!=='win32')deny('This setup helper only writes to the approved Windows authority workspace.');
 const paths=approvedGmailStoragePaths(approvedHome,{credentialSuffix});await assertNoLinks(paths.home);
 if((await realpath(paths.home)).toLowerCase()!==paths.home.toLowerCase())deny('Authority private directory resolved unexpectedly.');
 setupStage='destination_existing_file';
 try{await lstat(paths.file);deny('A Gmail credential file already exists. It will not be overwritten.');}catch(e){if(e.code!=='ENOENT')throw e;}
 setupStage='git_ignore';
 try{await run('git',['-C','D:/Coldbrew/Resistor','check-ignore','--quiet','--','.runtime/licensing/gmail-oauth/'+path.win32.basename(paths.file)],{windowsHide:true});}catch{deny('Secret destination must be excluded from Git before OAuth starts.');}
 setupStage='directory_create';
 try{if(!(await lstat(paths.directory)).isDirectory())deny('Private destination must be a directory.');}catch(e){if(e.code!=='ENOENT'||readOnly)throw e;await mkdir(paths.directory,{recursive:false,mode:0o700});}
 setupStage='directory_links';await assertNoLinks(paths.directory);
 setupStage='directory_acl';
 const acl=inspect=>run('powershell.exe',['-NoProfile','-NonInteractive','-Command',gmailPrivateAclScript({readOnly:inspect})],{windowsHide:true,env:{...process.env,RESISTOR_GMAIL_PRIVATE_DIRECTORY:paths.directory},timeout:20000});
 try{await acl(true);}catch{if(readOnly)deny('Private Windows ACL verification failed; OAuth was not started.');try{await acl(false);}catch{deny('Private Windows ACL verification failed; OAuth was not started.');}}
 return paths;
}
async function cli(){
 const args=process.argv.slice(2);
 if(!args.length||args[0]==='--help'){console.log('Operator-only setup: node scripts/license-gmail-connect.mjs connect --client-file ABSOLUTE_APPROVED_CLIENT_JSON --approved-private-dir D:/Coldbrew/Resistor/.runtime/licensing --approve-identity-scopes --publishing-status testing|production|unknown\nUse inspect instead of connect for read-only local checks, without OAuth, listener or credential writes. For an explicitly approved renewal, add --credential-suffix production-YYYYMMDD to create credentials-production-YYYYMMDD.json beside the original; existing files are never replaced. Requests only openid, email and gmail.send. Verifies creditlsh00726@gmail.com using a Google-signed ID token. Prints no tokens, sends no email and never overwrites credentials. A Testing refresh token is limited to 7 days. Run only after explicit approval of the client file and private destination.');return;}
 const readOnly=args[0]==='inspect';if(!['connect','inspect'].includes(args[0])||(!readOnly&&!args.includes('--approve-identity-scopes')))deny('Explicit connect command and identity-scope approval are required.');
 const options={};for(let i=1;i<args.length;i++){const key=args[i];if(key==='--approve-identity-scopes')continue;if(!['--client-file','--approved-private-dir','--publishing-status','--credential-suffix'].includes(key)||options[key]!==undefined||!args[i+1]||args[i+1].startsWith('--'))deny('Invalid setup arguments.');options[key]=args[++i];}
 setupStage='source_path';const file=options['--client-file'];if(!file||!path.isAbsolute(file))deny('An approved absolute OAuth client JSON path is required.');await assertNoLinks(file);
 const info=await lstat(file);if(!info.isFile()||info.size>16384)deny('Invalid OAuth client JSON file.');
 setupStage='source_read';
 let parsed;try{parsed=JSON.parse(await readFile(file,'utf8'));}catch{deny('Cannot read the approved OAuth client JSON.');}
 setupStage='client_validation';
 const client=parseGmailDesktopClient(parsed),publishingStatus=options['--publishing-status']??'unknown';if(!['testing','production','unknown'].includes(publishingStatus))deny('Invalid declared publishing status.');
 const paths=await preparePrivateStorage(options['--approved-private-dir'],{readOnly,credentialSuffix:options['--credential-suffix']});
 if(readOnly){console.log(JSON.stringify({ok:true,stage:'local_preflight',client_valid:true,path_valid:true,private_acl_verified:true,git_ignored:true,oauth_started:false,credentials_written:false}));return;}
 setupStage='session_create';const session=createGmailOAuthSession(client.client_id);setupStage='loopback_bind';const listener=await startGmailLoopback(session);
 console.log('Open '+listener.startUrl+' in your browser. Approve only the owner account and the displayed openid/email + Gmail send permissions. No email will be sent.');
 try{setupStage='oauth_callback';const code=await listener.code;setupStage='google_token_verification';const record=await exchangeGmailAuthorization(client,session,code,listener.redirectUri,{publishingStatus});setupStage='credential_write';await assertNoLinks(paths.directory);await checkPrivateAcl(paths.directory);await writeFile(paths.file,JSON.stringify(record,null,2)+'\n',{flag:'wx',mode:0o600});await checkPrivateAcl(paths.file,{childFile:true});console.log(JSON.stringify({saved:true,email:record.email,identity_verified:true,scopes:record.scopes,refresh_expiry_source:record.refresh_expiry_source,refresh_expires_at:record.refresh_expires_at,path:paths.file,email_sent:false,production_configured:false}));}finally{listener.close();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))cli().catch(()=>{console.error(JSON.stringify(safeGmailSetupDiagnostic(setupStage)));process.exitCode=1;});
