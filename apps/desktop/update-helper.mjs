import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {applyInstallation,assertInside} from './update-install.mjs';
const job=path.resolve(process.argv[2]);const plan=JSON.parse(await readFile(job,'utf8'));assertInside(plan.folder,job);
if(!Number.isSafeInteger(plan.parentPid)||plan.parentPid<1||!plan.id)throw Error('업데이트 프로세스 정보가 잘못되었습니다.');
try{
  await writeFile(job+'.ready',JSON.stringify({id:plan.id}),{flag:'wx',mode:0o600});
  const deadline=Date.now()+120000;
  while(true){let alive=true;try{process.kill(plan.parentPid,0);}catch(e){if(e.code==='ESRCH')alive=false;else throw e;}
    if(!alive)break;if(Date.now()>=deadline)throw Error('기존 앱이 종료되지 않아 설치하지 않았습니다.');await new Promise(r=>setTimeout(r,250));
  }
  await applyInstallation(plan);
}catch(e){const receiptFile=path.join(plan.folder,'receipt.json');let recorded=false;try{const r=JSON.parse(await readFile(receiptFile,'utf8'));recorded=r.id===plan.id&&r.status==='failed';}catch{}if(!recorded)await writeFile(receiptFile,JSON.stringify({id:plan.id,status:'failed',version:plan.version,message:e.message,finished_at:new Date().toISOString()}),{mode:0o600});process.exitCode=1;}
