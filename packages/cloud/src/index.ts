import {localRpc,setRpcOverride,WorkerError,type Project} from '@mos/contracts';
export interface Presence {peerId:string;userId?:string;name:string;color:string;selection?:string|null;cursor?:{x:string;y:string;layer_id?:string}|null}
export interface CloudStatus {configured:boolean;mode:'local'|'self-hosted'|'supabase';url:string;authenticated:boolean;user?:{id:string;email:string;name:string};room?:{id:string;name:string;role:'owner'|'editor'|'viewer';revision:number;sequence?:number};sync:{state:'local'|'connecting'|'synced'|'pending'|'conflict'|'offline'|'error';pending:number;message?:string;sequence?:number};presence:Presence[];capabilities:{auth:boolean;rooms:boolean;invites:boolean;presence:boolean;remoteRuns:boolean}}
export type CloudEvent={kind:'project'|'job'|'presence'|'status'};
const listeners=new Set<(event:CloudEvent)=>void>();
const storage=typeof window!=='undefined'?window.localStorage:undefined;
let url=storage?.getItem('register.cloud.url')||(typeof location!=='undefined'&&location.protocol!=='file:'&&location.port!=='5173'?location.origin:'http://127.0.0.1:18766');
let token=typeof sessionStorage!=='undefined'?sessionStorage.getItem('register.cloud.session')||'':'';
let socket:WebSocket|undefined,reconnect:ReturnType<typeof setTimeout>|undefined,heartbeat:ReturnType<typeof setInterval>|undefined,generation=0;
const peerId=globalThis.crypto.randomUUID();
let presenceInput:{selection?:string|null;cursor?:{x:string;y:string;layer_id?:string}|null}={};
let state:CloudStatus={configured:false,mode:'local',url,authenticated:false,sync:{state:'local',pending:0,sequence:0},presence:[],capabilities:{auth:false,rooms:false,invites:false,presence:false,remoteRuns:false}};
const preserved=new Map<string,{method:string;params:Record<string,unknown>;base_revision:number}>();
let lastStatus=0;
const pending=new Map<string,{method:string;params:Record<string,unknown>;base_revision:number}>();
function emit(kind:CloudEvent['kind']='status'){for(const l of listeners)l({kind});}
function sync(next:Partial<CloudStatus['sync']>){state.sync={...state.sync,...next,pending:pending.size};emit();}
async function request<T>(method:string,params:Record<string,unknown>={}):Promise<T>{
  try{const r=await fetch(`${url}/rpc`,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({method,params}),signal:AbortSignal.timeout(90000)});const data=await r.json();if(!data.ok)throw new WorkerError(data.error?.code||'CLOUD',data.error?.message||'Cloud request failed',data.error?.details);return data.result as T;}
  catch(e){if(e instanceof WorkerError)throw e;throw new WorkerError('CLOUD_OFFLINE',e instanceof Error?e.message:'Cloud unavailable');}
}
function disconnect(){generation++;if(reconnect)clearTimeout(reconnect);if(heartbeat)clearInterval(heartbeat);socket?.close();socket=undefined;}
function connect(){
  disconnect();if(!state.room||!token)return;const version=generation;
  sync({state:'connecting'});const endpoint=new URL('/events',url);endpoint.protocol=endpoint.protocol==='https:'?'wss:':'ws:';
  socket=new WebSocket(endpoint);socket.onopen=()=>socket?.send(JSON.stringify({type:'subscribe',token,room_id:state.room!.id,peer_id:peerId}));
  socket.onmessage=e=>{if(version!==generation)return;const m=JSON.parse(e.data);
    if(m.type==='ready'){state.room={...state.room!,revision:m.revision,sequence:m.sequence,...(m.role?{role:m.role}:{})};state.presence=m.presence||[];sync({state:pending.size?'pending':'synced',sequence:m.sequence,message:undefined});sendPresence();heartbeat=setInterval(sendPresence,15000);emit('project');}
    if(m.type==='snapshot'){const changedRevision=m.revision!==state.room?.revision;state.room={...state.room!,revision:m.revision,sequence:m.sequence};state.sync.sequence=m.sequence;emit(changedRevision?'project':'job');}
    if(m.type==='presence'){state.presence=(m.presence||[]).filter((p:Presence)=>p.peerId!==peerId);emit('presence');}
    if(m.type==='members')emit('status');
    if(m.type==='worker_error'||m.type==='error')sync({state:'error',message:m.error.message});
  };
  socket.onclose=()=>{if(version!==generation)return;if(heartbeat)clearInterval(heartbeat);sync({state:'offline',message:'연결이 끊겼습니다. 수정 명령은 다시 연결한 뒤 확인하세요.'});reconnect=setTimeout(()=>{if(version===generation)connect();},3000);};
  socket.onerror=()=>sync({state:'offline',message:'공동 작업 서버에 연결할 수 없습니다.'});
}
function sendPresence(){if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'presence',...presenceInput}));}
let savedRoom=typeof sessionStorage!=='undefined'?sessionStorage.getItem('register.cloud.room'):null;
let restore:Promise<Project>|undefined;
async function resume(){return restore??=(async()=>{const auth=await request<{user:CloudStatus['user']}>('cloud.auth.status');state.user=auth.user;state.authenticated=true;return activate(await request('cloud.open',{id:savedRoom}));})();}
const readMethods=new Set(['toolchain.doctor','project.open','project.snapshot','view.get_scene','schematic.validate','schematic.export_spice','schematic.netlist_xschem','experiment.list','experiment.status','pdk.capabilities','pdk.list_devices','pdk.validate','simulation.measure','simulation.compare','extraction.get_net_mapping','job.status','job.logs','project.export_bundle','project.command_receipt','layout.export','experiment.compare']);
for (const method of ['pdk.list_profiles', 'analysis.inspect']) readMethods.add(method);
for (const method of ['backend.catalog', 'backend.list_profiles', 'backend.validate', 'backend.read_artifact']) readMethods.add(method);
for (const method of ['compat.inspect', 'compat.export']) readMethods.add(method);
for (const method of ['database.catalog', 'database.list_sources', 'database.probe', 'database.list_cells', 'database.read', 'database.read_artifact']) readMethods.add(method);
for (const method of ['pvt.sources','pvt.status','pvt.list','design.catalog','design.routing_rules','design.route_preview','design.connectivity','design.check']) readMethods.add(method);
async function remoteRpc(method:string,params:Record<string,unknown>){
  if(!state.room)return localRpc(method,params);
  if(method==='project.list')return [await request('cloud.native',{room_id:state.room.id,method:'project.snapshot',params:{}})];
  if(['project.create','project.clone','design.create_template'].includes(method))throw new WorkerError('SHARED_SCOPE','공동 작업 패널에서 공유 프로젝트를 생성하거나 로컬로 전환하세요.');
  const roomId=state.room.id;
  if(readMethods.has(method))return request('cloud.native',{room_id:roomId,method,params});
  if(state.room.role==='viewer')throw new WorkerError('READ_ONLY','열람 권한에서는 편집 또는 분석 실행을 할 수 없습니다.');
  if(state.sync.state==='offline'||state.sync.state==='connecting')throw new WorkerError('CLOUD_OFFLINE','연결 후 최신 설계를 확인하고 편집하세요.');
  if(state.sync.state==='conflict')throw new WorkerError('EDIT_CONFLICT','보존된 충돌을 검토하고 최신 설계를 다시 불러오세요.');
  const id=crypto.randomUUID(),operation={method,params,base_revision:state.room.revision};pending.set(id,operation);sync({state:'pending',message:undefined});
  try{const result=await request<Record<string,unknown>>('cloud.native',{room_id:roomId,...operation,command_id:id});pending.delete(id);const project=result.project as Project|undefined;const revision=project?.revision??result.revision;if(Number.isSafeInteger(revision)&&!result.execution_status)state.room.revision=revision as number;sync({state:pending.size?'pending':'synced'});emit('project');return result;}
  catch(e){const error=e as WorkerError;const conflict=['EDIT_CONFLICT','REVISION_CONFLICT','UNCERTAIN_COMMIT','CLOUD_OFFLINE','COMMAND_PENDING'].includes(error.code);if(!conflict)pending.delete(id);sync({state:conflict?'conflict':'error',message:error.message});throw e;}
}
async function activate(result:{room:NonNullable<CloudStatus['room']>;project:Project;presence?:Presence[]}){pending.clear();state.room=result.room;savedRoom=result.room.id;sessionStorage.setItem('register.cloud.room',result.room.id);state.presence=result.presence||[];setRpcOverride(remoteRpc);connect();emit('project');return result.project;}
export const cloud={
  isRemoteClient(){return typeof location!=='undefined'&&location.protocol!=='file:'&&location.port!=='5173';},
  async status():Promise<CloudStatus>{if(token&&savedRoom&&!state.room){try{await resume();}catch(e){state.sync={...state.sync,state:'error',message:(e as Error).message};}}if(state.configured&&Date.now()-lastStatus<10000)return {...state,sync:{...state.sync},presence:[...state.presence]};lastStatus=Date.now();try{const info=await request<{mode:CloudStatus['mode'];capabilities:CloudStatus['capabilities']}>('cloud.info');state.configured=true;state.mode=info.mode;state.capabilities=info.capabilities;if(token&&!state.authenticated){const data=await request<{user:CloudStatus['user']}>('cloud.auth.status');state.user=data.user;state.authenticated=true;}}catch(e){if((e as WorkerError).code==='AUTH_EXPIRED'){token='';sessionStorage.removeItem('register.cloud.session');state.authenticated=false;state.user=undefined;}state.configured=false;}return {...state,sync:{...state.sync},presence:[...state.presence]};},
  async configure(input:{url:string;publishableKey?:string}){const parsed=new URL(input.url);if(parsed.protocol!=='https:'&&!(parsed.protocol==='http:'&&['127.0.0.1','localhost'].includes(parsed.hostname)))throw new WorkerError('HTTPS_REQUIRED','외부 서버는 HTTPS 주소를 사용하세요.');disconnect();setRpcOverride(undefined);savedRoom=null;restore=undefined;token='';sessionStorage.removeItem('register.cloud.room');sessionStorage.removeItem('register.cloud.session');url=parsed.origin;storage?.setItem('register.cloud.url',url);state={...state,url,configured:false,authenticated:false,user:undefined,room:undefined,presence:[],sync:{state:'local',pending:0,sequence:0}};emit();return this.status();},
  async signUp(input:{email:string;password:string;name:string}){const auth=await request<{token:string;user:CloudStatus['user']}>('cloud.auth.signUp',input);token=auth.token;sessionStorage.setItem('register.cloud.session',token);state.user=auth.user;state.authenticated=true;emit();return auth.user;},
  async signIn(input:{email:string;password:string}){const auth=await request<{token:string;user:CloudStatus['user']}>('cloud.auth.signIn',input);token=auth.token;sessionStorage.setItem('register.cloud.session',token);state.user=auth.user;state.authenticated=true;emit();return auth.user;},
  async signOut(){try{await request('cloud.auth.signOut');}finally{this.leaveProject();token='';sessionStorage.removeItem('register.cloud.session');state.user=undefined;state.authenticated=false;emit();}},
  listProjects(){return request<{id:string;name:string;role:'owner'|'editor'|'viewer';revision:number;updated_at:number}[]>('cloud.projects');},
  async publishProject({project_id}:{project_id:string}){const bundle=await localRpc<{bundle_base64:string}>('project.export_bundle',{project_id,inline:true});return activate(await request('cloud.create',{bundle_base64:bundle.bundle_base64}));},
  async createProject(input:{name:string;example:string}){return activate(await request('cloud.create',input));},
  async promoteCandidate(input:{experiment_id:string;project_id:string}){return activate(await request('cloud.promoteCandidate',{room_id:state.room?.id,...input}));},
  async openProject(input:{id:string}){return activate(await request('cloud.open',input));},
  createInvite(input:{role:'editor'|'viewer';expires_hours?:number}){return request<{token:string;url:string;expires_at:number}>('cloud.invite',{room_id:state.room?.id,...input});},
  async joinProject(input:{token:string}){return activate(await request('cloud.join',input));},
  members(){return request<{user_id:string;name:string;role:'owner'|'editor'|'viewer'}[]>('cloud.members',{room_id:state.room?.id});},
  setRole(input:{user_id:string;role:'editor'|'viewer'|'removed'}){return request('cloud.setRole',{room_id:state.room?.id,...input});},
  async leaveProject(){savedRoom=null;restore=undefined;sessionStorage.removeItem('register.cloud.room');disconnect();setRpcOverride(undefined);pending.clear();state.room=undefined;state.presence=[];sync({state:'local',message:undefined,sequence:0});},
  async resync(){if(!state.room)throw new WorkerError('NO_ROOM','공유 프로젝트를 먼저 여세요.');const result=await request<{room:NonNullable<CloudStatus['room']>;project:Project;presence:Presence[]}>('cloud.open',{id:state.room.id});state.room=result.room;state.presence=result.presence;for(const [id,operation] of pending)preserved.set(id,operation);pending.clear();sync({state:'synced',message:undefined,sequence:result.room.sequence});emit('project');return result.project;},
  preservedCommands(){return [...preserved].map(([id,operation])=>({id,...structuredClone(operation)}));},
  updatePresence(input:typeof presenceInput){presenceInput={...presenceInput,...input};sendPresence();},
  subscribe(listener:(event:CloudEvent)=>void){listeners.add(listener);return ()=>{listeners.delete(listener);};},
  async downloadExport({format}:{format:'gds'|'oas'|'bundle'}){if(!state.room)throw new WorkerError('NO_ROOM','공유 프로젝트를 먼저 여세요.');const query=new URLSearchParams({room_id:state.room.id,format});const r=await fetch(`${url}/export?${query}`,{headers:{Authorization:`Bearer ${token}`}});if(!r.ok){const data=await r.json();throw new WorkerError(data.error.code,data.error.message);}return {blob:await r.blob(),name:r.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1]||format};},
  async importLayout({file,sidecar}:{file:File;sidecar?:File}){if(!state.room)throw new WorkerError('NO_ROOM','공유 프로젝트를 먼저 여세요.');const format=file.name.toLowerCase().endsWith('.gds')?'gds':file.name.toLowerCase().endsWith('.oas')?'oas':null;if(!format||file.size>16*1024*1024)throw new WorkerError('FILE_FORMAT','16 MiB 이하의 GDS/OAS 파일을 선택하세요.');if(sidecar&&sidecar.size>2*1024*1024)throw new WorkerError('FILE_TOO_LARGE','Sidecar는 2 MiB 이하만 지원합니다.');const base64=(value:File)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(value);});return await remoteRpc('layout.import',{format,file_base64:await base64(file),...(sidecar?{sidecar_base64:await base64(sidecar)}:{})}) as Project;},
  async downloadArtifact({run_id,key}:{run_id:string;key:string}){if(!state.room)throw new WorkerError('NO_ROOM','공유 프로젝트를 먼저 여세요.');const query=new URLSearchParams({room_id:state.room.id,run_id,key});const r=await fetch(`${url}/artifact?${query}`,{headers:{Authorization:`Bearer ${token}`}});if(!r.ok){const data=await r.json();throw new WorkerError(data.error.code,data.error.message);}return {blob:await r.blob(),name:r.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1]||key};}
};

if(token&&savedRoom)setRpcOverride(async(method,params)=>{await resume();return remoteRpc(method,params);});
