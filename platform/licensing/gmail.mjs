import {createHash} from 'node:crypto';
import {licenseMailContent} from './mail.mjs';
const simpleAddress=value=>typeof value==='string'&&value.length<=254&&/^[A-Za-z0-9.!#$%&'*+\-/=?^_`{|}~]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}$/.test(value);
const safeFailure=(kind,preSend=false)=>Object.assign(Error('Gmail transport did not confirm the request'),{mailFailure:kind,safePreSendFailure:preSend});
function encodedSubject(value){let words=[],part='';for(const char of value){if(Buffer.byteLength(part+char)>36){words.push(part);part='';}part+=char;}if(part)words.push(part);return words.map(s=>'=?UTF-8?B?'+Buffer.from(s).toString('base64')+'?=').join('\r\n ');}

/** gmail.send only. This adapter never reads the mailbox, claims delivery, or
 * treats a Message-ID as a provider idempotency guarantee. */
export function createGmailMailer({clientId,clientSecret,refreshToken,from,senderEmail,fetchImpl=fetch}){
 if(!clientId||!clientSecret||!refreshToken||!from||!senderEmail)return undefined;
 if(!simpleAddress(from)||from!==senderEmail||![clientId,clientSecret,refreshToken].every(v=>typeof v==='string'&&v.length>0&&!/[\r\n\0]/.test(v)))throw Error('Authorized Gmail sender and OAuth credentials are required');
 const prepare=payload=>{
  if(!simpleAddress(payload.email)||(payload.kind==='mail_smoke'&&(payload.email!==senderEmail||payload.serial!==undefined)))throw safeFailure('terminal',true);
  const {subject,text}=licenseMailContent(payload),content=Buffer.from(text.replace(/\r?\n/g,'\r\n')).toString('base64').match(/.{1,76}/g).join('\r\n');
  const mime=[`Date: ${new Date(payload.created_at??Date.now()).toUTCString()}`,`From: ${from}`,`To: ${payload.email}`,`Subject: ${encodedSubject(subject)}`,'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',content,''].join('\r\n');
  return {schema_version:1,provider:'gmail',body:{raw:Buffer.from(mime).toString('base64url')}};
 };
 const send=async input=>{
  const message=input.prepared_message??prepare(input);
  if(message?.schema_version!==1||message.provider!=='gmail'||typeof message.body?.raw!=='string'||!/^[A-Za-z0-9_-]+$/.test(message.body.raw))throw safeFailure('terminal',true);
  let token;
  try{
   const response=await fetchImpl('https://oauth2.googleapis.com/token',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refreshToken,grant_type:'refresh_token'}).toString(),signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw safeFailure(response.status>=500||response.status===429||response.status===408?'retryable':'terminal',true);
   const value=await response.json();if(typeof value.access_token!=='string'||!value.access_token||/[\r\n\0]/.test(value.access_token)||value.token_type?.toLowerCase()!=='bearer')throw safeFailure('terminal',true);
   // Refresh may omit scope; when present, accept only send + the minimal
   // verified-account identity scopes used by the separate OAuth setup helper.
   const sendScope='https://www.googleapis.com/auth/gmail.send',allowed=new Set([sendScope,'openid','email','https://www.googleapis.com/auth/userinfo.email']);
   if(value.scope!==undefined&&(typeof value.scope!=='string'||!value.scope.split(' ').includes(sendScope)||value.scope.split(' ').some(s=>!allowed.has(s))))throw safeFailure('terminal',true);
   if(value.expires_in!==undefined&&(!Number.isFinite(value.expires_in)||value.expires_in<=0))throw safeFailure('terminal',true);
   token=value.access_token;
  }catch(error){if(error.safePreSendFailure)throw error;throw safeFailure('retryable',true);}
  // Gmail has no documented send idempotency key. Once a send is attempted,
  // any missing/invalid acknowledgment is ambiguous: do not resend automatically.
  input.before_send?.();
  try{
   const response=await fetchImpl('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',redirect:'manual',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(message.body),signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw safeFailure('review');const value=await response.json();if(typeof value.id!=='string'||!value.id||value.id.length>200||/[\r\n\0]/.test(value.id))throw safeFailure('review');return {id:value.id};
  }catch{throw safeFailure('review');}
 };
 return Object.assign(send,{prepare,provider:'gmail',senderEmail,retrySafety:'no-provider-idempotency',identity:createHash('sha256').update('gmail-v1\0'+clientId+'\0'+clientSecret+'\0'+refreshToken+'\0'+from).digest('hex')});
}
