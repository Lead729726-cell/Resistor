import {createServer} from 'node:http';
import {readFile,realpath,stat} from 'node:fs/promises';
import path from 'node:path';

// Private, read-only material. No engine credentials, mutation endpoint or LAN bind.
export async function createCourseServer(directory,{port=5189}={}){
  const root=await realpath(directory);
  const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.csv':'text/csv; charset=utf-8','.txt':'text/plain; charset=utf-8','.md':'text/plain; charset=utf-8','.zip':'application/zip','.mp4':'video/mp4','.png':'image/png'};
  const server=createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; media-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    const origin=`http://127.0.0.1:${server.address().port}`;
    if(!['GET','HEAD'].includes(req.method)||req.headers.host!==`127.0.0.1:${server.address().port}`||(req.headers.origin&&req.headers.origin!==origin)||req.headers['sec-fetch-site']==='cross-site'){res.writeHead(403);res.end();return;}
    try{
      const raw=decodeURIComponent(req.url.split('?')[0]);
      if(raw.includes('\\')||raw.split('/').some(s=>s.startsWith('.'))||raw.includes('\0'))throw Error();
      const file=path.resolve(root,'.'+(raw==='/'?'/index.html':raw));
      const rel=path.relative(root,await realpath(file));
      if(!rel||rel.startsWith('..'+path.sep)||rel==='..'||path.isAbsolute(rel)||!types[path.extname(file)]||!(await stat(file)).isFile())throw Error();
      const bytes=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)],'Content-Length':bytes.length});res.end(req.method==='HEAD'?undefined:bytes);
    }catch{res.writeHead(404);res.end('Not found');}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  return server;
}
