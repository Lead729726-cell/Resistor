import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const folder=path.resolve(process.env.RESISTOR_SITE_OUTPUT||'platform/download-site');
const config=JSON.parse(await readFile(path.join(folder,'vercel.json'),'utf8'));
const {createShopGateway}=await import(pathToFileURL(path.join(folder,'api/shop.mjs')));
const shop=createShopGateway({env:{}});
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.mp4':'video/mp4','.vtt':'text/vtt'};
const server=createServer(async(req,res)=>{
  try{
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
    const url=new URL(req.url,'http://127.0.0.1');
    if(url.pathname==='/api/shop'&&url.searchParams.get('action')==='catalog'){await shop(req,res);return;}
    if(url.pathname.startsWith('/api/')){res.writeHead(404);res.end();return;}
    const redirect=config.redirects?.find(r=>r.source===url.pathname);
    if(redirect){res.writeHead(redirect.permanent?308:307,{Location:redirect.destination});res.end();return;}
    const route=config.rewrites?.find(r=>r.source===url.pathname)?.destination||url.pathname;
    if(/^https?:/.test(route)){res.writeHead(502);res.end('Remote services are not proxied in this preview.');return;}
    const relative=decodeURIComponent(route==='/'?'/index.html':route);
    if(relative.split('/').some(part=>part.startsWith('.'))){res.writeHead(404);res.end();return;}
    let file=path.resolve(folder,'.'+relative);
    if(!file.startsWith(folder+path.sep)){res.writeHead(404);res.end();return;}
    let info=await stat(file);
    if(info.isDirectory()){file=path.join(file,'index.html');info=await stat(file);}
    if(!info.isFile()){res.writeHead(404);res.end();return;}
    const security=Object.fromEntries((config.headers?.find(h=>h.source==='/(.*)')?.headers||[]).map(h=>[h.key,h.value]));
    res.writeHead(200,{...security,'Content-Type':mime[path.extname(file)]||'application/octet-stream','Content-Length':info.size,'Cache-Control':'no-store'});
    if(req.method==='HEAD')res.end();else createReadStream(file).on('error',()=>res.destroy()).pipe(res);
  }catch{if(!res.headersSent)res.writeHead(404);res.end('Not found');}
});
server.listen(Number(process.env.PORT||18956),'127.0.0.1',()=>console.log(`Local: http://127.0.0.1:${server.address().port}/`));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)));
