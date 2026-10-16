import {editionRelease} from './fixtures/edition-release.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,lstat,symlink,access} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {selectRelease,compareVersions,platformKey,REPOSITORY,RELEASES_URL} from '../apps/desktop/update-feed.mjs';
import {DesktopUpdater} from '../apps/desktop/updates.mjs';
import {safeArchiveEntries,assertInside,applyInstallation,validateTree,zipEntryNames} from '../apps/desktop/update-install.mjs';
import {zipSync} from 'fflate';
const body=Buffer.from('real deterministic download fixture'),digest=createHash('sha256').update(body).digest('hex');
function release(version='0.23.0',options={}){const tag='v'+version;return {tag_name:tag,html_url:`https://github.com/${REPOSITORY}/releases/tag/${tag}`,draft:false,prerelease:true,published_at:'2026-10-13T00:00:00Z',body:'Release notes',assets:[{name:`Resistor-${version}-win-x64.exe`,size:body.length,digest:'sha256:'+digest,browser_download_url:`https://github.com/${REPOSITORY}/releases/download/${tag}/Resistor-${version}-win-x64.exe`}],...options};}
const choose=(data,options={})=>selectRelease(data,{currentVersion:'0.22.0',platform:'windows',...options});
async function fixture(t,{data=[release()],response=()=>new Response(body),installer=async()=>true}={}){
  const editions=data.map(r=>editionRelease({version:r.tag_name.slice(1),body}));
  const userData=await mkdtemp(path.join(os.tmpdir(),'resistor-update-test-'));let downloads=0;
  const manager=new DesktopUpdater({version:'0.22.0',platform:'win32',arch:'x64',userData,install:installer,fetchImpl:async(url)=>{if(url===RELEASES_URL)return new Response(JSON.stringify(editions.map(f=>f.release)));if(url.endsWith('.json'))return new Response(editions.find(f=>f.release.assets[1].browser_download_url===url).receiptBody);downloads++;return response();}});
  await manager.initialize();await manager.check();return {manager,userData,downloadCount:()=>downloads};
}
test('versions compare numerically, never lexically; draft, same and older releases cannot update',()=>{
  assert.equal(compareVersions('v0.10.0','0.9.9'),1);assert.equal(compareVersions('1.0.0','1.0.0'),0);
  assert.equal(choose([release('0.21.0'),release('0.22.0'),release('9.0.0',{draft:true})]),null);
  assert.equal(choose([release('0.23.0'),release('0.24.0')]).version,'0.24.0');
  assert.equal(choose([release()],{channel:'stable'}),null);assert.equal(choose([release('0.23.0',{prerelease:false})],{channel:'stable'}).version,'0.23.0');
});
test('unsupported architectures never receive an executable for another platform',()=>{
  assert.equal(platformKey('win32','arm64'),null);assert.equal(platformKey('linux','arm64'),null);assert.equal(platformKey('darwin','arm64'),'macos');assert.equal(platformKey('darwin','x64'),'macos-intel');assert.equal(choose([release()],{platform:'linux'}),null);
});
test('only official repository URLs and actual bounded SHA-256 assets are accepted',()=>{
  for(const change of [{browser_download_url:'https://evil.test/app.exe'},{size:0},{size:2**40},{digest:'sha256:bad'}]){const r=release();Object.assign(r.assets[0],change);assert.throws(()=>choose([r]));}
  assert.throws(()=>choose([release('0.23.0',{html_url:'https://evil.test/release'})]));
});
test('newest revision of the correct Mac architecture is selected',()=>{
  const r=release();r.assets=[['arm64',4],['arm64',5],['x64',9]].map(([arch,rev])=>({name:`Resistor-0.23.0-mac-${arch}-r${rev}.zip`,size:body.length,digest:'sha256:'+digest,browser_download_url:`https://github.com/${REPOSITORY}/releases/download/v0.23.0/Resistor-0.23.0-mac-${arch}-r${rev}.zip`}));
  assert.equal(choose([r],{platform:'macos'}).asset.revision,5);assert.equal(choose([r],{platform:'macos-intel'}).asset.revision,9);
});
test('download bytes and SHA must both match before ready; verified cached file survives restart',async t=>{
  const {manager,userData}=await fixture(t);assert.equal(manager.status().status,'available');await manager.download();assert.equal(manager.status().status,'ready');assert.deepEqual(await readFile(manager.file),body);
  const restarted=new DesktopUpdater({version:'0.22.0',platform:'win32',arch:'x64',userData,fetchImpl:manager.fetchImpl});await restarted.initialize();await restarted.check();assert.equal(restarted.status().status,'ready');
});
test('corrupt and truncated downloads never enable installation',async t=>{
  for(const bytes of [Buffer.from('corrupt'),Buffer.alloc(body.length,0)]){const {manager}=await fixture(t,{response:()=>new Response(bytes)});await manager.download();assert.equal(manager.status().status,'error');assert.equal(manager.file,null);await assert.rejects(manager.apply());}
});
test('an offsite redirect is rejected before any offsite request',async t=>{
  const {manager,downloadCount}=await fixture(t,{response:()=>new Response(null,{status:302,headers:{location:'https://evil.test/a'}})});await manager.download();assert.equal(manager.status().status,'error');assert.equal(downloadCount(),1);
});
test('network failure is offline, not current or success; retry recovers',async t=>{
  const {manager}=await fixture(t);const original=manager.fetchImpl;manager.fetchImpl=async()=>{throw new TypeError('fetch failed');};await manager.check();assert.equal(manager.status().status,'offline');manager.fetchImpl=original;await manager.check();assert.equal(manager.status().status,'available');
  manager.fetchImpl=async()=>{throw Error('net::ERR_INTERNET_DISCONNECTED');};await manager.check();assert.equal(manager.status().status,'offline');
});
test('one download at a time and cancellation leave no ready file',async t=>{
  let controller;
  const {manager,downloadCount}=await fixture(t,{response:()=>new Response(new ReadableStream({start(c){controller=c;},cancel(){}}))});
  const first=manager.download();while(!controller)await new Promise(r=>setTimeout(r,1));await manager.download();assert.equal(downloadCount(),1);manager.cancel();await first;assert.equal(manager.status().status,'available');assert.equal(manager.file,null);
});
test('file altered after download never reaches installer, including equal-length corruption',async t=>{
  let installs=0;const {manager}=await fixture(t,{installer:async()=>{installs++;}});await manager.download();await writeFile(manager.file,Buffer.alloc(body.length,0));await manager.apply();assert.equal(manager.status().status,'error');assert.equal(installs,0);
});
test('user cancels install: ready remains usable; development process cannot replace app',async t=>{
  const {manager}=await fixture(t,{installer:async()=>false});await manager.download();await manager.apply();assert.equal(manager.status().status,'ready');manager.packaged=false;await assert.rejects(manager.apply(),/소스/);
});
test('IPC never accepts arbitrary paths, URLs, commands or unknown actions',async t=>{
  const {manager}=await fixture(t);for(const method of ['status','download','install','check'])await assert.rejects(manager.rpc('desktop.update.'+method,{file:'other',url:'https://evil.test',command:'rm'}));await assert.rejects(manager.rpc('desktop.update.execute'));await assert.rejects(manager.rpc('desktop.update.preferences',{automatic:true,channel:'preview',file:'x'}));
});
test('preferences persist; auto checks are opt-out and throttled',async t=>{
  const {manager}=await fixture(t);await manager.preferences({automatic:false,channel:'stable'});let calls=0;manager.fetchImpl=async()=>{calls++;return new Response('[]');};await manager.check({automatic:true});assert.equal(calls,0);
  await manager.preferences({automatic:true,channel:'preview'});manager.lastAuto=0;await manager.check({automatic:true});await manager.check({automatic:true});assert.equal(calls,1);
  const r=new DesktopUpdater({version:'0.22.0',platform:'win32',arch:'x64',userData:path.dirname(path.dirname(manager.folder))});await r.initialize();assert.deepEqual(r.status().settings,{automatic:true,channel:'preview'});
});
test('archive traversal, absolute paths and unrelated roots are rejected; normal framework links retained',()=>{
  for(const entry of ['../outside','/outside','Resistor.app/../outside','Resistor.app\\bad','Other.app/x'])assert.throws(()=>safeArchiveEntries('Resistor.app/a\n'+entry,'Resistor.app',{mac:true}));
  safeArchiveEntries('Resistor.app/Contents/Frameworks/a\nBUNDLE-SYMLINKS.tsv\n','Resistor.app',{mac:true});assert.throws(()=>assertInside('D:/root','D:/outside'));
});
test('ZIP directory Unicode names do not depend on the native unzip locale; malformed directories fail',async()=>{
  const folder=await mkdtemp(path.join(os.tmpdir(),'resistor-update-unicode-')),file=path.join(folder,'file.zip');
  await writeFile(file,zipSync({'Resistor.app/Contents/test':Buffer.from('x'),'Mac 설치 안내.txt':Buffer.from('안내')}));
  const names=await zipEntryNames(file);assert(names.includes('Mac 설치 안내.txt'));safeArchiveEntries(names.join('\n'),'Resistor.app',{mac:true});
  await writeFile(file,Buffer.from('not zip'));await assert.rejects(zipEntryNames(file));
});
test('atomic Linux replacement preserves prior app and design data and updates launcher',async()=>{
  const home=await mkdtemp(path.join(os.tmpdir(),'resistor-update-install-')),parent=path.join(home,'.local/opt/resistor'),target=path.join(parent,'0.23.0'),staging=path.join(parent,'.resistor-update-fixture'),folder=path.join(home,'updates');
  await mkdir(staging,{recursive:true});await mkdir(target);await mkdir(folder);await mkdir(path.join(home,'workspace'));await writeFile(path.join(target,'old'),'old app');await writeFile(path.join(staging,'new'),'new app');await writeFile(path.join(home,'workspace/design'),'user design');
  const plan={id:'test',home,parent,target,staging,folder,version:'0.23.0',platform:'linux'};const receipt=await applyInstallation(plan,{launch:false});assert.equal(receipt.status,'installed');assert.equal(await readFile(path.join(target,'new'),'utf8'),'new app');assert.equal(await readFile(path.join(receipt.backup,'old'),'utf8'),'old app');assert.equal(await readFile(path.join(home,'workspace/design'),'utf8'),'user design');assert.match(await readFile(path.join(home,'.local/share/applications/org.register.eda.desktop'),'utf8'),/0\.23\.0/);
});
test('post-swap launch failure restores old Mac app; failed replacement is retained',async()=>{
  const home=await mkdtemp(path.join(os.tmpdir(),'resistor-update-rollback-')),parent=path.join(home,'Applications'),target=path.join(parent,'Resistor.app'),staging=path.join(parent,'.resistor-update-fixture'),folder=path.join(home,'updates');
  await mkdir(staging,{recursive:true});await mkdir(target);await mkdir(folder);await writeFile(path.join(target,'old'),'old');await writeFile(path.join(staging,'new'),'new');
  await assert.rejects(applyInstallation({id:'test',home,target,staging,folder,version:'0.23.0',platform:'darwin'},{runImpl:async()=>{throw Error('launch failure');}}));
  assert.equal(await readFile(path.join(target,'old'),'utf8'),'old');assert.equal(JSON.parse(await readFile(path.join(folder,'receipt.json'))).restored,true);
});
test('tree and install plan cannot target another directory',async()=>{
  const folder=await mkdtemp(path.join(os.tmpdir(),'resistor-update-paths-'));await assert.rejects(applyInstallation({home:folder,target:path.dirname(folder),staging:path.join(folder,'x'),folder,version:'0.23.0',platform:'darwin'}));
  // Symlink tests are executed on Unix where link creation needs no Windows privilege.
  if(process.platform!=='win32'){await symlink(os.tmpdir(),path.join(folder,'escape'));await assert.rejects(validateTree(folder));}
});
