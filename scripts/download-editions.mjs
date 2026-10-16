import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {targets} from './site/system-detection.mjs';

const repo='https://github.com/Lead729726-cell/Resistor';
const keys=['edu','indust'];
export const editionSlug=id=>id==='indust'?'industry':'edu';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function validateEditionDownloads(manifest,definitions){
  if(manifest.schema_version!==1||manifest.editions?.length!==2)throw Error('Expected exactly two edition download records.');
  for(const id of keys){
    const e=manifest.editions.find(e=>e.edition===id),d=definitions[id];
    if(!e||e.product_id!==d.id||e.name!==d.name||e.branch!==d.branch||!e.source||!/^[a-f0-9]{40}$/.test(e.source.revision)||e.source.url!==`${repo}/archive/${e.source.revision}.zip`||e.source.kind!=='source-zip'||e.source.product_edition_verified!==id)throw Error('Edition source identity or pinned URL mismatch: '+id);
    // Native publishing needs an actual edition receipt, hashes and public assets.
    // No historical common installer may silently become an Edu/Indust installer.
    const native=e.native_installer;
    if(native?.status==='unpublished'&&native.files?.length===0)continue;
    if(native?.status!=='published'||native.files?.length!==targets.length||new Set(native.files.map(f=>f.target)).size!==targets.length)throw Error('Dedicated native installer publication is not configured: '+id);
    for(const f of native.files){
      const extension=f.target.startsWith('windows')?'exe':f.target.startsWith('macos')?'zip':'tar.gz',name=`Resistor-${id==='edu'?'Edu':'Indust'}-${f.version}-${f.target}.${extension}`,base=`${repo}/releases/download/editions-v${f.version}/`;
      if(!targets.some(([key])=>key===f.target)||!/^\d+\.\d+\.\d+$/.test(f.version)||f.name!==name||f.product_id!==d.id||f.url!==base+name||f.receipt_url!==base+name.replace(/\.(exe|zip|tar\.gz)$/,'.json')||!Number.isSafeInteger(f.bytes)||f.bytes<1000000||!['sha256','receipt_sha256'].every(k=>/^[a-f0-9]{64}$/.test(f[k]))||!['source_revision','build_tools_revision'].every(k=>/^[a-f0-9]{40}$/.test(f[k]))||f.qa_completed!==true||f.requires_emulation!==(f.target==='windows-arm64')||f.runtime_arch!==(f.target==='windows-arm64'?'x64':f.target.endsWith('arm64')?'arm64':'x64'))throw Error('Native receipt identity or verified asset mismatch: '+id+' '+f.target);
    }
  }
  return manifest;
}
export async function loadEditionDownloads(root=process.cwd()){
  const definitions=JSON.parse(await readFile(path.join(root,'apps/desktop/product-editions.json'),'utf8'));
  return validateEditionDownloads(JSON.parse(await readFile(path.join(root,'platform/download-site/edition-downloads.json'),'utf8')),definitions);
}
export async function refreshEditionSources(root=process.cwd(),fetchImpl=fetch){
  const definitions=JSON.parse(await readFile(path.join(root,'apps/desktop/product-editions.json'),'utf8'));
  const previous=await loadEditionDownloads(root);
  const json=async url=>{const r=await fetchImpl(url,{headers:{Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Public edition metadata failed: '+r.status);return r.json();};
  const editions=await Promise.all(keys.map(async id=>{
    const d=definitions[id],branch=await json('https://api.github.com/repos/Lead729726-cell/Resistor/branches/'+encodeURIComponent(d.branch)),sha=branch.commit?.sha;
    if(!/^[a-f0-9]{40}$/.test(sha))throw Error('Invalid public revision: '+id);
    const identity=await json(`https://raw.githubusercontent.com/Lead729726-cell/Resistor/${sha}/product-edition.json`);
    if(identity.schema_version!==1||identity.edition!==id)throw Error('Public branch belongs to another edition: '+id);
    return {edition:id,product_id:d.id,name:d.name,branch:d.branch,source:{kind:'source-zip',revision:sha,url:`${repo}/archive/${sha}.zip`,product_edition_verified:id},native_installer:previous.editions.find(e=>e.edition===id).native_installer};
  }));
  const manifest=validateEditionDownloads({schema_version:1,checked_at:new Date().toISOString(),editions},definitions);
  await writeFile(path.join(root,'platform/download-site/edition-downloads.json'),JSON.stringify(manifest,null,2)+'\n');return manifest;
}
export function editionDownloadCards(manifest){
  return `<div class="wb-edition-downloads" aria-label="에디션별 다운로드">${manifest.editions.map(e=>{const edu=e.edition==='edu',slug=editionSlug(e.edition);return `<article data-edition="${e.edition}"><p class="wb-eyebrow">${edu?'LEARNING WORKBENCH':'ENGINEERING WORKBENCH'}</p><h3>${edu?'Resistor Edu':'Resistor Industry'}</h3><p>${edu?'수업·자율 학습·단계별 회로 실습과 학습 기록':'전문 회로·레이아웃 작업과 실제 시뮬레이션·검증 근거 검토'}</p><a class="button" data-edition-download="${e.edition}" href="/download/${slug}/">${edu?'Edu':'Industry'} 버전 다운로드 <span aria-hidden="true">→</span></a><p class="wb-note">${e.native_installer.status==='published'?'Windows x64·ARM64 / Mac / Linux 설치 파일':'소스 ZIP 제공 · 전용 설치 파일 준비 중'}</p></article>`;}).join('')}</div>`;
}
export function systemDetectionPanel(){
  return `<aside class="wb-system" data-system-detection aria-label="접속 시스템과 설치 파일 선택"><div><strong>접속 환경: <span data-system-label role="status">확인 중…</span></strong><p data-system-note>자동 확인이 어려우면 시스템을 직접 선택하세요.</p><small>OS·CPU 계열 확인은 이 브라우저에서만 처리합니다. 칩 모델·메모리는 수집하지 않습니다.</small></div><div><label>설치할 시스템<select aria-label="설치할 시스템"><option value="">자동 감지</option>${targets.map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></label><a class="button" data-system-action hidden></a></div></aside>`;
}
function platformCards(e){
  return `<div class="wb-edition-platforms">${targets.map(([target,label])=>{
    const file=e.native_installer.files.find(f=>f.target===target),[os,cpu]=label.split(' · ');
    return `<article data-platform-target="${target}"><span class="wb-recommended" data-recommended-label hidden>현재 시스템 추천</span><h3>${os}</h3><p>${cpu}</p>${file?`<a class="button" data-native-download href="/download/${editionSlug(e.edition)}/${target}">${e.edition==='edu'?'Edu':'Industry'} 설치 파일 ↓</a><p class="wb-file">${esc(file.name)}<br>${(file.bytes/1048576).toFixed(1)} MiB · v${file.version}</p><details><summary>해시·실행 검증</summary><code>${file.sha256}</code><p>이 에디션의 실제 앱 실행·ngspice 0.9V 분압·GDS 내보내기 확인. 제조 signoff는 별도입니다.</p><a href="${file.receipt_url}">빌드·검증 기록 JSON</a><a href="${repo}/tree/${file.source_revision}">설치 파일의 소스</a></details>`:'<span class="wb-pending">전용 설치 파일 준비 중</span>'}${target==='windows-arm64'?'<p class="wb-note">Windows 11 ARM64용 앱. 내장 Python·KLayout·ngspice는 x64 에뮬레이션을 사용합니다.</p>':''}</article>`;
  }).join('')}</div>`;
}
export async function prepareEditionPages(root,{site,head,footer,manifest}){
  const {version}=JSON.parse(await readFile(path.join(site,'downloads.json'),'utf8'));
  const descriptions={edu:['Resistor Edu','수업과 실습을 위한 교육용 작업대.','단계별 안내와 별도 학습 프로젝트·보고서를 사용합니다. 학습 체크는 실제 엔진 검증과 구분됩니다.'],indust:['Resistor Industry','설계와 검증을 위한 전문 작업대.','앱 이름은 Resistor Indust입니다. 회로·계층·레이아웃을 편집하고 실제 엔진의 출처·revision·최신성을 확인합니다.']};
  for(const e of manifest.editions){
    const slug=editionSlug(e.edition),[title,lead,description]=descriptions[e.edition],other=e.edition==='edu'?'industry':'edu';
    const published=e.native_installer.status==='published';
    const content=`<main class="wb-home wb-edition-page" data-download-edition="${e.edition}"><p class="wb-eyebrow">${e.edition==='edu'?'LEARNING':'ENGINEERING'} WORKBENCH</p><h1 class="wb-page-title">${title} 다운로드</h1><p class="wb-lead">${lead}</p><p>${description}</p>${systemDetectionPanel()}<section class="wb-section"><div class="wb-section-heading"><h2>운영체제별 전용 설치 파일</h2><span class="wb-note">${published?'에디션별 실제 앱·내장 엔진 실행 확인':'아직 미공개'}</span></div>${platformCards(e)}<details class="wb-install"><summary>설치 방법과 서명 상태</summary><p>Windows는 EXE를 실행합니다. Mac은 ZIP 전체를 풀고 설치 도우미를 사용하세요. Linux는 tar.gz를 풀고 install.sh를 실행합니다. 기본 편집·ngspice는 Docker 없이 실행됩니다.</p><p>Windows Authenticode·Mac Developer ID / Apple 공증은 미완료입니다. Mac 경고가 발생하면 출처와 SHA-256을 확인한 뒤 설치 안내를 확인하세요. 시스템 전체 보안 설정을 변경할 필요는 없습니다.</p><a href="${repo}/blob/main/docs/desktop-installation.md">자세한 설치·경고 해결 안내 →</a></details><p class="wb-note">DRC/LVS/PEX의 추가 도구와 deck은 별도로 준비합니다. 설치 파일 실행 검증은 제조 승인을 뜻하지 않습니다.</p></section><details class="wb-section wb-source-details"><summary>개발자용 에디션 소스 ZIP</summary><div class="wb-edition-source"><div><h2>${title} 소스 다운로드</h2><p>확인된 에디션의 소스 revision으로 고정합니다. 사용자 프로젝트와 API 키는 포함하지 않습니다.</p><a class="button" data-source-download="${e.edition}" href="/download/${slug}/source">${e.edition==='edu'?'Edu':'Industry'} 소스 ZIP 다운로드 ↓</a><p class="wb-file">ZIP · source code · commit ${e.source.revision.slice(0,12)}<br>앱 edition: ${esc(e.name)} · ${esc(e.product_id)}</p><a href="${repo}/tree/${e.source.revision}">이 소스와 변경 기록 보기 →</a></div><div><h2>소스 실행</h2><p>Node.js 24 설치 후 폴더에서 실행하세요.</p><pre><code>npm ci\nnpm run native:prepare\nnpm run dev:${e.edition}</code></pre><p class="wb-note">소스의 최신 revision은 설치 파일의 빌드 revision과 다를 수 있습니다. 각 설치 파일의 검증 기록에서 정확한 소스를 확인하세요.</p></div></div></details><section class="wb-section"><h2>시작하기와 저장 폴더</h2><p>${e.edition==='edu'?'Edu는 별도 저장 폴더·엔진을 사용하며 기존 Indust 프로젝트와 키를 복사하지 않습니다.':'기존 Indust 설계 저장 폴더를 보존합니다. 실제 실행 결과와 제조 signoff는 구분합니다.'}</p><div class="wb-utility-links"><a href="/tutorial/library/">실습·사용 가이드</a><a href="${repo}/blob/${e.source.revision}/docs/product-editions.md">에디션·작업 폴더 안내</a><a href="/download/${other}/">다른 에디션 다운로드</a><a href="/editions/">두 버전 비교</a><a href="/edition-downloads.json">파일·검증 정보 JSON</a><a href="/#common-downloads">기존 ${esc(version)} 공통 설치 파일</a></div></section></main>`;
    await writeFile(path.join(site,`download-${slug}.html`),head(title+' 다운로드',lead+' 에디션별 소스 ZIP과 설치 파일 준비 상태를 확인하세요.')+content+footer);
  }
  const configFile=path.join(site,'vercel.json'),config=JSON.parse(await readFile(configFile,'utf8'));
  const routes=manifest.editions.flatMap(e=>[...['','/'].map(s=>({source:`/download/${editionSlug(e.edition)}${s}`,destination:`/download-${editionSlug(e.edition)}.html`}))]);
  config.rewrites=config.rewrites.filter(r=>!routes.some(n=>n.source===r.source));config.rewrites.push(...routes);
  const sources=manifest.editions.flatMap(e=>[{source:`/download/${editionSlug(e.edition)}/source`,destination:e.source.url,permanent:false},...e.native_installer.files.map(f=>({source:`/download/${editionSlug(e.edition)}/${f.target}`,destination:f.url,permanent:false}))]);
  const aliases=['/download/indust','/download/indust/'].map(source=>({source,destination:'/download/industry/',permanent:false}));
  config.redirects=config.redirects.filter(r=>![...sources,...aliases].some(n=>n.source===r.source));config.redirects.push(...sources,...aliases);
  await writeFile(configFile,JSON.stringify(config,null,2)+'\n');
  const ignoreFile=path.join(site,'.vercelignore');let ignore=await readFile(ignoreFile,'utf8');for(const name of ['download-edu.html','download-industry.html','edition-downloads.json','system-detection.mjs'])if(!ignore.split('\n').includes('!'+name))ignore+='\n!'+name;await writeFile(ignoreFile,ignore.trimEnd()+'\n');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(!process.argv.includes('--refresh'))throw Error('Use --refresh to pin and verify public edition source revisions.');
  const manifest=await refreshEditionSources();console.log(JSON.stringify(manifest.editions.map(e=>({edition:e.edition,revision:e.source.revision,native_installer:e.native_installer.status}))));
}
