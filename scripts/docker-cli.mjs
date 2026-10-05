import {access} from 'node:fs/promises';
import {constants} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Finder does not inherit a terminal's Homebrew/Docker PATH. Discover fixed
// locations directly; never invoke a login shell or accept renderer commands.
export function dockerEnvironment({platform=process.platform,env=process.env,home=os.homedir()}={}) {
  if(platform!=='darwin')return {...env};
  const folders=[...(env.PATH??'').split(':').filter(Boolean),path.posix.join(home,'.docker/bin'),'/Applications/Docker.app/Contents/Resources/bin','/opt/homebrew/bin','/usr/local/bin','/usr/bin','/bin'];
  return {...env,PATH:[...new Set(folders)].join(':')};
}

export async function dockerExecutable({platform=process.platform,env=process.env,home=os.homedir(),check=access}={}) {
  const paths=platform==='win32'?path.win32:path.posix;
  if(env.REGISTER_DOCKER_PATH){
    if(!paths.isAbsolute(env.REGISTER_DOCKER_PATH))throw Error('REGISTER_DOCKER_PATH must be an absolute Docker CLI path.');
    await check(env.REGISTER_DOCKER_PATH,platform==='win32'?constants.F_OK:constants.X_OK);
    return env.REGISTER_DOCKER_PATH;
  }
  if(platform!=='darwin')return 'docker';
  for(const folder of dockerEnvironment({platform,env,home}).PATH.split(':')){
    if(!path.posix.isAbsolute(folder))continue;
    const candidate=path.posix.join(folder,'docker');
    try{await check(candidate,constants.X_OK);return candidate;}catch(e){if(!['ENOENT','EACCES','ENOTDIR'].includes(e.code))throw e;}
  }
  throw Object.assign(Error('Docker CLI was not found. Install and start a Linux Docker engine, or use the offline viewer.'),{code:'ENOENT'});
}
