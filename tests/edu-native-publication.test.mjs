import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash,generateKeyPairSync} from 'node:crypto';
import {verifiedEduNativeFiles,validateEduPublicationSource,flattenVercelSourceTree,mergeEduNativeManifest,eduNativeSiteOverlay} from '../scripts/edu-native-publication.mjs';
const definitions=JSON.parse(await readFile('apps/desktop/product-editions.json','utf8'));
const previous=JSON.parse(await readFile('platform/download-site/edition-downloads.json','utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const authority={server:'https://licenses.example.test',key_id:'test-key',public_key_fingerprint:'1'.repeat(64),checked_at:'2026-11-01T00:00:00Z'};
function fixture(change=()=>{}){
 const file='Resistor-Edu-0.32.0-windows-x64.exe',name=file.replace('.exe','.json'),base='https://github.com/Lead729726-cell/Resistor/releases/download/edu-v0.32.0/';
 const receipt={schema_version:1,edition:'edu',product_id:'resistor.edu',version:'0.32.0',platform:'windows',arch:'x64',file,bytes:2000000,sha256:'2'.repeat(64),source_revision:'a'.repeat(40),build_tools_revision:'b'.repeat(40),runtime_arch:'x64',requires_emulation:false,manufacturing_signoff:false,
  license_authority:{...authority},runtime:{platform:'win32',arch:'x64',manifest_sha256:'3'.repeat(64)},signing:{authenticode_signed:false,developer_id_signed:false,notarized:false,ad_hoc_signed:false},
  native_qa:{completed:true,edition:'edu',product_id:'resistor.edu',platform:'win32',arch:'x64',source_revision:'a'.repeat(40),desktop:{activation_checked:true,edition_title:'Resistor Edu',window_loaded:true,license_required_before_activation:true,engine_rpc_checked:true,lease_released:true},
   engine:{completed:true,checked_at:'2026-11-01T00:00:00Z',platform:'win32',arch:'x64',docker_used:false,public_pdk_available:true,physical_signoff:false,resource_scope:'packaged',runtime_manifest_sha256:'3'.repeat(64),source_sha256:Object.fromEntries(['workers/eda/server.py','workers/eda/native_entry.py','scripts/native-worker.mjs','scripts/native-engine-qa.mjs'].map(p=>[p,'4'.repeat(64)])),cases:[{name:'actual ideal-circuit OP: 0.9 V and 90 uA; functional verdict UNKNOWN',passed:true,run_id:'fixture-op',voltage_V:.9},{name:'GDSII and OASIS actual engine round trips',passed:true},{name:'actual SKY130 inverter model transient with signed currents',passed:true,run_id:'fixture-tran'}]}}
 };change(receipt);const bytes=Buffer.from(JSON.stringify(receipt)),release={tag_name:'edu-v0.32.0',html_url:'https://github.com/Lead729726-cell/Resistor/releases/tag/edu-v0.32.0',draft:false,prerelease:false,assets:[{name:file,browser_download_url:base+file,size:2000000,digest:'sha256:'+'2'.repeat(64)},{name,browser_download_url:base+name,size:bytes.length,digest:'sha256:'+sha(bytes)}]};
 return {release,receipts:{[name]:bytes},receipt};
}
test('only a matching licensed packaged-runtime receipt can produce new Edu metadata',()=>{
 const f=fixture(),v=verifiedEduNativeFiles(f.release,f.receipts,authority);assert.equal(v.files.length,1);assert.equal(v.files[0].release_tag,'edu-v0.32.0');assert.equal(v.files[0].target,'windows-x64');assert.equal(v.provenance[0].native_physical_tools_verified,false);
 for(const change of [r=>r.native_qa.completed=false,r=>r.native_qa.source_revision='c'.repeat(40),r=>r.native_qa.desktop.activation_checked=false,r=>r.native_qa.desktop.edition_title='Resistor Industry',r=>r.native_qa.desktop.lease_released=false,r=>r.native_qa.desktop.engine_rpc_checked=false,r=>r.native_qa.engine.native_physical_tools_verified=true,r=>r.native_qa.engine.resource_scope='source',r=>r.native_qa.engine.runtime_manifest_sha256='5'.repeat(64),r=>r.native_qa.engine.cases[0].voltage_V=1,r=>r.native_qa.engine.cases[1].passed=false,r=>r.native_qa.engine.cases.pop(),r=>delete r.native_qa.engine.source_sha256,r=>r.license_authority.public_key_fingerprint='6'.repeat(64),r=>r.runtime.arch='arm64',r=>r.manufacturing_signoff=true,r=>delete r.signing.notarized]){const bad=fixture(change);assert.throws(()=>verifiedEduNativeFiles(bad.release,bad.receipts,authority));}
});
test('public publication rejects draft, substituted tag, missing receipt and changed receipt bytes',()=>{
 for(const mutate of [f=>f.release.draft=true,f=>f.release.prerelease=true,f=>f.release.tag_name='indust-v0.32.0',f=>f.release.assets.pop(),f=>f.release.assets[0].browser_download_url='https://example.test/app.exe',f=>f.release.assets[1].digest='sha256:'+'0'.repeat(64),f=>f.receipts[Object.keys(f.receipts)[0]]=Buffer.from('{}')]){const f=fixture();mutate(f);assert.throws(()=>verifiedEduNativeFiles(f.release,f.receipts,authority));}
 const f=fixture();f.release.draft=true;assert.doesNotThrow(()=>verifiedEduNativeFiles(f.release,f.receipts,authority,{allowDraft:true}));
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
