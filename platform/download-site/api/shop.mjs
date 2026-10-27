import catalog from '../shop/catalog.json' with {type:'json'};
const actions={catalog:'GET',create:'POST',confirm:'POST',status:'POST',reconcile:'POST',webhook:'POST'};
const cookieName='__Host-resistor_shop';
export function createShopGateway({env=process.env,fetchImpl=fetch}={}){return async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
 const send=(status,data)=>{res.statusCode=status;res.end(JSON.stringify(data));};
 const url=new URL(req.url,'https://resistor.kr'),action=url.searchParams.get('action');
 if(!Object.hasOwn(actions,action??'')||req.method!==actions[action])return send(405,{ok:false,error:{code:'METHOD',message:'지원하지 않는 요청입니다.'}});
 if(req.method==='POST'&&action!=='webhook'&&!['https://resistor.kr','https://resistor-downloads.vercel.app'].includes(req.headers.origin))return send(403,{ok:false,error:{code:'ORIGIN',message:'Resistor 사이트에서 다시 시도하세요.'}});
 const origin=env.RESISTOR_COMMERCE_ORIGIN,token=env.RESISTOR_SHOP_GATEWAY_TOKEN;
 if(!origin||!token){
  if(action==='catalog')return send(200,{ok:true,result:{...catalog,checkout_enabled:false,products:catalog.products.map(p=>({...p,purchasable:false,blockers:[...p.blockers,'결제·주문 서버 연결']}))}});
  return send(503,{ok:false,error:{code:'SHOP_UNAVAILABLE',message:'판매 준비 중입니다. 결제 정보나 이메일을 받지 않습니다.'}});
 }
 try{
  const base=new URL(origin);if(base.protocol!=='https:'||base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw Error('Invalid fixed backend');
  const body=req.method==='POST'?(typeof req.body==='string'?req.body:JSON.stringify(req.body)):undefined;
  if(body&&Buffer.byteLength(body)>16000)return send(413,{ok:false});
  const session=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>new RegExp('^'+cookieName+'=[A-Za-z0-9_-]{43}$').test(s));
  const upstream=await fetchImpl(new URL('/'+action,base),{method:req.method,headers:{'X-Shop-Gateway':token,'Content-Type':'application/json',...(session?{Cookie:session}:{})},...(body?{body}:{}),redirect:'error',signal:AbortSignal.timeout(20000)});
  const data=await upstream.json(),cookie=upstream.headers.get('set-cookie');
  if(cookie?.startsWith(cookieName+'='))res.setHeader('Set-Cookie',cookie);
  return send(upstream.status,data);
 }catch{return send(503,{ok:false,error:{code:'SHOP_NETWORK',message:'주문 서버에 연결하지 못했습니다. 결제 직후라면 새 결제를 만들지 말고 상태 조회를 다시 시도하세요.'}});}
};}
export default createShopGateway();
