import {spawn} from 'node:child_process';
import {readFile,access,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {createRequire} from 'node:module';
import {archiveMacApp} from './mac-archive.mjs';
if(process.platform!=='darwin'||!['arm64','x64'].includes(process.arch))throw Error('Build and run the Mac preview on an arm64 or x64 Mac.');
const require=createRequire(import.meta.url),version=JSON.parse(await readFile('package.json','utf8')).version;
const run=args=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{stdio:'inherit'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('Mac preview stage failed: '+code)));});
await run(['scripts/package.mjs','--mac',...(process.arch==='arm64'?['--arm64']:[])]);
const app=path.resolve(`release/${version}/Register-darwin-${process.arch}/Register.app`);await access(app);
await run([require.resolve('@playwright/test/cli'),'test','tests/ui/desktop.spec.ts','--grep','Packaged viewer|Missing Docker|Mac native menu|Mac installed application']);
const suite=JSON.parse(await readFile('docs/evidence/ui-tests.json','utf8'));
if(suite.stats.expected!==4||suite.stats.unexpected!==0||suite.stats.skipped!==0||suite.stats.flaky!==0)throw Error('Four native Mac tests must pass without skips or retries before generating preview artifacts.');
if(process.env.REGISTER_NATIVE_QA==='1'){
  await run([require.resolve('@playwright/test/cli'),'test','tests/ui/desktop.spec.ts','--grep','real worker']);
  await run(['scripts/mac-native-qa.mjs']);
}
await run([require.resolve('electron-builder/out/cli/cli.js'),'--config','apps/desktop/builder.json','--prepackaged',app,'--mac',`--${process.arch}`,'--publish','never']);
const folder=path.resolve('release/installers');await mkdir(folder,{recursive:true});
const name=`Register-${version}-mac-${process.arch}-r4.zip`;
await archiveMacApp({app,destination:path.join(folder,name),version,arch:process.arch,installer:true,readme:`Register ${version} · ${process.arch} · macOS 13+\nZIP 전체를 Mac에서 풀고 Install Register.command로 설치하세요. Docker 없이 시작하려면 뷰어로 설치를 선택하세요.\n오류 진단: Diagnose Register.command\n네이티브 Mac 뷰어·메뉴·재실행·사용자 데이터 보존 검사는 이 빌드에서 수행했습니다. Docker EDA는 ${process.env.REGISTER_NATIVE_QA==='1'?'별도 실제 검사도 수행했습니다.':'검사하지 않았습니다.'}\nDeveloper ID/Apple 공증은 완료하지 않았습니다.\n`});
const bytes=await readFile(path.join(folder,name));
await writeFile(`docs/evidence/macos-preview-${process.arch}.json`,JSON.stringify({version,arch:process.arch,platform:process.platform,checked_at:new Date().toISOString(),native_desktop_tests:4,native_execution_verified:true,native_eda_verified:process.env.REGISTER_NATIVE_QA==='1',developer_id_signed:false,notarized:false,artifact:{file:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}},null,2));
