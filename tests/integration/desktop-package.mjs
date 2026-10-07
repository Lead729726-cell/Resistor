import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import { _electron as electron,expect } from '@playwright/test';
const {version}=JSON.parse(await readFile('package.json','utf8'));
if(process.platform!=='win32')throw Error('This check runs the packaged Windows application.');
await mkdir('.runtime/desktop-package-qa',{recursive:true});
const isolated=await mkdtemp(path.resolve('.runtime/desktop-package-qa/windows-'));
const app=await electron.launch({executablePath:path.resolve(`release/${version}/Register-win32-x64/Register.exe`),args:['--viewer'],env:{...process.env,REGISTER_USER_DATA:path.join(isolated,'user-data'),MOS_WORKSPACE:path.join(isolated,'workspace')},timeout:45000});
try{
  const window=await app.firstWindow();
  await window.getByRole('heading',{name:/GDS|뷰어|Viewer/}).first().waitFor({state:'visible',timeout:45000});
  const contents=await window.locator('body').innerText();assert.match(contents,/GDS/);assert.match(contents,/LAYOUT VIEWER/);
  await window.getByTestId('viewer-gds-input').setInputFiles(path.resolve('examples/sky130/wire.gds'));
  await expect(window.getByTestId('viewer-notice')).toContainText('형상 표시',{timeout:45000});
  const sandboxed=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences().sandbox);assert.equal(sandboxed,true);
  await mkdir('docs/evidence',{recursive:true});await window.screenshot({path:`docs/evidence/windows-${version}-viewer.png`});
  await writeFile(`docs/evidence/windows-${version}-desktop.json`,JSON.stringify({schema_version:1,checked_at:new Date().toISOString(),version,platform:'win32',arch:'x64',packaged_viewer_launch:true,actual_gds_opened:'examples/sky130/wire.gds',renderer_sandbox:true,checks:['Packaged executable launched on Windows','Actual standalone GDS file opened','Renderer sandbox enabled'],installer_execution_verified:false,eda_container_execution:'separate CPU16 native evidence'},null,2)+'\n');
  console.log('Packaged Windows viewer launched; renderer sandbox enabled. Installer execution is a separate check.');
}finally{await app.close();}
