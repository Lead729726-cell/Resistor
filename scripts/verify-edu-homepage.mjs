import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// Static delivery checks only: no AI calls, student writes or engine execution.
const root='platform/download-site/',checks=[];
const local=async file=>JSON.parse(await readFile(root+file,'utf8'));
const editions=await local('edition-downloads.json'),common=await local('downloads.json'),updates=await local('edu-updates.json'),assets=await local('learning-assets.json');
const bases=process.argv.slice(2).length?process.argv.slice(2):['https://resistor.kr','https://resistor-downloads.vercel.app'];
const checked=(name,ok)=>{assert.ok(ok,name);checks.push({name,pass:true});};
async function get(url,options={}){return fetch(url,{signal:AbortSignal.timeout(30000),...options});}
for(const base of bases){
 const [home,guide,remoteEditions,remoteCommon,remoteUpdates]=await Promise.all([
  get(base+'/').then(r=>{assert.equal(r.status,200);return r.text();}),
  get(base+'/edu/').then(r=>{assert.equal(r.status,200);return r.text();}),
  get(base+'/edition-downloads.json').then(r=>r.json()),
  get(base+'/downloads.json').then(r=>r.json()),
  get(base+'/edu-updates.json').then(r=>r.json())
 ]);
 checked(base+' homepage modes',home.includes('공부하는 두 가지 방법.')&&home.includes('/edu/#quiz')&&home.includes('/edu/#design/1'));
 checked(base+' source guide scope',guide.includes('이 페이지는 앱 사용법 가이드')&&guide.includes('not_run'));
 assert.deepEqual(remoteUpdates,updates);checked(base+' exact guide metadata',true);
 assert.deepEqual(remoteEditions,editions);assert.deepEqual(remoteCommon.files,common.files);
 checked(base+' all 10 dedicated and 4 historical native metadata preserved',true);
 checked(base+' source / installer distinction',updates.native_installer_rebuilt===false&&updates.engine_executed_on_website===false&&guide.includes(updates.source_revision.slice(0,12)));
 checked(base+' guide identifies published installer source',updates.published_native_installers?.matches_guide_source===editions.editions.find(e=>e.edition==='edu').native_installer.files.every(f=>f.source_revision===updates.source_revision)&&updates.native_installer_rebuilt_scope==='this-static-guide-generator-does-not-build-native-apps');
 const routes=['/edu','/tutorial/edu','/tutorial/edu/','/download/edu/','/download/industry/','/tutorial/library/','/pdk-links.html','/tutorial/oscillators/'];
 for(const route of routes){const res=await get(base+route);checked(base+route+' is public',res.status===200);await res.body?.cancel();}
 for(const file of ['edu-guide.mjs','edu-guide.css','edu-assets/inverter-desktop.png','edu-assets/block-preview.png','edu-assets/quiz-mobile.png']){
  const res=await get(base+'/'+file),body=Buffer.from(await res.arrayBuffer()),entry=assets.files.find(f=>f.file===file);
  checked(base+'/'+file+' exact bytes and SHA-256',res.status===200&&entry.bytes===body.length&&entry.sha256===createHash('sha256').update(body).digest('hex'));
  if(file.endsWith('.mjs'))checked(base+' ES module MIME',/javascript/.test(res.headers.get('content-type')));
 }
 const config=await local('vercel.json');
 for(const redirect of config.redirects.filter(r=>r.source.startsWith('/download/'))){
  const res=await get(base+redirect.source,{method:'HEAD',redirect:'manual'});
  checked(base+redirect.source+' download destination',res.status>=300&&res.status<400&&res.headers.get('location')===redirect.destination);
 }
 for(const file of ['guide-ko-v1.mp4','physical-logic.mp4','physical-chips.mp4']){
  const res=await get(base+'/tutorial-assets/'+file,{headers:{range:'bytes=0-1023'}}),body=await res.arrayBuffer();
  checked(base+' existing video byte-range '+file,res.status===206&&body.byteLength===1024&&res.headers.get('content-range')?.startsWith('bytes 0-1023/'));
 }
 const oscillatorHashes=JSON.parse(await readFile(root+'oscillator-assets/SHA256SUMS.json','utf8'));
 for(const [file,entry]of Object.entries(oscillatorHashes)){
  const res=await get(base+'/oscillator-assets/'+file),body=Buffer.from(await res.arrayBuffer());
  checked(base+' preserved oscillator asset '+file,res.status===200&&body.length===entry.bytes&&createHash('sha256').update(body).digest('hex')===entry.sha256);
 }
}
const report={schema_version:1,edition:'edu',checked_at:new Date().toISOString(),bases,source_revision:updates.source_revision,passed:checks.length,checks,native_installer_versions:[...new Set(editions.editions.flatMap(e=>e.native_installer.files.map(f=>f.version)))],engine_executed:false,full_installer_bytes_downloaded:false};
await mkdir('docs/evidence/edition-installers/portal',{recursive:true});
await writeFile('docs/evidence/edition-installers/portal/public-verification.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({bases,passed:checks.length,source_revision:updates.source_revision,native_installer_versions:report.native_installer_versions,engine_executed:false},null,2));
