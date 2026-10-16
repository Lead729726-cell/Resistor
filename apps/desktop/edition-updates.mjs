import {REPOSITORY,MAX_ASSET_BYTES,versionParts,compareVersions} from './update-feed.mjs';
export function updateIdentity(edition){
 if(!['edu','indust'].includes(edition))throw Error('Unknown update edition');
 return {edition,product_id:'resistor.'+edition,slug:edition==='edu'?'Edu':'Indust',name:edition==='edu'?'Resistor Edu':'Resistor Indust',package_name:edition==='edu'?'Resistor Edu':'Resistor',bundle_id:edition==='edu'?'org.resistor.edu':'org.register.eda'};
}
export function editionTarget(platform){return {windows:'windows-x64',macos:'macos-arm64','macos-intel':'macos-x64',linux:'linux-x64'}[platform]||platform;}
export function editionPlatform(platform,arch){return platform==='win32'&&arch==='arm64'?'windows-arm64':platform==='win32'&&arch==='x64'?'windows':platform==='darwin'&&arch==='arm64'?'macos':platform==='darwin'&&arch==='x64'?'macos-intel':platform==='linux'&&arch==='x64'?'linux':null;}
function releaseVersion(tag,edition){const m=/^(editions|edu|indust)-v(\d+\.\d+\.\d+)$/.exec(tag||'');if(!m||(m[1]!=='editions'&&m[1]!==edition))return null;versionParts(m[2]);return m[2];}
function verifiedMetadata(asset,tag,name,max){
 const url=`https://github.com/${REPOSITORY}/releases/download/${tag}/${name}`;
 if(!asset||asset.name!==name||asset.browser_download_url!==url||!Number.isSafeInteger(asset.size)||asset.size<1||asset.size>max||!/^sha256:[a-f0-9]{64}$/.test(asset.digest))throw Error('에디션 업데이트의 공식 주소·크기·SHA-256이 잘못되었습니다.');
 return {name,url,bytes:asset.size,sha256:asset.digest.slice(7)};
}
export function validateEditionAsset(asset,tag,platform,edition){
 const id=updateIdentity(edition),version=releaseVersion(tag,edition),target=editionTarget(platform);
 if(!version||!['windows-x64','windows-arm64','macos-arm64','macos-x64','linux-x64'].includes(target))throw Error('에디션·플랫폼 업데이트 대상이 다릅니다.');
 const name=`Resistor-${id.slug}-${version}-${target}.`+(target.startsWith('windows')?'exe':target.startsWith('macos')?'zip':'tar.gz');
 return {...verifiedMetadata(asset,tag,name,MAX_ASSET_BYTES),platform,revision:0,edition,product_id:id.product_id,target};
}
export function selectEditionRelease(releases,{currentVersion,platform,edition,channel='preview'}){
 updateIdentity(edition);versionParts(currentVersion);if(!['preview','stable'].includes(channel)||!Array.isArray(releases)||releases.length>100)throw Error('에디션 업데이트 응답 또는 채널이 잘못되었습니다.');
 const candidates=releases.filter(r=>r&&r.draft===false&&(channel==='preview'||r.prerelease===false)&&releaseVersion(r.tag_name,edition));candidates.sort((a,b)=>compareVersions(releaseVersion(b.tag_name,edition),releaseVersion(a.tag_name,edition)));
 for(const r of candidates){const version=releaseVersion(r.tag_name,edition);if(compareVersions(version,currentVersion)<=0)return null;
  if(r.html_url!==`https://github.com/${REPOSITORY}/releases/tag/${r.tag_name}`||!Array.isArray(r.assets))throw Error('공식 에디션 릴리스가 아닙니다.');
  const id=updateIdentity(edition),prefix=`Resistor-${id.slug}-${version}-${editionTarget(platform)}`,files=r.assets.filter(a=>a?.name===prefix+'.exe'||a?.name===prefix+'.zip'||a?.name===prefix+'.tar.gz');
  if(!files.length)continue;if(files.length!==1)throw Error('중복된 에디션 업데이트 파일입니다.');
  const asset=validateEditionAsset(files[0],r.tag_name,platform,edition),receipts=r.assets.filter(a=>a?.name===prefix+'.json');if(receipts.length!==1)throw Error('에디션 업데이트의 빌드 영수증이 없습니다.');
  const receipt=verifiedMetadata(receipts[0],r.tag_name,prefix+'.json',1024*1024);
  return {edition,product_id:id.product_id,version,tag:r.tag_name,preview:!!r.prerelease,publishedAt:r.published_at??null,releaseUrl:r.html_url,notes:String(r.body??'').slice(0,8000),asset,receipt};
 }return null;
}
export function assertEditionUpdate(update,edition,platform){
 if(!update||update.edition!==edition||update.product_id!==updateIdentity(edition).product_id)throw Error('다른 에디션의 업데이트를 설치하지 않습니다.');
 const asset=update.asset,checked=validateEditionAsset({name:asset.name,browser_download_url:asset.url,size:asset.bytes,digest:'sha256:'+asset.sha256},update.tag,platform,edition);
 if(releaseVersion(update.tag,edition)!==update.version||checked.target!==asset.target)throw Error('에디션 업데이트 버전·대상이 다릅니다.');return checked;
}
export function validateEditionReceipt(data,update){
 const a=update.asset,target=a.target,platform=target.split('-')[0],arch=target.split('-')[1];
 if(data?.schema_version!==1||data.edition!==update.edition||data.product_id!==update.product_id||data.version!==update.version||data.platform!==platform||data.arch!==arch||data.file!==a.name||data.bytes!==a.bytes||data.sha256!==a.sha256||!/^[a-f0-9]{40}$/.test(data.source_revision)||!/^[a-f0-9]{40}$/.test(data.build_tools_revision)||data.native_qa?.completed!==true||data.native_qa?.edition!==update.edition||data.native_qa?.source_revision!==data.source_revision)throw Error('빌드 영수증의 에디션·파일·실행 근거가 맞지 않습니다.');
 return {source_revision:data.source_revision,build_tools_revision:data.build_tools_revision};
}
