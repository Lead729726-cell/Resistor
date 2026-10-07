// Installer control-flow tests with macOS utilities replaced ONLY in a disposable
// Linux Docker container. These results never constitute native Mac execution.
import {readFile,writeFile,mkdir,mkdtemp,symlink,unlink,readdir,access} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {unzipSync} from 'fflate';
if(process.platform!=='linux'||process.env.REGISTER_INSTALLER_MOCK_CONTAINER!=='1'||!existsSync('/.dockerenv'))throw Error('Run only in the explicitly marked disposable Linux test container.');
const {version}=JSON.parse(await readFile('package.json','utf8'));
const archiveBytes=await readFile(process.env.REGISTER_MAC_ARCHIVE??`release/installers/Resistor-${version}-mac-arm64-r2.zip`);
const helpers=unzipSync(archiveBytes,{filter:file=>['Install Resistor.command','Open Viewer.command','Diagnose Resistor.command'].includes(file.name)});
const script=Buffer.from(helpers['Install Resistor.command']).toString('utf8'),viewerScript=Buffer.from(helpers['Open Viewer.command']).toString('utf8');
assert.equal(script,(await readFile('apps/desktop/Install Resistor.command','utf8')).replaceAll('@VERSION@',version).replaceAll('@ARCH@','arm64'));
const commands={
  '/usr/bin/uname':'printf "Darwin\\n"',
  '/usr/bin/sw_vers':'printf "%s\\n" "${MOCK_MACOS:-13.6}"',
  '/usr/sbin/sysctl':'printf "%s\\n" "${MOCK_CPU:-1}"',
  '/usr/libexec/PlistBuddy':`case "$2" in *CFBundleIdentifier*) printf "org.register.eda\\n";; *) printf "${version}\\n";; esac`,
  '/usr/bin/codesign':'printf "codesign %s\\n" "$*" >> "$MOCK_EVENTS"; [ "${MOCK_SIGNATURE_INVALID:-0}" != 1 ] || exit 1; case "$*" in *".register-install-"*) [ "${MOCK_COPIED_SIGNATURE_INVALID:-0}" != 1 ];; esac',
  '/usr/bin/osascript':'printf "prompt\\n" >> "$MOCK_EVENTS"; printf "%s\\n" "${MOCK_APPROVAL:-설치}"',
  '/usr/bin/ditto':'printf "copy %s\\n" "$*" >> "$MOCK_EVENTS"; [ "${MOCK_COPY_FAIL:-0}" != 1 ] || exit 5; shift; /bin/cp -a "$1" "$2"',
  '/usr/bin/xattr':'printf "xattr %s\\n" "$*" >> "$MOCK_EVENTS"',
  '/usr/bin/open':'printf "open %s\\n" "$*" >> "$MOCK_EVENTS"; [ "${MOCK_OPEN_FAIL:-0}" != 1 ]',
  '/usr/bin/uuidgen':'/bin/cat /proc/sys/kernel/random/uuid',
  '/usr/bin/shasum':'shift 2; exec /usr/bin/sha256sum "$@"'
};
for(const [file,body] of Object.entries(commands)){await mkdir(path.dirname(file),{recursive:true});await writeFile(file,`#!/bin/sh\n${body}\n`,{mode:0o755});}
const present=async file=>{try{await access(file);return true;}catch{return false;}};
const results=[];
const latest=script.includes('뷰어로 설치');
const diagnostic=helpers['Diagnose Resistor.command']?Buffer.from(helpers['Diagnose Resistor.command']).toString('utf8'):null;
const cases=['normal','replacement','cancel','corrupt-file','escaped-symlink','missing-symlink','wrong-cpu','old-macos','bad-signature',...(latest?['viewer-only','copy-failure','copied-signature-failure','launch-failure']:[])];
for(const name of cases){
  const root=await mkdtemp(path.join(os.tmpdir(),'Resistor installer ')),folder=path.join(root,'ZIP [with spaces]'),home=path.join(root,'Mac user [with spaces]');
  const app=path.join(folder,'Resistor.app'),design=path.join(home,'Library/Application Support/레지스터/workspace/design.json');
  await mkdir(path.join(app,'Contents/Frameworks/Demo.framework/Versions/A'),{recursive:true});
  await mkdir(path.join(app,'Contents/MacOS'),{recursive:true});
  await mkdir(path.dirname(design),{recursive:true});await writeFile(design,'user-design-kept');
  const files={'Resistor.app/Contents/Info.plist':'plist fixture','Resistor.app/Contents/MacOS/Resistor':'executable fixture','Resistor.app/Contents/Frameworks/Demo.framework/Versions/A/sample.txt':'resource fixture','Install Resistor.command':script,'Open Viewer.command':viewerScript,'BUNDLE-SYMLINKS.tsv':'Resistor.app/Contents/Frameworks/Demo.framework/Versions/Current\tA\n'};
  if(diagnostic)files['Diagnose Resistor.command']=diagnostic;
  for(const [relative,bytes] of Object.entries(files))await writeFile(path.join(folder,relative),bytes);
  const link=path.join(app,'Contents/Frameworks/Demo.framework/Versions/Current');await symlink('A',link);
  await writeFile(path.join(folder,'BUNDLE-SHA256SUMS.txt'),Object.entries(files).map(([relative,bytes])=>`${createHash('sha256').update(bytes).digest('hex')}  ${relative}`).join('\n')+'\n');
  const previous=['replacement','copy-failure','copied-signature-failure','launch-failure'].includes(name);
  if(previous){await mkdir(path.join(home,'Applications/Resistor.app'),{recursive:true});await writeFile(path.join(home,'Applications/Resistor.app/old.txt'),'old-app-kept');}
  if(name==='corrupt-file')await writeFile(path.join(app,'Contents/Info.plist'),'modified');
  if(name==='escaped-symlink'){await unlink(link);await symlink(root,link);}
  if(name==='missing-symlink')await unlink(link);
  const events=path.join(root,'events.txt');await writeFile(events,'');
  const env={...process.env,HOME:home,MOCK_EVENTS:events,...(name==='cancel'?{MOCK_APPROVAL:'취소'}:{}),...(name==='viewer-only'?{MOCK_APPROVAL:'뷰어로 설치'}:{}),...(name==='wrong-cpu'?{MOCK_CPU:'0'}:{}),...(name==='old-macos'?{MOCK_MACOS:'12.7'}:{}),...(name==='bad-signature'?{MOCK_SIGNATURE_INVALID:'1'}:{}),...(name==='copy-failure'?{MOCK_COPY_FAIL:'1'}:{}),...(name==='copied-signature-failure'?{MOCK_COPIED_SIGNATURE_INVALID:'1'}:{}),...(name==='launch-failure'?{MOCK_OPEN_FAIL:'1'}:{})};
  if(name==='normal'){
    const missing=spawnSync('/usr/bin/zsh',[path.join(folder,'Open Viewer.command')],{env,encoding:'utf8'});
    assert.notEqual(missing.status,0);assert.equal(await readFile(events,'utf8'),'');
  }
  const run=spawnSync('/usr/bin/zsh',[path.join(folder,'Install Resistor.command')],{env,encoding:'utf8',timeout:30000});
  const output=await readFile(events,'utf8'),installed=await present(path.join(home,'Applications/Resistor.app/Contents/Info.plist'));
  assert.equal(await readFile(design,'utf8'),'user-design-kept');
  if(['normal','replacement','viewer-only'].includes(name)){
    assert.equal(run.status,0,run.stdout+run.stderr);assert.ok(installed);assert.ok(output.includes('open '));
    const changes=output.split('\n').filter(line=>line.startsWith('xattr -dr'));
    assert.equal(changes.length,1);assert.ok(changes[0].includes(home+'/Applications/.register-install-')&&changes[0].endsWith('/Resistor.app'));
    if(name==='normal'){
      const viewer=spawnSync('/usr/bin/zsh',[path.join(folder,'Open Viewer.command')],{env,encoding:'utf8'});
      assert.equal(viewer.status,0,viewer.stdout+viewer.stderr);
      assert.ok((await readFile(events,'utf8')).includes(`open -n ${home}/Applications/Resistor.app --args --viewer`));
      if(diagnostic){
        const before=(await readFile(events,'utf8')).length;
        const diagnosis=spawnSync('/usr/bin/zsh',[path.join(folder,'Diagnose Resistor.command')],{env,encoding:'utf8'});
        assert.equal(diagnosis.status,0,diagnosis.stdout+diagnosis.stderr);
        const observed=(await readFile(events,'utf8')).slice(before);
        assert.ok(!observed.includes('copy ')&&!observed.includes('open ')&&!observed.includes('xattr -dr'));
        assert.equal(await readFile(design,'utf8'),'user-design-kept');
      }
    }
    if(name==='replacement'){
      const backup=(await readdir(path.join(home,'Applications'))).find(file=>file.startsWith('Resistor.previous-'));
      assert.ok(backup);assert.equal(await readFile(path.join(home,'Applications',backup,'old.txt'),'utf8'),'old-app-kept');
    }
    if(name==='viewer-only')assert.ok(output.includes(`open ${home}/Applications/Resistor.app --args --viewer`));
  }else if(['copy-failure','copied-signature-failure','launch-failure'].includes(name)){
    assert.notEqual(run.status,0,run.stdout+run.stderr);assert.equal(installed,false);
    assert.equal(await readFile(path.join(home,'Applications/Resistor.app/old.txt'),'utf8'),'old-app-kept');
    if(name==='copy-failure')assert.ok(!output.includes('xattr ')&&!output.includes('open '));
    if(name==='copied-signature-failure')assert.ok(!output.includes('open '));
    if(name==='launch-failure')assert.ok((await readdir(path.join(home,'Applications'))).some(file=>file.startsWith('Resistor.failed-')));
  }else{
    assert.equal(installed,false);assert.ok(!output.includes('copy ')&&!output.includes('xattr ')&&!output.includes('open '));
    if(name==='cancel')assert.equal(run.status,0,run.stdout+run.stderr);else assert.notEqual(run.status,0,run.stdout+run.stderr);
    if(['corrupt-file','escaped-symlink','missing-symlink','wrong-cpu','old-macos'].includes(name))assert.ok(!output.includes('codesign '));
  }
  results.push({case:name,passed:true,exit_code:run.status,user_design_preserved:true});
}
const report={checked_at:new Date().toISOString(),archive_sha256:createHash('sha256').update(archiveBytes).digest('hex'),installer_sha256:createHash('sha256').update(script).digest('hex'),scope:'Actual ZIP helper script logic simulation with stub macOS commands in disposable Linux Docker; not native Mac execution',native_execution_verified:false,diagnostic_helper:{present:!!diagnostic,read_only_logic_checked:!!diagnostic},viewer_launch:{missing_install_refused:true,installed_target_used:true,viewer_argument_forwarded:true},cases:results};
if(process.env.REGISTER_INSTALLER_MOCK_REPORT){
  const output=path.resolve(process.env.REGISTER_INSTALLER_MOCK_REPORT);
  assert.ok(output.startsWith('/evidence/'));await writeFile(output,JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify(report,null,2));
