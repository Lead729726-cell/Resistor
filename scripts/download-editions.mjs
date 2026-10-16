import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

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
    if(e.native_installer?.status!=='unpublished'||e.native_installer.files?.length!==0)throw Error('Dedicated native installer publication is not configured: '+id);
  }
  return manifest;
}
export async function loadEditionDownloads(root=process.cwd()){
  const definitions=JSON.parse(await readFile(path.join(root,'apps/desktop/product-editions.json'),'utf8'));
  return validateEditionDownloads(JSON.parse(await readFile(path.join(root,'platform/download-site/edition-downloads.json'),'utf8')),definitions);
}
export async function refreshEditionSources(root=process.cwd(),fetchImpl=fetch){
  const definitions=JSON.parse(await readFile(path.join(root,'apps/desktop/product-editions.json'),'utf8'));
  const json=async url=>{const r=await fetchImpl(url,{headers:{Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Public edition metadata failed: '+r.status);return r.json();};
  const editions=await Promise.all(keys.map(async id=>{
    const d=definitions[id],branch=await json('https://api.github.com/repos/Lead729726-cell/Resistor/branches/'+encodeURIComponent(d.branch)),sha=branch.commit?.sha;
    if(!/^[a-f0-9]{40}$/.test(sha))throw Error('Invalid public revision: '+id);
    const identity=await json(`https://raw.githubusercontent.com/Lead729726-cell/Resistor/${sha}/product-edition.json`);
    if(identity.schema_version!==1||identity.edition!==id)throw Error('Public branch belongs to another edition: '+id);
    return {edition:id,product_id:d.id,name:d.name,branch:d.branch,source:{kind:'source-zip',revision:sha,url:`${repo}/archive/${sha}.zip`,product_edition_verified:id},native_installer:{status:'unpublished',files:[]}};
  }));
  const manifest=validateEditionDownloads({schema_version:1,checked_at:new Date().toISOString(),editions},definitions);
  await writeFile(path.join(root,'platform/download-site/edition-downloads.json'),JSON.stringify(manifest,null,2)+'\n');return manifest;
}
export function editionDownloadCards(manifest){
  return `<div class="wb-edition-downloads" aria-label="에디션별 다운로드">${manifest.editions.map(e=>{const edu=e.edition==='edu',slug=editionSlug(e.edition);return `<article data-edition="${e.edition}"><p class="wb-eyebrow">${edu?'LEARNING WORKBENCH':'ENGINEERING WORKBENCH'}</p><h3>${edu?'Resistor Edu':'Resistor Industry'}</h3><p>${edu?'수업·자율 학습·단계별 회로 실습과 학습 기록':'전문 회로·레이아웃 작업과 실제 시뮬레이션·검증 근거 검토'}</p><a class="button" data-edition-download="${e.edition}" href="/download/${slug}/">${edu?'Edu':'Industry'} 버전 다운로드 <span aria-hidden="true">→</span></a><p class="wb-note">소스 ZIP 제공 · 전용 설치 파일 준비 중</p></article>`;}).join('')}</div>`;
}
export async function prepareEditionPages(root,{site,head,footer,manifest}){
  const {version}=JSON.parse(await readFile(path.join(site,'downloads.json'),'utf8'));
  const descriptions={edu:['Resistor Edu','수업과 실습을 위한 교육용 작업대.','단계별 안내와 별도 학습 프로젝트·보고서를 사용합니다. 학습 체크는 실제 엔진 검증과 구분됩니다.'],indust:['Resistor Industry','설계와 검증을 위한 전문 작업대.','앱 이름은 Resistor Indust입니다. 회로·계층·레이아웃을 편집하고 실제 엔진의 출처·revision·최신성을 확인합니다.']};
  for(const e of manifest.editions){
    const slug=editionSlug(e.edition),[title,lead,description]=descriptions[e.edition],other=e.edition==='edu'?'industry':'edu';
    const content=`<main class="wb-home wb-edition-page" data-download-edition="${e.edition}"><p class="wb-eyebrow">${e.edition==='edu'?'LEARNING':'ENGINEERING'} WORKBENCH</p><h1 class="wb-page-title">${title} 다운로드</h1><p class="wb-lead">${lead}</p><p>${description}</p><div class="wb-edition-status"><strong>지금 제공: 에디션 전용 소스 ZIP</strong><p>다운로드한 소스를 Node.js 24에서 실행합니다. Windows·Mac·Linux용 전용 설치 파일은 아직 공개되지 않았습니다.</p></div><section class="wb-edition-source"><div><h2>${title} 소스 다운로드</h2><p>확인된 에디션의 소스 revision으로 고정합니다. 사용자 프로젝트와 API 키는 포함하지 않습니다.</p><a class="button" data-source-download="${e.edition}" href="/download/${slug}/source">${e.edition==='edu'?'Edu':'Industry'} 소스 ZIP 다운로드 <span aria-hidden="true">↓</span></a><p class="wb-file">ZIP · source code · commit ${e.source.revision.slice(0,12)}<br>앱 edition: ${esc(e.name)} · ${esc(e.product_id)}</p><a href="${repo}/tree/${e.source.revision}">이 소스와 변경 기록 보기 →</a></div><div><h2>압축을 푼 뒤 실행</h2><p>Node.js 24 설치 후 압축을 푼 폴더에서 터미널을 열고 순서대로 실행하세요.</p><pre><code>npm ci\nnpm run native:prepare\nnpm run dev:${e.edition}</code></pre><p class="wb-note">최초 실행에는 공개 의존성·엔진 다운로드를 위한 인터넷이 필요합니다. 기본 편집·ngspice는 Docker 없이 사용하며, DRC/LVS/PEX의 추가 도구와 deck은 별도로 준비합니다.</p></div></section><section class="wb-section"><div class="wb-section-heading"><h2>운영체제별 전용 설치 파일</h2><span class="wb-note">아직 미공개</span></div><div class="wb-edition-platforms">${[['Windows','x64'],['macOS','Apple Silicon · M1 이후'],['macOS','Intel · x64'],['Linux','x64']].map(([os,cpu])=>`<article><h3>${os}</h3><p>${cpu}</p><span class="wb-pending">전용 설치 파일 준비 중</span></article>`).join('')}</div><p class="wb-note">기존 공통판을 ${title} 전용 설치 파일로 바꿔 표시하지 않습니다. 바로 설치할 공통판이 필요하면 아래 링크를 사용하세요.</p><a href="/#common-downloads">기존 ${esc(version)} 공통 설치 파일 →</a></section><section class="wb-section"><h2>시작하기와 저장 폴더</h2><p>${e.edition==='edu'?'Edu는 별도 저장 폴더·엔진을 사용하며 기존 Indust 프로젝트와 키를 복사하지 않습니다.':'기존 Indust 설계 저장 폴더를 보존합니다. 실제 실행 결과와 제조 signoff는 구분합니다.'}</p><div class="wb-utility-links"><a href="/tutorial/library/">실습·사용 가이드</a><a href="${repo}/blob/${e.source.revision}/docs/product-editions.md">에디션·작업 폴더 안내</a><a href="/download/${other}/">다른 에디션 다운로드</a><a href="/editions/">두 버전 비교</a><a href="/edition-downloads.json">에디션 소스 정보 JSON</a></div></section></main>`;
    await writeFile(path.join(site,`download-${slug}.html`),head(title+' 다운로드',lead+' 에디션별 소스 ZIP과 설치 파일 준비 상태를 확인하세요.')+content+footer);
  }
  const configFile=path.join(site,'vercel.json'),config=JSON.parse(await readFile(configFile,'utf8'));
  const routes=manifest.editions.flatMap(e=>[...['','/'].map(s=>({source:`/download/${editionSlug(e.edition)}${s}`,destination:`/download-${editionSlug(e.edition)}.html`}))]);
  config.rewrites=config.rewrites.filter(r=>!routes.some(n=>n.source===r.source));config.rewrites.push(...routes);
  const sources=manifest.editions.map(e=>({source:`/download/${editionSlug(e.edition)}/source`,destination:e.source.url,permanent:false}));
  const aliases=['/download/indust','/download/indust/'].map(source=>({source,destination:'/download/industry/',permanent:false}));
  config.redirects=config.redirects.filter(r=>![...sources,...aliases].some(n=>n.source===r.source));config.redirects.push(...sources,...aliases);
  await writeFile(configFile,JSON.stringify(config,null,2)+'\n');
  const ignoreFile=path.join(site,'.vercelignore');let ignore=await readFile(ignoreFile,'utf8');for(const name of ['download-edu.html','download-industry.html','edition-downloads.json'])if(!ignore.split('\n').includes('!'+name))ignore+='\n!'+name;await writeFile(ignoreFile,ignore.trimEnd()+'\n');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(!process.argv.includes('--refresh'))throw Error('Use --refresh to pin and verify public edition source revisions.');
  const manifest=await refreshEditionSources();console.log(JSON.stringify(manifest.editions.map(e=>({edition:e.edition,revision:e.source.revision,native_installer:e.native_installer.status}))));
}
