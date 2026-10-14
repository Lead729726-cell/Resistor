import {mkdir,readFile,writeFile,rename,unlink,lstat} from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {RELEASES_URL,REPOSITORY,selectRelease,platformKey,validateAsset} from './update-feed.mjs';
const networkFailure=e=>e instanceof TypeError||['TimeoutError','AbortError'].includes(e.name)||/ERR_(INTERNET_DISCONNECTED|NETWORK_CHANGED|NAME_NOT_RESOLVED|CONNECTION|TIMED_OUT)|ENOTFOUND|ECONNRESET|EAI_AGAIN/.test(e.message);
export async function hashFile(file){const h=createHash('sha256');for await(const b of createReadStream(file))h.update(b);return h.digest('hex');}
export async function verifiedFile(file,asset){try{const s=await lstat(file);return s.isFile()&&!s.isSymbolicLink()&&s.size===asset.bytes&&(await hashFile(file))===asset.sha256;}catch{return false;}}
async function safeFolder(folder){await mkdir(folder,{recursive:true});if((await lstat(folder)).isSymbolicLink())throw Error('업데이트 저장 폴더가 심볼릭 링크입니다.');}
async function publicFetch(url,{fetchImpl,signal}){
  for(let i=0;i<6;i++){
    const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||!(u.hostname==='release-assets.githubusercontent.com'||(u.hostname==='github.com'&&u.pathname.startsWith('/'+REPOSITORY+'/releases/download/'))))throw Error('업데이트 다운로드가 허용되지 않은 주소로 이동했습니다.');
    const r=await fetchImpl(url,{redirect:'manual',signal,headers:{'User-Agent':'Resistor-Updater'}});
    if([301,302,303,307,308].includes(r.status)){const next=r.headers.get('location');await r.body?.cancel();if(!next)throw Error('업데이트 다운로드 주소가 없습니다.');url=new URL(next,url).href;continue;}return r;
  }
  throw Error('업데이트 다운로드 주소가 너무 많이 이동했습니다.');
}
export class DesktopUpdater{
  constructor({version,edition='indust',platform=process.platform,arch=process.arch,userData,fetchImpl=fetch,packaged=true,install,clock=Date.now}){
    if(!['edu','indust'].includes(edition))throw Error('Unknown product edition');this.edition=edition;
    this.platform=platformKey(platform,arch);this.fetchImpl=fetchImpl;this.folder=path.join(userData,'updates');this.install=install;this.clock=clock;this.packaged=packaged;this.active=null;this.abort=null;this.file=null;this.lastAuto=0;
    this.state={status:this.platform?'idle':'unsupported',currentVersion:version,platform:this.platform,settings:{automatic:true,channel:'preview'},update:null,downloadedBytes:0,totalBytes:0,message:'',checkedAt:null,packaged,receipt:null};
  }
  status(){return structuredClone(this.state);}
  async initialize(){
    await safeFolder(this.folder);
    try{const p=JSON.parse(await readFile(path.join(this.folder,'preferences.json'),'utf8'));if(typeof p.automatic==='boolean'&&['preview','stable'].includes(p.channel))this.state.settings=p;}catch{}
    try{const r=JSON.parse(await readFile(path.join(this.folder,'receipt.json'),'utf8'));if(['installed','failed'].includes(r.status))this.state.receipt={...r,versionVerified:r.status==='installed'&&r.version===this.state.currentVersion};}catch{}
    return this.status();
  }
  async preferences(p){
    if(this.active)throw Error('업데이트 작업이 끝난 뒤 설정을 변경하세요.');
    if(Object.keys(p).some(k=>!['automatic','channel'].includes(k))||typeof p.automatic!=='boolean'||!['stable','preview'].includes(p.channel))throw Error('업데이트 설정이 잘못되었습니다.');
    const temporary=path.join(this.folder,'preferences-'+randomUUID()+'.json');await writeFile(temporary,JSON.stringify(p),{flag:'wx',mode:0o600});await rename(temporary,path.join(this.folder,'preferences.json'));
    this.state.settings={automatic:p.automatic,channel:p.channel};this.state.update=null;this.file=null;this.state.status='idle';return this.status();
  }
  async check({automatic=false}={}){
    if(this.edition==='edu'){this.state.status='unsupported';this.state.update=null;this.file=null;this.state.message='Resistor Edu 전용 설치 파일·업데이트는 아직 공개되지 않았습니다. Indust 설치 파일로 교육용 앱을 교체하지 않습니다.';return this.status();}
    if(!this.platform)return this.status();if(this.active)return this.status();
    if(automatic&&(!this.state.settings.automatic||this.clock()-this.lastAuto<15*60*1000))return this.status();
    this.lastAuto=this.clock();this.state.status='checking';this.state.message='';this.state.update=null;this.file=null;
    this.active=(async()=>{
      try{
        const r=await this.fetchImpl(RELEASES_URL,{signal:AbortSignal.timeout(20000),headers:{Accept:'application/vnd.github+json','User-Agent':'Resistor-Updater'}});
        if(!r.ok)throw Error(r.status===403||r.status===429?'GitHub 확인 요청 한도에 도달했습니다. 잠시 뒤 다시 확인하세요.':'버전 확인 서버가 응답하지 않습니다.');
        const body=await r.text();if(body.length>2*1024*1024)throw Error('업데이트 정보가 너무 큽니다.');
        this.state.update=selectRelease(JSON.parse(body),{currentVersion:this.state.currentVersion,platform:this.platform,channel:this.state.settings.channel});
        this.state.checkedAt=new Date(this.clock()).toISOString();this.state.status=this.state.update?'available':'current';
        if(this.state.update){const candidate=path.join(this.folder,this.state.update.asset.name);if(await verifiedFile(candidate,this.state.update.asset)){this.file=candidate;this.state.status='ready';}}
      }catch(e){this.state.status=networkFailure(e)?'offline':'error';this.state.message=networkFailure(e)?'인터넷·서버 연결을 확인한 뒤 다시 시도하세요.':e.message;}
      return this.status();
    })();try{return await this.active;}finally{this.active=null;}
  }
  async download(){
    if(this.edition==='edu')throw Error('Edu 전용 업데이트 파일이 필요합니다.');
    if(this.active)return this.status();if(!this.state.update||!['available','error','offline','ready'].includes(this.state.status))throw Error('새 버전을 먼저 확인하세요.');
    const {asset,tag}=this.state.update;validateAsset({name:asset.name,browser_download_url:asset.url.replace(/\?download=1$/,''),size:asset.bytes,digest:'sha256:'+asset.sha256},tag,this.platform);
    this.abort=new AbortController();const signal=AbortSignal.any([this.abort.signal,AbortSignal.timeout(15*60*1000)]);
    this.state.status='downloading';this.state.downloadedBytes=0;this.state.totalBytes=asset.bytes;this.state.message='';this.file=null;
    const destination=path.join(this.folder,asset.name),partial=path.join(this.folder,asset.name+'.'+randomUUID()+'.partial');
    this.active=(async()=>{
      try{
        if(await verifiedFile(destination,asset)){this.file=destination;this.state.status='ready';return this.status();}
        const r=await publicFetch(asset.url,{fetchImpl:this.fetchImpl,signal});if(r.status!==200||!r.body)throw Error('업데이트 파일을 받을 수 없습니다.');
        if(r.headers.get('content-length')&&Number(r.headers.get('content-length'))!==asset.bytes)throw Error('다운로드 파일 크기가 릴리스와 다릅니다.');
        const hash=createHash('sha256');let count=0;const monitor=new Transform({transform:(b,_enc,cb)=>{count+=b.length;if(count>asset.bytes)return cb(Error('업데이트 파일 크기 초과'));hash.update(b);this.state.downloadedBytes=count;cb(null,b);}});
        await pipeline(Readable.fromWeb(r.body),monitor,createWriteStream(partial,{flags:'wx',mode:0o600}),{signal});
        if(count!==asset.bytes||hash.digest('hex')!==asset.sha256)throw Error('SHA-256 또는 파일 크기가 다릅니다. 설치하지 않았습니다.');
        // Replace only this exact cached asset; never a design file or arbitrary path.
        try{const old=await lstat(destination);if(!old.isFile()||old.isSymbolicLink())throw Error('업데이트 캐시 경로가 안전하지 않습니다.');await unlink(destination);}catch(e){if(e.code!=='ENOENT')throw e;}
        await rename(partial,destination);this.file=destination;this.state.status='ready';
      }catch(e){await unlink(partial).catch(()=>{});this.state.status=this.abort.signal.aborted?'available':networkFailure(e)?'offline':'error';this.state.message=this.abort.signal.aborted?'다운로드를 취소했습니다.':networkFailure(e)?'인터넷 연결이 끊겼거나 응답 시간이 초과되었습니다. 다시 다운로드하세요.':e.message;}
      return this.status();
    })();try{return await this.active;}finally{this.active=null;this.abort=null;}
  }
  cancel(){this.abort?.abort();return this.status();}
  async apply(){
    if(this.edition==='edu')throw Error('Edu를 Indust 설치 파일로 교체할 수 없습니다.');
    if(this.active||this.state.status!=='ready'||!this.file||!this.state.update)throw Error('검증된 다운로드가 준비되어야 합니다.');
    if(!this.packaged)throw Error('소스 실행 환경에서는 설치 앱을 교체하지 않습니다. 다운로드 사이트에서 설치하세요.');
    this.active=(async()=>{try{
      if(!await verifiedFile(this.file,this.state.update.asset))throw Error('다운로드 이후 파일이 변경되었습니다. 다시 다운로드하세요.');
      this.state.status='installing';const started=await this.install({file:this.file,update:structuredClone(this.state.update),folder:this.folder});
      if(started===false)this.state.status='ready';return this.status();
    }catch(e){this.state.status='error';this.state.message=e.message;return this.status();}})();try{return await this.active;}finally{this.active=null;}
  }
  async rpc(method,params={}){
    if(!params||Array.isArray(params)||typeof params!=='object')throw Error('잘못된 업데이트 요청입니다.');
    if(method==='desktop.update.preferences')return this.preferences(params);
    if(Object.keys(params).length)throw Error('업데이트 요청은 경로·주소·명령을 받지 않습니다.');
    if(method==='desktop.update.status')return this.status();if(method==='desktop.update.check')return this.check();
    if(method==='desktop.update.online'){void this.check({automatic:true});return this.status();}
    // Downloads/installations run in the main process; callers poll status without blocking.
    if(method==='desktop.update.download'){void this.download().catch(e=>{this.state.status='error';this.state.message=e.message;});return this.status();}
    if(method==='desktop.update.cancel')return this.cancel();
    if(method==='desktop.update.install'){void this.apply().catch(e=>{this.state.status='error';this.state.message=e.message;});return this.status();}
    throw Error('지원하지 않는 업데이트 요청입니다.');
  }
}
