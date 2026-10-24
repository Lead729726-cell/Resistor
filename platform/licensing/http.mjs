import http from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {isIP} from 'node:net';
const same=(a,b)=>typeof a==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export function createLicenseHttpServer(service,{adminToken,allowOrigins=[],trustLoopbackProxy=false}={}){
 if(typeof adminToken!=='string'||adminToken.length<40)throw Error('A strong admin token is required');
 const attempts=new Map();
 return http.createServer(async(req,res)=>{res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Type','application/json');const send=(status,data)=>{res.writeHead(status);res.end(JSON.stringify(data));};
  const origin=req.headers.origin;if(origin&&!allowOrigins.includes(origin))return send(403,{ok:false,error:{code:'ORIGIN_DENIED',message:'허용되지 않은 브라우저 요청입니다.'}});
  if(req.method==='GET'&&req.url==='/health')return send(200,{ok:true,result:service.status()});
  if(req.method!=='POST')return send(405,{ok:false,error:{code:'METHOD_NOT_ALLOWED',message:'POST required'}});
  const admin=req.url?.startsWith('/admin/');if(admin&&!same(req.headers.authorization,'Bearer '+adminToken))return send(401,{ok:false,error:{code:'UNAUTHORIZED',message:'운영자 인증이 필요합니다.'}});
  if(!admin){let key=req.socket.remoteAddress;const forwarded=String(req.headers['x-forwarded-for']??'').split(',').at(-1).trim();if(trustLoopbackProxy&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(key)&&isIP(forwarded))key=forwarded;const now=Date.now(),state=attempts.get(key);if(!state||now-state.start>60000)attempts.set(key,{start:now,count:1});else if(++state.count>30)return send(429,{ok:false,error:{code:'RATE_LIMIT',message:'잠시 후 다시 시도하세요.'}});if(attempts.size>5000)for(const [k,v]of attempts)if(now-v.start>60000)attempts.delete(k);}
  if(!req.headers['content-type']?.startsWith('application/json'))return send(415,{ok:false,error:{code:'CONTENT_TYPE',message:'JSON required'}});
  try{let body='';for await(const c of req){body+=c;if(body.length>16000)return send(413,{ok:false,error:{code:'BODY_TOO_LARGE',message:'요청이 너무 큽니다.'}});}const p=JSON.parse(body);if(!p||Array.isArray(p)||typeof p!=='object')throw Error('object required');const actions={'/v1/activate':()=>service.activate(p),'/v1/refresh':()=>service.refresh(p),'/v1/deactivate':()=>service.deactivate(p),'/admin/orders':()=>service.issue(p),'/admin/refund':()=>service.refund(p),'/admin/deliver':()=>service.deliver(p.delivery_id)};if(!Object.hasOwn(actions,req.url))return send(404,{ok:false,error:{code:'NOT_FOUND',message:'경로가 없습니다.'}});const result=await actions[req.url]();send(200,{ok:true,result});}catch(e){const code=e.code||'INVALID_REQUEST',status=code==='LICENSE_SEAT_LIMIT'?409:code==='LICENSE_REVOKED'||code==='LICENSE_EDITION'||code==='LICENSE_INVALID'?403:400;send(status,{ok:false,error:{code,message:e.code?e.message:'올바른 요청 정보를 확인하세요.'}});}
 });
}
