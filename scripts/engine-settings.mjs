import {writeFile,mkdir,rename} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {nativeSettings,runtimeIdentity,stopNativeWorker,workspaceId} from './native-worker.mjs';
import {runtimeConfig} from './runtime.mjs';
import {wslDistributions} from './wsl-worker.mjs';
import {localEngineFetch} from './local-http.mjs';

export async function engineSettings(workspace){const settings=await nativeSettings(workspace);return {mode:process.env.REGISTER_ENGINE_MODE||settings.mode||'native',distribution:settings.wsl_distribution||'',distributions:await wslDistributions(),platform:process.platform,environment_override:!!process.env.REGISTER_ENGINE_MODE};}
export async function configureEngine(workspace,params){
  if(!params||Object.keys(params).some(k=>!['mode','distribution'].includes(k))||!['native','wsl','docker'].includes(params.mode))throw Error('실행 방식만 설정할 수 있습니다. 사용자 명령·파일 경로는 받지 않습니다.');
  if(process.env.REGISTER_ENGINE_MODE)throw Error('실행 방식이 환경 변수로 지정되어 있습니다. 시작 환경에서 변경하세요.');
  if(params.mode==='wsl'&&(process.platform!=='win32'||!(await wslDistributions()).includes(params.distribution)))throw Error('Docker와 독립된 설치된 WSL 배포판을 선택하세요.');
  const config=await runtimeConfig(workspace),identity=await runtimeIdentity(config);
  if(identity){if(identity.workspace_id!==workspaceId(workspace))throw Error('다른 폴더의 엔진은 전환하지 않습니다.');await stopNativeWorker(workspace);}
  else{try{const response=await localEngineFetch(config.url+'/health',{signal:AbortSignal.timeout(1500)});if(response.ok)throw Error('LEGACY_ENGINE_RUNNING');}catch(e){if(e.message==='LEGACY_ENGINE_RUNNING')throw Error('이전 엔진이 실행 중입니다. 기존 Docker 엔진 전환 버튼으로 종료한 뒤 적용하세요.');}}
  const settings=await nativeSettings(workspace);settings.mode=params.mode;
  if(params.mode==='wsl')settings.wsl_distribution=params.distribution;
  const directory=path.join(workspace,'.runtime');await mkdir(directory,{recursive:true});const temporary=path.join(directory,'engine-'+randomUUID()+'.json');await writeFile(temporary,JSON.stringify(settings,null,2)+'\n',{mode:0o600});await rename(temporary,path.join(directory,'engine.json'));
  return engineSettings(workspace);
}
