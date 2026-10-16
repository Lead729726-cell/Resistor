import {canonical,type LeagueEnvelope} from '../../education/src/league-protocol';
type Identity={signing:CryptoKeyPair;draftKey:CryptoKey};
const enc=new TextEncoder();
let database:Promise<IDBDatabase>|undefined;
function db(){return database??=new Promise((resolve,reject)=>{const r=indexedDB.open('resistor-edu-league-device',1);r.onupgradeneeded=()=>{r.result.createObjectStore('keys');r.result.createObjectStore('drafts');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('기기 키 저장소를 열 수 없습니다. 브라우저 저장소 권한을 확인하세요.'));});}
async function read<T>(store:string,key:string):Promise<T|undefined>{const d=await db();return new Promise((resolve,reject)=>{const r=d.transaction(store).objectStore(store).get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function write(store:string,key:string,value:unknown,remove=false){const d=await db();return new Promise<void>((resolve,reject)=>{const tx=d.transaction(store,'readwrite');if(remove)tx.objectStore(store).delete(key);else tx.objectStore(store).put(value,key);tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(tx.error);});}
async function identity(endpoint:string,create=false):Promise<Identity|undefined>{
 let value=await read<Identity>('keys',endpoint);if(!value&&create){if(!crypto.subtle)throw Error('기기 키 등록은 HTTPS 또는 localhost의 보안 컨텍스트에서 지원합니다.');const candidate:Identity={signing:await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']),draftKey:await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt'])};
  const d=await db();value=await new Promise<Identity>((resolve,reject)=>{const tx=d.transaction('keys','readwrite'),store=tx.objectStore('keys'),get=store.get(endpoint);let chosen:Identity;get.onsuccess=()=>{chosen=get.result||candidate;if(!get.result)store.add(candidate,endpoint);};tx.oncomplete=()=>resolve(chosen);tx.onabort=tx.onerror=()=>reject(tx.error);});
 }
 if(value&&(value.signing.privateKey.extractable||value.draftKey.extractable||value.signing.privateKey.algorithm.name!=='ECDSA'))throw Error('저장된 기기 키 형식이 올바르지 않습니다. 임의로 새 닉네임을 만들지 않았습니다.');return value;
}
function base64(bytes:ArrayBuffer){let value='';for(const b of new Uint8Array(bytes))value+=String.fromCharCode(b);return btoa(value).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
function hex(bytes:ArrayBuffer){return [...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');}
export function leagueEndpoint(value:string){
 const u=new URL(value);if(u.username||u.password||u.hash||u.search||!(u.protocol==='https:'||u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname)))throw Error('공용 서버는 인증정보 없는 HTTPS 주소를 사용하세요. 로컬 HTTP는 localhost만 허용합니다.');
 if(u.pathname==='/'||u.pathname==='')u.pathname='/api/league';if(u.pathname!=='/api/league')throw Error('리그 주소는 /api/league 경로를 사용하세요.');return u.href;
}
export function defaultLeagueEndpoint(){return localStorage.getItem('resistor.edu.league.endpoint')||((location.protocol==='http:'||location.protocol==='https:')?new URL('/api/league',location.origin).href:'http://127.0.0.1:18786/api/league');}
export function leagueClient(value:string,identityNamespace?:string){
 const endpoint=leagueEndpoint(value),storage=identityNamespace?'publisher:'+identityNamespace:endpoint;let offset=0,synced=false,queue=Promise.resolve();
 async function call<T=Record<string,unknown>>(method:string,params:Record<string,unknown>={},signed=false):Promise<T>{
  let body:Record<string,unknown>={method,params};if(signed){if(!synced)await call('league.info');const key=await identity(storage,method==='league.enroll');if(!key)throw Error('이 기기를 먼저 등록하세요.');const pub=await crypto.subtle.exportKey('spki',key.signing.publicKey),device_id=hex(await crypto.subtle.digest('SHA-256',pub));
   const message:LeagueEnvelope={schema_version:1,device_id,method,params:method==='league.enroll'?{public_key:base64(pub)}:params,issued_at:Math.round(Date.now()+offset),nonce:crypto.randomUUID()};body={...message,signature:base64(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key.signing.privateKey,enc.encode(canonical(message))))};
  }
  let r:Response;try{r=await fetch(endpoint,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000),credentials:'omit'});}catch{throw Error('리그 서버에 연결할 수 없습니다. 전송한 작업은 기록 새로고침으로 먼저 확인하세요.');}
  const reader=r.body?.getReader(),decoder=new TextDecoder();let text='',bytes=0;if(!reader)throw Error('리그 응답 본문이 없습니다.');try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>1000000){await reader.cancel();throw Error('리그 응답 크기 제한입니다.');}text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}let response;try{response=JSON.parse(text);}catch{throw Error('리그 서버 응답을 읽을 수 없습니다. 서버 주소를 확인하세요.');}
  if(!response?.ok){if(response?.error?.code==='CLOCK_SKEW')synced=false;throw Object.assign(Error(response?.error?.message||'리그 요청 실패'),{code:response?.error?.code});}if(!r.ok||response.result?.edition!=='edu'||response.result?.schema_version!==1||!Number.isFinite(response.result?.server_time))throw Error('Resistor Edu 리그 응답 형식·버전을 확인할 수 없습니다.');offset=response.result.server_time-Date.now();synced=true;return response.result;
 }
 return {endpoint,call,clock:()=>Date.now()+offset,hasIdentity:async()=>!!await identity(storage),
  saveDraft(attempt:string,answers:Record<string,string>){queue=queue.catch(()=>{}).then(async()=>{const key=await identity(storage);if(!key)return;const iv=crypto.getRandomValues(new Uint8Array(12)),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(storage+'|'+attempt)},key.draftKey,enc.encode(JSON.stringify(answers)));await write('drafts',storage+'|'+attempt,{iv,cipher});});return queue;},
  async loadDraft(attempt:string):Promise<Record<string,string>>{const value=await read<{iv:Uint8Array;cipher:ArrayBuffer}>('drafts',storage+'|'+attempt),key=await identity(storage);if(!value||!key)return {};return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(value.iv),additionalData:enc.encode(storage+'|'+attempt)},key.draftKey,value.cipher)));},
  clearDraft(attempt:string){queue=queue.catch(()=>{}).then(()=>write('drafts',storage+'|'+attempt,null,true));return queue;}
 };
}
