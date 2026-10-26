// Local-only manual UI harness. Uses a separate QA store and forbids paid AI and EDA engine jobs.
import http from 'node:http';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {studyRpc} from '../../scripts/self-study-service.mjs';
const label=process.argv.find(v=>v.startsWith('--run='))?.slice(6)||'local';
if(!/^[a-zA-Z0-9-]{1,48}$/.test(label))throw Error('Use a short alphanumeric QA run label.');
const runDirectory=resolve('.runtime/edu-ux-'+label),workspace=resolve(runDirectory,'workspace');
await mkdir(workspace,{recursive:true});await mkdir('packages/ui/qa/edu-loop',{recursive:true});
await writeFile('packages/ui/qa/edu-loop/index.html',"<!doctype html><html lang=\"ko\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Resistor Edu 학습 UX 검증</title><div id=\"root\"></div><script type=\"module\" src=\"./main.tsx\"></script></html>\n");
await writeFile('packages/ui/qa/edu-loop/main.tsx',"import React,{useState} from 'react';\nimport {createRoot} from 'react-dom/client';\nimport {setRpcOverride} from '@mos/contracts';\nimport SelfStudy from '../../src/SelfStudy';\nimport '../../src/styles.css';\nimport '../../src/education-lab.css';\nconst request=async(method:string,params={})=>{const r=await fetch('http://127.0.0.1:19006',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method,params})}).then(r=>r.json());if(!r.ok)throw Error(r.error.message);return r.result;};\nsetRpcOverride(request);\nfunction QA(){const [notice,setNotice]=useState('');return <><style>{'body{overflow:auto!important}'}</style><aside style={{padding:12,borderBottom:'1px solid #888'}}>Resistor Edu · 독립 학습 기록으로 실제 UI·규칙 채점 검증 / 유료 AI·EDA 엔진 해석 미실행 <button onClick={()=>void request('qa.failNextPuzzleRead').then(()=>setNotice('다음 퍼즐 조회 1회 실패 예약'))}>QA: 다음 퍼즐 조회 실패</button><button onClick={()=>{Object.defineProperty(window,'localStorage',{configurable:true,get:()=>{throw Error('QA browser storage denied');}});setNotice('이 탭의 임시 저장 접근 차단 · 새로고침하면 해제');}}>QA: 임시 저장 차단</button><span role=\"status\">{notice}</span></aside><SelfStudy initialPanel=\"questions\"/></>;}\ncreateRoot(document.getElementById('root')!).render(<React.StrictMode><QA/></React.StrictMode>);\n");
let failNext=false;const calls=[];
const server=http.createServer(async(req,res)=>{
 const origin=req.headers.origin;
 if(origin&&origin!=='http://127.0.0.1:5177'){res.writeHead(403).end();return;}
 res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:5177');res.setHeader('Access-Control-Allow-Headers','content-type');res.setHeader('Cache-Control','no-store');
 if(req.method==='OPTIONS'){res.end();return;}
 if(req.method==='GET'&&req.url==='/evidence'){res.setHeader('content-type','application/json');res.end(JSON.stringify({schema_version:1,edition:'edu',qa_only:true,provider_calls:0,calls}));return;}
 if(req.method!=='POST'){res.writeHead(405).end();return;}
 let body='';for await(const chunk of req){body+=chunk;if(body.length>100000){res.writeHead(413).end();return;}}
 try{
 const {method,params={}}=JSON.parse(body);let result;
 if(method==='qa.failNextPuzzleRead'){failNext=true;result={ok:true,result:{armed:true}};}
 else if(!['study.catalog','study.history','study.submit','study.hint','study.reveal','study.recommend','study.export','study.puzzle.catalog','study.puzzle.create','study.puzzle.open','study.puzzle.act','study.puzzle.tutor','study.puzzle.export'].includes(method)||params.approved||params.mode==='ai')result={ok:false,error:{message:'QA harness excludes paid provider calls and engine jobs'}};
 else if(method==='study.puzzle.catalog'&&failNext){failNext=false;result={ok:false,error:{message:'QA 주입: 연결이 잠시 끊겼습니다.'}};}
 else result=await studyRpc({workspace},method,params,{edition:'edu',fetcher:async()=>{throw Error('No external provider in UI QA');}});
 calls.push({method,ok:result.ok,purpose:params.purpose??null,at:new Date().toISOString()});
 res.setHeader('content-type','application/json');res.end(JSON.stringify(result));
 await writeFile(resolve(runDirectory,'browser-service.json'),JSON.stringify({schema_version:1,edition:'edu',qa_only:true,scope:'실제 학습 서비스 + 브라우저 UI / 네트워크 실패만 주입 / 유료 AI·EDA 해석 미실행',provider_calls:0,calls},null,2)+'\n');
 }catch(e){res.writeHead(500).end(JSON.stringify({error:e.message}));}
});
server.listen(19006,'127.0.0.1',()=>console.log('Resistor Edu isolated QA: http://127.0.0.1:5177/packages/ui/qa/edu-loop/index.html (start Vite separately). No license settings, user projects or provider keys are changed.'));
