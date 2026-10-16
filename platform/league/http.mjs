import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {isIP} from 'node:net';
import {createLeague} from './service.mjs';

export function clientIP(req,trustCloudflare=false){const remote=req.socket.remoteAddress||'unknown',forwarded=req.headers['cf-connecting-ip'];return trustCloudflare&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote)&&typeof forwarded==='string'&&isIP(forwarded)?forwarded:remote;}
export function leagueMiddleware(league,{maxPerMinute=600,trustCloudflare=false}={}){
 const rates=new Map();let minute=Math.floor(Date.now()/60000);
 return async(req,res)=>{
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,GET,OPTIONS','Access-Control-Allow-Headers':'Content-Type','X-Content-Type-Options':'nosniff'};
  const send=(code,value)=>{res.writeHead(code,headers);res.end(JSON.stringify(value));};
  if(req.method==='OPTIONS'){res.writeHead(204,headers);res.end();return;}
  const current=Math.floor(Date.now()/60000);if(current!==minute){rates.clear();minute=current;}const ip=clientIP(req,trustCloudflare),bucket=ip;if(rates.size>=5000&&!rates.has(bucket)){send(429,{ok:false,error:{code:'RATE_LIMIT',message:'서버 요청 한도입니다. 잠시 후 다시 연결하세요.'}});return;}rates.set(bucket,(rates.get(bucket)||0)+1);
  if(rates.get(bucket)>maxPerMinute){send(429,{ok:false,error:{code:'RATE_LIMIT',message:'잠시 후 다시 연결하세요.'}});return;}
  try{
   if(req.method==='GET'){send(200,league.request({method:'league.info',params:{}},{ip}));return;}
   if(req.method!=='POST'||!req.headers['content-type']?.startsWith('application/json')){send(415,{ok:false,error:{code:'CONTENT_TYPE',message:'JSON POST를 사용하세요.'}});return;}
   const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>32768){send(413,{ok:false,error:{code:'BODY_LIMIT',message:'요청 크기 제한입니다.'}});return;}chunks.push(chunk);}
   const result=league.request(JSON.parse(Buffer.concat(chunks).toString('utf8')),{ip});send(result.ok?200:result.error.code==='RATE_LIMIT'?429:400,result);
  }catch{send(400,{ok:false,error:{code:'INVALID_JSON',message:'요청을 읽을 수 없습니다.'}});}
 };
}
export async function startLeagueServer({directory,port=18786,host='127.0.0.1',staticDirectory,mode='local',trustCloudflare=false,...options}={}){
 if(trustCloudflare&&host!=='127.0.0.1')throw Error('Cloudflare header trust requires a loopback-only tunnel origin.');
 const league=await createLeague({directory,mode,...options}),rpc=leagueMiddleware(league,{trustCloudflare}),root=staticDirectory&&path.resolve(staticDirectory);
 const server=http.createServer(async(req,res)=>{
  let url;try{url=new URL(req.url,'http://league.invalid');}catch{res.writeHead(400);res.end();return;}
  if(url.pathname==='/api/league')return rpc(req,res);
  if(url.pathname==='/health'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({service:'resistor-edu-league',schema_version:1,edition:'edu',mode}));return;}
  // Only the standalone league shell and public hashed assets. No EDA RPC,
  // project files, workspace directories, API keys, or operator HTTP methods.
  let file;if(root&&['/','/league','/league.html'].includes(url.pathname))file=path.join(root,'league.html');
  else if(root&&/^\/assets\/[A-Za-z0-9_.-]+\.(js|css|woff2|svg)$/.test(url.pathname))file=path.join(root,url.pathname.slice(1));
  if(!file||!['GET','HEAD'].includes(req.method)){res.writeHead(404);res.end();return;}
  try{const data=await readFile(file),type=file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.svg')?'image/svg+xml':'font/woff2';res.writeHead(200,{'Content-Type':type,'Content-Length':data.length,'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https: http://127.0.0.1:*; img-src 'self' data:; frame-ancestors 'none'; object-src 'none'"});res.end(req.method==='HEAD'?undefined:data);}catch{res.writeHead(404);res.end('Build the standalone league frontend first.');}
 });
 server.requestTimeout=10000;server.headersTimeout=10000;await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
 return {server,league,url:`http://${host}:${server.address().port}`,close:async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));league.close();}};
}
