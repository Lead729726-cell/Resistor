import {DurableObject} from 'cloudflare:workers';
import {timingSafeEqual} from 'node:crypto';
import {createLicenseDomain} from '../domain.mjs';
import {configureLicenseMail} from '../mail-config.mjs';
import {verifyResendWebhook} from '../mail-webhook.mjs';

const AUTHORITY_ID='production-v1';
const MAX_BODY_BYTES=16384;
const same=(a,b)=>typeof a==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const response=(status,data,origin)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(origin?{'Access-Control-Allow-Origin':origin,Vary:'Origin'}:{})}});
const failure=(status,code,message,origin)=>response(status,{ok:false,error:{code,message}},origin);
const allowedOrigin=(request,env)=>{const origin=request.headers.get('Origin');return !origin||(env.LICENSE_ALLOWED_ORIGINS??'').split(',').map(x=>x.trim()).filter(Boolean).includes(origin);};
const routes=new Set(['/health','/v1/activate','/v1/refresh','/v1/deactivate','/admin/orders','/admin/inflearn/orders','/admin/refund','/admin/deliver','/admin/delivery','/admin/outbox','/admin/outbox/process','/admin/grants','/admin/grants/revoke','/webhooks/resend']);

// Only this Worker receives public traffic. Caller-supplied internal headers
// are replaced; CF-Connecting-IP is set by Cloudflare at its trusted edge.
export default {async fetch(request,env){
 const url=new URL(request.url),origin=request.headers.get('Origin');
 if(url.protocol!=='https:')return failure(400,'HTTPS_REQUIRED','HTTPS required');
 if(!allowedOrigin(request,env))return failure(403,'ORIGIN_DENIED','허용되지 않은 브라우저 요청입니다.');
 if(!routes.has(url.pathname)||url.search)return failure(404,'NOT_FOUND','경로가 없습니다.',origin);
 if(request.method==='OPTIONS'){
  if(!origin)return failure(403,'ORIGIN_DENIED','브라우저 출처가 필요합니다.');
  return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin,Vary:'Origin','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600'}});
 }
 const headers=new Headers(request.headers);headers.set('X-License-Client',request.headers.get('CF-Connecting-IP')||'unknown');
 const forwarded=new Request(request,{headers});
 try{return await env.LICENSE_AUTHORITY.get(env.LICENSE_AUTHORITY.idFromName(AUTHORITY_ID)).fetch(forwarded);}
 catch{return failure(503,'LICENSE_SERVER_UNAVAILABLE','인증 서버의 영구 저장소를 사용할 수 없습니다. 잠시 후 다시 시도하세요.',origin);}
},async scheduled(_event,env,ctx){
 // A configured Cron remains a no-op until the operator explicitly enables
 // mail. This never polls or fabricates an Inflearn purchase/refund feed.
 if(env.LICENSE_MAIL_SENDING_ENABLED!=='true')return;
 ctx.waitUntil(env.LICENSE_AUTHORITY.get(env.LICENSE_AUTHORITY.idFromName(AUTHORITY_ID)).processMailOutbox());
}};

