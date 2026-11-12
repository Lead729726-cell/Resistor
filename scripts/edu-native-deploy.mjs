// Full native Edu publication. `prepare` reads public release files and current
// production; only the separately invoked `publish` command changes Vercel.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {assertLicenseReleaseReady} from './license-release-check.mjs';
import {verifiedEduNativeFiles,validateEduPublicationSource,eduNativeSiteOverlay,eduNativeDeploymentPayload,flattenVercelSourceTree} from './edu-native-publication.mjs';

const command=process.argv[2]??'prepare',tag=process.argv[3]??'edu-v0.32.0';
if(!['baseline','prepare','publish','status'].includes(command)||!/^edu-v\d+\.\d+\.\d+$/.test(tag))throw Error('Use edu-native-deploy.mjs baseline|prepare|publish|status edu-vX.Y.Z');
const root=process.cwd(),stage=path.resolve('.runtime/edu-native-publication',tag);
await fs.mkdir(stage,{recursive:true});
const json=async file=>JSON.parse(await fs.readFile(file,'utf8')),save=(name,value)=>fs.writeFile(path.join(stage,name),JSON.stringify(value,null,2)+'\n');
const digest=(bytes,type='sha256')=>createHash(type).update(bytes).digest('hex');
const {projectId,orgId}=await json('platform/download-site/.vercel/project.json');
if(!/^prj_[\w]+$/.test(projectId)||!/^team_[\w]+$/.test(orgId))throw Error('Unexpected Vercel project identity');
// The existing CLI credential is read only into memory, never copied into a
// staged payload, review, receipt, command line, or console output.
const authRoot=process.platform==='win32'?path.join(process.env.APPDATA,'com.vercel.cli/Data'):path.join(process.env.XDG_DATA_HOME??path.join(process.env.HOME,'.local/share'),'com.vercel.cli');
const {token}=await json(path.join(authRoot,'auth.json'));if(typeof token!=='string'||!token)throw Error('Authorized Vercel CLI session required');
const headers={Authorization:'Bearer '+token};
async function api(route,options={}){
 const response=await fetch('https://api.vercel.com'+route+(route.includes('?')?'&':'?')+'teamId='+orgId,{...options,headers:{...headers,...options.headers},signal:AbortSignal.timeout(60000)});
 const body=await response.json();if(!response.ok)throw Error(`Vercel ${response.status} ${body.error?.code??'request_failed'}`);return body;
}
async function publicBytes(url,maxBytes=1048576,timeout=60000){
 const response=await fetch(url,{signal:AbortSignal.timeout(timeout)});if(!response.ok)throw Error('Public artifact/source unavailable: '+response.status);
 let size=0;const chunks=[];for await(const chunk of response.body){size+=chunk.length;if(size>maxBytes)throw Error('Public metadata exceeds expected size');chunks.push(chunk);}return Buffer.concat(chunks);
}
const repo='https://api.github.com/repos/Lead729726-cell/Resistor';
async function readRelease(){return JSON.parse((await publicBytes(repo+'/releases/tags/'+tag)).toString('utf8'));}
async function latestRelease(){const release=JSON.parse((await publicBytes(repo+'/releases/latest')).toString('utf8'));if(release.tag_name===tag)throw Error('Edu-only publication must preserve GitHub shared Latest; restore the reviewed Latest pointer first');return {id:release.id,tag_name:release.tag_name,html_url:release.html_url};}
async function releaseSource(){
 let object=JSON.parse((await publicBytes(repo+'/git/ref/tags/'+tag)).toString('utf8')).object;
 for(let count=0;object?.type==='tag'&&count<3;count++)object=JSON.parse((await publicBytes(repo+'/git/tags/'+object.sha)).toString('utf8')).object;
 if(object?.type!=='commit'||!/^[a-f0-9]{40}$/.test(object.sha))throw Error('Release tag must resolve to a commit');return object.sha;
}
async function authorityReady(){return assertLicenseReleaseReady(root);}
const identity=release=>({id:release.id,tag_name:release.tag_name,html_url:release.html_url,draft:release.draft,prerelease:release.prerelease,assets:release.assets.map(({id,name,size,digest,browser_download_url})=>({id,name,size,digest,browser_download_url})).sort((a,b)=>a.name.localeCompare(b.name))});
async function verifyRelease(release,authority,{downloadInstallers=false}={}){
 const receipts={};
 for(const asset of release.assets??[]){if(/^Resistor-Edu-.*\.json$/.test(asset.name)){
  if(asset.browser_download_url!==`https://github.com/Lead729726-cell/Resistor/releases/download/${tag}/${asset.name}`)throw Error('Unexpected receipt download origin');
  receipts[asset.name]=await publicBytes(asset.browser_download_url);
 }}
 const verified=verifiedEduNativeFiles(release,receipts,authority);
 if(await releaseSource()!==verified.source_revision)throw Error('Release tag does not resolve to its installer source revision');
 const names=new Set(['product-edition.json','package.json','platform/licensing/public-config.json']);
 for(const bytes of Object.values(receipts)){const receipt=JSON.parse(bytes);for(const name of Object.keys(receipt.native_qa?.engine?.source_sha256??{})){
  if(!/^(workers\/eda|scripts)\/[\w./-]+$/.test(name)||name.split('/').includes('..'))throw Error('Unexpected engine source path');names.add(name);
 }}
 const sourceFiles={};for(const name of names)sourceFiles[name]=await publicBytes(`https://raw.githubusercontent.com/Lead729726-cell/Resistor/${verified.source_revision}/${name}`,16777216);
 validateEduPublicationSource(verified,receipts,sourceFiles);
 if(downloadInstallers)for(const file of verified.files){
  const response=await fetch(file.url,{signal:AbortSignal.timeout(600000)});if(!response.ok)throw Error('Native installer unavailable: '+response.status);
  let bytes=0;const hash=createHash('sha256');for await(const chunk of response.body){bytes+=chunk.length;if(bytes>file.bytes)throw Error('Native installer exceeds published size');hash.update(chunk);}
  if(bytes!==file.bytes||hash.digest('hex')!==file.sha256)throw Error('Public native installer differs from its receipt: '+file.target);
 }
 return {verified,receipts:Object.fromEntries(Object.entries(receipts).map(([name,bytes])=>[name,bytes.toString('base64')])),source_sha256:Object.fromEntries(Object.entries(sourceFiles).map(([name,bytes])=>[name,digest(bytes)]))};
}
async function optionalReceipt(){try{return await json(path.join(stage,'receipt.json'));}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function productionSource(){
 const current=(await api('/v9/projects/'+projectId)).targets?.production;if(!current?.id)throw Error('Current production deployment missing');
 const previous=flattenVercelSourceTree(await api('/v6/deployments/'+current.id+'/files'));
 async function original(name){const record=previous.find(f=>f.file===name);if(!record)throw Error('Production source missing: '+name);const body=await api('/v8/deployments/'+current.id+'/files/'+record.sha);if(typeof body.data!=='string')throw Error('Original production source unavailable');const bytes=Buffer.from(body.data,'base64');if(digest(bytes,'sha1')!==record.sha)throw Error('Original production SHA-1 mismatch: '+name);return bytes.toString('utf8');}
 const baseline={manifest:JSON.parse(await original('edition-downloads.json')),config:JSON.parse(await original('vercel.json')),home:await original('index.html'),eduPage:await original('download-edu.html'),eduUpdates:JSON.parse(await original('edu-updates.json')),learningAssets:JSON.parse(await original('learning-assets.json'))};
 return {current,previous,baseline,original};
}
if(command==='baseline'){
 const {current,previous,baseline,original}=await productionSource(),protectedFiles={};
 for(const name of ['download-industry.html','updates.json','downloads.json'])protectedFiles[name]={sha256:digest(await original(name)),source_sha1:previous.find(f=>f.file===name).sha};
 const preflight={schema_version:1,edition:'edu',checked_at:new Date().toISOString(),baseline_id:current.id,github_latest:await latestRelease(),previous_files:previous.length,protected_files:protectedFiles,industry_manifest_sha256:digest(JSON.stringify(baseline.manifest.editions.find(e=>e.edition==='indust'))),editions:baseline.manifest.editions.map(e=>({edition:e.edition,source_revision:e.source.revision,files:e.native_installer.files.map(f=>({target:f.target,version:f.version,source_revision:f.source_revision}))})),production_changed:false};
 await save('production-preflight.json',preflight);await save('production-source-baseline.json',{files:previous,...baseline});console.log(JSON.stringify(preflight,null,2));
}else if(command==='status'){
 const receipt=await optionalReceipt();if(!receipt)throw Error('No deployment receipt; production has not been changed by this command');
 const d=await api('/v13/deployments/'+receipt.id),status={id:d.id,url:d.url,state:d.readyState,target:d.target,checked_at:new Date().toISOString()};
 await save('status.json',status);console.log(JSON.stringify(status));
}else if(command==='prepare'){
 if(await optionalReceipt())throw Error('Deployment receipt already exists; inspect status before preparing again');
 try{await fs.access(path.join(stage,'publish-intent.json'));throw Error('Unreconciled publication intent exists; inspect Vercel before any retry');}catch(error){if(error.code!=='ENOENT')throw error;}
 const authority=await authorityReady(),release=await readRelease(),githubLatest=await latestRelease(),audit=await verifyRelease(release,authority,{downloadInstallers:true});
 const {current,previous,baseline}=await productionSource();
 const definitions=await json('apps/desktop/product-editions.json');
 const overlay=eduNativeSiteOverlay(baseline,audit.verified,definitions),files=[...previous.filter(f=>!overlay.has(f.file)),...[...overlay].map(([file,body])=>({file,data:Buffer.from(body).toString('base64'),encoding:'base64'}))];
 const payload=eduNativeDeploymentPayload({projectId,baselineId:current.id,files,sourceRevision:audit.verified.source_revision,tag});
 const protectedFiles=previous.filter(f=>['download-industry.html','updates.json','downloads.json'].includes(f.file));if(protectedFiles.length!==3)throw Error('Protected Industry/common feed source missing');
 const review={schema_version:1,edition:'edu',release_kind:'official-edu-native',tag,source_revision:audit.verified.source_revision,baseline_id:current.id,prepared_at:new Date().toISOString(),authority,github_latest:githubLatest,release:identity(release),verified:audit.verified,public_bytes_verified:true,source_sha256:audit.source_sha256,previous_files:previous.length,unchanged_files:previous.filter(f=>!overlay.has(f.file)).length,overlay:[...overlay].map(([file,body])=>({file,bytes:Buffer.byteLength(body),sha256:digest(body)})),protected_files:protectedFiles,industry_manifest_sha256:digest(JSON.stringify(baseline.manifest.editions.find(e=>e.edition==='indust'))),payload_sha256:digest(JSON.stringify(payload)),public_url:'https://resistor.kr/download/edu/'};
 await save('baseline-files.json',previous);await save('release-audit.json',audit);await save('payload.json',payload);await save('review.json',review);
 console.log(JSON.stringify({prepared:true,tag,source_revision:review.source_revision,verified_targets:audit.verified.files.map(f=>f.target),baseline_id:current.id,review:path.join(stage,'review.json'),production_changed:false},null,2));
}else{
 const prior=await optionalReceipt();if(prior){console.log(JSON.stringify({...prior,reused:true,note:'No duplicate deployment. Use status.'}));process.exit(0);}
 try{await fs.access(path.join(stage,'publish-intent.json'));throw Error('Previous publication attempt has no receipt. Reconcile the saved fingerprint with Vercel before retrying.');}catch(error){if(error.code!=='ENOENT')throw error;}
 const payload=await json(path.join(stage,'payload.json')),review=await json(path.join(stage,'review.json'));
 if(review.tag!==tag||review.public_bytes_verified!==true||digest(JSON.stringify(payload))!==review.payload_sha256||payload.project!==projectId||payload.target!=='production'||payload.deploymentId!==review.baseline_id||'projectSettings'in payload||'env'in payload||'build'in payload)throw Error('Prepared native publication changed, incomplete or overrides the live configuration');
 const authority=await authorityReady(),release=await readRelease();if(JSON.stringify(identity(release))!==JSON.stringify(review.release))throw Error('GitHub release changed after public-byte verification; prepare again');
 if(JSON.stringify(await latestRelease())!==JSON.stringify(review.github_latest))throw Error('GitHub shared Latest changed after preparation; review the release state again');
 const audit=await verifyRelease(release,authority);if(JSON.stringify(audit.source_sha256)!==JSON.stringify(review.source_sha256)||JSON.stringify(audit.verified)!==JSON.stringify(review.verified))throw Error('Source or installer provenance changed since preparation');
 const current=await api('/v9/projects/'+projectId);if(current.targets?.production?.id!==review.baseline_id)throw Error('Production advanced. Prepare against its current source to preserve newer changes.');
 for(const file of payload.files.filter(f=>f.data&&Buffer.from(f.data,'base64').length>200000)){
  const body=Buffer.from(file.data,'base64'),sha=digest(body,'sha1'),response=await fetch('https://api.vercel.com/v2/files?teamId='+orgId,{method:'POST',headers:{...headers,'Content-Type':'application/octet-stream','x-vercel-digest':sha},body,signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error('Vercel file upload failed: '+response.status);file.sha=sha;file.size=body.length;delete file.data;delete file.encoding;
 }
 payload.meta.release_fingerprint=review.payload_sha256;
 if((await api('/v9/projects/'+projectId)).targets?.production?.id!==review.baseline_id)throw Error('Production advanced during staging; no deployment was created');
 await fs.writeFile(path.join(stage,'publish-intent.json'),JSON.stringify({project_id:projectId,tag,release_fingerprint:review.payload_sha256,started_at:new Date().toISOString()},null,2)+'\n',{flag:'wx'});
 const result=await api('/v13/deployments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
 const receipt={id:result.id,url:result.url,tag,edition:'edu',source_revision:review.source_revision,baseline_id:review.baseline_id,payload_sha256:review.payload_sha256,created_at:new Date().toISOString(),production_smoke_completed:false};
 await save('receipt.json',receipt);console.log(JSON.stringify(receipt));
}
