import {createHash,createPublicKey} from 'node:crypto';
import {validateEditionDownloads} from './download-editions.mjs';
import {validateEditionAsset,validateEditionReceipt} from '../apps/desktop/edition-updates.mjs';
import {compareVersions} from '../apps/desktop/update-feed.mjs';
import {assertEduDesktopEvidence} from './edu-native-options.mjs';

const repo='https://github.com/Lead729726-cell/Resistor',hash=b=>createHash('sha256').update(b).digest('hex');
const targets=['windows-x64','windows-arm64','macos-arm64','macos-x64','linux-x64'];
const platform={windows:'win32',macos:'darwin',linux:'linux'};
const validDate=s=>typeof s==='string'&&Number.isFinite(Date.parse(s));
const check=(condition,message)=>{if(!condition)throw Error(message);};
const sha256=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const sha1=s=>typeof s==='string'&&/^[a-f0-9]{40}$/i.test(s);
const checkedDate=s=>validDate(s)&&Date.parse(s)<=Date.now()+60000;

/** Validate evidence emitted by native signature verifiers. This does not sign
 * anything or convert a receipt into OS trust; public artifact bytes are still
 * independently hashed by the deployment preparer before these claims display.
 * Historic unsigned/ad-hoc receipts deliberately remain valid. */
export function validateEduSigningEvidence(receipt){
 const s=receipt?.signing,p=receipt?.signing_policy;
 check(s&&['authenticode_signed','developer_id_signed','notarized','ad_hoc_signed'].every(k=>typeof s[k]==='boolean'),'Code-signing scope must be explicit');
 const trusted=s.authenticode_signed||s.developer_id_signed||s.notarized;
 if(receipt.platform==='windows')check(!s.developer_id_signed&&!s.notarized&&!s.ad_hoc_signed,'Windows receipt contains Mac signing claims');
 else if(receipt.platform==='macos')check(!s.authenticode_signed&&!(s.ad_hoc_signed&&s.developer_id_signed)&&(!s.notarized||s.developer_id_signed),'Mac receipt contains contradictory signing claims');
 else check(receipt.platform==='linux'&&!trusted&&!s.ad_hoc_signed,'Unsupported OS signing claim');
 if(!trusted){
  check(!p||p.mode===(receipt.platform==='macos'?'adhoc':'none'),'Configured trusted signing has no verified evidence');
  check(s.hardened_runtime!==true&&s.stapled!==true&&s.verification!=='Valid'&&s.notarization_status!=='Accepted'&&s.gatekeeper_assessment!=='accepted'&&s.application?.authenticode_signed!==true&&!s.signed_installer_files?.some(e=>e.authenticode_signed===true),'Unsigned receipt contains trusted verification claims');
  return true;
 }
 check(s.schema_version===1&&sha256(s.artifact_sha256)&&s.artifact_sha256===receipt.sha256&&sha256(s.packaged_executable_sha256)&&s.packaged_executable_sha256===receipt.packaged_executable_sha256&&sha256(s.runtime_manifest_sha256)&&s.runtime_manifest_sha256===receipt.runtime?.manifest_sha256,'Trusted signature evidence is not bound to the published artifact, executable and runtime');
 check(checkedDate(s.checked_at),'Trusted signature verification timestamp is missing or in the future');
 if(receipt.platform==='windows'){
  check(p&&['store','azure'].includes(p.mode)&&typeof p.publisher==='string'&&p.publisher.trim().length>0,'Windows signing policy/publisher missing');
  if(p.mode==='store')check(sha1(p.thumbprint),'Configured Windows certificate fingerprint missing');
  else check(/^https:\/\/[a-z0-9-]+\.codesigning\.azure\.net\/?$/.test(p.endpoint??'')&&/^[a-zA-Z0-9-]{3,64}$/.test(p.account??'')&&/^[a-zA-Z0-9-]{1,100}$/.test(p.profile??''),'Azure signing profile identity missing');
  const verify=entry=>{
   check(entry?.authenticode_signed===true&&entry.verification==='Valid'&&entry.publisher===p.publisher&&sha1(entry.signer_thumbprint)&&sha1(entry.timestamp_thumbprint)&&checkedDate(entry.checked_at),'Windows signature lacks verified publisher, certificate, timestamp or trust evidence');
   if(p.mode==='store')check(entry.signer_thumbprint.toUpperCase()===p.thumbprint.toUpperCase(),'Windows signature belongs to a different certificate');
  };
  verify(s);verify(s.application);
  check(s.sha256===receipt.sha256,'Windows trust verification belongs to a different installer');
  check(s.application.sha256===receipt.packaged_executable_sha256,'Windows application signature belongs to a different executable');
  check(Array.isArray(s.signed_installer_files)&&s.signed_installer_files.length>=2&&s.signed_installer_files.length<=100,'Installer and uninstaller signing evidence missing');
  for(const entry of s.signed_installer_files){verify(entry);check(typeof entry.file==='string'&&!/[\\/\r\n\0]/.test(entry.file)&&sha256(entry.sha256),'Invalid signed installer file evidence');}
  const installer=s.signed_installer_files.filter(e=>e.file===receipt.file).at(-1),uninstaller=s.signed_installer_files.filter(e=>e.file===receipt.file.replace(/\.exe$/,'.__uninstaller.exe')).at(-1);
  check(installer?.sha256===receipt.sha256&&uninstaller&&sha256(uninstaller.sha256),'Signing evidence does not match the final installer and uninstaller');
 }else{
  check(p?.mode==='developer-id'&&sha1(p.identity)&&/^[A-Z0-9]{10}$/.test(p.team_id??''),'Developer ID policy identity missing');
  check(s.developer_id_signed===true&&s.ad_hoc_signed===false&&s.hardened_runtime===true&&s.apple_chain_verified===true&&s.team_id===p.team_id&&sha1(s.signer_thumbprint)&&s.signer_thumbprint.toUpperCase()===p.identity.toUpperCase(),'Developer ID certificate, Apple chain, team or hardened runtime evidence mismatch');
  check(typeof s.authority==='string'&&s.authority.startsWith('Developer ID Application:')&&typeof s.secure_timestamp==='string'&&s.secure_timestamp.trim().length>0&&!/^(none|not set)$/i.test(s.secure_timestamp.trim()),'Developer ID authority or secure timestamp evidence missing');
  check(s.notarized===true&&s.notarization_status==='Accepted'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(s.notarization_submission_id??'')&&s.stapled===true&&s.gatekeeper_assessment==='accepted'&&s.distribution_archive_verified===true,'Published Developer ID app requires accepted notarization, stapled ticket and verified final archive');
 }
 return true;
}

