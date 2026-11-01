import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {licenseError} from './token.mjs';
const eventTypes=new Set(['email.sent','email.delivered','email.bounced','email.complained','email.failed','email.suppressed','email.delivery_delayed']);
const deny=()=>{throw licenseError('DELIVERY_WEBHOOK_INVALID','메일 이벤트 서명 또는 시간이 올바르지 않습니다.');};

// Resend's documented Svix format: HMAC-SHA256(id.timestamp.rawBody).
// Verify the untouched body before JSON parsing; message-ID deduplication is
// handled transactionally by the durable outbox, including out-of-order events.
export function verifyResendWebhook(raw,headers,secret,{now=Date.now()}={}){
 if(typeof secret!=='string'||!secret.startsWith('whsec_')||typeof raw!=='string'||Buffer.byteLength(raw)>65536)deny();
 const read=name=>headers?.get?.(name)??headers?.[name];
 const id=read('svix-id'),timestamp=read('svix-timestamp'),signatures=read('svix-signature');
 if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,200}$/.test(id)||typeof timestamp!=='string'||!/^\d{1,12}$/.test(timestamp)||Math.abs(now-Number(timestamp)*1000)>300000||typeof signatures!=='string'||signatures.length>4096)deny();
 const encoded=secret.slice(6);if(!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))deny();const key=Buffer.from(encoded,'base64');if(key.length<16)deny();
 const expected=createHmac('sha256',key).update(id+'.'+timestamp+'.'+raw).digest();
 const valid=signatures.split(' ').some(part=>{const [version,value,...extra]=part.split(',');if(version!=='v1'||extra.length||!value||!/^[A-Za-z0-9+/]+={0,2}$/.test(value))return false;const actual=Buffer.from(value,'base64');return actual.length===expected.length&&timingSafeEqual(actual,expected);});
 if(!valid)deny();let body;try{body=JSON.parse(raw);}catch{deny();}
 if(!eventTypes.has(body?.type))return {ignored:true,event_id:id};
 const occurred=Date.parse(body.created_at),providerId=body.data?.email_id;
 if(!Number.isFinite(occurred)||occurred>now+300000||typeof providerId!=='string'||!/^[A-Za-z0-9_-]{1,200}$/.test(providerId))deny();
 return {provider:'resend',event_id:id,provider_id:providerId,event_type:body.type,occurred_at:occurred,received_at:now,payload_sha256:createHash('sha256').update(raw).digest('hex')};
}
