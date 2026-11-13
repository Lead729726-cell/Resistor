import {ONLINE_ACCESS_POLICY_VERSION,ONLINE_ACCESS_ERROR_CODE,assertOnlineAccess,createOnlineAcknowledgment,onlineAccessRequired,validOnlineAcknowledgment,type OnlineAccessEdition,type OnlineAcknowledgment} from '../../../platform/licensing/online-access-policy.mjs';

export type OnlineAccessStatus={edition:OnlineAccessEdition;policy_version:string;required:boolean;acknowledged:boolean;acknowledgment?:OnlineAcknowledgment};
type StorageLike=Pick<Storage,'getItem'|'setItem'>;
type HostRpc=(method:string,params:Record<string,unknown>)=>Promise<unknown>;
export const onlineAccessStorageKey=(edition:OnlineAccessEdition)=>`resistor.${edition}.online-access.v1`;
export function createOnlineAccessClient({edition,storage,hostRpc,now=()=>Date.now(),onChange=()=>{},onRequired=()=>{}}:{edition:OnlineAccessEdition;storage:()=>StorageLike;hostRpc?:HostRpc;now?:()=>number;onChange?:()=>void;onRequired?:(origin:HTMLElement|null)=>unknown}){
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
   // Capture before the local host lookup yields: callers may disable their
   // action button while waiting, which moves document focus back to BODY.
   const origin=typeof document!=='undefined'&&typeof HTMLElement!=='undefined'&&document.activeElement instanceof HTMLElement&&document.activeElement!==document.body?document.activeElement:null;
   if(!onlineAccessRequired(edition))return;
   const result=await status();try{assertOnlineAccess(result.acknowledgment,edition,now());}catch(error){
    if(!prompt)throw error;
    const confirmed=await onRequired(origin);
    if(confirmed===false)throw Object.assign(Error('온라인 작업을 취소했습니다. 현재 작업은 그대로입니다.'),{code:'ONLINE_ACCESS_CANCELLED'});
    if(confirmed!==true)throw error;
    // The dialog is not authority. Re-read persistence before the still-unsent
    // action may continue; never replay an already-issued request.
    const currentStatus=await status();assertOnlineAccess(currentStatus.acknowledgment,edition,now());
   }
  },
 };
}

declare const __RESISTOR_EDITION__:'edu'|'indust'|undefined;
let edition:OnlineAccessEdition=typeof __RESISTOR_EDITION__==='undefined'?'indust':__RESISTOR_EDITION__;
let hostMode:'native'|'local-rpc'|'browser'='browser';
let client:ReturnType<typeof createOnlineAccessClient>|undefined;
type ConfirmationHandler=(finish:(confirmed:boolean)=>void,origin:HTMLElement|null)=>void;
let confirmationHandler:ConfirmationHandler|undefined,pendingConfirmation:((confirmed:boolean)=>void)|undefined;
export function registerOnlineAccessPrompt(handler:ConfirmationHandler){
 if(confirmationHandler&&confirmationHandler!==handler)pendingConfirmation?.(false);
 confirmationHandler=handler;
 return ()=>{if(confirmationHandler===handler){confirmationHandler=undefined;pendingConfirmation?.(false);}};
}
function requestConfirmation(origin:HTMLElement|null):Promise<boolean|undefined>{
 if(!confirmationHandler)return Promise.resolve(undefined);
 // Do not silently batch another action behind one confirmation.
 if(pendingConfirmation)return Promise.resolve(false);
 return new Promise(resolve=>{
  const finish=(confirmed:boolean)=>{if(pendingConfirmation!==finish)return;pendingConfirmation=undefined;resolve(confirmed);};
  pendingConfirmation=finish;try{confirmationHandler!(finish,origin);}catch{finish(false);}
 });
}
const announce=(name:string)=>{if(typeof window!=='undefined')window.dispatchEvent(new Event(name));};
export function configureOnlineAccess(options:{edition:OnlineAccessEdition;host:'native'|'local-rpc'|'browser'}){pendingConfirmation?.(false);edition=options.edition;hostMode=options.host;client=undefined;}
function current(){
 return client??=createOnlineAccessClient({edition,storage:()=>localStorage,onChange:()=>announce('resistor:online-access-changed'),onRequired:requestConfirmation,...(hostMode==='browser'?{}:{hostRpc:async(method,params)=>{
  const reply=hostMode==='native'?await window.mos?.rpc(method,params):await fetch('/api/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method,params}),credentials:'same-origin'}).then(async response=>{if(!response.ok)throw Error('온라인 기능 확인을 위한 로컬 연결을 사용할 수 없습니다.');return response.json();});
  if(!reply?.ok)throw Object.assign(Error(reply?.error?.message||'온라인 기능 확인을 읽지 못했습니다.'),{code:reply?.error?.code});return reply.result;
 }})});
}
export const readOnlineAccess=()=>current().inspect();
export const onlineAccessAllowed=()=>{const status=readOnlineAccess();return !status.required||status.acknowledged;};
export const onlineAccessStatus=()=>current().status();
export const acknowledgeOnlineAccess=(input:{age_14_or_over:true;policy_version:string})=>current().acknowledge(input);
export const requireOnlineAccess=(options?:{prompt?:boolean})=>current().require(options);
export const requireOnlineAccessFor=(target:OnlineAccessEdition,options?:{prompt?:boolean})=>target===edition?requireOnlineAccess(options):createOnlineAccessClient({edition:target,storage:()=>localStorage,onRequired:requestConfirmation}).require(options);
export function onlineRpcNeedsAcknowledgment(method:string,params:Record<string,unknown>={}){
 return ['license.activate','license.refresh','desktop.update.check','desktop.update.download'].includes(method)||method==='assistant.review'&&params.provider==='openai'||['study.generate','study.submit','study.coach.run'].includes(method)&&params.approved===true||method==='study.puzzle.tutor'&&params.mode==='ai'&&params.approved===true;
}
export async function guardOnlineRpc(method:string,params:Record<string,unknown>={}){if(onlineRpcNeedsAcknowledgment(method,params))await requireOnlineAccess();}
export {ONLINE_ACCESS_POLICY_VERSION,ONLINE_ACCESS_ERROR_CODE};