/** A publication gate over real receipts, not a producer of runtime PASS results. */
export function verifiedEduNativeFiles(release,receipts,authority,{allowDraft=false}={}){
 check(release&&/^edu-v\d+\.\d+\.\d+$/.test(release.tag_name),'Expected dedicated edu-v semantic release');
 const draft=allowDraft===true&&release.draft===true;
 check(draft||release.draft===false,'Draft native releases cannot replace public download links');
 let assetTag=release.tag_name;
 if(draft){
  check(Number.isSafeInteger(release.id)&&release.id>0&&/^[a-f0-9]{40}$/.test(release.target_commitish),'Draft audit requires a release ID and exact target commit SHA');
  if(release.html_url!==`${repo}/releases/tag/${release.tag_name}`){
   const prefix=`${repo}/releases/tag/`,temporary=typeof release.html_url==='string'&&release.html_url.startsWith(prefix)?release.html_url.slice(prefix.length):'';
   check(/^untagged-[a-f0-9]{20}$/.test(temporary),'Official temporary draft release identity missing');assetTag=temporary;
  }
 }
 check(release.html_url===`${repo}/releases/tag/${assetTag}`&&Array.isArray(release.assets),'Official Edu release identity missing');
 check(release.prerelease===false,'Prerelease native releases cannot replace stable download links');
 check(authority&&/^https:\/\//.test(authority.server)&&/^[a-f0-9]{64}$/.test(authority.public_key_fingerprint)&&typeof authority.key_id==='string'&&!!authority.key_id&&validDate(authority.checked_at),'Live license authority verification missing');
 const version=release.tag_name.slice(5),files=[],provenance=[];
 const installers=release.assets.filter(a=>/^Resistor-.*\.(exe|zip|tar\.gz)$/.test(a?.name||''));
 check(installers.length>0&&installers.length<=targets.length,'No verified Edu installers in release');
 for(const asset of installers){
  const target=targets.find(t=>asset.name===`Resistor-Edu-${version}-${t}.`+(t.startsWith('windows')?'exe':t.startsWith('macos')?'zip':'tar.gz'));
  check(target,'Unexpected installer asset in dedicated Edu release');
  check(!files.some(f=>f.target===target),'Duplicate native installer target');
  check(asset.browser_download_url===`${repo}/releases/download/${assetTag}/${asset.name}`,'Installer URL does not belong to the verified release');
  // Temporary GitHub draft URLs are authenticated audit locations only. Validate
  // the same immutable file identity against the stable updater's strict rules.
  const checked=validateEditionAsset(draft?{...asset,browser_download_url:`${repo}/releases/download/${release.tag_name}/${asset.name}`}:asset,release.tag_name,target,'edu'),name=asset.name.replace(/\.(exe|zip|tar\.gz)$/,'.json');
  const matches=release.assets.filter(a=>a.name===name);check(matches.length===1,'Native installer requires exactly one paired receipt');
  const meta=matches[0],bytes=receipts[name];
  check(bytes&&meta.browser_download_url===`${repo}/releases/download/${assetTag}/${name}`&&Number.isSafeInteger(meta.size)&&meta.size<1048576&&bytes.length===meta.size&&meta.digest==='sha256:'+hash(bytes),'Receipt bytes/digest/URL mismatch');
  const receipt=JSON.parse(Buffer.from(bytes).toString('utf8'));
  const update={edition:'edu',product_id:'resistor.edu',version,asset:checked};validateEditionReceipt(receipt,update);
  if(draft)check(receipt.source_revision===release.target_commitish,'Draft target commit differs from packaged source');
  const qa=receipt.native_qa,engine=qa.engine,desktop=qa.desktop,license=receipt.license_authority,runtime=receipt.runtime;
  check(qa.product_id==='resistor.edu'&&qa.platform===platform[receipt.platform]&&qa.arch===receipt.arch,'Desktop QA must match installer OS/CPU');
  check(desktop?.activation_checked===true&&desktop.edition_title==='Resistor Edu'&&desktop.window_loaded===true&&desktop.license_required_before_activation===true&&desktop.engine_rpc_checked===true&&desktop.lease_released===true,'Actual licensed Edu desktop verification is incomplete');
  check(runtime&&/^[a-f0-9]{64}$/.test(runtime.manifest_sha256)&&runtime.platform===platform[receipt.platform]&&runtime.arch===receipt.arch,'Packaged runtime provenance missing');
  check(/^[a-f0-9]{64}$/.test(receipt.packaged_executable_sha256),'Packaged executable digest missing');
  assertEduDesktopEvidence(desktop,{edition:'edu',product_id:'resistor.edu',version,target,source_revision:receipt.source_revision,packaged_executable_sha256:receipt.packaged_executable_sha256,runtime_manifest_sha256:runtime.manifest_sha256});
  check(engine?.completed===true&&engine.resource_scope==='packaged'&&engine.runtime_manifest_sha256===runtime.manifest_sha256&&engine.platform===runtime.platform&&engine.arch===runtime.arch&&validDate(engine.checked_at),'Engine QA must run against the packaged target runtime');
  check(engine.docker_used===false&&engine.public_pdk_available===true&&engine.physical_signoff===false,'Native engine/PDK/signoff scope not verified');
  check(Array.isArray(engine.cases)&&engine.cases.length>0&&engine.cases.every(c=>typeof c.name==='string'&&c.passed===true),'Packaged engine QA contains missing or failed cases');
  const op=engine.cases.find(c=>c.name==='actual ideal-circuit OP: 0.9 V and 90 uA; functional verdict UNKNOWN'),transient=engine.cases.find(c=>c.name==='actual SKY130 inverter model transient with signed currents');
  check(op&&typeof op.run_id==='string'&&Math.abs(op.voltage_V-.9)<1e-8&&transient&&typeof transient.run_id==='string'&&engine.cases.some(c=>c.name==='GDSII and OASIS actual engine round trips'),'Actual divider, GDS/OASIS and SKY130 transient evidence missing');
  if(engine.native_physical_tools_verified===true)check(['actual native verification.run_drc','actual native verification.run_lvs','actual native extraction.run_pex','actual native post-layout RC transient'].every(name=>engine.cases.some(c=>c.name===name&&typeof c.run_id==='string'&&c.run_id)),'Physical tool claim requires each actual DRC/LVS/PEX/post-layout run');
  check(engine.source_sha256&&['workers/eda/server.py','workers/eda/native_entry.py','scripts/native-worker.mjs','scripts/native-engine-qa.mjs'].every(p=>/^[a-f0-9]{64}$/.test(engine.source_sha256[p])),'Packaged engine source hashes missing');
  check(license&&license.server===authority.server&&license.key_id===authority.key_id&&license.public_key_fingerprint===authority.public_key_fingerprint&&validDate(license.checked_at),'Packaged license authority differs from the live verified authority');
  check(receipt.runtime_arch===receipt.arch&&receipt.requires_emulation===false,'This release requires native runtime CPU verification');
  check(receipt.manufacturing_signoff===false,'Native execution must not claim manufacturing signoff');
  validateEduSigningEvidence(receipt);const signing=receipt.signing;
  files.push({target,name:asset.name,url:asset.browser_download_url,receipt_url:meta.browser_download_url,product_id:'resistor.edu',version,release_tag:release.tag_name,bytes:checked.bytes,sha256:checked.sha256,receipt_sha256:hash(bytes),source_revision:receipt.source_revision,build_tools_revision:receipt.build_tools_revision,runtime_arch:receipt.runtime_arch,requires_emulation:false,qa_completed:true,minimum_os:target.startsWith('macos')?'15.0':target==='windows-x64'?'10.0':null});
  provenance.push({target,source_revision:receipt.source_revision,build_tools_revision:receipt.build_tools_revision,runtime_manifest_sha256:runtime.manifest_sha256,engine_checked_at:engine.checked_at,license_authority:license,signing,native_physical_tools_verified:engine.native_physical_tools_verified===true,manufacturing_signoff:false});
 }
 check(new Set(files.map(f=>f.source_revision)).size===1,'New native targets must share the exact Edu source revision');
 return {version,tag:release.tag_name,source_revision:files[0].source_revision,files,provenance,...(draft?{draft:true,publicly_downloadable:false,draft_release_id:release.id}:{})};
}

/** Bind receipt claims to the exact publicly committed source, including its authority. */
export function validateEduPublicationSource(verified,receipts,sourceFiles){
 const read=name=>{check(sourceFiles[name],'Required release source missing: '+name);return Buffer.from(sourceFiles[name]);};
 const marker=JSON.parse(read('product-edition.json')),pkg=JSON.parse(read('package.json')),config=JSON.parse(read('platform/licensing/public-config.json'));
 check(marker.schema_version===1&&marker.edition==='edu'&&pkg.version===verified.version,'Committed release must identify this Edu version');
 check(config.schema_version===1&&config.required===true&&config.deployment_status==='production_ready','Committed release has no production license policy');
 for(const file of verified.files){
  const receipt=JSON.parse(Buffer.from(receipts[file.name.replace(/\.(exe|zip|tar\.gz)$/,'.json')]).toString('utf8'));
  for(const [name,digest]of Object.entries(receipt.native_qa.engine.source_sha256))check(hash(read(name))===digest,'Packaged engine differs from committed release source: '+name);
  const authority=receipt.license_authority,key=config.public_keys?.[authority.key_id];
  check(typeof key==='string'&&!key.includes('PRIVATE KEY'),'Committed authority key missing');
  const publicKey=createPublicKey(key);
  check(publicKey.asymmetricKeyType==='ed25519'&&new URL(config.server_url).origin===authority.server&&hash(publicKey.export({type:'spki',format:'der'}))===authority.public_key_fingerprint,'Committed license authority differs from the packaged receipt');
 }
 return true;
}

export function flattenVercelSourceTree(tree){
 const walk=(nodes,prefix='')=>{check(Array.isArray(nodes),'Unexpected Vercel source tree');return nodes.flatMap(n=>{check(typeof n.name==='string'&&n.name.length>0&&!n.name.includes('/')&&!n.name.includes('\\'),'Invalid production file name');return n.type==='directory'?walk(n.children??[],prefix+n.name+'/'):[{file:prefix+n.name,sha:n.uid}];});};
 // Vercel returns source and build-output wrappers together for deployments
 // containing serverless functions. Only src is the next deployment's input.
 const wrapped=Array.isArray(tree)&&tree.some(n=>n.name==='src'&&n.type==='directory');
 if(wrapped)check(tree.filter(n=>n.name==='src').length===1&&tree.every(n=>['src','out'].includes(n.name)&&n.type==='directory'),'Unexpected Vercel source/output wrappers');
 const files=walk(wrapped?tree.find(n=>n.name==='src').children:tree);
 check(files.length>=30&&new Set(files.map(f=>f.file)).size===files.length&&files.every(f=>/^[a-f0-9]{40}$/.test(f.sha)&&!/(^|\/)(\.\.?|\.env[^/]*|\.git|\.runtime|node_modules)(\/|$)/.test(f.file)),'Unexpected production source inventory');
 return files;
}

export function mergeEduNativeManifest(previous,verified,definitions,now=new Date().toISOString()){
 validateEditionDownloads(previous,definitions);
 check(verified?.files?.length>0&&/^edu-v\d+\.\d+\.\d+$/.test(verified.tag),'Verified native files required');
 check(verified.draft!==true,'Draft audit cannot replace public download links');
 const manifest=structuredClone(previous),edu=manifest.editions.find(e=>e.edition==='edu'),industry=JSON.stringify(manifest.editions.find(e=>e.edition==='indust'));
 for(const file of verified.files){const i=edu.native_installer.files.findIndex(f=>f.target===file.target);check(i>=0,'Unknown target in current download inventory');const old=edu.native_installer.files[i];check(compareVersions(file.version,old.version)>0||file.version===old.version&&file.sha256===old.sha256,'Refusing native installer downgrade or same-version replacement');edu.native_installer.files[i]=structuredClone(file);}
 edu.source={kind:'source-zip',revision:verified.source_revision,url:`${repo}/archive/${verified.source_revision}.zip`,product_edition_verified:'edu'};
 manifest.checked_at=now;validateEditionDownloads(manifest,definitions);
 check(JSON.stringify(manifest.editions.find(e=>e.edition==='indust'))===industry,'Industry metadata changed');return manifest;
}

const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function eduNativeSiteOverlay({manifest,config,home,eduPage,eduUpdates,learningAssets},verified,definitions){
 const updated=mergeEduNativeManifest(manifest,verified,definitions),nextConfig=structuredClone(config),edu=updated.editions.find(e=>e.edition==='edu');
 const replacements=[{source:'/download/edu/source',destination:edu.source.url,permanent:false},...verified.files.map(f=>({source:'/download/edu/'+f.target,destination:f.url,permanent:false}))];
 nextConfig.redirects=(nextConfig.redirects||[]).filter(r=>!replacements.some(n=>n.source===r.source));nextConfig.redirects.push(...replacements);
 let page=eduPage;
 for(const file of verified.files){const detail=verified.provenance.find(p=>p.target===file.target),heading={windows:'Windows',macos:'macOS',linux:'Linux'}[file.target.split('-')[0]],cpu=file.target.split('-')[1];
  const card=`<article data-platform-target="${file.target}"><span class="wb-recommended" data-recommended-label hidden>현재 시스템 추천</span><h3>${heading}</h3><p>${cpu}</p><a class="button" data-native-download href="/download/edu/${file.target}">Edu 전체 앱 설치 파일 ↓</a><p class="wb-file">${esc(file.name)}<br>${(file.bytes/1048576).toFixed(1)} MiB · v${file.version}</p><details><summary>해시·실행 검증</summary><code>${file.sha256}</code><p>실제 Edu 앱 인증·창 열기와 내장 ngspice·KLayout·SKY130 실행을 확인한 파일입니다. 제조 signoff는 포함하지 않습니다.</p><p>추가 Magic/Netgen 실행 검증: ${detail.native_physical_tools_verified?'이 대상에서 실제 실행 확인':'별도 설치·검증 필요'}. Windows 서명 ${detail.signing.authenticode_signed?'완료':'미완료'} · Apple 공증 ${detail.signing.notarized?'완료':'미완료'}.</p><a href="${file.receipt_url}">빌드·런타임·인증 검증 기록 JSON</a><a href="${repo}/tree/${file.source_revision}">정확한 설치 파일 소스</a></details></article>`;
  const pattern=new RegExp(`<article\\b[^>]*data-platform-target="${file.target}"[^>]*>[\\s\\S]*?<\\/article>`);check(pattern.test(page),'Expected existing OS download card missing: '+file.target);page=page.replace(pattern,()=>card);
 }
 // Change only the Edu source display; target-specific older receipt SHAs remain.
 const oldSource=manifest.editions.find(e=>e.edition==='edu').source.revision;
 page=page.replace(/<details\b[^>]*\bwb-source-details\b[^>]*>[\s\S]*?<\/details>/,block=>block.replaceAll(oldSource,edu.source.revision).replaceAll(oldSource.slice(0,12),edu.source.revision.slice(0,12)));
 const notice=`<section class="wb-section" data-edu-native-release><div class="wb-section-heading"><h2>Resistor Edu v${verified.version} · 전체 앱 업데이트</h2><a href="/download/edu/">Edu 설치 파일 보기 →</a></div><p>이번 새 버전 확인 대상: ${verified.files.map(f=>esc(f.target)).join(' · ')}. 다른 OS는 카드에 표시된 기존 검증 버전을 제공합니다.</p><p>회로도·레이아웃·시뮬레이션과 단계별 학습이 포함된 Edu 전체 앱입니다. 유효한 Edu 시리얼이 필요하며, 강의 구매에는 Industry 사용권이 포함되지 않습니다.</p><p class="wb-note">파일별 소스·CPU·엔진·인증 검증은 각 빌드 기록에서 확인하세요. DRC/LVS/PEX 도구 제공·실행 범위와 제조 승인은 별도입니다.</p></section>`;
 const insert=html=>html.includes('data-edu-native-release')?html.replace(/<section\b[^>]*data-edu-native-release[^>]*>[\s\S]*?<\/section>/,()=>notice):html.includes('</main>')?html.replace('</main>',notice+'</main>'):(()=>{throw Error('Expected main missing in publication page');})();
 const guide=structuredClone(eduUpdates);guide.source_revision=edu.source.revision;guide.native_installer_rebuilt=true;guide.native_installer_rebuilt_scope='verified-native-targets:'+verified.files.map(f=>f.target).join(',');
 guide.published_native_installers={...guide.published_native_installers,versions:[...new Set(edu.native_installer.files.map(f=>f.version))],matches_guide_source:edu.native_installer.files.every(f=>f.source_revision===guide.feature_source_revision),installed_app_verification:edu.native_installer.files.every(f=>f.qa_completed===true),matches_latest_source:edu.native_installer.files.every(f=>f.source_revision===edu.source.revision)};
 guide.native_release={tag:verified.tag,source_revision:verified.source_revision,verified_targets:verified.files.map(f=>f.target),provenance:verified.provenance,website_executes_eda_engine:false};
 const overlay=new Map([['edition-downloads.json',JSON.stringify(updated,null,2)+'\n'],['vercel.json',JSON.stringify(nextConfig,null,2)+'\n'],['index.html',insert(home)],['download-edu.html',insert(page)],['edu-updates.json',JSON.stringify(guide,null,2)+'\n']]);
 // Older isolated callers may omit this manifest; productionSource requires it.
 // Preserve entry order, metadata and untouched historical hashes, including stale ones.
 if(learningAssets!==undefined){
  check(learningAssets&&Array.isArray(learningAssets.files),'Production learning manifest files required');
  const next=structuredClone(learningAssets),seen=new Set();
  for(const entry of next.files){
   check(entry&&typeof entry.file==='string'&&!seen.has(entry.file),'Invalid or duplicate learning manifest entry');seen.add(entry.file);
   if(overlay.has(entry.file)){const body=overlay.get(entry.file);entry.bytes=Buffer.byteLength(body);entry.sha256=hash(body);}
  }
  overlay.set('learning-assets.json',JSON.stringify(next,null,2)+'\n');
 }
 return overlay;
}

/** Keep the selected live deployment's function settings and environment. */
export function eduNativeDeploymentPayload({projectId,baselineId,files,sourceRevision,tag}){
 check(/^prj_[\w]+$/.test(projectId)&&/^dpl_[\w]+$/.test(baselineId),'Verified production identity required');
 check(sha1(sourceRevision)&&/^edu-v\d+\.\d+\.\d+$/.test(tag)&&Array.isArray(files)&&files.length>0,'Verified native publication inputs required');
 return {name:'resistor-downloads',project:projectId,deploymentId:baselineId,target:'production',files,meta:{edition:'edu',source_revision:sourceRevision,release_kind:'official-edu-native',native_release_tag:tag}};
}
