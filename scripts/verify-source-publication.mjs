// Read-only checks of the public portal and existing installer receipts.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const base=process.env.RESISTOR_PUBLICATION_URL??'https://resistor.kr';
const out=process.env.RESISTOR_PUBLICATION_OUT??'.runtime/deploy-20261024/public-verification.json';
const local=JSON.parse(await readFile('platform/download-site/edition-downloads.json','utf8'));
const get=(url,options={})=>fetch(url,{signal:AbortSignal.timeout(60000),...options});
const report={edition:'shared-portal / Resistor Indust source update',checked_at:new Date().toISOString(),base_url:base,native_installer_files_modified:false,native_OS_execution_this_run:false,checks:[],installers:[]};
const check=(name,ok)=>{assert(ok,name);report.checks.push({name,pass:true});};
const response=await get(base+'/edition-downloads.json');check('Public metadata HTTP 200',response.status===200);
const published=await response.json();assert.deepEqual(published,local);check('Public metadata equals staged edition identities and receipts',true);
const indust=local.editions.find(e=>e.edition==='indust');
const home=await get(base+'/');check('Homepage and existing release remain available',home.status===200&&(await home.text()).includes('0.31.0'));
const page=await get(base+'/download/industry/'),html=await page.text();
check('Industry page exposes verified source and explicit installer limitation',page.status===200&&html.includes('data-verified-source="indust"')&&html.includes(indust.source.revision.slice(0,12))&&html.includes('새 설치파일은 아직 공개하지 않았습니다'));
const source=await get(base+'/download/industry/source',{method:'HEAD',redirect:'manual'});
check('Source redirect is pinned to verified Indust commit',[302,307,308].includes(source.status)&&source.headers.get('location')===indust.source.url);
const archive=await get(indust.source.url,{method:'HEAD'});check('Pinned source archive responds',archive.status===200);await archive.body?.cancel();
const identity=await get(`https://raw.githubusercontent.com/Lead729726-cell/Resistor/${indust.source.revision}/product-edition.json`);
check('Pinned source has Indust identity',identity.ok&&(await identity.json()).edition==='indust');
for(const endpoint of ['/.env','/.runtime/worker.json','/workers/eda/server.py','/api/rpc']){
 const r=await get(base+endpoint,{method:'HEAD'});check('Private/runtime endpoint absent: '+endpoint,r.status===404);await r.body?.cancel();
}
const releases=new Map();
for(const e of local.editions)for(const f of e.native_installer.files){
 const tag=new URL(f.url).pathname.split('/')[5];
 if(!releases.has(tag)){const r=await get('https://api.github.com/repos/Lead729726-cell/Resistor/releases/tags/'+tag);check('Published GitHub release: '+tag,r.ok);releases.set(tag,await r.json());}
 const [head,receipt]=await Promise.all([get(f.url,{method:'HEAD'}),get(f.receipt_url)]);
 const bytes=Number(head.headers.get('content-length'));check('Installer availability and size: '+f.name,head.status===200&&bytes===f.bytes);await head.body?.cancel();
 check('Receipt available: '+f.name,receipt.status===200);
 const receiptHash=createHash('sha256').update(Buffer.from(await receipt.arrayBuffer())).digest('hex');check('Receipt SHA-256: '+f.name,receiptHash===f.receipt_sha256);
 const asset=releases.get(tag).assets.find(a=>a.name===f.name);check('Release asset size matches: '+f.name,asset?.size===f.bytes);
 if(asset.digest)check('GitHub asset SHA-256 matches: '+f.name,asset.digest==='sha256:'+f.sha256);
 report.installers.push({edition:e.edition,target:f.target,version:f.version,bytes,receipt_sha256:receiptHash,github_asset_digest:asset.digest??null,full_installer_download_this_run:false});
}
for(const name of ['guide-ko-v1.mp4','physical-logic.mp4','physical-chips.mp4']){
 const r=await get(base+'/tutorial-assets/'+name);check('Existing tutorial media available: '+name,r.status===200);
 const data=Buffer.from(await r.arrayBuffer()),expected=await readFile('platform/download-site/tutorial-assets/'+name);
 const hash=b=>createHash('sha256').update(b).digest('hex');
 check('Existing tutorial media bytes/SHA-256 preserved: '+name,data.length===expected.length&&hash(data)===hash(expected));
 (report.tutorial_media??=[]).push({name,bytes:data.length,sha256:hash(data),full_download_verified:true});
}
report.source_archive_verification='Pinned public identity and archive HEAD only; full archive bytes/checksum not measured.';
await mkdir(path.dirname(path.resolve(out)),{recursive:true});
await writeFile(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({checks:report.checks.length,installers:report.installers.length,source:indust.source.revision,pass:true,out}));
