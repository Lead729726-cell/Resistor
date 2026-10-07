import {spawn} from 'node:child_process';
import {readFile,access} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {dockerExecutable,dockerEnvironment} from './docker-cli.mjs';

async function command(args){
  let executable;try{executable=await dockerExecutable();}catch(e){return {ok:false,missing:e.code==='ENOENT'};}
  return new Promise(resolve=>{
    let stdout='',settled=false;const child=spawn(executable,args,{windowsHide:true,stdio:['ignore','pipe','ignore'],env:dockerEnvironment()});
    const finish=result=>{if(settled)return;settled=true;clearTimeout(timer);resolve(result);};
    const timer=setTimeout(()=>{child.kill();finish({ok:false,timeout:true});},5000);
    child.stdout.on('data',b=>{stdout=(stdout+b).slice(0,4096);});
    child.once('error',e=>finish({ok:false,missing:e.code==='ENOENT'}));child.once('exit',code=>finish({ok:code===0,stdout}));
  });
}
export function normalizeMount(value){const s=value.trim().replaceAll('\\','/'),windows=/^[A-Za-z]:\//.test(s)||/^\/(?:run\/desktop\/mnt\/host|mnt\/host)\/[A-Za-z]\//.test(s);const normalized=s.replace(/^\/(?:run\/desktop\/mnt\/host|mnt\/host)\//,'').replace(/^([A-Za-z]):\//,'$1/').replace(/\/$/,'');return windows?normalized.toLowerCase():normalized;}
// The renderer supplies no paths, executables, command arguments or credentials.
// Diagnostics inspect existing state and never create a session or start Docker.
export async function desktopDiagnostics({workspace,resourcesRoot=workspace,platform=process.platform,arch=process.arch,run=command,read=readFile,check=access,fetchImpl=fetch}){
  const items=[];const add=(id,status,message,action='')=>items.push({id,status,message,action});
  add('viewer','pass','GDS 뷰어는 Docker와 로그인 없이 사용할 수 있습니다.');
  if(platform==='darwin'&&arch==='arm64')add('architecture','pass','Apple Silicon용 뷰어입니다. 공개 EDA 엔진은 Linux amd64 에뮬레이션으로 실행합니다.','엔진 첫 준비에는 인터넷과 디스크 공간이 필요하며 해석 속도는 Mac 성능에 따라 달라집니다.');
  try{await check(workspace,constants.W_OK);add('workspace','pass','설계 저장 폴더에 접근할 수 있습니다.');}catch{add('workspace','blocked','설계 저장 폴더에 접근할 수 없습니다.','폴더 권한과 연결된 드라이브를 확인하세요.');}
  let resourcesReady=true;
  for(const file of ['workers/eda/Dockerfile','workers/eda/bootstrap.py','workers/eda/server.py','platform/commercial/runner.py','platform/commercial/agent.py','adapters/commercial/catalog.json']){
    try{await check(path.join(resourcesRoot,file));}catch{resourcesReady=false;add('resources','blocked',`엔진 실행 파일이 없습니다: ${file}`,'ZIP 전체를 풀고 새 Resistor.app을 설치하세요. 설계 저장 폴더는 삭제하지 마세요.');break;}
  }
  if(resourcesReady)add('resources','pass','앱의 엔진 실행 파일과 backend 모듈이 있습니다.');
  const cli=await run(['--version']);let linux=false,mountMatched=true;
  if(!cli.ok)add('docker','missing','Docker 명령을 실행할 수 없습니다.','Docker Desktop을 설치한 뒤 Resistor를 다시 실행하세요.');
  else{
    add('docker','pass',cli.stdout.trim());const info=await run(['info','--format','{{.OSType}}']);linux=info.ok&&info.stdout.trim()==='linux';
    add('docker-engine',linux?'pass':'blocked',linux?'Docker Linux 엔진이 실행 중입니다.':'Docker Linux 엔진에 연결할 수 없습니다.','Docker Desktop을 실행하고 Linux containers 모드를 선택하세요.');
    if(linux){const container=await run(['inspect','--format','{{range .Mounts}}{{if eq .Destination "/workspace"}}{{.Source}}{{end}}{{end}}','mos-studio-eda']);
      if(container.ok){mountMatched=normalizeMount(container.stdout)===normalizeMount(workspace);add('container',mountMatched?'pass':'blocked',mountMatched?'기존 엔진이 현재 설계 폴더에 연결되어 있습니다.':container.stdout.trim()?'다른 설계 폴더가 엔진 컨테이너를 사용 중입니다.':'Docker 엔진의 /workspace 폴더 연결이 없습니다.',mountMatched?'':'기존 컨테이너를 보존한 채 이름을 변경하고 다시 연결하세요. Docker Desktop에서 이미지만 직접 실행하면 설계 연결이 준비되지 않습니다.');}
      else add('container','pending','첫 연결에서 고정된 공개 EDA 이미지를 준비합니다.','최초 준비에는 인터넷과 디스크 공간이 필요합니다.');
    }
  }
  let session,connected=false;
  try{
    session=JSON.parse(await read(path.join(workspace,'.runtime/worker.json'),'utf8'));
    const url=new URL(session.url);
    if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||url.pathname!=='/'||url.search||url.hash||typeof session.token!=='string'||session.token.length<32)throw Error('Invalid session');
  }catch{session=null;add('session','pending','현재 폴더의 엔진 연결이 아직 준비되지 않았습니다.','Docker를 준비한 뒤 설계 엔진 다시 연결을 누르세요.');}
  if(session&&linux&&mountMatched&&resourcesReady){
    try{
      const response=await fetchImpl(`${session.url}/rpc`,{method:'POST',headers:{'Content-Type':'application/json','X-MOS-Token':session.token},body:JSON.stringify({method:'pdk.capabilities',params:{}}),signal:AbortSignal.timeout(3500)});
      if(response.status===401||response.status===403){add('session','blocked','저장된 연결과 실행 중인 엔진의 인증 정보가 다릅니다.','현재 폴더의 엔진을 종료하고 다시 연결하세요.');}
      else{const data=await response.json();connected=response.ok&&data.ok===true;add('session',connected?'pass':'blocked',connected?'현재 설계 엔진의 인증 연결을 확인했습니다.':'설계 엔진이 진단 요청을 처리하지 못했습니다.','설계 엔진 다시 연결을 누르세요.');}
    }catch{add('session','pending','설계 엔진이 아직 응답하지 않습니다.','설계 엔진 다시 연결을 누르세요.');}
  }
  return {schema_version:1,checked_at:new Date().toISOString(),platform,arch,workspace,engine_ready:connected&&!items.some(i=>i.status==='blocked'),items,read_only:true,credentials_included:false};
}
