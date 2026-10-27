import http from 'node:http';
import {timingSafeEqual} from 'node:crypto';
export const shopCookie='__Host-resistor_shop';
export const readShopSession=cookie=>cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith(shopCookie+'='))?.slice(shopCookie.length+1);
export function createCommerceHttpServer(service,{gatewayToken}={}){
 if(typeof gatewayToken!=='string'||gatewayToken.length<40)throw Error('Strong gateway token required');
 const same=value=>typeof value==='string'&&Buffer.byteLength(value)===Buffer.byteLength(gatewayToken)&&timingSafeEqual(Buffer.from(value),Buffer.from(gatewayToken));
 return http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('X-Content-Type-Options','nosniff');
  const send=(status,body)=>{res.writeHead(status);res.end(JSON.stringify(body));};
  if(!same(req.headers['x-shop-gateway']))return send(401,{ok:false,error:{code:'UNAUTHORIZED',message:'인증된 사이트 연결이 필요합니다.'}});
  const action=new URL(req.url,'http://localhost').pathname.slice(1),methods={catalog:'GET',create:'POST',confirm:'POST',status:'POST',reconcile:'POST',webhook:'POST'};
  if(!Object.hasOwn(methods,action))return send(404,{ok:false,error:{code:'NOT_FOUND',message:'경로가 없습니다.'}});
  if(req.method!==methods[action])return send(405,{ok:false,error:{code:'METHOD',message:'잘못된 요청 방식입니다.'}});
  try{
   let p={};if(req.method==='POST'){if(!req.headers['content-type']?.startsWith('application/json'))return send(415,{ok:false});let body='';for await(const b of req){body+=b;if(Buffer.byteLength(body)>16000)return send(413,{ok:false});}p=JSON.parse(body);if(!p||Array.isArray(p)||typeof p!=='object')throw Error('object required');}
   const session=readShopSession(req.headers.cookie);
   let result;if(action==='catalog')result=service.catalog();else if(action==='create'){const created=service.create(p,session);res.setHeader('Set-Cookie',`${shopCookie}=${created.session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`);result=created.order;}else result=await service[action](p,session);
   send(200,{ok:true,result});
  }catch(e){send(e.status||400,{ok:false,error:{code:e.code||'INVALID_REQUEST',message:e.code?e.message:'요청을 확인하세요.'}});}
 });
}
