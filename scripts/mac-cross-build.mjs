import {packager} from '@electron/packager';
import {readFile,mkdtemp,mkdir,cp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {archiveMacApp} from './mac-archive.mjs';
import {signMacApp} from './mac-signing.mjs';
import {macBuildOptions} from './mac-build-options.mjs';

if(process.platform==='win32')throw Error('Run the Mac ZIP builder in Linux Docker or macOS so .app symlinks are preserved.');
const metadata=JSON.parse(await readFile('package.json','utf8')),stage=JSON.parse(await readFile('release/staging/package.json','utf8'));
if(stage.version!==metadata.version)throw Error('Prepare current staging first with npm run package.');
const temporary=await mkdtemp(path.join(os.tmpdir(),'register-mac-')),source=path.join(temporary,'app');
await cp('release/staging',source,{recursive:true});
const destination=path.resolve(process.env.REGISTER_MAC_OUTPUT??'release/installers');await mkdir(destination,{recursive:true});
const receipts=[];
const {architectures,revision,suffix}=macBuildOptions(process.argv.slice(2));
for(const arch of architectures){
  const folders=await packager({dir:source,out:path.join(temporary,'packages'),name:'Register',platform:'darwin',arch,electronVersion:'44.5.0',appVersion:metadata.version,icon:path.resolve('apps/desktop/assets/register.icns'),asar:false,prune:false,appBundleId:'org.register.eda',appCategoryType:'public.app-category.developer-tools',darwinDarkModeSupport:true,appCopyright:'Register contributors'});
  if(folders.length!==1)throw Error(`Mac ${arch} packaging did not return an application.`);
  const app=path.join(folders[0],'Register.app'),filename=`Register-${metadata.version}-mac-${arch}${suffix}.zip`;
  const signing=await signMacApp(app);
  const readme=`레지스터 ${metadata.version} · ${arch==='arm64'?'Apple Silicon':'Intel'} Mac 개발 미리보기\n\nRegister.app을 Applications 폴더에 복사하고 실행하세요. Node.js 설치는 필요하지 않습니다.\nGDS/OASIS 독립 뷰어는 Docker 없이 작동합니다. Open Viewer.command로 뷰어만 실행할 수 있습니다.\n설계·ngspice·DRC·LVS·PEX는 실행 중인 Docker Linux 엔진이 필요합니다. 공개 EDA 이미지의 amd64 에뮬레이션을 사용합니다.\n데이터는 ~/Library/Application Support/레지스터/workspace에 저장합니다. 앱을 삭제해도 설계는 자동 삭제하지 않습니다.\n\n현재 Developer ID 서명·공증 및 Mac 실기기 실행은 미검증입니다. 시스템 보안 설정을 전역으로 해제하지 마세요.\nMac 검증과 빌드 절차: 앱 내부 Contents/Resources/app/docs/desktop-installation.md\n`;
  const installation=`\nMac 설치 도우미 r${revision}: ZIP을 Mac에서 풀고 Install Register.command를 실행합니다. 사용자 ~/Applications에 설치하며 기존 사용자 설치 앱은 백업합니다.\n도우미는 파일 해시와 자체 서명을 확인하고 사용자 승인 후 복사한 레지스터 앱의 다운로드 표시만 처리합니다.\nDocker 없이 시작하려면 뷰어로 설치를 선택하세요. 실행 오류는 Diagnose Register.command로 확인합니다.\n도우미 자체가 차단되면 터미널에 /bin/zsh 뒤 공백을 입력하고 Install Register.command 파일을 끌어 넣은 뒤 Enter를 누릅니다.\nmacOS 13 Ventura 이상이 필요합니다. Apple 공증 완료본이 아니므로 별도 사용자 승인이 필요합니다.\n`;
  const archive=path.join(destination,filename);await archiveMacApp({app,destination:archive,readme:readme+installation,version:metadata.version,arch,installer:true});
  const bytes=await readFile(archive);
  receipts.push({file:filename,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),arch,build_host:process.platform,native_execution_verified:false,...signing,installer_helper:true,build_revision:revision});
  console.log(`Created ${filename}: ${bytes.length} bytes; native Mac execution remains unverified.`);
}
await writeFile(path.join(destination,`mac-build-${metadata.version}${suffix}.json`),JSON.stringify({version:metadata.version,created_at:new Date().toISOString(),artifacts:receipts},null,2));
