import { defineConfig } from 'vite';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
// Main-process transport helpers contain the token; they never enter the renderer bundle.
// @ts-expect-error Node-only .mjs
import { runtimeConfig, workerRpc } from './scripts/runtime.mjs';
// @ts-expect-error Node-only credential/provider boundary
import { assistantRpc } from './scripts/design-assistant.mjs';
const {getProductEdition}=createRequire(import.meta.url)(path.resolve('apps/desktop/product-edition.cjs'));
const edition=getProductEdition();
const devPort=Number(process.env.REGISTER_DEV_PORT??edition.dev_port);
if(!Number.isSafeInteger(devPort)||devPort<1024||devPort>65535)throw new Error('REGISTER_DEV_PORT must be a port from 1024 to 65535.');
const localOrigin=`http://127.0.0.1:${devPort}`;
export default defineConfig({
  define:{__RESISTOR_EDITION__:JSON.stringify(edition.edition)},
  base:'./',resolve:{alias:{'@mos/contracts':path.resolve('packages/contracts/src/index.ts'),'@mos/ui':path.resolve('packages/ui/src/index.ts'),'@mos/viewer':path.resolve('packages/viewer/src/index.ts'),'@mos/cloud':path.resolve('packages/cloud/src/index.ts'),'@mos/importer':path.resolve('packages/importer/src/index.ts')}},
  esbuild:{jsx:'automatic'}, build:{outDir:process.env.RESISTOR_BUILD_DIR||'dist',sourcemap:true},server:{host:'127.0.0.1',port:devPort,strictPort:true,cors:false,
    watch:{ignored:['**/release/**','**/.runtime/**','**/test-results/**','**/docs/evidence/**','**/examples/**','**/teaching-private/**']},
    fs:{deny:['.env','.env.*','*.{crt,pem}','**/.git/**','**/.runtime/**','**/.tools/**','**/release/**','**/teaching-private/**']}},
  plugins:[{name:'product-context',generateBundle(){this.emitFile({type:'asset',fileName:'product-context.json',source:JSON.stringify({schema_version:1,product_id:edition.id,edition:edition.edition,name:edition.name})+'\n'});}},{name:'authenticated-local-worker',async configureServer(server){const {prepareEditionWorkspace}=await import(pathToFileURL(path.resolve('scripts/edition-workspace.mjs')).href);const workspace=await prepareEditionWorkspace({edition,workspace:process.env.MOS_WORKSPACE});
    const {readFile}=await import('node:fs/promises');
    const {LicenseClient,fileLicenseVault}=await import(pathToFileURL(path.resolve('apps/desktop/licensing.mjs')).href);
    const licenseDirectory=path.join(workspace,'.runtime/license');
    const license=new LicenseClient({directory:licenseDirectory,edition:edition.edition,config:JSON.parse(await readFile(process.env.RESISTOR_LICENSE_CONFIG||path.resolve('platform/licensing/public-config.json'),'utf8')),...await fileLicenseVault(licenseDirectory),allowLocalServer:true});
    await license.refresh().catch(()=>{});
    server.middlewares.use('/api/rpc',async(req,res)=>{
    const origin=req.headers.origin;if(req.method!=='POST'||(origin&&origin!==localOrigin)||req.headers['sec-fetch-site']==='cross-site'){res.writeHead(403);res.end();return;}
    if(!req.headers['content-type']?.startsWith('application/json')){res.writeHead(415);res.end();return;}
    let body='';for await(const chunk of req){body+=chunk;if(body.length>32*1024*1024){res.writeHead(413);res.end();return;}}
    try {const payload=JSON.parse(body);if(typeof payload.method==='string'&&payload.method.startsWith('license.')){const result=await license.rpc(payload.method,payload.params??{});res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({ok:true,result}));return;}await license.assertActive();const config=await runtimeConfig(workspace);const result=typeof payload.method==='string'&&payload.method.startsWith('assistant.')?await assistantRpc(config,payload.method,payload.params??{}):await workerRpc(config,payload.method,payload.params??{});res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(result));}
    catch(e){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,error:{code:e instanceof Error&&'code' in e?e.code:'WORKER_UNAVAILABLE',message:e instanceof Error?e.message:'Worker unavailable'}}));}
  });}}]
});
