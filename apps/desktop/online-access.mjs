import {mkdir,readFile,writeFile,rename,unlink,lstat} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {ONLINE_ACCESS_POLICY_VERSION,onlineAccessRequired,createOnlineAcknowledgment,validOnlineAcknowledgment,assertOnlineAccess} from '../../platform/licensing/online-access-policy.mjs';

// An acknowledgment belongs to this edition's local installation. It is not a
// license, an age verification result, or permission for a particular AI upload.
export class DesktopOnlineAccess {
 constructor({directory,edition,now=()=>Date.now()}){
  if(!['edu','indust'].includes(edition)||typeof directory!=='string')throw Error('Invalid online access context');
  Object.assign(this,{directory,edition,now});this.file=path.join(directory,'online-access-'+edition+'.json');this.queue=Promise.resolve();
 }
 async record(){
  try{const stat=await lstat(this.file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>2048)return null;const value=JSON.parse(await readFile(this.file,'utf8'));return validOnlineAcknowledgment(value,this.edition,this.now())?value:null;}catch{return null;}
 }
 async status(){const acknowledgment=await this.record();return {schema_version:1,edition:this.edition,policy_version:ONLINE_ACCESS_POLICY_VERSION,required:onlineAccessRequired(this.edition),acknowledged:!!acknowledgment,...(acknowledgment?{acknowledgment}:{})};}
 async assert(){const acknowledgment=await this.record();assertOnlineAccess(acknowledgment,this.edition,this.now());return acknowledgment;}
 acknowledge(params){
  const run=this.queue.then(async()=>{
   if(!params||typeof params!=='object'||Array.isArray(params)||Object.keys(params).sort().join(',')!=='age_14_or_over,policy_version')throw Object.assign(Error('온라인 이용 확인에는 현재 정책 버전과 만 14세 이상 확인만 입력하세요.'),{code:'INVALID_PARAMETER'});
   const record=createOnlineAcknowledgment({...params,edition:this.edition},this.now());
   await mkdir(this.directory,{recursive:true});if((await lstat(this.directory)).isSymbolicLink())throw Error('Online acknowledgment directory must not be a symbolic link');
   const temp=this.file+'.'+randomUUID()+'.tmp';
   try{await writeFile(temp,JSON.stringify(record)+'\n',{mode:0o600,flag:'wx'});await rename(temp,this.file);}catch{await unlink(temp).catch(()=>{});throw Object.assign(Error('온라인 이용 확인을 저장하지 못했습니다. 기존 인증과 프로젝트는 보존했습니다.'),{code:'ONLINE_ACCESS_STORAGE'});}
   return this.status();
  });this.queue=run.catch(()=>{});return run;
 }
 async rpc(method,params={}){
  if(method==='online.access.acknowledge')return this.acknowledge(params);
  if(method==='online.access.status'&&params&&typeof params==='object'&&!Array.isArray(params)&&Object.keys(params).length===0)return this.status();
  throw Object.assign(Error('지원하지 않는 온라인 이용 확인 요청입니다.'),{code:'INVALID_PARAMETER'});
 }
 async runAutomatic(action){const state=await this.status();if(state.required&&!state.acknowledged)return {skipped:true,reason:'ONLINE_AGE_CONFIRMATION_REQUIRED'};return action();}
}
