import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {promisify} from 'node:util';
import {DatabaseSync} from 'node:sqlite';
import {WebSocketServer} from 'ws';
import {runtimeConfig,workerRpc,METHODS} from '../../scripts/runtime.mjs';

const scrypt=promisify(crypto.scrypt);
const digest=v=>crypto.createHash('sha256').update(v).digest('hex');
const uuid=()=>crypto.randomUUID();
const fail=(code,message,details)=>{throw Object.assign(new Error(message),{code,details});};
const readonly=new Set(['toolchain.doctor','project.open','project.snapshot','view.get_scene','view.pick','view.cross_probe','schematic.validate','schematic.export_spice','schematic.netlist_xschem','experiment.list','experiment.status','pdk.capabilities','pdk.list_devices','pdk.validate','simulation.measure','simulation.compare','extraction.get_net_mapping','job.status','job.logs','project.export_bundle','project.command_receipt','layout.export','experiment.compare']);
const mutations=new Set(['project.save','layout.apply_command','schematic.apply_command','layout.generate_pcell','layout.import','project.import_bundle','project.rename','view.set_display','simulation.run','verification.run_drc','verification.run_lvs','extraction.run_pex','job.cancel','experiment.create','experiment.evaluate','experiment.cancel']);
for (const method of ['pdk.list_profiles', 'analysis.inspect']) readonly.add(method);
for (const method of ['analysis.configure', 'analysis.run', 'analysis.verify']) mutations.add(method);
for (const method of ['backend.catalog', 'backend.list_profiles', 'backend.validate', 'backend.read_artifact']) readonly.add(method);
for (const method of ['backend.configure', 'backend.run', 'backend.import_layout']) mutations.add(method);
for (const method of ['compat.inspect','compat.export']) readonly.add(method);
for (const method of ['compat.import','compat.import_results']) mutations.add(method);
for (const method of ['database.catalog','database.list_sources','database.probe','database.list_cells','database.read','database.read_artifact']) readonly.add(method);
mutations.add('database.import');
for(const method of ['pvt.sources','pvt.status','pvt.list','design.catalog','design.routing_rules','design.route_preview','design.route_search','design.connectivity','design.check'])readonly.add(method);
for(const method of ['pvt.create','pvt.start','pvt.cancel','design.route_apply'])mutations.add(method);
function scopes(method,params){
  const c=params.command||{};
  if(method==='project.rename')return ['project:name'];
  if(method==='view.set_display')return ['display'];
  if(['analysis.configure','backend.configure','backend.import_layout'].includes(method))return ['*'];
  if(['compat.import','compat.import_results','database.import'].includes(method))return ['*'];
  if(['pvt.create','pvt.start','design.route_apply'].includes(method))return ['*'];
  if(['layout.import','project.import_bundle','layout.generate_pcell'].includes(method))return ['*'];
  if(method.endsWith('.apply_command')){
    if(['undo','redo','set_connectivity_mode','update_testbench','add_cell'].includes(c.type)||method==='layout.apply_command'&&c.type==='update_device')return ['*'];
    if(c.id)return [`${method.startsWith('schematic')?'device':'shape'}:${c.cell_name||''}:${c.id}`];
    if(c.device?.id)return [`device:${c.cell_name||''}:${c.device.id}`,`name:${c.device.name}`];
    if(c.wire?.id)return [`wire:${c.wire.id}`];
    if(c.junction?.id)return [`junction:${c.junction.id}`];
    if(['add_box','add_route','add_polygon','add_path','add_label','add_pin','add_instance','add_via'].includes(c.type))return [];
    return ['*'];
  }
  return [];
}
const overlap=(a,b)=>a.length&&b.length&&(a.includes('*')||b.includes('*')||a.some(v=>b.includes(v)));

