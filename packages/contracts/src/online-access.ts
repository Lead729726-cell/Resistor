import {ONLINE_ACCESS_POLICY_VERSION,ONLINE_ACCESS_ERROR_CODE,assertOnlineAccess,createOnlineAcknowledgment,onlineAccessRequired,validOnlineAcknowledgment,type OnlineAccessEdition,type OnlineAcknowledgment} from '../../../platform/licensing/online-access-policy.mjs';

export type OnlineAccessStatus={edition:OnlineAccessEdition;policy_version:string;required:boolean;acknowledged:boolean;acknowledgment?:OnlineAcknowledgment};
type StorageLike=Pick<Storage,'getItem'|'setItem'>;
type HostRpc=(method:string,params:Record<string,unknown>)=>Promise<unknown>;
export const onlineAccessStorageKey=(edition:OnlineAccessEdition)=>`resistor.${edition}.online-access.v1`;
export function createOnlineAccessClient({edition,storage,hostRpc,now=()=>Date.now(),onChange=()=>{},onRequired=()=>{}}:{edition:OnlineAccessEdition;storage:()=>StorageLike;hostRpc?:HostRpc;now?:()=>number;onChange?:()=>void;onRequired?:()=>void}){
 let hostAcknowledgment:unknown;
 const describe=(value:unknown):OnlineAccessStatus=>({edition,policy_version:ONLINE_ACCESS_POLICY_VERSION,required:onlineAccessRequired(edition),acknowledged:validOnlineAcknowledgment(value,edition,now()),...(validOnlineAcknowledgment(value,edition,now())?{acknowledgment:value}:{})});
 const stored=()=>{try{return JSON.parse(storage().getItem(onlineAccessStorageKey(edition))||'null') as unknown;}catch{return null;}};
 const inspect=()=>describe(hostRpc?hostAcknowledgment:stored());
 const acceptHost=(raw:unknown)=>{
  const value=raw as OnlineAccessStatus;
  if(!value||value.edition!==edition||value.policy_version!==ONLINE_ACCESS_POLICY_VERSION||value.required!==onlineAccessRequired(edition)||typeof value.acknowledged!=='boolean'||value.acknowledged&&!validOnlineAcknowledgment(value.acknowledgment,edition,now()))throw Error('온라인 기능 확인 상태를 읽지 못했습니다. 기존 인증·기록은 변경하지 않았습니다.');
  hostAcknowledgment=value.acknowledged?value.acknowledgment:null;return describe(hostAcknowledgment);
 };
 const status=async()=>hostRpc?acceptHost(await hostRpc('online.access.status',{})):inspect();
 return {
  inspect,status,
  async acknowledge(input:{age_14_or_over:true;policy_version:string}){
   if(!input||Object.keys(input).length!==2||!Object.hasOwn(input,'age_14_or_over')||!Object.hasOwn(input,'policy_version'))throw Object.assign(Error('만 14세 이상 자기 확인과 정책 버전만 저장할 수 있습니다.'),{code:ONLINE_ACCESS_ERROR_CODE});
   const acknowledgment=createOnlineAcknowledgment({...input,edition},now());
   if(hostRpc){const result=acceptHost(await hostRpc('online.access.acknowledge',input));if(!result.acknowledged)throw Error('온라인 기능 확인이 저장되지 않았습니다.');onChange();return result;}
   try{storage().setItem(onlineAccessStorageKey(edition),JSON.stringify(acknowledgment));if(!validOnlineAcknowledgment(stored(),edition,now()))throw Error();}catch{throw Error('기기 저장소에 확인을 저장하지 못했습니다. 온라인 요청을 보내지 않았습니다. 저장소 권한을 확인하세요.');}
   onChange();return inspect();
  },
  async require({prompt=true}:{prompt?:boolean}={}){
   if(!onlineAccessRequired(edition))return;
   const result=await status();try{assertOnlineAccess(result.acknowledgment,edition,now());}catch(error){if(prompt)onRequired();throw error;}
  },
 };
}

declare const __RESISTOR_EDITION__:'edu'|'indust'|undefined;
let edition:OnlineAccessEdition=typeof __RESISTOR_EDITION__==='undefined'?'indust':__RESISTOR_EDITION__;
let hostMode:'native'|'local-rpc'|'browser'='browser';
let client:ReturnType<typeof createOnlineAccessClient>|undefined;
const announce=(name:string)=>{if(typeof window!=='undefined')window.dispatchEvent(new Event(name));};
export function configureOnlineAccess(options:{edition:OnlineAccessEdition;host:'native'|'local-rpc'|'browser'}){edition=options.edition;hostMode=options.host;client=undefined;}
function current(){
 return client??=createOnlineAccessClient({edition,storage:()=>localStorage,onChange:()=>announce('resistor:online-access-changed'),onRequired:()=>announce('resistor:online-access-required'),...(hostMode==='browser'?{}:{hostRpc:async(method,params)=>{
  const reply=hostMode==='native'?await window.mos?.rpc(method,params):await fetch('/api/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method,params}),credentials:'same-origin'}).then(async response=>{if(!response.ok)throw Error('온라인 기능 확인을 위한 로컬 연결을 사용할 수 없습니다.');return response.json();});
  if(!reply?.ok)throw Object.assign(Error(reply?.error?.message||'온라인 기능 확인을 읽지 못했습니다.'),{code:reply?.error?.code});return reply.result;
 }})});
}
export const readOnlineAccess=()=>current().inspect();
export const onlineAccessAllowed=()=>{const status=readOnlineAccess();return !status.required||status.acknowledged;};
export const onlineAccessStatus=()=>current().status();
export const acknowledgeOnlineAccess=(input:{age_14_or_over:true;policy_version:string})=>current().acknowledge(input);
export const requireOnlineAccess=(options?:{prompt?:boolean})=>current().require(options);
export const requireOnlineAccessFor=(target:OnlineAccessEdition,options?:{prompt?:boolean})=>target===edition?requireOnlineAccess(options):createOnlineAccessClient({edition:target,storage:()=>localStorage,onRequired:()=>announce('resistor:online-access-required')}).require(options);
export function onlineRpcNeedsAcknowledgment(method:string,params:Record<string,unknown>={}){
 return ['license.activate','license.refresh'].includes(method)||method==='assistant.review'&&params.provider==='openai'||['study.generate','study.submit','study.coach.run'].includes(method)&&params.approved===true;
}
export async function guardOnlineRpc(method:string,params:Record<string,unknown>={}){if(onlineRpcNeedsAcknowledgment(method,params))await requireOnlineAccess();}
export {ONLINE_ACCESS_POLICY_VERSION,ONLINE_ACCESS_ERROR_CODE};