export class LicenseAuthority extends DurableObject {
 constructor(ctx,env){
  super(ctx,env);this.context=ctx;this.env=env;this.service=null;this.initializationError=false;
  const mail=configureLicenseMail(env);this.mailReadiness=mail.readiness;
  try{
   if(typeof env.LICENSE_ADMIN_TOKEN!=='string'||env.LICENSE_ADMIN_TOKEN.length<40)throw Error('Admin token required');
   if(typeof env.LICENSE_MASTER_KEY!=='string'||!env.LICENSE_KEY_ID)throw Error('Authority secrets required');
   const sql=ctx.storage.sql;
   const database={exec:statement=>sql.exec(statement).toArray(),prepare:statement=>({get:(...args)=>sql.exec(statement,...args).toArray()[0],all:(...args)=>sql.exec(statement,...args).toArray(),run:(...args)=>{const cursor=sql.exec(statement,...args);cursor.toArray();return {changes:cursor.rowsWritten};}})};
   this.service=createLicenseDomain({database,transaction:fn=>ctx.storage.transactionSync(fn),masterKey:Buffer.from(env.LICENSE_MASTER_KEY,'base64'),privateKey:env.LICENSE_SIGNING_PRIVATE_KEY,keyId:env.LICENSE_KEY_ID,mailer:mail.mailer,dailyMailAttemptLimit:mail.dailyAttemptLimit});
  }catch{this.initializationError=true;}
 }
 async processMailOutbox(){
  if(this.initializationError||!this.service)throw Error('Authority unavailable');
  return this.service.processOutbox({limit:5});
 }
 async fetch(request){
  const origin=request.headers.get('Origin'),url=new URL(request.url);
  if(!allowedOrigin(request,this.env))return failure(403,'ORIGIN_DENIED','허용되지 않은 브라우저 요청입니다.');
  if(this.initializationError||!this.service)return failure(503,'LICENSE_SERVER_UNAVAILABLE','인증 서버의 키 또는 영구 저장소 설정을 확인해야 합니다.',origin);
  const service=this.service;
  if(request.method==='GET'&&url.pathname==='/health'){
   try{const result={...service.status(),storage_backend:'cloudflare-durable-object-sqlite',authority_id:AUTHORITY_ID,mail_readiness:this.mailReadiness};return response(result.database_ready?200:503,{ok:result.database_ready,result},origin);}
   catch{return failure(503,'LICENSE_SERVER_UNAVAILABLE','영구 저장소 상태를 확인하지 못했습니다.',origin);}
  }
  if(request.method!=='POST')return failure(405,'METHOD_NOT_ALLOWED','POST required',origin);
  const admin=url.pathname.startsWith('/admin/'),webhook=url.pathname==='/webhooks/resend';
  try{
   if(!service.rateLimit((admin?'admin:':webhook?'mail-webhook:':'public:')+request.headers.get('X-License-Client'),{limit:admin?60:webhook?1200:30}))return failure(429,'RATE_LIMIT','잠시 후 다시 시도하세요.',origin);
   // Browser requests cannot use operator routes, even if an app origin is
   // explicitly enabled later. No wildcard CORS or cookie-based authority.
   if(admin&&(origin||!same(request.headers.get('Authorization'),'Bearer '+this.env.LICENSE_ADMIN_TOKEN)))return failure(401,'UNAUTHORIZED','운영자 인증이 필요합니다.',origin);
   if(webhook&&origin)return failure(403,'ORIGIN_DENIED','메일 이벤트는 서버에서만 받을 수 있습니다.');
   if(webhook&&!this.env.RESEND_WEBHOOK_SECRET)return failure(503,'DELIVERY_WEBHOOK_UNAVAILABLE','메일 이벤트 서명 키가 설정되지 않았습니다.');
   if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))return failure(415,'CONTENT_TYPE','JSON required',origin);
   const bodyLimit=webhook?65536:MAX_BODY_BYTES;
   if(Number(request.headers.get('Content-Length')||0)>bodyLimit)return failure(413,'BODY_TOO_LARGE','요청이 너무 큽니다.',origin);
   const reader=request.body?.getReader();let bytes=0,chunks=[];
   if(reader)while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>bodyLimit){await reader.cancel();return failure(413,'BODY_TOO_LARGE','요청이 너무 큽니다.',origin);}chunks.push(part.value);}
   const raw=Buffer.concat(chunks).toString('utf8');
   if(webhook){const event=verifyResendWebhook(raw,request.headers,this.env.RESEND_WEBHOOK_SECRET);return response(200,{ok:true,result:event.ignored?{ignored:true}:service.recordMailEvent(event)});}
   let p;try{p=JSON.parse(raw);}catch{return failure(400,'INVALID_REQUEST','올바른 JSON 요청이 필요합니다.',origin);}
   if(!p||Array.isArray(p)||typeof p!=='object')return failure(400,'INVALID_REQUEST','객체 형식의 요청이 필요합니다.',origin);
   const issueInflearn=()=>{
    if(!this.mailReadiness.inflearn_course_bound)throw Object.assign(Error('확인한 인프런 강의 ID 설정이 필요합니다.'),{code:'ORDER_SOURCE_UNAVAILABLE'});
    if(p.course_id!==this.env.LICENSE_INFLEARN_COURSE_ID||p.verification_method!=='operator_review'||p.provider!=='inflearn'||p.edition!=='edu'||p.device_limit!==2)throw Object.assign(Error('운영자가 확인한 해당 강의의 Edu 기기 2대 주문만 입력할 수 있습니다.'),{code:'ORDER_UNVERIFIED'});
    return service.issue(p);
   };
   const actions={'/v1/activate':()=>service.activate(p),'/v1/refresh':()=>service.refresh(p),'/v1/deactivate':()=>service.deactivate(p),'/admin/orders':()=>service.issue(p),'/admin/inflearn/orders':issueInflearn,'/admin/refund':()=>service.refund(p),'/admin/deliver':()=>service.deliver(p.delivery_id),'/admin/delivery':()=>service.operatorDelivery(p.delivery_id),'/admin/outbox':()=>({...service.outboxStatus(p),readiness:this.mailReadiness}),'/admin/outbox/process':()=>service.processOutbox(p),'/admin/grants':()=>service.operatorGrant(p),'/admin/grants/revoke':()=>service.revokeGrant(p)};
   if(!Object.hasOwn(actions,url.pathname)||url.search)return failure(404,'NOT_FOUND','경로가 없습니다.',origin);
   const result=await actions[url.pathname]();
   if(this.mailReadiness.sending_enabled&&['/admin/orders','/admin/inflearn/orders'].includes(url.pathname)&&(p.provider??'inflearn')==='inflearn')this.context.waitUntil(this.processMailOutbox());
   return response(200,{ok:true,result},origin);
  }catch(error){
   if(!/^(LICENSE_|GRANT_|ORDER_|DELIVERY_|INVALID_PARAMETER$)/.test(error.code??''))return failure(503,'LICENSE_SERVER_UNAVAILABLE','인증 요청을 저장하지 못했습니다. 같은 요청으로 재시도하세요.',origin);
   const code=error.code,status=code==='LICENSE_SEAT_LIMIT'||code==='GRANT_CONFLICT'||code==='ORDER_CONFLICT'?409:code.startsWith('LICENSE_')?403:400;
   return failure(status,code,error.message,origin);
  }
 }
}
