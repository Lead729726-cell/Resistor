// Public release metadata only. No credentials or user design data leave the app.
export const REPOSITORY='Lead729726-cell/Resistor';
export const RELEASES_URL=`https://api.github.com/repos/${REPOSITORY}/releases?per_page=30`;
export const DOWNLOAD_SITE='https://resistor-downloads.vercel.app/';
export const MAX_ASSET_BYTES=512*1024*1024;
export function versionParts(value){
  const match=/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value);
  if(!match||match.slice(1).some(n=>!Number.isSafeInteger(Number(n))))throw Error('지원하지 않는 버전 형식입니다.');
  return match.slice(1).map(Number);
}
export function compareVersions(a,b){const x=versionParts(a),y=versionParts(b);for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]>y[i]?1:-1;}return 0;}
export function platformKey(platform,arch){return platform==='win32'&&arch==='x64'?'windows':platform==='darwin'&&arch==='arm64'?'macos':platform==='darwin'&&arch==='x64'?'macos-intel':platform==='linux'&&arch==='x64'?'linux':null;}
export function validateAsset(asset,tag,platform){
  versionParts(tag);const v=tag.replace(/^v/,'');
  const patterns={windows:`Resistor-${v}-win-x64.exe`,linux:`Resistor-${v}-linux-x64.tar.gz`};
  const match=platform==='macos'||platform==='macos-intel'?new RegExp(`^Resistor-${v.replaceAll('.','\\.')}-mac-${platform==='macos'?'arm64':'x64'}-r([1-9]\\d*)\\.zip$`).exec(asset.name):null;
  if(!(match||asset.name===patterns[platform]))throw Error('운영체제와 업데이트 파일이 일치하지 않습니다.');
  const expected=`https://github.com/${REPOSITORY}/releases/download/${tag}/${asset.name}`;
  if(asset.browser_download_url!==expected||!Number.isSafeInteger(asset.size)||asset.size<1||asset.size>MAX_ASSET_BYTES||!/^sha256:[a-f0-9]{64}$/.test(asset.digest))throw Error('공식 배포 주소·파일 크기·SHA-256을 확인할 수 없습니다.');
  return {name:asset.name,url:expected+'?download=1',bytes:asset.size,sha256:asset.digest.slice(7),platform,revision:match?Number(match[1]):0};
}
export function selectRelease(releases,{currentVersion,platform,channel='preview'}){
  versionParts(currentVersion);if(!['stable','preview'].includes(channel))throw Error('업데이트 채널이 잘못되었습니다.');
  if(!Array.isArray(releases)||releases.length>100)throw Error('업데이트 응답 형식이 잘못되었습니다.');
  const candidates=releases.filter(r=>r&&r.draft===false&&(channel==='preview'||r.prerelease===false)&&/^v\d+\.\d+\.\d+$/.test(r.tag_name));
  candidates.sort((a,b)=>compareVersions(b.tag_name,a.tag_name));
  for(const r of candidates){
    if(compareVersions(r.tag_name,currentVersion)<=0)return null;
    if(r.html_url!==`https://github.com/${REPOSITORY}/releases/tag/${r.tag_name}`||!Array.isArray(r.assets))throw Error('공식 릴리스 정보를 확인할 수 없습니다.');
    const matches=[];
    for(const a of r.assets){try{matches.push(validateAsset(a,r.tag_name,platform));}catch(e){
      // An expected platform asset with corrupted metadata must not silently fall back.
      if(typeof a?.name==='string'&&a.name.startsWith('Resistor-'+r.tag_name.slice(1)+'-')&&((platform==='windows'&&a.name.endsWith('-win-x64.exe'))||(platform==='linux'&&a.name.endsWith('-linux-x64.tar.gz'))||(platform?.startsWith('macos')&&a.name.includes('-mac-'+(platform==='macos'?'arm64':'x64')+'-'))))throw e;
    }}
    matches.sort((a,b)=>b.revision-a.revision);if(!matches.length)continue;
    if(matches.length>1&&matches[0].revision===matches[1].revision)throw Error('중복 업데이트 파일입니다.');
    return {version:r.tag_name.slice(1),tag:r.tag_name,preview:!!r.prerelease,publishedAt:r.published_at??null,releaseUrl:r.html_url,notes:String(r.body??'').slice(0,8000),asset:matches[0]};
  }
  return null;
}
