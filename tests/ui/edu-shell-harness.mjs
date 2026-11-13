// Actual Edu components and local learning services, isolated from user data.
// No license activation, EDA jobs or external AI requests in this UI harness.
import {createServer} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {studyRpc} from '../../scripts/self-study-service.mjs';
import {educationRpc} from '../../scripts/education-service.mjs';
import {createLeague} from '../../platform/league/service.mjs';
import {leagueMiddleware} from '../../platform/league/http.mjs';

const root=process.cwd(),port=Number(process.env.RESISTOR_QA_PORT||5198),runDirectory=path.resolve(process.env.RESISTOR_QA_DIRECTORY||path.join(root,'.runtime/edu-ui-20261112')),workspace=path.join(runDirectory,'workspace');
if(!Number.isSafeInteger(port)||port<1024||port>65535)throw Error('Invalid QA port');
const entry=path.join(root,'packages/ui/qa/edu-shell');
await mkdir(entry,{recursive:true});await mkdir(workspace,{recursive:true});
await writeFile(path.join(entry,'index.html'),'<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Resistor Edu · UI 검수</title><div id="root"></div><script type="module" src="./main.tsx"></script></html>');
await writeFile(path.join(entry,'main.tsx'),`import React from 'react';
import {createRoot} from 'react-dom/client';
import {setRpcOverride} from '@mos/contracts';
import App from '../../src/App';
import OnlineAccessBoundary from '../../src/OnlineAccessBoundary';
import {configureOnlineAccess} from '../../../contracts/src/online-access';
import '../../src/edu-workbench.css';
configureOnlineAccess({edition:'edu',host:'browser'});
setRpcOverride(async(method,params={})=>{const r=await fetch('/__edu_qa_rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method,params})}).then(r=>r.json());if(!r.ok)throw Error(r.error.message);return r.result;});
createRoot(document.getElementById('root')!).render(<React.StrictMode><style>{'.qa-scope{height:32px;padding:8px 12px;font:11px system-ui;white-space:nowrap;overflow:hidden;background:var(--panel);color:var(--muted);border-bottom:1px solid var(--line)}#root>.edu-workspace{height:calc(100dvh - 32px)}'}</style><div className="qa-scope" role="note">Resistor Edu · 독립 UI 검수 / 인증·EDA 해석·외부 AI 미실행</div><OnlineAccessBoundary enabled><App/></OnlineAccessBoundary></React.StrictMode>);
`);
const calls=[];
const league=await createLeague({directory:path.join(runDirectory,'league'),mode:'local'});
const leagueRpc=leagueMiddleware(league);
const server=await createServer({configFile:false,root,define:{__RESISTOR_EDITION__:JSON.stringify('edu')},esbuild:{jsx:'automatic'},resolve:{alias:Object.fromEntries(['contracts','ui','viewer','cloud','importer'].map(name=>['@mos/'+name,path.join(root,'packages',name,'src/index.ts')]))},server:{host:'127.0.0.1',port,strictPort:true,fs:{deny:['.env','.env.*','*.{crt,pem}','**/.runtime/**','**/.git/**']}},plugins:[{name:'isolated-edu-services',configureServer(vite){vite.middlewares.use('/api/league',(req,res)=>{if(req.headers.origin&&req.headers.origin!=="http://127.0.0.1:"+port){res.writeHead(403).end();return;}return leagueRpc(req,res);});vite.middlewares.use('/__edu_qa_rpc',async(req,res)=>{
  if(req.method!=='POST'||req.headers.origin&&req.headers.origin!==`http://127.0.0.1:${port}`){res.writeHead(403).end();return;}
  let body='';for await(const chunk of req){body+=chunk;if(body.length>128000){res.writeHead(413).end();return;}}
  try{const {method,params={}}=JSON.parse(body);let result;
    const allowed=['study.catalog','study.history','study.submit','study.hint','study.reveal','study.recommend','study.export','study.puzzle.catalog','study.puzzle.create','study.puzzle.open','study.puzzle.act','study.puzzle.tutor','study.puzzle.export','learning.list','learning.dashboard'];
    if(!allowed.includes(method)||params.approved||params.mode==='ai')result={ok:false,error:{code:'QA_SCOPE',message:'독립 UI 검수에서는 외부 AI·EDA 해석을 실행하지 않습니다. 실제 설치 앱의 엔진과 인증이 필요합니다.'}};
    else if(method.startsWith('study.'))result=await studyRpc({workspace},method,params,{edition:'edu',fetcher:async()=>{throw Error('External AI disabled in UI QA');}});
    else result=await educationRpc({workspace},method,params,{edition:'edu'});
    calls.push({method,ok:result.ok,at:new Date().toISOString()});res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));
    await writeFile(path.join(runDirectory,'calls.json'),JSON.stringify({edition:'edu',qa_only:true,provider_calls:0,engine_calls:0,calls},null,2));
  }catch(e){res.writeHead(500).end(JSON.stringify({ok:false,error:{message:e.message}}));}
});}}]});
await server.listen();console.log(`Edu UI QA: http://127.0.0.1:${port}/packages/ui/qa/edu-shell/index.html`);
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{void server.close().then(()=>{league.close();process.exit(0);});});
