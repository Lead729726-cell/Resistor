import { defineConfig } from 'vite';
import path from 'node:path';
// Main-process transport helpers contain the token; they never enter the renderer bundle.
// @ts-expect-error Node-only .mjs
import { runtimeConfig, workerRpc } from './scripts/runtime.mjs';
// @ts-expect-error Node-only credential/provider boundary
import { assistantRpc } from './scripts/design-assistant.mjs';
const devPort=Number(process.env.REGISTER_DEV_PORT??5173);
if(!Number.isSafeInteger(devPort)||devPort<1024||devPort>65535)throw new Error('REGISTER_DEV_PORT must be a port from 1024 to 65535.');
const localOrigin=`http://127.0.0.1:${devPort}`;
export default defineConfig({
  base:'./',resolve:{alias:{'@mos/contracts':path.resolve('packages/contracts/src/index.ts'),'@mos/ui':path.resolve('packages/ui/src/index.ts'),'@mos/viewer':path.resolve('packages/viewer/src/index.ts'),'@mos/cloud':path.resolve('packages/cloud/src/index.ts'),'@mos/importer':path.resolve('packages/importer/src/index.ts')}},
  esbuild:{jsx:'automatic'}, build:{outDir:'dist',sourcemap:true},server:{host:'127.0.0.1',port:devPort,strictPort:true,cors:false,
    watch:{ignored:['**/release/**','**/.runtime/**','**/test-results/**','**/docs/evidence/**','**/examples/**']},
    fs:{deny:['.env','.env.*','*.{crt,pem}','**/.git/**','**/.runtime/**','**/.tools/**','**/release/**']}},
  plugins:[{name:'authenticated-local-worker',configureServer(server){server.middlewares.use('/api/rpc',async(req,res)=>{
    const origin=req.headers.origin;if(req.method!=='POST'||(origin&&origin!==localOrigin)||req.headers['sec-fetch-site']==='cross-site'){res.writeHead(403);res.end();return;}
    if(!req.headers['content-type']?.startsWith('application/json')){res.writeHead(415);res.end();return;}
    let body='';for await(const chunk of req){body+=chunk;if(body.length>32*1024*1024){res.writeHead(413);res.end();return;}}
    try {const payload=JSON.parse(body);const config=await runtimeConfig();const result=typeof payload.method==='string'&&payload.method.startsWith('assistant.')?await assistantRpc(config,payload.method,payload.params??{}):await workerRpc(config,payload.method,payload.params??{});res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(result));}
    catch(e){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,error:{code:'WORKER_UNAVAILABLE',message:e instanceof Error?e.message:'Worker unavailable'}}));}
  });}}]
});
