import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export async function createDownloadServer(root){
  root=path.resolve(root);
  const manifest=JSON.parse(await readFile(path.join(root,'release.json'),'utf8'));
  const files=new Map();
  for(const file of manifest.files){
    if(!/^[A-Za-z0-9._-]+$/.test(file.name)||path.basename(file.name)!==file.name||file.name.startsWith('.'))throw Error('Unsafe public release filename.');
    const full=path.join(root,file.name),info=await stat(full);
    if(!info.isFile()||info.size!==file.bytes||!/^[a-f0-9]{64}$/.test(file.sha256))throw Error('Public release metadata differs from staged files.');
    files.set('/'+file.name,{...file,full});
  }
  const server=http.createServer(async(req,res)=>{
    const security={'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"};
    const finish=(status,text,headers={})=>{res.writeHead(status,{...security,'Content-Type':'text/plain; charset=utf-8',...headers});res.end(req.method==='HEAD'?undefined:text);};
    try{
      if(!['GET','HEAD'].includes(req.method)){finish(405,'Only downloads are supported.',{Allow:'GET, HEAD'});return;}
      const requested=new URL(req.url,'http://download.local').pathname;
      if(requested==='/health'){res.writeHead(200,{...security,'Content-Type':'application/json','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:JSON.stringify({service:'register-release-downloads',version:manifest.version,ready:true}));return;}
      const file=files.get(requested==='/'?'/index.html':requested);
      if(!file){finish(404,'File not found.');return;}
      const etag='"'+file.sha256+'"';
      const headers={...security,'Content-Type':file.content_type,'Content-Length':file.bytes,'Accept-Ranges':'bytes',ETag:etag,'Cache-Control':file.name==='index.html'?'no-cache':'public, max-age=3600'};
      if(file.download)headers['Content-Disposition']=`attachment; filename="${file.name}"`;
      if(req.headers['if-none-match']===etag){res.writeHead(304,{...security,ETag:etag});res.end();return;}
      let start=0,end=file.bytes-1,status=200;
      if(req.headers.range&&(!req.headers['if-range']||req.headers['if-range']===etag)){
        const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        if(!match||(!match[1]&&!match[2])){finish(416,'Invalid download range.',{'Content-Range':`bytes */${file.bytes}`});return;}
        if(!match[1]){const suffix=Number(match[2]);start=Math.max(0,file.bytes-suffix);if(!Number.isSafeInteger(suffix)||suffix<=0)start=file.bytes;}
        else{start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),end):end;}
        if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>end||start>=file.bytes){finish(416,'Range is outside the file.',{'Content-Range':`bytes */${file.bytes}`});return;}
        status=206;headers['Content-Range']=`bytes ${start}-${end}/${file.bytes}`;headers['Content-Length']=end-start+1;
      }
      res.writeHead(status,headers);
      if(req.method==='HEAD'){res.end();return;}
      await pipeline(createReadStream(file.full,{start,end}),res);
    }catch(e){if(!res.headersSent)finish(500,'Download unavailable.');else res.destroy();}
  });
  server.requestTimeout=30000;server.headersTimeout=15000;server.keepAliveTimeout=5000;
  return server;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=process.env.REGISTER_DOWNLOAD_ROOT??path.resolve('.runtime/public-download/0.14.0');
  const server=await createDownloadServer(root);server.listen(Number(process.env.PORT??8080),process.env.REGISTER_DOWNLOAD_BIND??'127.0.0.1',()=>console.log('Register release-only download server ready.'));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
}
