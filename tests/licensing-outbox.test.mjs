import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomBytes,createHmac} from 'node:crypto';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import {createLicenseService} from '../platform/licensing/service.mjs';
import {createResendMailer} from '../platform/licensing/mail.mjs';
import {createGmailMailer} from '../platform/licensing/gmail.mjs';
import {configureLicenseMail} from '../platform/licensing/mail-config.mjs';
import {verifyResendWebhook} from '../platform/licensing/mail-webhook.mjs';

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const transport=fn=>Object.assign(fn,{provider:'resend',identity:'test-transport-v1',idempotencyWindowMs:86400000,prepare:p=>({recipient:p.email,serial:p.serial})});
async function fixture(t,{mailer,dailyMailAttemptLimit=80}={}){
 const dir=await mkdtemp(path.join(os.tmpdir(),'resistor-outbox-')),filename=path.join(dir,'license.sqlite'),keys=generateKeyPairSync('ed25519');let clock=Date.now();
 const options={filename,masterKey:randomBytes(32),privateKey:keys.privateKey.export({format:'pem',type:'pkcs8'}),now:()=>clock,mailer,dailyMailAttemptLimit};let service=createLicenseService(options);
 t.after(async()=>{service.close();await rm(dir,{recursive:true,force:true});});
 return {get service(){return service;},filename,now:()=>clock,advance:ms=>clock+=ms,restart(patch={}){service.close();service=createLicenseService({...options,...patch});},sql(fn){const db=new DatabaseSync(filename);try{return fn(db);}finally{db.close();}},issue(ref='order-one',patch={}){return service.issue({provider:'inflearn',purchase_ref:ref,edition:'edu',device_limit:2,email:'fixture@example.invalid',verified:true,evidence_sha256:'a'.repeat(64),...patch});}};
}
test('durable claim excludes concurrent sends and accepted acknowledgment never claims inbox delivery',async t=>{
 const d=deferred();let calls=0;const h=await fixture(t,{mailer:transport(async()=>{calls++;return d.promise;})}),order=h.issue();
 const first=h.service.deliver(order.delivery_id),other=await h.service.deliver(order.delivery_id);assert.equal(other.reason,'delivery_in_progress');assert.equal(calls,1);
 d.resolve({id:'email-one'});const result=await first;assert.equal(result.status,'accepted');assert.equal(result.provider_accepted,true);assert.equal(result.delivered_to_inbox,false);assert.equal(result.recipient_server_delivered,false);await h.service.deliver(order.delivery_id);assert.equal(calls,1);
});
test('late successful request cannot be downgraded by a newer failed lease',async t=>{
 const a=deferred(),b=deferred();let calls=0;const h=await fixture(t,{mailer:transport(()=>++calls===1?a.promise:b.promise)}),o=h.issue();
 const first=h.service.deliver(o.delivery_id);h.advance(60001);const second=h.service.deliver(o.delivery_id);a.resolve({id:'same-id'});assert.equal((await first).status,'accepted');b.reject(Error('response lost'));const r=await second;assert.equal(r.status,'accepted');assert.equal(r.provider_id,'same-id');assert.equal(h.service.outboxStatus().counts[0].status,'accepted');
});
test('restart retries immutable encrypted payload and same provider key, then deduplicates',async t=>{
 let calls=[];const m=transport(async p=>{calls.push(p);if(calls.length===1)throw Error('uncertain network');return {id:'provider-id'};});const h=await fixture(t,{mailer:m}),o=h.issue(),code=h.service.operatorDelivery(o.delivery_id).serial;
 await h.service.deliver(o.delivery_id);assert.equal((await h.service.deliver(o.delivery_id)).reason,'retry_scheduled');h.restart();h.advance(60001);assert.equal((await h.service.deliver(o.delivery_id)).status,'accepted');assert.equal(calls[0].idempotency_key,calls[1].idempotency_key);assert.deepEqual(calls[0].prepared_message,calls[1].prepared_message);
 for(const suffix of['','-wal']){const bytes=await readFile(h.filename+suffix);assert.equal(bytes.includes(Buffer.from(code)),false);assert.equal(bytes.includes(Buffer.from('fixture@example.invalid')),false);}assert.equal(JSON.stringify(h.service.outboxStatus()).includes(code),false);assert.equal(JSON.stringify(h.service.outboxStatus()).includes('fixture@example.invalid'),false);
});
test('ambiguous retry beyond safe idempotency window and changed provider identity require operator review',async t=>{
 let calls=0;const m=transport(async()=>{calls++;throw Error('timeout');}),h=await fixture(t,{mailer:m}),o=h.issue();await h.service.deliver(o.delivery_id);h.advance(23*3600000);let r=await h.service.deliver(o.delivery_id);assert.equal(r.status,'review_required');assert.equal(r.last_error,'idempotency_window_expired');assert.equal(calls,1);
 const another=h.issue('second');await h.service.deliver(another.delivery_id);h.advance(60001);h.restart({mailer:Object.assign(transport(async()=>{calls++;return {id:'wrong-new-account'};}),{identity:'changed-sender-or-key'})});r=await h.service.deliver(another.delivery_id);assert.equal(r.last_error,'transport_configuration_changed');assert.equal(calls,2);
});
test('attempts are bounded and invalid provider acknowledgment stays unconfirmed',async t=>{
 let calls=0;const h=await fixture(t,{mailer:transport(async()=>{calls++;return {};})}),o=h.issue();for(let n=0;n<8;n++){await h.service.deliver(o.delivery_id);h.advance([60000,300000,900000,3600000,7200000,14400000,21600000,1][n]+1);}const r=await h.service.deliver(o.delivery_id);assert.equal(r.status,'review_required');assert.equal(r.provider_accepted,false);assert.equal(calls,8);
});
test('persistent daily attempt budget and automatic scope preserve Industry queues',async t=>{
 let calls=0;const h=await fixture(t,{dailyMailAttemptLimit:1,mailer:transport(async()=>({id:'mail-'+(++calls)}))}),first=h.issue('one'),second=h.issue('two'),industry=h.issue('separate',{provider:'direct',edition:'indust'});
 await h.service.deliver(first.delivery_id);assert.equal(calls,1);h.restart();const pending=await h.service.deliver(second.delivery_id);assert.equal(pending.reason,'daily_attempt_limit');h.advance(86401001);await h.service.processOutbox();assert.equal(calls,2);assert.equal(h.service.operatorDelivery(industry.delivery_id).status,'pending');assert.equal(h.service.operatorDelivery(first.delivery_id).status,'accepted');
});
test('refund tombstone before issuance survives restart and cannot revoke a different provider',async t=>{
 const h=await fixture(t);const r=h.service.refund({purchase_ref:'future'});assert.equal(r.blocked_future_issuance,true);h.restart();assert.throws(()=>h.issue('future'),{code:'LICENSE_REVOKED'});assert.ok(h.issue('future',{provider:'direct',edition:'indust'}).license_id);
});
test('refund cancels unsent work and reconciles late provider acceptance without restoring entitlement',async t=>{
 const d=deferred();let calls=0;const h=await fixture(t,{mailer:transport(()=>{calls++;return d.promise;})}),o=h.issue(),code=h.service.operatorDelivery(o.delivery_id).serial;
 const inFlight=h.service.deliver(o.delivery_id);h.service.refund({purchase_ref:'order-one'});d.resolve({id:'accepted-during-refund'});const result=await inFlight;assert.equal(result.status,'canceled');assert.equal(result.provider_accepted,true);assert.equal(result.license_revoked,true);assert.throws(()=>h.service.activate({serial:code,edition:'edu',device_hash:'a'.repeat(64)}),{code:'LICENSE_REVOKED'});await h.service.deliver(o.delivery_id);assert.equal(calls,1);
 const unsent=h.issue('unsent');h.service.refund({purchase_ref:'unsent'});assert.equal((await h.service.deliver(unsent.delivery_id)).status,'canceled');assert.equal(calls,1);
});
test('legacy pending attempts require reconciliation while legacy accepted remains accepted',async t=>{
 let calls=0;const h=await fixture(t,{mailer:transport(async()=>{calls++;return {id:'unexpected'};})}),uncertain=h.issue(),accepted=h.issue('old-accepted');h.sql(db=>{db.prepare('UPDATE deliveries SET attempts=1 WHERE id=?').run(uncertain.delivery_id);db.prepare("UPDATE deliveries SET status='accepted',provider_id='legacy',attempts=1 WHERE id=?").run(accepted.delivery_id);});h.restart();assert.equal((await h.service.deliver(uncertain.delivery_id)).last_error,'legacy_attempt_window_unknown');assert.equal((await h.service.deliver(accepted.delivery_id)).status,'accepted');assert.equal(calls,0);
});
function signedEvent({secret='whsec_'+Buffer.alloc(32,7).toString('base64'),id='event-one',type='email.delivered',providerId='provider-one',clock=Date.now(),timestamp=Math.floor(clock/1000)}={}){const raw=JSON.stringify({type,created_at:new Date(clock).toISOString(),data:{email_id:providerId}}),signature=createHmac('sha256',Buffer.from(secret.slice(6),'base64')).update(`${id}.${timestamp}.${raw}`).digest('base64');return {secret,raw,headers:{'svix-id':id,'svix-timestamp':String(timestamp),'svix-signature':'v1,'+signature},clock};}
test('Resend raw-body verification rejects tamper, stale timestamps and bad signatures',()=>{
 const e=signedEvent();assert.equal(verifyResendWebhook(e.raw,e.headers,e.secret,{now:e.clock}).event_type,'email.delivered');assert.throws(()=>verifyResendWebhook(e.raw+' ',e.headers,e.secret,{now:e.clock}),{code:'DELIVERY_WEBHOOK_INVALID'});assert.throws(()=>verifyResendWebhook(e.raw,e.headers,e.secret,{now:e.clock+301000}),{code:'DELIVERY_WEBHOOK_INVALID'});assert.throws(()=>verifyResendWebhook(e.raw,e.headers,e.secret,{now:e.clock-301000}),{code:'DELIVERY_WEBHOOK_INVALID'});assert.equal(verifyResendWebhook(e.raw,{...e.headers,'svix-signature':'v1,AAAA '+e.headers['svix-signature']},e.secret,{now:e.clock}).provider_id,'provider-one');
});
test('signed pre-ack events, out-of-order replay and conflicting event IDs retain truthful evidence',async t=>{
 const d=deferred(),h=await fixture(t,{mailer:transport(()=>d.promise)}),o=h.issue(),pending=h.service.deliver(o.delivery_id);const e=signedEvent({clock:h.now()}),verified=verifyResendWebhook(e.raw,e.headers,e.secret,{now:h.now()});assert.equal(h.service.recordMailEvent(verified).matched_deliveries,0);d.resolve({id:'provider-one'});const result=await pending;assert.equal(result.recipient_server_delivered,true);assert.equal(result.delivered_to_inbox,false);assert.equal(h.service.recordMailEvent(verified).idempotent,true);assert.throws(()=>h.service.recordMailEvent({...verified,payload_sha256:'b'.repeat(64)}),{code:'DELIVERY_EVENT_CONFLICT'});
 for(const [id,type]of[['bounce','email.bounced'],['late-sent','email.sent']]){const event=signedEvent({id,type,clock:h.now()});h.service.recordMailEvent(verifyResendWebhook(event.raw,event.headers,event.secret,{now:h.now()}));}h.restart();const status=h.service.outboxStatus().deliveries[0];assert.equal(status.delivery_event_state,'bounced');assert.equal(status.recipient_server_delivered,true);assert.equal(status.delivered_to_inbox,false);
});
test('mail enablement is explicit and bad optional settings do not invalidate the signing service',()=>{
 const configured={LICENSE_MAIL_PROVIDER:'resend',RESEND_API_KEY:'fixture',LICENSE_MAIL_FROM:'teacher@example.invalid'};assert.equal(configureLicenseMail(configured).mailer,undefined);for(const flag of ['1','yes','TRUE'])assert.equal(configureLicenseMail({...configured,LICENSE_MAIL_SENDING_ENABLED:flag}).mailer,undefined);const enabled=configureLicenseMail({...configured,LICENSE_MAIL_SENDING_ENABLED:'true'});assert.equal(enabled.readiness.sending_enabled,true);assert.equal(enabled.readiness.inflearn_webhook,'not_connected');assert.equal(enabled.readiness.provider_connection_verified,false);assert.equal(configureLicenseMail({...configured,LICENSE_MAIL_SENDING_ENABLED:'true',LICENSE_MAIL_DAILY_ATTEMPT_LIMIT:'1000'}).readiness.configuration_error,'daily_attempt_limit_invalid');
});
test('Resend retry classifications respect idempotency conflicts without leaking provider body',async()=>{
 for(const [status,name,expected]of[[429,'rate_limit_exceeded','retryable'],[503,'internal_server_error','retryable'],[409,'concurrent_idempotent_requests','retryable'],[409,'invalid_idempotent_request','review'],[422,'validation_error','terminal']]){const m=createResendMailer({apiKey:'fixture',from:'teacher@example.invalid',fetchImpl:async()=>({ok:false,status,headers:new Headers({'Retry-After':'10'}),json:async()=>({name,message:'private-provider-content'})})});await assert.rejects(()=>m({email:'fixture@example.invalid',serial:'private-code',edition:'edu',device_limit:2,idempotency_key:'fixture-id'}),error=>error.mailFailure===expected&&!error.message.includes('private'));}
});

