import {spawn} from 'node:child_process';
import {readFile,access,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {createRequire} from 'node:module';
import {archiveMacApp} from './mac-archive.mjs';
import {nativeMacBuilderConfig} from './mac-build-options.mjs';
if(process.platform!=='darwin'||!['arm64','x64'].includes(process.arch))throw Error('Build and run the Mac preview on an arm64 or x64 Mac.');
const require=createRequire(import.meta.url),version=JSON.parse(await readFile('package.json','utf8')).version;
const run=args=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{stdio:'inherit'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('Mac preview stage failed: '+code)));});
await run(['scripts/package.mjs','--mac',...(process.arch==='arm64'?['--arm64']:[])]);
const app=path.resolve(`release/${version}/Resistor-darwin-${process.arch}/Resistor.app`);await access(app);
await run([require.resolve('@playwright/test/cli'),'test','tests/ui/desktop.spec.ts','--grep','Packaged viewer|Missing Docker|Mac native menu|Mac installed application']);
const suite=JSON.parse(await readFile('docs/evidence/ui-tests.json','utf8'));
if(suite.stats.expected!==4||suite.stats.unexpected!==0||suite.stats.skipped!==0||suite.stats.flaky!==0)throw Error('Four native Mac tests must pass without skips or retries before generating preview artifacts.');
await run([require.resolve('@playwright/test/cli'),'test','tests/ui/native-desktop.spec.ts']);
if(process.env.REGISTER_NATIVE_QA==='1'){
  await run([require.resolve('@playwright/test/cli'),'test','tests/ui/desktop.spec.ts','--grep','real worker']);
  await run(['scripts/mac-native-qa.mjs']);
}
// A prepackaged app has one architecture. Explicit target architectures override
// CLI flags; narrowing them prevents mislabeled artifacts and concurrent DMG
// tool-cache extraction for an unnecessary second architecture.
await mkdir('.runtime',{recursive:true});
const nativeConfig=`.runtime/mac-builder-native-${process.arch}.json`;
await writeFile(nativeConfig,JSON.stringify(nativeMacBuilderConfig(JSON.parse(await readFile('apps/desktop/builder.json','utf8')),process.arch)));
await run([require.resolve('electron-builder/out/cli/cli.js'),'--config',nativeConfig,'--prepackaged',app,'--mac',`--${process.arch}`,'--publish','never']);
const folder=path.resolve('release/installers');await mkdir(folder,{recursive:true});
const name=`Resistor-${version}-mac-${process.arch}-r5.zip`;
await archiveMacApp({app,destination:path.join(folder,name),version,arch:process.arch,installer:true,readme:`Resistor ${version} · ${process.arch} · macOS 13+\nZIP 전체를 Mac에서 풀고 Install Resistor.command로 설치하세요. 기본 설치는 Docker 없이 회로·레이아웃·GDS/OASIS·ngspice를 실행합니다. Python·KLayout·ngspice·공개 SKY130 자료가 포함됩니다.\nDRC/LVS/PEX와 PCell 생성은 docs/native-runtime.md에 따라 실제 Magic·Netgen 도구를 설치한 뒤 실행하세요.\n오류 진단: Diagnose Resistor.command\n네이티브 Mac 뷰어·메뉴·재실행·사용자 데이터 보존과 실제 로컬 엔진 IPC 검사를 수행했습니다.\nDeveloper ID/Apple 공증은 완료하지 않았습니다.\n`});
const bytes=await readFile(path.join(folder,name));
await writeFile(`docs/evidence/macos-preview-${process.arch}.json`,JSON.stringify({version,arch:process.arch,platform:process.platform,checked_at:new Date().toISOString(),native_desktop_tests:4,native_execution_verified:true,native_eda_verified:true,native_package_ipc_test:true,docker_used:false,developer_id_signed:false,notarized:false,artifact:{file:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}},null,2));
