import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {preparePdkCatalog} from './download-pdk-catalog.mjs';
export async function prepareDownloads(workspace=process.cwd()){
  const metadata=JSON.parse(await readFile(path.join(workspace,'package.json'),'utf8')),version=metadata.version;
  if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('Release version must be a simple semantic version.');
  const minor=version.split('.').slice(0,2).join('.'),proof=JSON.parse(await readFile(path.join(workspace,`docs/evidence/release-${minor}-mac.json`),'utf8'));
  if(proof.version!==version||proof.artifacts.length!==3)throw Error('Expected verified Windows and both Mac release artifacts.');
  let macRepair;
  try{
    macRepair=JSON.parse(await readFile(path.join(workspace,'docs/evidence/mac-arm64-repair.json'),'utf8'));
    if(macRepair.version!==version||macRepair.build_revision!==2||macRepair.artifact?.file!==`Register-${version}-mac-arm64-r2.zip`||macRepair.artifact.arch!=='arm64'||!macRepair.artifact.ad_hoc_signed||!macRepair.validation?.crc_checked||!macRepair.validation.installer_manifest_checked||macRepair.validation.bundle_resource_seals<5)throw Error('M1 repair release is not validated.');
  }catch(e){if(e.code!=='ENOENT')throw e;}
  let macLatest;
  try{
    macLatest=JSON.parse(await readFile(path.join(workspace,'docs/evidence/mac-preview-release.json'),'utf8'));
    if(macLatest.version!==version||macLatest.build_revision!==3||macLatest.artifacts?.length!==2||new Set(macLatest.artifacts.map(a=>a.arch)).size!==2||macLatest.installer_cases_passed!==13)throw Error('Latest Mac installer QA is incomplete.');
    for(const a of macLatest.artifacts)if(!['arm64','x64'].includes(a.arch)||a.file!==`Register-${version}-mac-${a.arch}-r3.zip`||a.build_revision!==3||!a.ad_hoc_signed||!a.crc_checked||!a.installer_manifest_checked||a.bundle_resource_seals<5)throw Error('Latest Mac archive evidence is incomplete.');
  }catch(e){if(e.code!=='ENOENT')throw e;}
  const artifacts=proof.artifacts.map(a=>path.basename(a.file).includes('-mac-')&&macLatest?macLatest.artifacts.find(m=>m.arch===a.arch):a.arch==='arm64'&&path.basename(a.file).includes('-mac-')&&macRepair?macRepair.artifact:a);
  const root=path.resolve(workspace,'.runtime/public-download',version);
  if(!root.startsWith(path.resolve(workspace)+path.sep))throw Error('Download staging escaped the workspace.');
  await mkdir(root,{recursive:true});
  const files=[],digest=data=>createHash('sha256').update(data).digest('hex');
  for(const artifact of artifacts){
    const name=path.basename(artifact.file);
    if(!new RegExp(`^Register-${version.replaceAll('.','\\.')}-((mac-(arm64|x64)(-r[23])?\\.zip)|(win-x64\\.exe))$`).test(name))throw Error('Only this release installer/ZIP may be shared.');
    const source=path.join(workspace,'release/installers',name),bytes=await readFile(source);
    if(bytes.length!==artifact.bytes||digest(bytes)!==artifact.sha256)throw Error('Installer differs from verified release: '+name);
    await copyFile(source,path.join(root,name));
    files.push({name,bytes:bytes.length,sha256:artifact.sha256,content_type:name.endsWith('.zip')?'application/zip':'application/vnd.microsoft.portable-executable',download:true,platform:name.includes('-mac-')?'macOS':'Windows',architecture:artifact.arch,minimum_macos:artifact.minimum_macos??null,build_revision:artifact.build_revision??1});
  }
  const cards=files.map(f=>{const mac=f.platform==='macOS',title=mac?(f.architecture==='arm64'?'Apple Silicon Mac':'Intel Mac'):'Windows';return `<article><span class="platform">${mac?'macOS 13 이상':'Windows · x64'}</span><h2>${title}</h2><p>${mac?(f.architecture==='arm64'?'M1 이후 Apple Silicon용':'Intel 프로세서 Mac용'):'64비트 Windows 설치 파일'}</p><a class="download" href="/${f.name}" download>다운로드 <small>${(f.bytes/1048576).toFixed(1)} MB</small></a><details><summary>SHA-256 확인</summary><code>${f.sha256}</code></details></article>`;}).join('');
  const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>레지스터 ${version} 다운로드</title><style>*{box-sizing:border-box}body{margin:0;background:#101722;color:#edf3fb;font:16px/1.65 system-ui,-apple-system,sans-serif}main{max-width:1100px;margin:auto;padding:54px 24px}header{display:flex;gap:16px;align-items:center}header img{width:64px;height:64px}h1{font-size:36px;line-height:1.2;margin:0}header p{margin:7px 0;color:#9daec4}.badge{display:inline-block;font-size:12px;color:#b8d9fb;border:1px solid #3c526d;border-radius:20px;padding:3px 10px}.intro{max-width:760px;color:#b2c0d1;margin:32px 0}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}article{padding:24px;border-radius:18px;background:#1b2635;border:1px solid #304157}.platform{font-size:13px;color:#9db3cc}h2{font-size:22px;margin:12px 0 6px}article p{color:#aebcd0;min-height:48px;font-size:14px}.download{display:flex;justify-content:space-between;align-items:center;background:#b1dcff;color:#102337;padding:13px 16px;border-radius:10px;text-decoration:none;font-weight:700;white-space:nowrap}.download:hover{background:#d0ebff}small{font-size:12px}details{margin-top:19px;font-size:12px;color:#91a6c0}code{display:block;overflow-wrap:anywhere;font-size:11px;margin-top:10px}section{margin-top:28px;background:#172130;border:1px solid #2c3e54;border-radius:16px;padding:24px}section h2{margin-top:0;font-size:19px}section p{color:#aebcd0;font-size:14px}footer{margin-top:28px;color:#8da0b9;font-size:13px}footer a{color:#bbddff;margin-right:18px}@media(max-width:760px){main{padding:30px 18px}.cards{grid-template-columns:1fr}h1{font-size:29px}article p{min-height:0}}</style></head><body><main><header><img src="/register.png" alt="레지스터 로고"><div><h1>레지스터 다운로드</h1><p>Register ${version} <span class="badge">개발 미리보기</span></p></div></header><p class="intro">회로도·레이아웃·시뮬레이션·3D 뷰어를 한 작업 공간에서 사용합니다. 사용 중인 컴퓨터에 맞는 파일을 선택하세요.</p><div class="cards">${cards}</div><section><h2>설치와 실행</h2><p>Windows는 EXE 설치 파일을 실행합니다. Mac은 ZIP을 풀고 Register.app을 Applications 폴더로 옮깁니다. GDS/OASIS 독립 뷰어는 Docker 없이 사용할 수 있습니다. 회로 해석·DRC·LVS·PEX에는 실행 중인 Docker Linux 엔진과 최초 공개 이미지 다운로드가 필요합니다.</p><p>현재 설치 파일은 Developer ID/Authenticode 서명과 Apple 공증을 완료하지 않은 개발 미리보기입니다. Mac 실기기 실행은 아직 미검증입니다. 기존 설계는 별도로 ZIP 백업해 주세요.</p></section><footer><a href="/SHA256SUMS.txt" download>전체 SHA-256</a><a href="/installation.txt">설치 안내</a><span>PC와 다운로드 터널이 실행 중일 때 사용할 수 있는 임시 링크입니다.</span></footer></main></body></html>`;
  const extras=[['index.html',Buffer.from(html),'text/html; charset=utf-8',false],['register.png',await readFile(path.join(workspace,'apps/desktop/assets/register.png')),'image/png',false],['SHA256SUMS.txt',Buffer.from(files.map(f=>`${f.sha256}  ${f.name}`).join('\n')+'\n'),'text/plain; charset=utf-8',true],['installation.txt',Buffer.from(`레지스터 ${version} 개발 미리보기\n\nWindows: EXE 실행\nMac(macOS 13+): CPU에 맞는 ZIP을 풀고 Register.app을 Applications로 복사\nGDS/OASIS 독립 뷰어: Docker 없이 사용 가능\n설계·해석·DRC·LVS·PEX: 실행 중인 Docker Linux 엔진 필요\nMac은 실기기 실행·Developer ID 서명·공증 미검증\nWindows는 설치·제거·사용자 데이터 보존 검증, Authenticode 미서명\n\nPC와 다운로드 터널이 중지되면 임시 링크도 중지됩니다.\n`),'text/plain; charset=utf-8',false]];
  if(macRepair&&!macLatest){
    const section='<section id="mac-install"><h2>M1 Mac 실행 차단 수정본 · r2</h2><p>Apple Silicon 다운로드는 앱·프레임워크·실행 도우미의 자체 서명과 설치 도우미를 포함한 수정본입니다. <strong>macOS 13 Ventura 이상</strong>에서 사용합니다.</p><ol><li>Apple Silicon Mac ZIP을 새로 받아 Mac에서 압축을 풉니다.</li><li><strong>Install Register.command</strong>를 실행하고, 파일 검증 후 표시되는 창에서 <strong>설치</strong>를 선택합니다.</li></ol><p>사용자 Applications 폴더에 설치하고 레지스터 앱의 다운로드 차단 표시만 처리합니다. 기존 사용자 설치 앱은 백업하며 설계 데이터는 보존합니다.</p><details><summary>설치 도우미 자체가 차단될 때</summary><p>터미널을 열어 <strong>/bin/zsh </strong> 뒤 공백을 입력하고, <strong>Install Register.command</strong> 파일을 터미널로 끌어 넣은 뒤 Enter를 누릅니다. 설치 기록은 ~/Library/Logs/Register에 저장됩니다.</p></details><p>자체 서명은 Developer ID 서명·Apple 공증과 별도입니다. 이 수정본의 M1 실기기 실행은 아직 미검증입니다.</p></section>';
    extras[0][1]=Buffer.from(extras[0][1].toString('utf8').replace('</div><section><h2>설치와 실행</h2>','</div>'+section+'<section><h2>설치와 실행</h2>').replace('M1 이후 Apple Silicon용','M1 이후 · 실행 차단 수정본 r2').replace('Mac은 ZIP을 풀고 Register.app을 Applications 폴더로 옮깁니다.','M1 Mac은 위 설치 도우미를 사용합니다. Intel Mac은 ZIP을 풀고 Register.app을 Applications 폴더로 옮깁니다.'));
    extras[3][1]=Buffer.concat([extras[3][1],Buffer.from('\nM1 수정본 r2: ZIP을 풀고 Install Register.command 실행 → 파일 검증 후 설치 승인\n도우미 자체가 차단되면: 터미널에 /bin/zsh 뒤 공백 입력 → Install Register.command 파일 끌어 넣기 → Enter\n사용자 ~/Applications/Register.app에 설치, 기존 사용자 앱 백업, 설계 보존\n이 앱의 다운로드 차단 표시만 처리하며 시스템 Gatekeeper 설정은 변경하지 않음\n자체 서명 완료, Developer ID 서명·Apple 공증·M1 실기기 실행 미검증\n')]);
  }
  if(macLatest){
    const section='<section id="mac-install"><h2>Mac 최신 작업대 · M1 / Intel r3</h2><ol><li>CPU에 맞는 ZIP 전체를 Mac에서 압축 해제합니다.</li><li><strong>Install Register.command</strong>를 실행하고 파일 검증 후 설치를 선택합니다.</li><li>Docker 없이 시작하려면 <strong>뷰어로 설치</strong>를 선택합니다.</li></ol><p>기존 앱과 설계는 보존합니다. 복사·서명 검사·실행 요청이 실패하면 기존 앱을 복원합니다. 오류는 <strong>Diagnose Register.command</strong>로 확인하세요.</p><details><summary>설치 도우미가 차단될 때</summary><p>터미널에 <strong>/bin/zsh </strong>를 입력한 뒤 Install Register.command 파일을 끌어 넣고 Enter를 누릅니다. 출처와 아래 SHA-256을 먼저 확인하세요.</p></details><p>macOS 13 이상 · 자체 서명 완료 · Developer ID/Apple 공증과 실제 Mac 실행 인증은 별도입니다. 이 패키지는 Windows/Linux에서 구조·서명을 검사했으며 실제 Mac 실행은 아직 확인하지 않았습니다.</p></section>';
    extras[0][1]=Buffer.from(extras[0][1].toString('utf8').replace('</div><section><h2>설치와 실행</h2>','</div>'+section+'<section><h2>설치와 실행</h2>').replace('Mac은 ZIP을 풀고 Register.app을 Applications 폴더로 옮깁니다.','Mac은 ZIP 전체를 풀고 Install Register.command로 설치합니다.'));
    extras[3][1]=Buffer.concat([extras[3][1],Buffer.from('\nM1/Intel 최신 작업대 r3: ZIP 전체 해제 → Install Register.command → 설치 또는 뷰어로 설치\n사용자 ~/Applications/Register.app 설치, 기존 앱 백업 및 설치 실패 시 복원\n오류 진단: Diagnose Register.command, 기록: ~/Library/Logs/Register\n자체 서명 검증 완료, 실제 Mac 실행/Apple 공증은 미확인\n')]);
  }
  try{
    const referenceProof=JSON.parse(await readFile(path.join(workspace,'docs/evidence/voltage-references.json'),'utf8'));
    if(referenceProof.references?.length!==5||referenceProof.register_view_verification?.length!==4)throw Error('Reference examples have not completed both viewer checks.');
    const name='register-voltage-references.zip',bytes=await readFile(path.join(workspace,'examples',name));
    if(bytes.length!==referenceProof.archive.bytes||digest(bytes)!==referenceProof.archive.sha256)throw Error('Reference ZIP differs from its verified artifact.');
    await copyFile(path.join(workspace,'examples',name),path.join(root,name));
    files.push({name,bytes:bytes.length,sha256:digest(bytes),content_type:'application/zip',download:true});
    const section=`<section><h2>볼테지에서 볼 레퍼런스</h2><p>저항 배선·단차 피복·깊은 홀·다층 배선/CMP·SKY130 MUX4의 5종 파일입니다. GDS, 층 정보, 공정 레시피, 사용 안내와 저항 모양 로고를 포함합니다. 작성한 공정 높이·막 두께는 설명용 가정입니다.</p><a class="download reference-download" href="/${name}" download>레퍼런스 ZIP 다운로드 <small>${(bytes.length/1024).toFixed(1)} KB</small></a></section>`;
    extras[0][1]=Buffer.from(extras[0][1].toString('utf8').replace('<section><h2>설치와 실행</h2>',section+'<section><h2>설치와 실행</h2>'));
    extras[2][1]=Buffer.from(files.map(f=>`${f.sha256}  ${f.name}`).join('\n')+'\n');
  }catch(e){if(e.code!=='ENOENT')throw e;}
  const catalog=await preparePdkCatalog(workspace);
  const page=extras[0][1].toString('utf8'),insertion='<section><h2>설치와 실행</h2>';
  if(!page.includes(insertion))throw Error('Download page is missing its catalog insertion point.');
  extras[0][1]=Buffer.from(page.replace(insertion,catalog.section+insertion));
  extras.push(...catalog.files);
  for(const [name,bytes,content_type,download] of extras){await writeFile(path.join(root,name),bytes);files.push({name,bytes:bytes.length,sha256:digest(bytes),content_type,download});}
  await writeFile(path.join(root,'release.json'),JSON.stringify({version,preview:true,mac_native_execution_verified:false,files},null,2));
  return {root,version,files};
}