const gmailOptions={clientId:'test-client',clientSecret:'test-secret',refreshToken:'test-refresh',from:'owner@example.invalid',senderEmail:'owner@example.invalid'};
const tokenResponse=()=>new Response(JSON.stringify({access_token:'test-access',token_type:'Bearer',scope:'https://www.googleapis.com/auth/gmail.send'}),{status:200});
test('Gmail MIME uses deterministic UTF-8 headers/body and rejects recipient/sender header injection',()=>{
 const m=createGmailMailer(gmailOptions),payload={email:'learner@example.invalid',serial:'RS1-TEST',edition:'edu',device_limit:2,created_at:1000000};assert.deepEqual(m.prepare(payload),m.prepare(payload));const prepared=m.prepare(payload),mime=Buffer.from(prepared.body.raw,'base64url').toString('utf8'),[headers,content]=mime.split('\r\n\r\n');assert.match(headers,/From: owner@example.invalid/);assert.match(headers,/To: learner@example.invalid/);assert.match(headers,/Date: Thu, 01 Jan 1970/);assert.match(headers,/Subject: =\?UTF-8\?B\?/);assert.ok(headers.split('\r\n').every(line=>line.length<79));assert.match(Buffer.from(content.replace(/\r\n/g,''),'base64').toString('utf8'),/RS1-TEST/);assert.match(Buffer.from(content.replace(/\r\n/g,''),'base64').toString('utf8'),/Edu 사용권만/);
 for(const email of ['bad@example.invalid\r\nBcc: other@example.invalid','a@example.invalid,b@example.invalid','Name <a@example.invalid>'])assert.throws(()=>m.prepare({...payload,email}));assert.throws(()=>createGmailMailer({...gmailOptions,from:'other@example.invalid'}));assert.throws(()=>createGmailMailer({...gmailOptions,from:'a@example.invalid\r\nBcc: other@example.invalid'}));
});
test('Gmail only refreshes OAuth then sends to official endpoints and preserves provider acceptance meaning',async t=>{
 const calls=[];const mailer=createGmailMailer({...gmailOptions,fetchImpl:async(url,options)=>{calls.push({url,options});assert.equal(options.redirect,'manual');return url.includes('oauth2.')?tokenResponse():new Response(JSON.stringify({id:'gmail-id'}),{status:200});}}),h=await fixture(t,{mailer}),o=h.issue();const r=await h.service.deliver(o.delivery_id);assert.equal(r.status,'accepted');assert.equal(r.recipient_server_delivered,false);assert.equal(r.delivered_to_inbox,false);assert.deepEqual(calls.map(v=>v.url),['https://oauth2.googleapis.com/token','https://gmail.googleapis.com/gmail/v1/users/me/messages/send']);assert.equal(new URLSearchParams(calls[0].options.body).get('grant_type'),'refresh_token');assert.equal(calls[1].options.headers.Authorization,'Bearer test-access');assert.equal(calls[1].options.headers['Idempotency-Key'],undefined);await h.service.deliver(o.delivery_id);assert.equal(calls.length,2);
});
test('Gmail retries proven pre-send OAuth failure but never an ambiguous send',async t=>{
 let tokenCalls=0,sendCalls=0;const mailer=createGmailMailer({...gmailOptions,fetchImpl:async url=>{if(url.includes('oauth2.')){if(++tokenCalls===1)throw Error('token network offline');return tokenResponse();}sendCalls++;throw Error('send response lost');}}),h=await fixture(t,{mailer}),o=h.issue();const first=await h.service.deliver(o.delivery_id);assert.equal(first.status,'pending');assert.equal(first.last_error,'provider_pre_send_failed');assert.equal(sendCalls,0);h.advance(60001);const second=await h.service.deliver(o.delivery_id);assert.equal(second.status,'review_required');assert.equal(sendCalls,1);h.advance(86400000);h.restart();await h.service.deliver(o.delivery_id);assert.equal(sendCalls,1);assert.equal(tokenCalls,2);
});
test('Gmail durable interrupted-attempt marker cannot become a second send after restart',async t=>{
 let tokenCalls=0;const mailer=createGmailMailer({...gmailOptions,fetchImpl:async()=>{tokenCalls++;throw Error('no token response');}}),h=await fixture(t,{mailer}),o=h.issue();await h.service.deliver(o.delivery_id);h.sql(db=>db.prepare('UPDATE deliveries SET last_error=? WHERE id=?').run('provider_request_in_progress',o.delivery_id));h.advance(61000);h.restart();const r=await h.service.deliver(o.delivery_id);assert.equal(r.status,'review_required');assert.equal(r.last_error,'provider_has_no_safe_retry');assert.equal(tokenCalls,1);
});
test('refund while Gmail OAuth is awaiting prevents the subsequent send request',async t=>{
 const token=deferred();let sends=0;const mailer=createGmailMailer({...gmailOptions,fetchImpl:async url=>{if(url.includes('oauth2.'))return token.promise;sends++;return new Response(JSON.stringify({id:'must-not-send'}));}}),h=await fixture(t,{mailer}),o=h.issue(),pending=h.service.deliver(o.delivery_id);h.service.refund({purchase_ref:'order-one'});token.resolve(tokenResponse());assert.equal((await pending).status,'canceled');assert.equal(sends,0);
});
test('Gmail OAuth rejection is terminal before sending; malformed send ack requires review',async t=>{
 let sends=0;const rejected=createGmailMailer({...gmailOptions,fetchImpl:async url=>{if(!url.includes('oauth2.'))sends++;return new Response(JSON.stringify({error:'invalid_grant'}),{status:400});}}),h=await fixture(t,{mailer:rejected}),o=h.issue();assert.equal((await h.service.deliver(o.delivery_id)).status,'failed');assert.equal(sends,0);
 h.restart({mailer:createGmailMailer({...gmailOptions,fetchImpl:async url=>url.includes('oauth2.')?tokenResponse():new Response('{}',{status:200})})});const other=h.issue('missing-ack');assert.equal((await h.service.deliver(other.delivery_id)).status,'review_required');
 const configured=configureLicenseMail({LICENSE_MAIL_PROVIDER:'gmail',LICENSE_MAIL_SENDING_ENABLED:'true',LICENSE_MAIL_FROM:gmailOptions.from,GMAIL_SENDER_EMAIL:gmailOptions.senderEmail,GMAIL_CLIENT_ID:'test',GMAIL_CLIENT_SECRET:'test',GMAIL_REFRESH_TOKEN:'test'});assert.equal(configured.readiness.sending_enabled,true);assert.equal(configured.readiness.delivery_event_support,'not_available_with_send_only_scope');
});
test('Gmail rejects broadened or expired OAuth tokens and does not follow credential redirects',async()=>{
 const payload={email:'fixture@example.invalid',serial:'fixture',edition:'edu',device_limit:2};
 for(const token of [{access_token:'test',token_type:'Bearer',scope:'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly'},{access_token:'test',token_type:'Bearer',scope:'https://www.googleapis.com/auth/gmail.send',expires_in:0}]){let calls=0;const mailer=createGmailMailer({...gmailOptions,fetchImpl:async()=>{calls++;return new Response(JSON.stringify(token),{status:200});}});await assert.rejects(()=>mailer(payload),error=>error.mailFailure==='terminal'&&error.safePreSendFailure===true);assert.equal(calls,1);}
 let calls=0;const redirected=createGmailMailer({...gmailOptions,fetchImpl:async(_url,options)=>{calls++;assert.equal(options.redirect,'manual');return new Response(null,{status:307,headers:{Location:'https://wrong.example.invalid'}});}});await assert.rejects(()=>redirected(payload),error=>error.mailFailure==='terminal'&&error.safePreSendFailure);assert.equal(calls,1);
});