export async function startHub({workspace=process.cwd(),port=18766,host='127.0.0.1',stateDirectory,staticDirectory,publicUrl,allowOrigins=[],workerConfig}={}){
  const folder=path.resolve(stateDirectory||path.join(workspace,'.runtime/cloud'));
  const frontendRoot=path.resolve(staticDirectory||path.join(workspace,'dist'));
  await fs.mkdir(folder,{recursive:true});
  const db=new DatabaseSync(path.join(folder,'register.sqlite3'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE,name TEXT,salt TEXT,password_hash TEXT,created_at INTEGER);
    CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),expires_at INTEGER);
    CREATE TABLE IF NOT EXISTS rooms(id TEXT PRIMARY KEY,name TEXT,owner_id TEXT REFERENCES users(id),project_id TEXT,revision INTEGER,sequence INTEGER DEFAULT 0,snapshot TEXT,updated_at INTEGER);
    CREATE TABLE IF NOT EXISTS members(room_id TEXT REFERENCES rooms(id),user_id TEXT REFERENCES users(id),role TEXT CHECK(role IN ('owner','editor','viewer')),PRIMARY KEY(room_id,user_id));
    CREATE TABLE IF NOT EXISTS invites(hash TEXT PRIMARY KEY,room_id TEXT REFERENCES rooms(id),role TEXT,expires_at INTEGER,uses INTEGER DEFAULT 0,max_uses INTEGER DEFAULT 16);
    CREATE TABLE IF NOT EXISTS commands(id TEXT PRIMARY KEY,room_id TEXT REFERENCES rooms(id),user_id TEXT,method TEXT,hash TEXT,base_revision INTEGER,scopes TEXT,params TEXT,status TEXT,result TEXT,error TEXT,revision INTEGER,created_at INTEGER);
    CREATE INDEX IF NOT EXISTS command_revision ON commands(room_id,revision);
    CREATE INDEX IF NOT EXISTS user_memberships ON members(user_id,room_id);`);
  db.prepare("UPDATE commands SET status='uncertain',error=? WHERE status='processing'").run(JSON.stringify({code:'UNCERTAIN_COMMIT',message:'Server restarted during command. Inspect the authoritative revision before retrying.'}));
  const config=workerConfig||await runtimeConfig(workspace);
  const queues=new Map(),sockets=new Set(),presence=new Map(),limits=new Map();
  let closing=false,polling=false;
  const native=async(method,params={})=>{const r=await workerRpc(config,method,params);if(!r.ok)fail(r.error.code,r.error.message,r.error.details);return r.result;};
  const room=id=>{const r=db.prepare('SELECT * FROM rooms WHERE id=?').get(id);if(!r)fail('NOT_FOUND','Shared project not found.');return r;};
  const auth=token=>{if(!token)fail('AUTH_REQUIRED','Sign in to collaborate.');const row=db.prepare('SELECT u.id,u.email,u.name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=? AND s.expires_at>?').get(digest(token),Date.now());if(!row)fail('AUTH_EXPIRED','Session expired. Sign in again.');return row;};
  const member=(user,id,edit=false)=>{const m=db.prepare('SELECT role FROM members WHERE room_id=? AND user_id=?').get(id,user.id);if(!m)fail('FORBIDDEN','You are not a project member.');if(edit&&m.role==='viewer')fail('READ_ONLY','Viewer access does not permit design edits or analysis jobs.');return m.role;};
  const session=user=>{const token=crypto.randomBytes(32).toString('base64url');db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token),user.id,Date.now()+7*86400000);return {token,user:{id:user.id,email:user.email,name:user.name}};};
  function broadcast(id,event){for(const s of sockets){if(s.roomId!==id||s.readyState!==1)continue;try{auth(s.token);member(s.user,id);s.send(JSON.stringify(event));}catch{s.close(1008,'Access expired');}}}
  const presenceList=id=>[...(presence.get(id)?.values()||[])].filter(p=>p.updated_at>Date.now()-45000).map(({user_id,...p})=>({...p,userId:user_id}));
  async function projectAuthorized(id,projectId){
    const r=room(id);if(r.project_id===projectId)return true;
    for(const entry of db.prepare("SELECT result FROM commands WHERE room_id=? AND method='experiment.create' AND status='completed'").all(id)){
      const ref=JSON.parse(entry.result);const experiment=await native('experiment.status',{experiment_id:ref.id});
      if(experiment.project_id===r.project_id&&experiment.trials.some(t=>(t.candidate_project_id||t.project_id)===projectId))return true;
    }
    for(const entry of db.prepare("SELECT result FROM commands WHERE room_id=? AND method='pvt.create' AND status='completed'").all(id)){
      const ref=JSON.parse(entry.result);const study=await native('pvt.status',{study_id:ref.id,project_id:r.project_id});
      if(study.project_id===r.project_id&&study.points.some(point=>point.project_id===projectId))return true;
    }
    return false;
  }
  async function snapshot(id,{notify=true}={}){
    const r=room(id);
    const [project,scene]=await Promise.all([native('project.snapshot',{project_id:r.project_id}),native('view.get_scene',{project_id:r.project_id})]);
    const value={project,scene};const encoded=JSON.stringify(value);
    if(encoded!==r.snapshot){const seq=r.sequence+1;db.prepare('UPDATE rooms SET name=?,revision=?,sequence=?,snapshot=?,updated_at=? WHERE id=?').run(project.name,project.revision,seq,encoded,Date.now(),id);if(notify)broadcast(id,{type:'snapshot',room_id:id,revision:project.revision,sequence:seq});}
    return value;
  }
  async function serial(id,operation){const previous=queues.get(id)||Promise.resolve();const next=previous.catch(()=>{}).then(operation);queues.set(id,next);try{return await next;}finally{if(queues.get(id)===next)queues.delete(id);}}
  async function createRoom(user,{name='공유 설계',example='inverter',bundle_base64}={}){
    const project=bundle_base64?await native('project.import_bundle',{bundle_base64,mode:'new'}):await native('project.create',{name,example});
    const id=uuid();db.prepare('INSERT INTO rooms(id,name,owner_id,project_id,revision,snapshot,updated_at) VALUES(?,?,?,?,?,?,?)').run(id,project.name,user.id,project.id,project.revision,'{}',Date.now());
    db.prepare('INSERT INTO members VALUES(?,?,?)').run(id,user.id,'owner');await snapshot(id,{notify:false});
    return {room:{id,name:project.name,role:'owner',revision:project.revision,sequence:room(id).sequence},project};
  }
  async function nativeCall(user,params){
    const id=params.room_id;const method=params.method;const p={...(params.params||{})};
    const role=member(user,id,mutations.has(method));const r=room(id);
    if(method==='pdk.validate' && Object.keys(p).some(key=>!['profile_id','project_id'].includes(key)))fail('REMOTE_PDK','Shared clients validate installed profile IDs. PDK installation is performed by the server operator.');
    if(method==='backend.validate' && Object.keys(p).some(key=>!['profile_id','project_id'].includes(key)))fail('REMOTE_BACKEND','Shared clients validate installed backend IDs. Native recipes and connections are configured by the server operator.');
    if(method==='project.import_bundle'&&p.mode!=='replace')fail('BUNDLE_MODE','Shared edits can replace only the authorized project; new projects use cloud.create.');
    if(['layout.import','project.import_bundle'].includes(method)&&p.path)fail('REMOTE_PATH','Upload a project bundle or layout file; server filesystem paths are not accepted.');
    if(method==='layout.import'){
      if(typeof p.file_base64!=='string'||!['gds','oas'].includes(p.format))fail('REMOTE_UPLOAD','Upload GDSII or OASIS bytes for remote import.');
      const bytes=Buffer.from(p.file_base64,'base64');if(!bytes.length||bytes.length>16*1024*1024||bytes.toString('base64')!==p.file_base64)fail('FILE_TOO_LARGE','Use a valid GDS/OAS file up to 16 MiB.');
      const metadata=p.sidecar_base64?Buffer.from(p.sidecar_base64,'base64'):null;if(metadata&&metadata.length>2*1024*1024)fail('FILE_TOO_LARGE','Sidecar limit is 2 MiB.');
      const uploads=path.join(workspace,'.runtime/eda/uploads',id);await fs.mkdir(uploads,{recursive:true});
      const basename=`${digest(bytes)}-${metadata?digest(metadata).slice(0,16):'plain'}.${p.format}`;const target=path.join(uploads,basename);
      if((await fs.readdir(uploads)).length>=64)fail('UPLOAD_QUOTA','Room upload quota reached; export and review existing files before adding more.');
      try{await fs.writeFile(target,bytes,{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}
      if(metadata)try{await fs.writeFile(`${target}.mos.json`,metadata,{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}
      p.path=`/workspace/.runtime/eda/uploads/${id}/${basename}`;delete p.file_base64;delete p.sidecar_base64;delete p.format;
    }
    if(!METHODS.has(method)||!readonly.has(method)&&!mutations.has(method))fail('UNSUPPORTED_METHOD','Method is not available through a shared project.');
    if(p.project_id&&p.project_id!==r.project_id)fail('WRONG_PROJECT','Command does not belong to this shared project.');
    if(method.startsWith('database.'))p.access_project_id=r.project_id;
    if(['compat.inspect','design.catalog'].includes(method))delete p.project_id;else p.project_id=r.project_id;
    if(method.startsWith('experiment.')&&!['experiment.create','experiment.list'].includes(method)){const experiment=await native('experiment.status',{experiment_id:p.experiment_id});if(experiment.project_id!==r.project_id)fail('FORBIDDEN','Experiment belongs to another project.');}
    if(method.startsWith('pvt.')&&!['pvt.create','pvt.sources','pvt.list'].includes(method)){const study=await native('pvt.status',{study_id:p.study_id,project_id:r.project_id});if(study.project_id!==r.project_id)fail('FORBIDDEN','PVT study belongs to another project.');}
    if(method.startsWith('job.')||['backend.read_artifact','backend.import_layout'].includes(method)){const run=await native('job.status',{run_id:p.run_id});if(!await projectAuthorized(id,run.project_id))fail('FORBIDDEN','Run belongs to another project.');}
    if(readonly.has(method)){if(method==='project.open'||method==='project.snapshot')return (await snapshot(id,{notify:false})).project;if(method==='view.get_scene')return p.bounds||p.max_shapes?native(method,p):(await snapshot(id,{notify:false})).scene;return native(method,p);}
    const commandId=params.command_id;if(typeof commandId!=='string'||commandId.length<8||commandId.length>200)fail('COMMAND_ID','A unique command id is required.');
    const key=`${id}:${commandId}`,payloadHash=digest(JSON.stringify({method,params:p,base_revision:params.base_revision}));
    return serial(id,async()=>{
      member(user,id,true);const previous=db.prepare('SELECT * FROM commands WHERE id=?').get(key);
      if(previous){if(previous.user_id!==user.id||previous.hash!==payloadHash)fail('IDEMPOTENCY_CONFLICT','Command id was reused for a different operation.');if(previous.status==='completed')return JSON.parse(previous.result);if(previous.status==='uncertain'){const receipt=await native('project.command_receipt',{project_id:r.project_id,command_id:key});if(receipt){db.prepare("UPDATE commands SET status='completed',result=?,revision=?,error=NULL WHERE id=?").run(JSON.stringify(receipt.result),receipt.revision,key);await snapshot(id);return receipt.result;}}if(previous.error){const e=JSON.parse(previous.error);fail(e.code,e.message,e.details);}fail('COMMAND_PENDING','This command is already processing.');}
      const current=(await native('project.snapshot',{project_id:r.project_id})).revision;
      const base=params.base_revision;if(!Number.isSafeInteger(base)||base<1||base>current)fail('REVISION_CONFLICT','Refresh the shared project before editing.',{current_revision:current});
      if(['analysis.configure','analysis.run','analysis.verify','backend.configure','backend.run','backend.import_layout','compat.import','compat.import_results','database.import','pvt.create','pvt.start','design.route_apply'].includes(method)&&p.expected_revision!==undefined&&p.expected_revision!==base)fail('EDIT_CONFLICT','The analysis form was based on an older project revision. Refresh and inspect the current setup.',{current_revision:current,form_revision:p.expected_revision,base_revision:base});
      const scope=scopes(method,p);
      if(method==='layout.apply_command'||method==='schematic.apply_command')if(['undo','redo'].includes(p.command?.type)){
        const latest=db.prepare("SELECT user_id,revision FROM commands WHERE room_id=? AND status='completed' AND method IN ('layout.apply_command','schematic.apply_command','layout.generate_pcell','layout.import','project.import_bundle','compat.import','database.import','design.route_apply') ORDER BY revision DESC,created_at DESC LIMIT 1").get(id);
        if(latest?.revision===current&&latest.user_id!==user.id)fail('COLLABORATIVE_UNDO','The latest shared edit belongs to another collaborator. Use an explicit reverse edit after reviewing the design.');
      }
      if(current>base){const tracked=new Set(db.prepare("SELECT revision FROM commands WHERE room_id=? AND status='completed' AND method IN ('layout.apply_command','schematic.apply_command','layout.generate_pcell','layout.import','project.import_bundle','project.rename','view.set_display','analysis.configure','backend.configure','backend.import_layout','compat.import','database.import','design.route_apply') AND revision>?").all(id,base).map(c=>c.revision));for(let revision=base+1;revision<=current;revision++)if(!tracked.has(revision))fail('EDIT_CONFLICT','The native design changed outside this collaboration history. Refresh and inspect the authoritative revision.',{current_revision:current});}
      for(const recent of db.prepare("SELECT scopes,user_id,revision FROM commands WHERE room_id=? AND status='completed' AND revision>?").all(id,base)){
        if(overlap(scope,JSON.parse(recent.scopes)))fail('EDIT_CONFLICT','Another collaborator changed the same design element. Review the current design before reapplying.',{current_revision:current,scope});
      }
      if(current!==base&&scope.includes('*'))fail('EDIT_CONFLICT','This operation affects the whole project. Refresh before applying.',{current_revision:current});
      db.prepare('INSERT INTO commands(id,room_id,user_id,method,hash,base_revision,scopes,params,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(key,id,user.id,method,payloadHash,base,JSON.stringify(scope),JSON.stringify(p),'processing',Date.now());
      try{
        p.expected_revision=current;p.command_id=key;db.prepare('UPDATE commands SET params=? WHERE id=?').run(JSON.stringify(p),key);
        const result=await native(method,p);
        const committedRevision=result.project?.revision??result.revision;const revision=Number.isSafeInteger(committedRevision)&&!result.execution_status?committedRevision:current;
        db.prepare("UPDATE commands SET status='completed',result=?,revision=? WHERE id=?").run(JSON.stringify(result),revision,key);
        await snapshot(id);return result;
      }catch(e){const uncertain=!e.code||e.code==='WORKER_UNAVAILABLE';const error={code:uncertain?'UNCERTAIN_COMMIT':e.code,message:uncertain?'The native worker response was interrupted. Inspect or retry the same command id to reconcile its receipt.':e.message,details:e.details};db.prepare("UPDATE commands SET status=?,error=? WHERE id=?").run(uncertain?'uncertain':'failed',JSON.stringify(error),key);broadcast(id,{type:'command_error',command_id:commandId,error});fail(error.code,error.message,error.details);}
    });
  }
  async function dispatch(method,p,token,{ip='local'}={}){
    if(method==='cloud.info')return {name:'레지스터',protocol:1,mode:publicUrl&&!['127.0.0.1','localhost'].includes(new URL(publicUrl).hostname)?'self-hosted':'local',capabilities:{auth:true,rooms:true,invites:true,presence:true,remoteRuns:true},publicUrl:publicUrl||`http://127.0.0.1:${port}`};
    if(['cloud.auth.signUp','cloud.auth.signIn'].includes(method)){
      const bucket=limits.get(ip)||{start:Date.now(),count:0};if(Date.now()-bucket.start>60000){bucket.start=Date.now();bucket.count=0;}bucket.count++;limits.set(ip,bucket);if(bucket.count>20)fail('RATE_LIMIT','Too many sign-in requests. Try again later.');
      const email=String(p.email||'').trim().toLowerCase(),password=String(p.password||'');
      if(email.length>254||!/^\S+@\S+\.\S+$/.test(email)||password.length>1024)fail('AUTH_INPUT','Enter a valid email and password.');
      if(method==='cloud.auth.signUp'){
        if(password.length<12)fail('PASSWORD_WEAK','Use a password of at least 12 characters.');
        if(db.prepare('SELECT id FROM users WHERE email=?').get(email))fail('ACCOUNT_EXISTS','An account already exists.');
        const salt=crypto.randomBytes(16).toString('hex');const hash=Buffer.from(await scrypt(password,salt,64)).toString('hex');
        const user={id:uuid(),email,name:String(p.name||email.split('@')[0]).trim().slice(0,80)};
        db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(user.id,email,user.name,salt,hash,Date.now());return session(user);
      }
      const user=db.prepare('SELECT * FROM users WHERE email=?').get(email);
      const found=Buffer.from(await scrypt(password,user?.salt||'missing-account-salt',64));
      if(!user||!crypto.timingSafeEqual(found,Buffer.from(user.password_hash,'hex')))fail('INVALID_CREDENTIALS','Email or password is incorrect.');return session(user);
    }
    const user=auth(token);
    if(method==='cloud.auth.status')return {user};
    if(method==='cloud.auth.signOut'){db.prepare('DELETE FROM sessions WHERE hash=?').run(digest(token));for(const s of sockets)if(s.token===token)s.close(1008,'Signed out');return {ok:true};}
    if(method==='cloud.projects')return db.prepare('SELECT r.id,r.name,r.revision,r.sequence,r.updated_at,m.role FROM rooms r JOIN members m ON m.room_id=r.id WHERE m.user_id=? ORDER BY r.updated_at DESC').all(user.id);
    if(method==='cloud.create')return createRoom(user,p);
    if(method==='cloud.open'){const role=member(user,p.id);const value=await snapshot(p.id,{notify:false});const r=room(p.id);return {room:{id:r.id,name:r.name,role,revision:r.revision,sequence:r.sequence},...value,presence:presenceList(p.id)};}
    if(method==='cloud.native')return nativeCall(user,p);
    if(method==='cloud.promoteCandidate'){
      member(user,p.room_id,true);const r=room(p.room_id);const experiment=await native('experiment.status',{experiment_id:p.experiment_id});
      if(experiment.project_id!==r.project_id||!experiment.trials.some(t=>(t.candidate_project_id||t.project_id)===p.project_id))fail('FORBIDDEN','Candidate does not belong to this shared experiment.');
      const bundle=await native('project.export_bundle',{project_id:p.project_id,inline:true});return createRoom(user,{bundle_base64:bundle.bundle_base64});
    }
    if(method==='cloud.members'){member(user,p.room_id);return db.prepare('SELECT u.id AS user_id,u.name,m.role FROM members m JOIN users u ON u.id=m.user_id WHERE m.room_id=?').all(p.room_id);}
    if(method==='cloud.setRole'){
      if(member(user,p.room_id)!=='owner')fail('FORBIDDEN','Only the owner can manage members.');if(room(p.room_id).owner_id===p.user_id)fail('OWNER_ROLE','Owner role cannot be changed.');
      if(p.role==='removed')db.prepare('DELETE FROM members WHERE room_id=? AND user_id=?').run(p.room_id,p.user_id);else if(['editor','viewer'].includes(p.role))db.prepare('UPDATE members SET role=? WHERE room_id=? AND user_id=?').run(p.role,p.room_id,p.user_id);else fail('ROLE','Unsupported role.');
      for(const s of sockets)if(s.roomId===p.room_id&&s.user?.id===p.user_id)s.close(1008,'Membership changed');broadcast(p.room_id,{type:'members'});return {ok:true};
    }
    if(method==='cloud.invite'){
      if(member(user,p.room_id)!=='owner')fail('FORBIDDEN','Only the owner can create invitations.');if(!['editor','viewer'].includes(p.role))fail('ROLE','Unsupported invitation role.');
      const hours=Number(p.expires_hours||24);if(hours<.1||hours>168)fail('EXPIRY','Invite expiry must be between 0.1 and 168 hours.');
      const invite=crypto.randomBytes(24).toString('base64url'),expires_at=Date.now()+hours*3600000;db.prepare('INSERT INTO invites(hash,room_id,role,expires_at) VALUES(?,?,?,?)').run(digest(invite),p.room_id,p.role,expires_at);return {token:invite,url:`${publicUrl||`http://127.0.0.1:${port}`}?invite=${encodeURIComponent(invite)}`,expires_at};
    }
    if(method==='cloud.join'){
      const invite=db.prepare('SELECT * FROM invites WHERE hash=?').get(digest(String(p.token||'')));if(!invite||invite.expires_at<Date.now()||invite.uses>=invite.max_uses)fail('INVITE_INVALID','Invitation is expired or unavailable.');
      if(!db.prepare('SELECT role FROM members WHERE room_id=? AND user_id=?').get(invite.room_id,user.id)){db.prepare('INSERT INTO members VALUES(?,?,?)').run(invite.room_id,user.id,invite.role);db.prepare('UPDATE invites SET uses=uses+1 WHERE hash=?').run(invite.hash);}
      broadcast(invite.room_id,{type:'members'});return dispatch('cloud.open',{id:invite.room_id},token);
    }
    fail('UNSUPPORTED_METHOD','Unsupported collaboration method.');
  }
  const send=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));};
  const server=http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,'http://localhost');
      if(req.method==='GET'&&url.pathname==='/health')return send(res,200,{service:'register-cloud',protocol:1});
      const origin=req.headers.origin;const allowed=!origin||origin==='null'||/^http:\/\/(?:127\.0\.0\.1|localhost):(5173|18766)$/.test(origin)||allowOrigins.includes(origin)||publicUrl&&origin===new URL(publicUrl).origin;
      if(!allowed)return send(res,403,{ok:false,error:{code:'ORIGIN',message:'Origin is not permitted.'}});
      if(origin){res.setHeader('access-control-allow-origin',origin);res.setHeader('vary','Origin');res.setHeader('access-control-allow-headers','Authorization,Content-Type');res.setHeader('access-control-allow-methods','POST,GET,OPTIONS');}
      if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
      const token=req.headers.authorization?.replace(/^Bearer /,'');
      if(url.pathname==='/export'&&req.method==='GET'){
        const user=auth(token),r=room(url.searchParams.get('room_id'));member(user,r.id);
        const format=url.searchParams.get('format');if(!['gds','oas','bundle'].includes(format))fail('FORMAT','Export GDSII, OASIS or Register bundle.');
        const result=await native(format==='bundle'?'project.export_bundle':'layout.export',{project_id:r.project_id,...(format==='bundle'?{}:{format})});
        const artifact=await fs.realpath(result.path.replace(/^\/workspace(?=\/)/,workspace));const projectFolder=await fs.realpath(path.join(workspace,'.runtime/eda/projects',r.project_id));
        const relative=path.relative(projectFolder,artifact);if(relative.startsWith('..')||path.isAbsolute(relative))fail('FORBIDDEN','Export outside project.');
        const bytes=await fs.readFile(artifact);res.writeHead(200,{'content-type':'application/octet-stream','content-disposition':`attachment; filename="${path.basename(artifact).replace(/[^A-Za-z0-9._-]/g,'_')}"`,'cache-control':'no-store'});return res.end(bytes);
      }
      if(url.pathname==='/artifact'&&req.method==='GET'){
        const user=auth(token),r=room(url.searchParams.get('room_id'));member(user,r.id);
        const run=await native('job.status',{run_id:url.searchParams.get('run_id')});if(!await projectAuthorized(r.id,run.project_id))fail('FORBIDDEN','Artifact belongs to another project.');
        const key=url.searchParams.get('key'),source=run.artifacts?.[key];if(!source)fail('NOT_FOUND','Artifact unavailable.');
        const artifact=await fs.realpath(source.replace(/^\/workspace(?=\/)/,workspace));const rel=path.relative(await fs.realpath(workspace),artifact);if(rel.startsWith('..')||path.isAbsolute(rel))fail('FORBIDDEN','Artifact outside workspace.');
        const bytes=await fs.readFile(artifact);res.writeHead(200,{'content-type':'application/octet-stream','content-disposition':`attachment; filename="${path.basename(artifact).replace(/[^A-Za-z0-9._-]/g,'_')}"`,'cache-control':'no-store'});return res.end(bytes);
      }
      if(url.pathname==='/rpc'&&req.method==='POST'){
        if(!req.headers['content-type']?.startsWith('application/json'))fail('CONTENT_TYPE','Use application/json.');let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>48*1024*1024)fail('BODY_TOO_LARGE','Request exceeds 48 MiB.');}
        const {method,params={}}=JSON.parse(body);const result=await dispatch(method,params,token,{ip:req.socket.remoteAddress});return send(res,200,{ok:true,result});
      }
      // The same hub can serve the compiled web client on a cloud host.
      if(req.method==='GET'){
        const dist=frontendRoot;let relative=decodeURIComponent(url.pathname).replace(/^\//,'')||'index.html';if(relative.includes('..')||relative.includes('\\'))fail('NOT_FOUND','File unavailable.');
        let target=path.join(dist,relative);try{await fs.access(target);}catch{target=path.join(dist,'index.html');}
        const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};
        const content=await fs.readFile(target);res.writeHead(200,{'content-type':types[path.extname(target)]||'application/octet-stream','content-security-policy':"default-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:* http://localhost:* ws://localhost:* https: wss:; frame-ancestors 'none'",'x-content-type-options':'nosniff'});return res.end(content);
      }
      send(res,404,{ok:false,error:{code:'NOT_FOUND',message:'Not found.'}});
    }catch(e){send(res,e.code==='AUTH_REQUIRED'||e.code==='AUTH_EXPIRED'?401:e.code==='FORBIDDEN'||e.code==='READ_ONLY'?403:400,{ok:false,error:{code:e.code||'REQUEST_FAILED',message:e.message,details:e.details}});}
  });
  const wss=new WebSocketServer({server,path:'/events',maxPayload:16384});
  wss.on('connection',(s,req)=>{
    const origin=req.headers.origin;if(origin&&origin!=='null'&&!/^http:\/\/(?:127\.0\.0\.1|localhost):(5173|18766)$/.test(origin)&&!allowOrigins.includes(origin)&&!(publicUrl&&origin===new URL(publicUrl).origin)){s.close(1008,'Origin is not permitted');return;}
    sockets.add(s);const authenticateTimer=setTimeout(()=>{if(!s.user)s.close(1008,'Authentication required');},5000);
    s.on('message',raw=>{try{
      const m=JSON.parse(raw.toString());
      if(m.type==='subscribe'){s.user=auth(m.token);member(s.user,m.room_id);s.token=m.token;s.roomId=m.room_id;clearTimeout(authenticateTimer);s.peerId=String(m.peer_id||uuid()).slice(0,80);s.send(JSON.stringify({type:'ready',role:member(s.user,s.roomId),room_id:s.roomId,revision:room(s.roomId).revision,sequence:room(s.roomId).sequence,presence:presenceList(s.roomId)}));return;}
      auth(s.token);member(s.user,s.roomId);
      if(m.type==='presence'){
        const now=Date.now();if(now-(s.lastPresence||0)<40)return;s.lastPresence=now;
        const cursor=m.cursor;if(cursor&&(!/^-?\d{1,20}$/.test(cursor.x)||!/^-?\d{1,20}$/.test(cursor.y)))fail('COORDINATE','Cursor must use decimal DBU strings.');
        const entry={peerId:s.peerId,user_id:s.user.id,name:s.user.name,color:`#${digest(s.user.id).slice(0,6)}`,selection:typeof m.selection==='string'?m.selection.slice(0,200):null,cursor:cursor?{x:cursor.x,y:cursor.y,layer_id:String(cursor.layer_id||'').slice(0,100)}:null,updated_at:now};
        if(!presence.has(s.roomId))presence.set(s.roomId,new Map());presence.get(s.roomId).set(s.peerId,entry);broadcast(s.roomId,{type:'presence',presence:presenceList(s.roomId)});
      }
    }catch(e){s.send(JSON.stringify({type:'error',error:{code:e.code||'EVENT',message:e.message}}));}});
    s.on('close',()=>{clearTimeout(authenticateTimer);sockets.delete(s);if(s.roomId){presence.get(s.roomId)?.delete(s.peerId);broadcast(s.roomId,{type:'presence',presence:presenceList(s.roomId)});}});
  });
  const timer=setInterval(async()=>{if(polling||closing)return;polling=true;try{for(const id of new Set([...sockets].map(s=>s.roomId).filter(Boolean)))await serial(id,()=>snapshot(id));}catch(e){for(const s of sockets)if(s.readyState===1)s.send(JSON.stringify({type:'worker_error',error:{code:e.code||'WORKER_UNAVAILABLE',message:e.message}}));}finally{polling=false;}},1500);timer.unref();
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
  return {server,db,port:server.address().port,dispatch,async close(){closing=true;clearInterval(timer);for(const s of sockets)s.close();await new Promise(r=>wss.close(r));await new Promise(r=>server.close(r));db.close();}};
}
