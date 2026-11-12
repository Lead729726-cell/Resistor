import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash,generateKeyPairSync} from 'node:crypto';
import {verifiedEduNativeFiles,validateEduSigningEvidence,validateEduPublicationSource,flattenVercelSourceTree,mergeEduNativeManifest,eduNativeSiteOverlay,eduNativeDeploymentPayload} from '../scripts/edu-native-publication.mjs';
const definitions=JSON.parse(await readFile('apps/desktop/product-editions.json','utf8'));
const previous=JSON.parse(await readFile('platform/download-site/edition-downloads.json','utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const authority={server:'https://licenses.example.test',key_id:'test-key',public_key_fingerprint:'1'.repeat(64),checked_at:'2026-11-01T00:00:00Z'};
function fixture(change=()=>{}){
 const file='Resistor-Edu-0.32.0-windows-x64.exe',name=file.replace('.exe','.json'),base='https://github.com/Lead729726-cell/Resistor/releases/download/edu-v0.32.0/';
 const receipt={schema_version:1,edition:'edu',product_id:'resistor.edu',version:'0.32.0',platform:'windows',arch:'x64',file,bytes:2000000,sha256:'2'.repeat(64),source_revision:'a'.repeat(40),build_tools_revision:'b'.repeat(40),runtime_arch:'x64',requires_emulation:false,manufacturing_signoff:false,packaged_executable_sha256:'7'.repeat(64),
  license_authority:{...authority},runtime:{platform:'win32',arch:'x64',manifest_sha256:'3'.repeat(64)},signing:{authenticode_signed:false,developer_id_signed:false,notarized:false,ad_hoc_signed:false},
  native_qa:{completed:true,edition:'edu',product_id:'resistor.edu',platform:'win32',arch:'x64',source_revision:'a'.repeat(40),desktop:{edition:'edu',product_id:'resistor.edu',version:'0.32.0',target:'windows-x64',source_revision:'a'.repeat(40),packaged_executable_sha256:'7'.repeat(64),runtime_manifest_sha256:'3'.repeat(64),verification_method:'automated-electron',checked_at:'2026-11-01T00:00:00Z',activation_checked:true,edition_title:'Resistor Edu',window_loaded:true,license_required_before_activation:true,engine_rpc_checked:true,lease_released:true},
   engine:{completed:true,checked_at:'2026-11-01T00:00:00Z',platform:'win32',arch:'x64',docker_used:false,public_pdk_available:true,physical_signoff:false,resource_scope:'packaged',runtime_manifest_sha256:'3'.repeat(64),source_sha256:Object.fromEntries(['workers/eda/server.py','workers/eda/native_entry.py','scripts/native-worker.mjs','scripts/native-engine-qa.mjs'].map(p=>[p,'4'.repeat(64)])),cases:[{name:'actual ideal-circuit OP: 0.9 V and 90 uA; functional verdict UNKNOWN',passed:true,run_id:'fixture-op',voltage_V:.9},{name:'GDSII and OASIS actual engine round trips',passed:true},{name:'actual SKY130 inverter model transient with signed currents',passed:true,run_id:'fixture-tran'}]}}
 };change(receipt);const bytes=Buffer.from(JSON.stringify(receipt)),release={tag_name:'edu-v0.32.0',html_url:'https://github.com/Lead729726-cell/Resistor/releases/tag/edu-v0.32.0',draft:false,prerelease:false,assets:[{name:file,browser_download_url:base+file,size:2000000,digest:'sha256:'+'2'.repeat(64)},{name,browser_download_url:base+name,size:bytes.length,digest:'sha256:'+sha(bytes)}]};
 return {release,receipts:{[name]:bytes},receipt};
}
test('only a matching licensed packaged-runtime receipt can produce new Edu metadata',()=>{
 const f=fixture(),v=verifiedEduNativeFiles(f.release,f.receipts,authority);assert.equal(v.files.length,1);assert.equal(v.files[0].release_tag,'edu-v0.32.0');assert.equal(v.files[0].target,'windows-x64');assert.equal(v.provenance[0].native_physical_tools_verified,false);
 for(const change of [r=>r.native_qa.completed=false,r=>r.native_qa.source_revision='c'.repeat(40),r=>r.native_qa.desktop.activation_checked=false,r=>r.native_qa.desktop.edition_title='Resistor Industry',r=>r.native_qa.desktop.lease_released=false,r=>r.native_qa.desktop.engine_rpc_checked=false,r=>r.native_qa.engine.native_physical_tools_verified=true,r=>r.native_qa.engine.resource_scope='source',r=>r.native_qa.engine.runtime_manifest_sha256='5'.repeat(64),r=>r.native_qa.engine.cases[0].voltage_V=1,r=>r.native_qa.engine.cases[1].passed=false,r=>r.native_qa.engine.cases.pop(),r=>delete r.native_qa.engine.source_sha256,r=>r.license_authority.public_key_fingerprint='6'.repeat(64),r=>r.runtime.arch='arm64',r=>r.manufacturing_signoff=true,r=>delete r.signing.notarized]){const bad=fixture(change);assert.throws(()=>verifiedEduNativeFiles(bad.release,bad.receipts,authority));}
});
test('desktop publication requires the exact observed source, target, executable and runtime for either QA method',()=>{
 const checks=['activation_checked','window_loaded','license_required_before_activation','engine_rpc_checked','lease_released'];
 const native=fixture(r=>{r.native_qa.desktop.verification_method='native-cua';r.native_qa.desktop.observations=checks.map(check=>({check,evidence:'Synthetic test observation for '+check}));});
 assert.doesNotThrow(()=>verifiedEduNativeFiles(native.release,native.receipts,authority));
 for(const mutation of [r=>r.native_qa.desktop.source_revision='c'.repeat(40),r=>r.native_qa.desktop.target='macos-arm64',r=>r.native_qa.desktop.product_id='resistor.indust',r=>r.native_qa.desktop.version='0.31.0',r=>r.native_qa.desktop.packaged_executable_sha256='8'.repeat(64),r=>delete r.packaged_executable_sha256,r=>r.native_qa.desktop.runtime_manifest_sha256='9'.repeat(64),r=>r.native_qa.desktop.verification_method='unchecked',r=>r.native_qa.desktop.checked_at='2099-01-01T00:00:00Z',r=>{r.native_qa.desktop.verification_method='native-cua';r.native_qa.desktop.observations=checks.slice(1).map(check=>({check,evidence:'Synthetic test observation'}));}]){
  const changed=fixture(mutation);assert.throws(()=>verifiedEduNativeFiles(changed.release,changed.receipts,authority));
 }
});

// These are synthetic validator fixtures, never real signed release receipts.
function signedWindowsFixture(){
 const r=fixture().receipt,signature={authenticode_signed:true,verification:'Valid',publisher:'Synthetic test publisher',signer_thumbprint:'C'.repeat(40),timestamp_thumbprint:'D'.repeat(40),checked_at:'2026-11-01T00:00:00Z'};
 r.signing_policy={mode:'store',publisher:signature.publisher,thumbprint:signature.signer_thumbprint};
 r.signing={...r.signing,...signature,schema_version:1,sha256:r.sha256,artifact_sha256:r.sha256,packaged_executable_sha256:r.packaged_executable_sha256,runtime_manifest_sha256:r.runtime.manifest_sha256,application:{...signature,sha256:r.packaged_executable_sha256},signed_installer_files:[{...signature,file:r.file.replace(/\.exe$/,'.__uninstaller.exe'),sha256:'5'.repeat(64)},{...signature,file:r.file,sha256:r.sha256}]};
 return r;
}
function signedMacFixture(){
 const r=fixture().receipt;r.platform='macos';r.file='Resistor-Edu-0.32.0-macos-arm64.zip';
 r.signing_policy={mode:'developer-id',identity:'C'.repeat(40),team_id:'ABCD123456'};
 r.signing={schema_version:1,authenticode_signed:false,ad_hoc_signed:false,developer_id_signed:true,notarized:true,hardened_runtime:true,apple_chain_verified:true,team_id:r.signing_policy.team_id,signer_thumbprint:r.signing_policy.identity,authority:'Developer ID Application: Synthetic test publisher (ABCD123456)',secure_timestamp:'Nov 1, 2026 at 00:00:00',notarization_status:'Accepted',notarization_submission_id:'12345678-1234-1234-1234-123456789abc',stapled:true,gatekeeper_assessment:'accepted',distribution_archive_verified:true,artifact_sha256:r.sha256,packaged_executable_sha256:r.packaged_executable_sha256,runtime_manifest_sha256:r.runtime.manifest_sha256,checked_at:'2026-11-01T00:00:00Z'};
 return r;
}
test('legacy unsigned receipts stay valid while boolean-only or cross-platform trusted claims fail',()=>{
 for(const os of ['windows','macos','linux']){const r=fixture().receipt;r.platform=os;r.signing.ad_hoc_signed=os==='macos';assert.equal(validateEduSigningEvidence(r),true);}
 for(const change of [r=>r.signing.authenticode_signed=true,r=>r.signing.notarized=true,r=>r.signing.developer_id_signed=true,r=>r.signing.ad_hoc_signed=true,r=>r.signing_policy={mode:'store'},r=>r.signing.verification='Valid',r=>r.signing.stapled=true,r=>r.signing.application={authenticode_signed:true},r=>r.signing.signed_installer_files=[{authenticode_signed:true}]]){
  const f=fixture(change);assert.throws(()=>verifiedEduNativeFiles(f.release,f.receipts,authority));
 }
 const mac=fixture().receipt;mac.platform='macos';mac.signing.ad_hoc_signed=true;mac.signing.developer_id_signed=true;assert.throws(()=>validateEduSigningEvidence(mac));
 const linux=fixture().receipt;linux.platform='linux';linux.signing.authenticode_signed=true;assert.throws(()=>validateEduSigningEvidence(linux));
});
test('trusted Windows publication binds publisher, certificate, timestamp and both installer components to observed bytes',()=>{
 const valid=signedWindowsFixture();assert.equal(validateEduSigningEvidence(valid),true);
 const f=fixture(r=>Object.assign(r,valid));assert.doesNotThrow(()=>verifiedEduNativeFiles(f.release,f.receipts,authority));
 for(const mutate of [r=>delete r.signing.schema_version,r=>r.signing.sha256='0'.repeat(64),r=>r.signing.artifact_sha256='0'.repeat(64),r=>r.signing.packaged_executable_sha256='0'.repeat(64),r=>r.signing.runtime_manifest_sha256='0'.repeat(64),r=>r.signing.checked_at='2099-01-01T00:00:00Z',r=>r.signing.verification='NotTrusted',r=>r.signing.publisher='Different publisher',r=>r.signing.signer_thumbprint='A'.repeat(40),r=>delete r.signing.timestamp_thumbprint,r=>r.signing.application.sha256='0'.repeat(64),r=>r.signing.application.verification='UnknownError',r=>r.signing.signed_installer_files.pop(),r=>r.signing.signed_installer_files.shift(),r=>r.signing.signed_installer_files[0].sha256='',r=>r.signing.signed_installer_files[0].timestamp_thumbprint='',r=>r.signing.signed_installer_files[1].sha256='0'.repeat(64),r=>r.signing.signed_installer_files[1].file='../installer.exe']){
  const r=signedWindowsFixture();mutate(r);assert.throws(()=>validateEduSigningEvidence(r));
 }
 const azure=signedWindowsFixture();azure.signing_policy={mode:'azure',publisher:azure.signing.publisher,endpoint:'https://krc.codesigning.azure.net',account:'test-account',profile:'test-profile'};assert.equal(validateEduSigningEvidence(azure),true);
 azure.signing_policy.endpoint='https://codesigning.azure.net.attacker.test';assert.throws(()=>validateEduSigningEvidence(azure));
});
test('trusted Mac publication requires exact Developer ID identity and final archived notarization evidence',()=>{
 assert.equal(validateEduSigningEvidence(signedMacFixture()),true);
 for(const mutate of [r=>r.signing.ad_hoc_signed=true,r=>r.signing.authenticode_signed=true,r=>r.signing.notarized=false,r=>delete r.signing_policy,r=>r.signing.signer_thumbprint='A'.repeat(40),r=>r.signing.team_id='OTHER12345',r=>r.signing.hardened_runtime=false,r=>r.signing.apple_chain_verified=false,r=>r.signing.authority='Synthetic self-signed certificate',r=>r.signing.secure_timestamp='none',r=>delete r.signing.secure_timestamp,r=>r.signing.notarization_status='In Progress',r=>r.signing.notarization_submission_id='not-a-submission',r=>r.signing.stapled=false,r=>r.signing.gatekeeper_assessment='rejected',r=>r.signing.distribution_archive_verified=false,r=>r.signing.artifact_sha256='0'.repeat(64),r=>r.signing.packaged_executable_sha256='0'.repeat(64),r=>r.signing.runtime_manifest_sha256='0'.repeat(64)]){
  const r=signedMacFixture();mutate(r);assert.throws(()=>validateEduSigningEvidence(r));
 }
});
test('public publication rejects draft, substituted tag, missing receipt and changed receipt bytes',()=>{
 for(const mutate of [f=>f.release.draft=true,f=>f.release.prerelease=true,f=>f.release.tag_name='indust-v0.32.0',f=>f.release.assets.pop(),f=>f.release.assets[0].browser_download_url='https://example.test/app.exe',f=>f.release.assets[1].digest='sha256:'+'0'.repeat(64),f=>f.receipts[Object.keys(f.receipts)[0]]=Buffer.from('{}')]){const f=fixture();mutate(f);assert.throws(()=>verifiedEduNativeFiles(f.release,f.receipts,authority));}
 const f=fixture();Object.assign(f.release,{draft:true,id:1234,target_commitish:f.receipt.source_revision});assert.doesNotThrow(()=>verifiedEduNativeFiles(f.release,f.receipts,authority,{allowDraft:true}));
});
test('explicit private draft audit accepts GitHub temporary URLs only when every asset and receipt binds to its exact target',()=>{
 const temporary='untagged-51de4a2d2cf3e86599a2';
 function draftFixture(){const f=fixture();Object.assign(f.release,{id:1234,draft:true,target_commitish:f.receipt.source_revision,html_url:'https://github.com/Lead729726-cell/Resistor/releases/tag/'+temporary});for(const asset of f.release.assets)asset.browser_download_url=asset.browser_download_url.replace('/edu-v0.32.0/','/'+temporary+'/');return f;}
 const f=draftFixture(),verified=verifiedEduNativeFiles(f.release,f.receipts,authority,{allowDraft:true});
 assert.equal(verified.draft,true);assert.equal(verified.publicly_downloadable,false);assert.equal(verified.draft_release_id,1234);assert.equal(verified.source_revision,f.release.target_commitish);
 assert.equal(verified.files[0].url,f.release.assets[0].browser_download_url);assert.equal(verified.files[0].receipt_url,f.release.assets[1].browser_download_url);
 assert.throws(()=>verifiedEduNativeFiles(f.release,f.receipts,authority),/Draft/);assert.throws(()=>mergeEduNativeManifest(previous,verified,definitions),/Draft audit/);
 for(const mutate of [
  f=>delete f.release.id,f=>f.release.target_commitish='main',f=>f.release.target_commitish='b'.repeat(40),
  f=>f.release.html_url=f.release.html_url.replace('github.com','github.com.attacker.test'),
  f=>f.release.html_url=f.release.html_url.replace('Lead729726-cell/Resistor','other/Resistor'),
  f=>f.release.html_url+='?redirect=other',
  f=>f.release.assets[0].browser_download_url=f.release.assets[0].browser_download_url.replace(temporary,'untagged-'+'a'.repeat(20)),
  f=>f.release.assets[1].browser_download_url=f.release.assets[1].browser_download_url.replace(temporary,'edu-v0.32.0'),
  f=>f.release.assets[0].digest='sha256:'+'0'.repeat(64),f=>f.release.assets[1].digest='sha256:'+'0'.repeat(64),
 ]){const bad=draftFixture();mutate(bad);assert.throws(()=>verifiedEduNativeFiles(bad.release,bad.receipts,authority,{allowDraft:true}));}
 const published=draftFixture();published.release.draft=false;assert.throws(()=>verifiedEduNativeFiles(published.release,published.receipts,authority),/identity/);assert.throws(()=>verifiedEduNativeFiles(published.release,published.receipts,authority,{allowDraft:true}),/identity/);
});
test('public source verification rejects a different engine, edition, version or authority',()=>{
 const {publicKey}=generateKeyPairSync('ed25519'),key=publicKey.export({type:'spki',format:'pem'}),trusted={...authority,public_key_fingerprint:sha(publicKey.export({type:'spki',format:'der'}))};
 const engineNames=['workers/eda/server.py','workers/eda/native_entry.py','scripts/native-worker.mjs','scripts/native-engine-qa.mjs'],sourceFiles=Object.fromEntries(engineNames.map(name=>[name,Buffer.from('test fixture engine source: '+name)]));
 sourceFiles['product-edition.json']=Buffer.from(JSON.stringify({schema_version:1,edition:'edu'}));sourceFiles['package.json']=Buffer.from(JSON.stringify({version:'0.32.0'}));sourceFiles['platform/licensing/public-config.json']=Buffer.from(JSON.stringify({schema_version:1,required:true,deployment_status:'production_ready',server_url:trusted.server,public_keys:{[trusted.key_id]:key}}));
 const f=fixture(r=>{r.license_authority=trusted;r.native_qa.engine.source_sha256=Object.fromEntries(engineNames.map(name=>[name,sha(sourceFiles[name])]));}),verified=verifiedEduNativeFiles(f.release,f.receipts,trusted);
 assert.equal(validateEduPublicationSource(verified,f.receipts,sourceFiles),true);
 for(const [name,changed]of [['workers/eda/server.py',Buffer.from('different implementation')],['package.json',Buffer.from('{"version":"0.31.0"}')],['product-edition.json',Buffer.from('{"schema_version":1,"edition":"indust"}')],['platform/licensing/public-config.json',Buffer.from('{"schema_version":1,"required":true,"deployment_status":"unconfigured"}')]])assert.throws(()=>validateEduPublicationSource(verified,f.receipts,{...sourceFiles,[name]:changed}));
 const missing={...sourceFiles};delete missing['workers/eda/native_entry.py'];assert.throws(()=>validateEduPublicationSource(verified,f.receipts,missing),/source missing/);
});
test('production source inventory rejects traversal, duplicate and incomplete API trees',()=>{
 const entries=Array.from({length:30},(_,i)=>({name:'page-'+i+'.html',type:'file',uid:i.toString(16).padStart(40,'0')})),tree=[{name:'src',type:'directory',children:entries}];
 assert.equal(flattenVercelSourceTree(tree).length,30);assert.equal(flattenVercelSourceTree(tree)[0].file,'page-0.html');
 assert.deepEqual(flattenVercelSourceTree([...tree,{name:'out',type:'directory',children:[{name:'generated-function',type:'file',uid:'not-a-source-sha'}]}]),flattenVercelSourceTree(tree));
 assert.throws(()=>flattenVercelSourceTree([...tree,{name:'other',type:'directory',children:[]}]));
 assert.throws(()=>flattenVercelSourceTree(entries.slice(0,2)));
 assert.throws(()=>flattenVercelSourceTree([...entries,entries[0]]));
 for(const name of ['..','.env.local','../outside','bad\\name'])assert.throws(()=>flattenVercelSourceTree([...entries,{name,type:'directory',children:[{name:'secret',type:'file',uid:'f'.repeat(40)}]}]));
 assert.throws(()=>flattenVercelSourceTree([...entries,{name:'invalid-sha',type:'file',uid:'unknown'}]));
});
test('a new Windows Edu receipt leaves every unbuilt OS and all Industry fields unchanged',()=>{
 const f=fixture(),v=verifiedEduNativeFiles(f.release,f.receipts,authority),snapshot=JSON.stringify(previous),next=mergeEduNativeManifest(previous,v,definitions);
 assert.equal(JSON.stringify(previous),snapshot);
 assert.deepEqual(next.editions.find(e=>e.edition==='indust'),previous.editions.find(e=>e.edition==='indust'));
 const edu=next.editions.find(e=>e.edition==='edu'),old=previous.editions.find(e=>e.edition==='edu');
 assert.equal(edu.source.revision,'a'.repeat(40));
 assert.deepEqual(edu.native_installer.files.filter(f=>f.target!=='windows-x64'),old.native_installer.files.filter(f=>f.target!=='windows-x64'));
 const bad=structuredClone(v);bad.files[0].version='0.30.0';assert.throws(()=>mergeEduNativeManifest(previous,bad,definitions),/downgrade/);
 const rebuilt=structuredClone(v);rebuilt.files[0].sha256='9'.repeat(64);assert.throws(()=>mergeEduNativeManifest(next,rebuilt,definitions),/same-version/);
});
test('native site overlay changes only Edu receipt targets and cannot rewrite old OS source links',()=>{
 const f=fixture(),v=verifiedEduNativeFiles(f.release,f.receipts,authority),old=previous.editions.find(e=>e.edition==='edu'),cards=old.native_installer.files.map(f=>`<article data-platform-target="${f.target}"><a href="${f.url}">${f.version}</a><a href="https://github.com/Lead729726-cell/Resistor/tree/${f.source_revision}">source</a></article>`).join('');
 const eduPage=`<main>${cards}<details class="wb-source-details">${old.source.revision} ${old.source.revision.slice(0,12)}</details></main>`,config={redirects:[{source:'/download/industry/windows-x64',destination:'industry-original',permanent:false},{source:'/download/edu/windows-x64',destination:'old-edu',permanent:false},{source:'/download/edu/macos-arm64',destination:'old-mac',permanent:false}],rewrites:[{source:'/course/',destination:'/course-workbook.html'}]},before=JSON.stringify(config);
 const overlay=eduNativeSiteOverlay({manifest:previous,config,home:'<main>home</main>',eduPage,eduUpdates:{feature_source_revision:old.source.revision,published_native_installers:{},engine_executed_on_website:false}},v,definitions);
 assert.deepEqual([...overlay.keys()].sort(),['download-edu.html','edu-updates.json','edition-downloads.json','index.html','vercel.json'].sort());assert.equal(JSON.stringify(config),before);
 const c=JSON.parse(overlay.get('vercel.json'));assert.deepEqual(c.redirects.find(r=>r.source.includes('industry')),config.redirects[0]);assert.deepEqual(c.redirects.find(r=>r.source.includes('macos-arm64')),config.redirects[2]);assert.deepEqual(c.rewrites,config.rewrites);
 const html=overlay.get('download-edu.html'),macBlock=html.match(/<article data-platform-target="macos-arm64">([\s\S]*?)<\/article>/)[1];assert.ok(macBlock.includes(old.native_installer.files.find(f=>f.target==='macos-arm64').source_revision));assert.ok(html.includes('소스')||html.includes('source'));
 assert.equal(JSON.parse(overlay.get('edu-updates.json')).published_native_installers.matches_latest_source,false);
 assert.ok(overlay.get('index.html').includes('다른 OS는 카드에 표시된 기존 검증 버전'));
});

test('native overlay refreshes only its learning hashes and preserves history, order and untouched stale entries',()=>{
 const f=fixture(),verified=verifiedEduNativeFiles(f.release,f.receipts,authority);
 const learningAssets={schema_version:1,generated_at:'historical timestamp',source_revision:'old guide source',files:[
  {file:'index.html',bytes:1,sha256:'0'.repeat(64),kind:'guide',source_revision:'historical-home'},
  {file:'learning/example.html',bytes:999,sha256:'1'.repeat(64),scope:'intentionally untouched historical entry'},
  {file:'download-edu.html',bytes:2,sha256:'2'.repeat(64)},
  {file:'edu-updates.json',bytes:3,sha256:'3'.repeat(64)},
  {file:'download-industry.html',bytes:4,sha256:'4'.repeat(64)},
 ]};
 const baseline={manifest:previous,config:{redirects:[]},home:'<main>학습 안내</main>',eduPage:'<main><article data-platform-target="windows-x64">이전 파일</article></main>',eduUpdates:{published_native_installers:{}},learningAssets};
 const original=structuredClone(baseline),overlay=eduNativeSiteOverlay(baseline,verified,definitions);
 assert.equal(overlay.size,6);assert.deepEqual(baseline,original);
 const updated=JSON.parse(overlay.get('learning-assets.json'));
 assert.deepEqual(updated.files.map(entry=>entry.file),learningAssets.files.map(entry=>entry.file));
 for(const file of ['index.html','download-edu.html','edu-updates.json']){
  const body=overlay.get(file),entry=updated.files.find(value=>value.file===file);
  assert.equal(entry.bytes,Buffer.byteLength(body));assert.equal(entry.sha256,sha(body));
 }
 assert.ok(Buffer.byteLength(overlay.get('index.html'))>overlay.get('index.html').length,'Korean UTF-8 byte length is not character count');
 const restored=structuredClone(updated);
 for(const entry of restored.files){const old=learningAssets.files.find(value=>value.file===entry.file);entry.bytes=old.bytes;entry.sha256=old.sha256;}
 assert.deepEqual(restored,learningAssets);
 assert.deepEqual(updated.files[1],learningAssets.files[1]);assert.deepEqual(updated.files[4],learningAssets.files[4]);
 for(const invalid of [null,{}, {files:'not an array'}, {files:[{file:'index.html'},{file:'index.html'}]}, {files:[{}]}])assert.throws(()=>eduNativeSiteOverlay({...baseline,learningAssets:invalid},verified,definitions),/learning manifest/);
});

test('native deployment inherits its exact live base without overriding function settings or environment',()=>{
 const files=[{file:'api/shop.mjs',sha:'c'.repeat(40),mode:33206},{file:'privacy/index.html',sha:'d'.repeat(40),mode:33206}],input={projectId:'prj_test',baselineId:'dpl_verified_live',files,sourceRevision:'a'.repeat(40),tag:'edu-v0.33.0'},before=structuredClone(input);
 const payload=eduNativeDeploymentPayload(input);
 assert.equal(payload.deploymentId,input.baselineId);assert.equal(payload.project,input.projectId);assert.equal(payload.target,'production');assert.deepEqual(payload.files,files);
 assert.deepEqual(Object.keys(payload).sort(),['name','project','deploymentId','target','files','meta'].sort());
 assert.equal(payload.meta.native_release_tag,input.tag);assert.equal(payload.meta.source_revision,input.sourceRevision);assert.deepEqual(input,before);
 for(const change of [{baselineId:''},{baselineId:'other_live'},{projectId:'other_project'},{sourceRevision:'unknown'},{tag:'indust-v0.33.0'},{files:[]}])assert.throws(()=>eduNativeDeploymentPayload({...input,...change}),/Verified/);
});
