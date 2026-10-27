import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import shop from '../platform/download-site/api/shop.mjs';
const directory=path.resolve('platform/download-site'),config=JSON.parse(await readFile(path.join(directory,'vercel.json'),'utf8')),port=Number(process.env.RESISTOR_STORE_PREVIEW_PORT||18953);
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.xml':'application/xml'};
const server=http.createServer(async(req,res)=>{
 try{const url=new URL(req.url,'http://127.0.0.1');if(url.pathname==='/api/shop'){if(req.method==='POST'){let body='';for await(const c of req){body+=c;if(Buffer.byteLength(body)>16000){res.writeHead(413);res.end();return;}}req.body=JSON.parse(body);}return shop(req,res);}
 const route=config.rewrites.find(r=>r.source===url.pathname),file=path.resolve(directory,'.'+(route?.destination??(url.pathname==='/'?'/index.html':url.pathname)));
 if(!file.startsWith(directory+path.sep)){res.writeHead(403);res.end();return;}const bytes=await readFile(file);res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(bytes);
 }catch{res.writeHead(404);res.end('Not found');}
});
server.listen(port,'127.0.0.1',()=>console.log('Edu course/store preview: http://127.0.0.1:'+port+'/shop/ · no payment credentials configured by this command'));
process.on('SIGINT',()=>server.close());process.on('SIGTERM',()=>server.close());
