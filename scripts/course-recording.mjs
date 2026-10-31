// Local source rehearsal. Official entrypoint, LicenseGate, keys and grants are unchanged.
import http from 'node:http';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {randomBytes,createHash} from 'node:crypto';
import path from 'node:path';
import {build} from 'esbuild';
import {prepareEditionWorkspace,getProductEdition} from './edition-workspace.mjs';
import {startWorker} from './worker.mjs';
import {runtimeIdentity} from './native-worker.mjs';
import {workerRpc} from './runtime.mjs';
import {studyRpc} from './self-study-service.mjs';
import {educationRpc} from './education-service.mjs';
const root=process.cwd(),edition=getProductEdition();if(edition.edition!=='edu')throw Error('촬영 실습은 Resistor Edu에서만 실행합니다.');
const port=18955,origin='http://127.0.0.1:'+port,token=randomBytes(32).toString('hex'),output=path.resolve('.runtime/course-recording-20261031'),kit=path.resolve('docs/teaching/recording-20261031');
let existingResponse;
try{existingResponse=await fetch(origin+'/health',{signal:AbortSignal.timeout(1500)});}catch(e){if(e.cause?.code!=='ECONNREFUSED')throw Error('촬영 포트의 상태를 확인하지 못했습니다. 기존 작업을 보존하고 다시 확인하세요.');}
if(existingResponse){let existing;try{existing=await existingResponse.json();}catch{}if(existingResponse.ok&&existing?.product_id==='resistor.edu.source-rehearsal'&&existing.edition==='edu'){console.log('Existing Resistor Edu source rehearsal preserved: '+origin);process.exit(0);}throw Error('촬영 포트 18955를 다른 프로그램이 사용 중입니다. 기존 프로그램이나 파일을 변경하지 않았습니다.');}
await mkdir(output,{recursive:true});
const engine=await startWorker(await prepareEditionWorkspace({edition}),{resourcesRoot:root});
const local={workspace:path.join(output,'learner-records')};await mkdir(local.workspace,{recursive:true});
const projects=new Set(),runs=new Set();
const ownershipFile=path.join(output,'ownership.json');
try{const prior=JSON.parse(await readFile(ownershipFile,'utf8'));if(prior.edition!=='edu'||!Array.isArray(prior.projects)||!Array.isArray(prior.runs)||[...prior.projects,...prior.runs].some(v=>typeof v!=='string'||!/^[a-f0-9-]{1,64}$/.test(v)))throw Error('촬영 프로젝트 소유 기록을 확인하세요. 기존 파일은 보존합니다.');for(const id of prior.projects)projects.add(id);for(const id of prior.runs)runs.add(id);}catch(e){if(e.code!=='ENOENT')throw e;}
let ownershipQueue=Promise.resolve();
const persistOwnership=()=>ownershipQueue=ownershipQueue.then(async()=>{const temporary=ownershipFile+'.tmp';await writeFile(temporary,JSON.stringify({schema_version:1,edition:'edu',projects:[...projects],runs:[...runs]}));await rename(temporary,ownershipFile);});
const invoke=async(_config,method,params={})=>{
 if(params.project_id&&!projects.has(params.project_id))return {ok:false,error:{code:'REHEARSAL_SCOPE',message:'이 촬영 세션에서 새로 만든 프로젝트만 사용할 수 있습니다.'}};
 if(params.source_project_id&&!projects.has(params.source_project_id))return {ok:false,error:{code:'REHEARSAL_SCOPE',message:'기존 사용자 프로젝트는 촬영 서버에서 열지 않습니다.'}};
 if(params.run_id&&!runs.has(params.run_id))return {ok:false,error:{code:'REHEARSAL_SCOPE',message:'다른 세션의 실행 기록은 열지 않습니다.'}};
 const response=await workerRpc(engine,method,params);
 if(response.ok){let changed=false;if(method==='project.create'||method==='project.clone'){projects.add(response.result.id);changed=true;}if(response.result?.execution_status&&response.result?.id){runs.add(response.result.id);changed=true;}if(changed)await persistOwnership();}
 return response;
};
const allowed=new Set(['study.catalog','study.history','study.submit','study.hint','study.reveal','study.recommend','study.export','study.puzzle.catalog','study.puzzle.create','study.puzzle.open','study.puzzle.act','study.puzzle.tutor','study.puzzle.simulate','study.puzzle.refresh','study.puzzle.export','learning.list','learning.create','learning.open','learning.refresh','learning.change','learning.run','learning.save','learning.observe','view.get_scene']);
await build({entryPoints:['packages/ui/qa/course-recording/main.tsx'],outfile:path.join(output,'app.mjs'),bundle:true,format:'esm',platform:'browser',target:'es2022',jsx:'automatic',define:{__RESISTOR_EDITION__:JSON.stringify('edu'),__REHEARSAL_TOKEN__:JSON.stringify(token),'process.env.NODE_ENV':JSON.stringify('production')},alias:{'@mos/contracts':path.resolve('packages/contracts/src/index.ts'),'@mos/viewer':path.resolve('packages/viewer/src/index.ts')},loader:{'.woff2':'dataurl'},logLevel:'warning'});
await writeFile(path.join(output,'index.html'),'<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Resistor Edu · 소스 촬영 실습</title><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script type="module" src="/app.mjs"></script></body></html>');
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; worker-src 'self' blob:; frame-ancestors 'none'; object-src 'none'");
 if(req.headers.host!=='127.0.0.1:'+port){res.writeHead(403).end();return;}
 try{const url=new URL(req.url,origin);
 if(url.pathname==='/rpc'){
  if(req.method!=='POST'||req.headers.origin!==origin||req.headers['x-resistor-rehearsal']!==token||!req.headers['content-type']?.startsWith('application/json')){res.writeHead(403).end();return;}
  let raw='';for await(const c of req){raw+=c;if(Buffer.byteLength(raw)>100000){res.writeHead(413).end();return;}}
  const {method,params={}}=JSON.parse(raw);let result;
  if(!allowed.has(method)||params.approved||params.mode==='ai')result={ok:false,error:{code:'REHEARSAL_SCOPE',message:'촬영 환경은 외부 AI·비용·인증 설정 변경을 차단합니다. 무료 규칙 코치와 실제 엔진을 사용하세요.'}};
  else if(method.startsWith('study.'))result=await studyRpc(local,method,{...params,...(method==='study.puzzle.create'||method==='study.submit'?{purpose:'qa'}:{})},{edition:'edu',invoke,fetcher:async()=>{throw Error('No paid provider in recording rehearsal');}});
  else if(method.startsWith('learning.'))result=await educationRpc(local,method,{...params,...(method==='learning.create'?{purpose:'qa'}:{})},{edition:'edu',invoke,identity:()=>runtimeIdentity(engine)});
  else result=await invoke(local,method,params);
  res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(result));return;
 }
 if(req.method!=='GET'){res.writeHead(405).end();return;}
 if(url.pathname==='/health'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({schema_version:1,edition:'edu',product_id:'resistor.edu.source-rehearsal',official_activation:false}));return;}
 let file;if(['/','/index.html','/app.mjs','/app.css'].includes(url.pathname))file=path.join(output,url.pathname==='/'?'index.html':url.pathname.slice(1));
 else if(url.pathname.startsWith('/kit/')){const name=url.pathname.slice(5)||'index.html';if(!/^[a-zA-Z0-9_.-]+$/.test(name))throw Error('Invalid asset');file=path.join(kit,name);}
 else if(url.pathname.startsWith('/edu-study-tutorial/')){const name=url.pathname.slice('/edu-study-tutorial/'.length);if(!['index.html','chapters.json','captions.ko.vtt','captions.ko.srt','Resistor-Edu-AI-Study-KO.mp4'].includes(name)){res.writeHead(404).end();return;}file=path.join(root,'public/edu-study-tutorial',name);if(name==='index.html'){const html=await readFile(file,'utf8'),hashes=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(match=>"'sha256-"+createHash('sha256').update(match[1]).digest('base64')+"'");res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' "+hashes.join(' ')+"; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; media-src 'self'; frame-ancestors 'none'; object-src 'none'");}}
 else {res.writeHead(404).end();return;}
 const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.txt':'text/plain; charset=utf-8','.mp4':'video/mp4','.vtt':'text/vtt; charset=utf-8','.srt':'text/plain; charset=utf-8'};
 res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));
 }catch{res.writeHead(400,{'Content-Type':'application/json'}).end(JSON.stringify({ok:false,error:{message:'촬영 요청을 처리하지 못했습니다. 기존 기록은 보존됩니다.'}}));}
});
server.listen(port,'127.0.0.1',()=>console.log('Resistor Edu source rehearsal: '+origin+' · localhost only · no official activation · no paid AI'));
process.on('SIGINT',()=>server.close());process.on('SIGTERM',()=>server.close());
