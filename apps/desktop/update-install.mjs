import {cp,mkdir,readFile,writeFile,lstat,realpath,rename,unlink,open} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {verifiedFile} from './updates.mjs';
import {versionParts} from './update-feed.mjs';
export const run=(exe,args,options={})=>new Promise((resolve,reject)=>{
  const child=spawn(exe,args,{windowsHide:true,stdio:'pipe',...options});let output='';
  child.stdout?.on('data',b=>{output+=b;if(output.length>4*1024*1024){child.kill();reject(Error('설치 파일 목록이 너무 큽니다.'));}});child.stderr?.on('data',()=>{});
  const timer=setTimeout(()=>{child.kill();reject(Error('업데이트 설치 시간이 초과되었습니다.'));},120000);
  child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('exit',code=>{clearTimeout(timer);code===0?resolve(output):reject(Error(`업데이트 설치 단계 실패 (${path.basename(exe)} / ${code})`));});
});
export function assertInside(root,target){const relative=path.relative(path.resolve(root),path.resolve(target));if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('설치 경로가 허용 범위를 벗어났습니다.');}
export function safeArchiveEntries(list,prefix,{mac=false}={}){
  const extras=new Set(['Mac 설치 안내.txt','Open Viewer.command','Install Resistor.command','Diagnose Resistor.command','BUNDLE-SYMLINKS.tsv','BUNDLE-SHA256SUMS.txt']);
  for(const entry of list.split('\n').filter(Boolean)){
    if(entry.includes('\\')||entry.startsWith('/')||entry.split('/').some(s=>s==='..'||s==='.')||entry.includes('\0')||!(entry===prefix||entry.startsWith(prefix+'/')||(mac&&extras.has(entry))))throw Error('업데이트 압축 파일에 허용되지 않은 경로가 있습니다.');
  }
  if(!list.split('\n').some(e=>e.startsWith(prefix+'/')))throw Error('업데이트 앱이 압축 파일에 없습니다.');
}
export async function zipEntryNames(file){
  // Read Unicode names from the ZIP directory, not locale-dependent unzip output.
  const handle=await open(file,'r');try{
    const size=(await handle.stat()).size,tailSize=Math.min(size,65557),tail=Buffer.alloc(tailSize);await handle.read(tail,0,tailSize,size-tailSize);
    let e=-1;for(let i=tailSize-22;i>=0;i--)if(tail.readUInt32LE(i)===0x06054b50&&i+22+tail.readUInt16LE(i+20)===tailSize){e=i;break;}
    if(e<0||tail.readUInt16LE(e+4)||tail.readUInt16LE(e+6))throw Error('지원하지 않는 ZIP 디렉터리입니다.');
    const count=tail.readUInt16LE(e+10),length=tail.readUInt32LE(e+12),offset=tail.readUInt32LE(e+16);
    if(count===65535||length>8*1024*1024||offset+length>size-tailSize+e||count!==tail.readUInt16LE(e+8))throw Error('ZIP 디렉터리 크기가 잘못되었습니다.');
    const directory=Buffer.alloc(length);await handle.read(directory,0,length,offset);const names=[];let position=0;
    for(let i=0;i<count;i++){
      if(position+46>length||directory.readUInt32LE(position)!==0x02014b50)throw Error('ZIP 파일 목록이 잘못되었습니다.');
      const flags=directory.readUInt16LE(position+8),n=directory.readUInt16LE(position+28),extra=directory.readUInt16LE(position+30),comment=directory.readUInt16LE(position+32),end=position+46+n+extra+comment;
      if(end>length||flags&1)throw Error('암호화되거나 잘못된 ZIP입니다.');
      const bytes=directory.subarray(position+46,position+46+n);if(!(flags&0x800)&&bytes.some(b=>b>=128))throw Error('UTF-8이 아닌 ZIP 이름입니다.');
      const name=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(/[\r\n\0]/.test(name))throw Error('ZIP 이름에 제어 문자가 있습니다.');names.push(name);position=end;
    }
    if(position!==length)throw Error('ZIP 디렉터리에 알 수 없는 항목이 있습니다.');return names;
  }finally{await handle.close();}
}
export async function validateTree(root){
  if((await lstat(root)).isSymbolicLink())throw Error('앱 최상위 폴더가 심볼릭 링크입니다.');
  const base=await realpath(root);
  async function walk(folder){const {readdir}=await import('node:fs/promises');for(const entry of await readdir(folder,{withFileTypes:true})){
    const file=path.join(folder,entry.name),info=await lstat(file);
    if(info.isSymbolicLink())assertInside(base,await realpath(file));else if(info.isDirectory())await walk(file);else if(!info.isFile())throw Error('앱에 지원하지 않는 파일이 있습니다.');
  }}await walk(root);
}
export async function prepareInstallation({file,update,folder,platform=process.platform,home=os.homedir(),runImpl=run}){
  if(!['darwin','linux'].includes(platform))throw Error('압축 설치는 Mac과 Linux에서만 지원합니다.');
  versionParts(update.version);assertInside(folder,file);
  if(path.basename(file)!==update.asset.name||!await verifiedFile(file,update.asset))throw Error('업데이트 파일 무결성 검사가 실패했습니다.');
  const cache=path.join(folder,'stage-'+randomUUID());await mkdir(cache,{mode:0o700});
  const prefix=platform==='darwin'?'Resistor.app':`Resistor-${update.version}-linux-x64`;
  const list=platform==='darwin'?(await zipEntryNames(file)).join('\n'):await runImpl('tar',['-tzf',file]);safeArchiveEntries(list,prefix,{mac:platform==='darwin'});
  if(platform==='darwin')await runImpl('/usr/bin/ditto',['-x','-k',file,cache]);else await runImpl('tar',['-xzf',file,'--no-same-owner','-C',cache]);
  const source=platform==='darwin'?path.join(cache,prefix):path.join(cache,prefix,'Resistor');await validateTree(source);
  const resources=platform==='darwin'?path.join(source,'Contents/Resources/app'):path.join(source,'resources/app');
  const metadata=JSON.parse(await readFile(path.join(resources,'package.json'),'utf8'));
  if(metadata.version!==update.version||metadata.productName!=='Resistor'||metadata.name!=='resistor-eda')throw Error('압축 파일의 제품 또는 버전이 다릅니다.');
  const executable=platform==='darwin'?path.join(source,'Contents/MacOS/Resistor'):path.join(source,'Resistor');
  const binary=await readFile(executable);
  if(platform==='darwin'){
    const magic=binary.readUInt32LE(0),cpu=binary.readUInt32LE(4),expected=update.asset.platform==='macos'?0x0100000c:0x01000007;
    if(magic!==0xfeedfacf||cpu!==expected)throw Error('Mac 실행 파일의 아키텍처가 다릅니다.');
    const id=(await runImpl('/usr/libexec/PlistBuddy',['-c','Print :CFBundleIdentifier',path.join(source,'Contents/Info.plist')])).trim();
    if(id!=='org.register.eda')throw Error('Mac 앱 식별자가 다릅니다.');
    await runImpl('/usr/bin/codesign',['--verify','--deep','--strict',source]);
  }else if(binary.subarray(0,4).toString('hex')!=='7f454c46'||binary.readUInt16LE(18)!==62)throw Error('Linux 실행 파일 아키텍처가 다릅니다.');
  const parent=platform==='darwin'?path.join(home,'Applications'):path.join(home,'.local/opt/resistor');await mkdir(parent,{recursive:true});
  if((await lstat(parent)).isSymbolicLink())throw Error('앱 설치 폴더가 심볼릭 링크입니다.');
  const target=path.join(parent,platform==='darwin'?'Resistor.app':update.version);
  const staging=path.join(parent,'.resistor-update-'+randomUUID());assertInside(home,staging);await cp(source,staging,{recursive:true,errorOnExist:true,force:false});
  await validateTree(staging);if(platform==='darwin')await runImpl('/usr/bin/codesign',['--verify','--deep','--strict',staging]);
  return {schema:1,id:randomUUID(),version:update.version,platform,target,staging,home,folder,asset: update.asset,sha256:update.asset.sha256};
}
export async function applyInstallation(plan,{runImpl=run,launch=true}={}){
  const {target,staging,home,folder,version,platform}=plan;versionParts(version);
  const expected=platform==='darwin'?path.join(home,'Applications/Resistor.app'):platform==='linux'?path.join(home,'.local/opt/resistor',version):null;
  if(!expected||path.resolve(target)!==path.resolve(expected)||path.dirname(staging)!==path.dirname(target)||!path.basename(staging).startsWith('.resistor-update-'))throw Error('업데이트 설치 계획이 잘못되었습니다.');
  assertInside(home,target);assertInside(home,staging);
  const backup=path.join(path.dirname(target),'Resistor.previous-'+randomUUID()+(platform==='darwin'?'.app':''));let moved=false,installed=false;
  const receiptFile=path.join(folder,'receipt.json');
  const receipt={id:plan.id,version,platform,target,status:'installing',started_at:new Date().toISOString(),backup:null};
  let desktopFile,oldDesktop;
  try{
    if((await lstat(path.dirname(target))).isSymbolicLink()||(await lstat(staging)).isSymbolicLink())throw Error('앱 설치 경로가 심볼릭 링크입니다.');
    await validateTree(staging);
    try{const info=await lstat(target);if(!info.isDirectory()||info.isSymbolicLink())throw Error('기존 앱 경로가 안전하지 않습니다.');await rename(target,backup);moved=true;receipt.backup=backup;}catch(e){if(e.code!=='ENOENT')throw e;}
    await rename(staging,target);installed=true;
    if(platform==='linux'){
      const desktopFolder=path.join(home,'.local/share/applications');await mkdir(desktopFolder,{recursive:true});desktopFile=path.join(desktopFolder,'org.register.eda.desktop');
      try{oldDesktop=await readFile(desktopFile);}catch(e){if(e.code!=='ENOENT')throw e;}
      const quote=v=>'"'+v.replace(/[\\"`$]/g,c=>'\\'+c)+'"';
      await writeFile(desktopFile,['[Desktop Entry]','Type=Application','Name=Resistor','Comment=Schematic, layout and simulation workbench','Exec='+quote(path.join(target,'Resistor')),'Icon='+path.join(target,'resources/app/apps/desktop/assets/register.png'),'Terminal=false','Categories=Development;Electronics;','StartupWMClass=Resistor',''].join('\n'));
    }
    receipt.status='installed';receipt.finished_at=new Date().toISOString();await writeFile(receiptFile,JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
    if(launch){if(platform==='darwin')await runImpl('/usr/bin/open',[target,...(plan.viewer?['--args','--viewer']:[])]);else{
      const child=spawn(path.join(target,'Resistor'),plan.viewer?['--viewer']:[],{detached:true,stdio:'ignore',env:cleanLaunchEnvironment(),cwd:home});
      await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();
    }}return receipt;
  }catch(error){
    if(installed){await rename(target,path.join(path.dirname(target),'Resistor.failed-'+randomUUID()+(platform==='darwin'?'.app':'')));}
    if(moved)await rename(backup,target);
    if(desktopFile){if(oldDesktop)await writeFile(desktopFile,oldDesktop);else await unlink(desktopFile).catch(()=>{});}
    receipt.status='failed';receipt.message=error.message;receipt.restored=moved;receipt.finished_at=new Date().toISOString();await writeFile(receiptFile,JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
    throw error;
  }
}
export function cleanLaunchEnvironment(){const env={...process.env};for(const name of ['ELECTRON_RUN_AS_NODE','MOS_DEV_URL'])delete env[name];return env;}
export async function startInstallHelper(plan,{executable=process.execPath,parentPid=process.pid}={}){
  const helper=path.join(plan.folder,'helper-'+plan.id);await mkdir(helper,{mode:0o700});
  // Copy the helper outside the app being replaced. Its imports remain available after rename.
  for(const name of ['update-helper.mjs','update-install.mjs','updates.mjs','update-feed.mjs'])await cp(path.join(path.dirname(fileURLToPath(import.meta.url)),name),path.join(helper,name));
  const job=path.join(helper,'job.json');await writeFile(job,JSON.stringify({...plan,parentPid}),{mode:0o600});
  const child=spawn(executable,[path.join(helper,'update-helper.mjs'),job],{detached:true,stdio:'ignore',windowsHide:true,env:{...process.env,ELECTRON_RUN_AS_NODE:'1'}});
  await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();
  const deadline=Date.now()+10000;while(Date.now()<deadline){try{const ready=JSON.parse(await readFile(job+'.ready','utf8'));if(ready.id===plan.id)return;}catch{}await new Promise(r=>setTimeout(r,100));}
  throw Error('설치 도우미가 시작되지 않았습니다. 앱을 종료하지 않았습니다.');
}
