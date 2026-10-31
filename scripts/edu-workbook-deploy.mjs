// Keep current production files by digest and overlay only the public workbook.
// `prepare` is read-only remotely. `publish` is an explicit production mutation.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const command=process.argv[2]||'prepare';
if(!['prepare','publish','status'].includes(command))throw Error('Use prepare, publish or status.');
const root=process.cwd(),base=path.resolve('.runtime/edu-workbook-release'),stage=path.join(base,'deployment'),artifacts=path.resolve(process.env.RESISTOR_WORKBOOK_OUTPUT||path.join(base,'artifacts'));
if(!artifacts.startsWith(root+path.sep))throw Error('Artifacts must remain in checkout.');
await fs.mkdir(stage,{recursive:true});
const {projectId,orgId}=JSON.parse(await fs.readFile('platform/download-site/.vercel/project.json','utf8'));
// Read the existing authorized CLI session only; never persist or print credentials.
const {token}=JSON.parse(await fs.readFile(path.join(process.env.APPDATA,'com.vercel.cli/Data/auth.json'),'utf8'));
const headers={Authorization:'Bearer '+token};
const api=async(route,options={})=>{const r=await fetch('https://api.vercel.com'+route+(route.includes('?')?'&':'?')+'teamId='+orgId,{...options,headers:{...headers,...options.headers},signal:AbortSignal.timeout(60000)});const body=await r.json();if(!r.ok)throw Error(`Vercel ${r.status} ${body.error?.code||'request_failed'}`);return body;};
const sha1=b=>createHash('sha1').update(b).digest('hex'),sha256=b=>createHash('sha256').update(b).digest('hex');
const receiptFile=path.join(stage,'receipt.json'),payloadFile=path.join(stage,'payload.json'),reviewFile=path.join(stage,'review.json');
async function readReceipt(){try{return JSON.parse(await fs.readFile(receiptFile,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
if(command==='status'){
 const receipt=await readReceipt();if(!receipt)throw Error('No deployment receipt.');
 const d=await api('/v13/deployments/'+receipt.id),status={id:d.id,url:d.url,state:d.readyState,target:d.target,checked_at:new Date().toISOString()};
 await fs.writeFile(path.join(stage,'status.json'),JSON.stringify(status,null,2)+'\n');console.log(JSON.stringify(status));
}else if(command==='prepare'){
 if(await readReceipt())throw Error('A deployment receipt already exists. Inspect status before preparing another deployment.');
 const project=await api('/v9/projects/'+projectId),current=project.targets?.production;
 if(!current?.id)throw Error('Current production deployment missing.');
 const tree=await api('/v6/deployments/'+current.id+'/files');
 function flatten(nodes,prefix=''){return nodes.flatMap(n=>n.type==='directory'?flatten(n.children||[],prefix+n.name+'/'):[{file:prefix+n.name,sha:n.uid}]);}
 const previous=flatten(Array.isArray(tree)&&tree[0]?.name==='src'?tree[0].children:tree);
 if(previous.length<30||previous.some(f=>!/^[a-f0-9]{40}$/.test(f.sha)||/(^|\/)(\.\.|\.env[^/]*|\.git|\.runtime|node_modules)(\/|$)/.test(f.file)))throw Error('Unexpected production source tree.');
 const original=async(name)=>{const f=previous.find(f=>f.file===name);if(!f)throw Error('Production file missing: '+name);const r=await api('/v8/deployments/'+current.id+'/files/'+f.sha),b=Buffer.from(r.data,'base64');if(sha1(b)!==f.sha)throw Error('Production source digest mismatch: '+name);return b;};
 const manifest=JSON.parse(await fs.readFile(path.join(artifacts,'manifest.json'),'utf8'));
 if(manifest.edition!=='edu'||manifest.release_kind!=='offline-formula-workbook'||manifest.official_native_installer!==false||manifest.actual_engine_included!==false)throw Error('Unexpected release scope.');
 for(const [name,hash]of Object.entries(manifest.source_inputs)){if(sha256(await fs.readFile(name))!==hash)throw Error('Source changed since workbook build: '+name);}
 for(const [name,info]of Object.entries(manifest.files)){const file=path.resolve(artifacts,name);if(!file.startsWith(artifacts+path.sep))throw Error('Artifact path escapes release');const bytes=await fs.readFile(file);if(bytes.length!==info.bytes||sha256(bytes)!==info.sha256)throw Error('Artifact changed after build: '+name);}
 const releaseReceipt=JSON.parse(await fs.readFile(path.join(artifacts,'release-receipt.json'),'utf8')),archive=await fs.readFile(path.join(artifacts,'Resistor-Edu-Workbook.zip'));
 if(releaseReceipt.zip.sha256!==sha256(archive)||releaseReceipt.manifest_sha256!==sha256(await fs.readFile(path.join(artifacts,'manifest.json'))))throw Error('Archive/manifest release receipt mismatch.');
 const overlay=new Map();
 // Publish only the builder's explicit inventory, never arbitrary files left in
 // the staging directory (which might include a learner's exported JSON).
 for(const name of [...Object.keys(manifest.files),'manifest.json','release-receipt.json','Resistor-Edu-Workbook.zip']){const file=path.resolve(artifacts,name);if(!file.startsWith(artifacts+path.sep)||name.split('/').some(p=>p.startsWith('.')))throw Error('Unexpected artifact path');overlay.set('edu-workbook/'+name,await fs.readFile(file));}
 overlay.set('edu-practice.html',await fs.readFile(path.join(artifacts,'course-workbook.html')));overlay.delete('edu-workbook/course-workbook.html');
 const config=JSON.parse((await original('vercel.json')).toString('utf8'));
 const aliases=process.argv.includes('--alias-course')?['/edu-practice','/edu-practice/','/course','/course/']:['/edu-practice','/edu-practice/'];
 config.rewrites=(config.rewrites||[]).filter(r=>!aliases.includes(r.source));config.rewrites.unshift(...aliases.map(source=>({source,destination:'/edu-practice.html'})));
 const newHeaders=[{source:'/edu-workbook/(.*)',headers:[{key:'Cache-Control',value:'public, max-age=0, must-revalidate'}]},{source:'/edu-workbook/Resistor-Edu-Workbook.html',headers:[{key:'Content-Disposition',value:'attachment; filename="Resistor-Edu-Workbook.html"'}]}];
 config.headers=(config.headers||[]).filter(h=>!newHeaders.some(n=>n.source===h.source));config.headers.push(...newHeaders);
 overlay.set('vercel.json',Buffer.from(JSON.stringify(config,null,2)+'\n'));
 const entry='<section class="wb-section" data-edu-practice-entry><div class="wb-section-heading"><h2>Resistor Edu · 바로 시작하는 회로 실습</h2><a href="/edu-practice/">개선된 워크북 열기 →</a></div><p>예측·계산·비교·설명을 한 단계씩 안내합니다. 마지막 미션 이어하기, 입력 오류 안내, 학습 기록 저장을 지원합니다.</p><p><a class="button" href="/edu-practice/">웹에서 지금 실습</a> <a class="secondary-button" href="/edu-workbook/Resistor-Edu-Workbook.zip" download>Windows · Mac · Linux 공통 오프라인 워크북 ZIP</a></p><p class="wb-note">무료 수식 워크북 · 설치 없이 HTML 열기 · 전체 EDA 앱이나 새 정식 설치 파일이 아닙니다. 실제 시뮬레이션·DRC/LVS/PEX 엔진은 포함하지 않습니다. 기존 OS 설치 파일은 아래 제공 버전을 확인하세요.</p></section>';
 for(const file of ['index.html','download-edu.html']){let html=(await original(file)).toString('utf8');if(html.includes('data-edu-practice-entry'))html=html.replace(/<section\b[^>]*data-edu-practice-entry[^>]*>[\s\S]*?<\/section>/,entry);else if(html.includes('</main>'))html=html.replace('</main>',entry+'</main>');else throw Error('Expected main missing: '+file);overlay.set(file,Buffer.from(html));}
 const files=[...previous.filter(f=>!overlay.has(f.file)),...[...overlay].map(([file,body])=>({file,data:body.toString('base64'),encoding:'base64'}))];
 const payload={name:'resistor-downloads',project:projectId,target:'production',files,projectSettings:{framework:null,buildCommand:null,installCommand:null,outputDirectory:'.'},meta:{edition:'edu',source_revision:manifest.source_revision,release_kind:'public-formula-workbook',native_installer_updated:'false'}};
 const review={schema_version:1,edition:'edu',baseline_id:current.id,source_revision:manifest.source_revision,prepared_at:new Date().toISOString(),previous_files:previous.length,unchanged_files:previous.filter(f=>!overlay.has(f.file)).length,overlay:[...overlay].map(([file,body])=>({file,bytes:body.length,sha256:sha256(body)})),protected_files:previous.filter(f=>['edition-downloads.json','edu-updates.json','updates.json','downloads.json','download-industry.html'].includes(f.file)),public_url:'https://resistor.kr/edu-practice/',download_url:'https://resistor.kr/edu-workbook/Resistor-Edu-Workbook.zip',aliases,official_native_installer:false,payload_sha256:sha256(JSON.stringify(payload))};
 await fs.writeFile(payloadFile,JSON.stringify(payload));await fs.writeFile(reviewFile,JSON.stringify(review,null,2)+'\n');await fs.writeFile(path.join(stage,'baseline-files.json'),JSON.stringify(previous,null,2)+'\n');
 console.log(JSON.stringify({prepared:true,baseline:current.id,source_revision:manifest.source_revision,previous:previous.length,unchanged:review.unchanged_files,overlay:review.overlay.map(f=>f.file),review:reviewFile,production_changed:false},null,2));
}else{
 const prior=await readReceipt();if(prior){console.log(JSON.stringify({...prior,reused:true,note:'No duplicate deployment. Use status.'}));process.exit(0);}
 try{await fs.access(path.join(stage,'publish-intent.json'));throw Error('A previous publish attempt has no receipt. Reconcile its Vercel deployment by the saved fingerprint before retrying.');}catch(e){if(e.code!=='ENOENT')throw e;}
 const payload=JSON.parse(await fs.readFile(payloadFile,'utf8')),review=JSON.parse(await fs.readFile(reviewFile,'utf8'));
 if(sha256(JSON.stringify(payload))!==review.payload_sha256||payload.project!==projectId||payload.target!=='production')throw Error('Prepared deployment changed.');
 const current=await api('/v9/projects/'+projectId);if(current.targets?.production?.id!==review.baseline_id)throw Error('Production advanced. Prepare again against the new live files.');
 for(const f of payload.files.filter(f=>f.data&&Buffer.from(f.data,'base64').length>200000)){const body=Buffer.from(f.data,'base64'),sha=sha1(body);const r=await fetch('https://api.vercel.com/v2/files?teamId='+orgId,{method:'POST',headers:{...headers,'Content-Type':'application/octet-stream','x-vercel-digest':sha},body,signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('Artifact upload failed: '+r.status);f.sha=sha;f.size=body.length;delete f.data;delete f.encoding;}
 payload.meta.release_fingerprint=review.payload_sha256;
 await fs.writeFile(path.join(stage,'publish-intent.json'),JSON.stringify({project_id:projectId,release_fingerprint:review.payload_sha256,started_at:new Date().toISOString()},null,2)+'\n',{flag:'wx'});
 const d=await api('/v13/deployments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),receipt={id:d.id,url:d.url,baseline_id:review.baseline_id,source_revision:review.source_revision,created_at:new Date().toISOString(),payload_sha256:review.payload_sha256};
 await fs.writeFile(receiptFile,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
}
