import {test,expect,_electron as electron} from '@playwright/test';
import path from 'node:path';
import {mkdir,mkdtemp,access,writeFile} from 'node:fs/promises';
import os from 'node:os';
const version=JSON.parse(await (await import('node:fs/promises')).readFile('package.json','utf8')).version;
const release=path.resolve(process.platform==='darwin'?`release/${version}/Register-darwin-${process.arch}/Register.app/Contents/MacOS/Register`:`release/${version}/Register-win32-x64/Register.exe`);
const evidenceOS=process.platform==='darwin'?'macos':'windows';
test('Packaged desktop loads real worker through sandbox IPC',async()=>{
  const app=await electron.launch({executablePath:release,env:{...process.env,MOS_WORKSPACE:process.cwd(),REGISTER_USER_DATA:path.resolve('.runtime/desktop-qa')},timeout:60000});
  try{
    const window=await app.firstWindow();await expect(window.getByTestId('app-ready')).toBeVisible();await expect(window.getByTestId('scene-loaded-count')).toHaveAttribute('data-count',/^[1-9]\d*$/);
    const isolation=await window.evaluate(()=>({nodeAvailable:'require' in globalThis,ipcAvailable:typeof window.mos?.rpc==='function'}));expect(isolation).toEqual({nodeAvailable:false,ipcAvailable:true});
    const collaboration=await window.evaluate(()=>fetch('http://localhost:18766/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method:'cloud.info',params:{}})}).then(r=>r.json()));expect(collaboration.ok).toBe(true);expect(collaboration.result.capabilities.rooms).toBe(true);
    await window.getByTestId('tab-layout3d').click();await expect(window.locator('canvas').first()).toBeVisible();
    await mkdir('docs/evidence',{recursive:true});await window.screenshot({path:`docs/evidence/${evidenceOS}-desktop.png`});
  }finally{await app.close();}
});

test('Packaged viewer opens GDS without Docker, credentials or native runtime initialization',async()=>{
  const workspace=await mkdtemp(path.join(os.tmpdir(),'register-viewer-only-'));
  const app=await electron.launch({executablePath:release,args:['--viewer'],env:{...process.env,MOS_WORKSPACE:workspace,REGISTER_USER_DATA:path.resolve('.runtime/viewer-qa'),PATH:path.dirname(process.execPath)},timeout:60000});
  try{
    const window=await app.firstWindow();await expect(window.getByTestId('viewer-empty-gds-input')).toBeAttached();await window.getByTestId('viewer-empty-gds-input').setInputFiles(path.resolve('examples/sky130/mosfet.gds'));await expect(window.getByTestId('viewer-shape-count')).toHaveText('52 / 52');await window.getByTestId('viewer-sky130').click();await expect(window.locator('canvas').first()).toBeVisible();
    await expect(window.getByRole('button',{name:'XY 이동',exact:true})).toBeDisabled();let initialized=false;try{await access(path.join(workspace,'.runtime/worker.json'));initialized=true;}catch{}expect(initialized).toBe(false);
    await window.screenshot({path:`docs/evidence/${evidenceOS}-viewer-only.png`});await writeFile(`docs/evidence/${evidenceOS}-viewer-only.json`,JSON.stringify({executable:release,platform:process.platform,arch:process.arch,argument:'--viewer',docker_not_on_PATH:true,empty_workspace:true,native_session_created:initialized,real_gds_shape_count:52,pdk_layer_display:true,readonly:true},null,2));
  }finally{await app.close();}
});

test('Missing Docker: actual packaged startup diagnostics, rejected path overrides, reconnect and offline viewer',async()=>{
  const workspace=await mkdtemp(path.join(os.tmpdir(),'register-startup-'));
  await mkdir(path.join(workspace,'.runtime'),{recursive:true});await writeFile(path.join(workspace,'.runtime/worker.json'),JSON.stringify({url:'http://127.0.0.1:19999',token:'isolated-test-not-credential'.padEnd(40,'x')}));
  const app=await electron.launch({executablePath:release,env:{...process.env,MOS_WORKSPACE:workspace,REGISTER_USER_DATA:path.resolve('.runtime/startup-qa'),PATH:path.dirname(process.execPath),REGISTER_DOCKER_PATH:path.resolve(workspace,'intentionally-absent-docker')},timeout:60000});
  try{
    const window=await app.firstWindow(),panel=window.getByTestId('runtime-diagnostics');await expect(panel).toBeVisible();await expect(panel.locator('[data-diagnostic="docker"]')).toHaveAttribute('data-status','missing');
    const rejected=await window.evaluate(()=>window.mos!.rpc('desktop.diagnostics',{workspace:'other',command:'docker stop'}));expect(rejected.ok).toBe(false);expect(rejected.error?.code).toBe('INVALID_PARAMETER');
    await window.screenshot({path:`docs/evidence/${evidenceOS}-startup-diagnostics.png`});await panel.getByTestId('runtime-reconnect').click();await expect(panel).toBeVisible();await expect(panel.locator('[data-diagnostic="docker"]')).toHaveAttribute('data-status','missing');
    await panel.getByTestId('runtime-open-viewer').click();await expect(window.getByTestId('viewer-empty-gds-input')).toBeAttached();await window.getByTestId('viewer-empty-gds-input').setInputFiles(path.resolve('examples/sky130/mosfet.gds'));await expect(window.getByTestId('viewer-shape-count')).toHaveText('52 / 52');
  }finally{await app.close();}
});

test('Mac native menu delivers sandbox commands and Dock activation reopens the offline viewer',async()=>{
  test.skip(process.platform!=='darwin','Requires actual macOS; never count a Windows run as Mac QA.');
  const workspace=await mkdtemp(path.join(os.tmpdir(),'register-mac-dock-'));
  const app=await electron.launch({executablePath:release,args:['--viewer'],env:{...process.env,MOS_WORKSPACE:workspace,REGISTER_USER_DATA:path.resolve('.runtime/mac-menu-qa')},recordVideo:{dir:'docs/evidence/macos-recording',size:{width:1600,height:1000}},timeout:60000});
  try{
    const window=await app.firstWindow();await expect(window.getByTestId('viewer-empty-gds-input')).toBeAttached();
    await window.evaluate(()=>{(globalThis as any).nativeCommands=[];window.mos!.onMenuCommand!(command=>(globalThis as any).nativeCommands.push(command));});
    const menu=await app.evaluate(({Menu})=>{
      const menu=Menu.getApplicationMenu()!;
      const commands=['register-save','register-undo','register-redo'].map(id=>{const item=menu.getMenuItemById(id)!;const result={id,accelerator:item.accelerator};item.click(undefined as any,undefined as any,undefined as any);return result;});
      return {commands,quit:menu.items[0].submenu!.items.some(i=>i.role==='quit')};
    });
    expect(menu.quit).toBe(true);expect(menu.commands.map(i=>i.accelerator)).toEqual(['Command+S','Command+Z','Command+Shift+Z']);
    await expect.poll(()=>window.evaluate(()=>(globalThis as any).nativeCommands)).toEqual(['save','undo','redo']);
    await window.close();const reopened=app.waitForEvent('window');await app.evaluate(({app})=>{app.emit('activate');});
    const next=await reopened;await expect(next.getByTestId('viewer-empty-gds-input')).toBeAttached();
    await next.getByTestId('viewer-empty-gds-input').setInputFiles(path.resolve('examples/sky130/mosfet.gds'));await expect(next.getByTestId('viewer-shape-count')).toHaveText('52 / 52');
    await writeFile('docs/evidence/macos-native-menu.json',JSON.stringify({platform:process.platform,arch:process.arch,version,menu,sandbox_commands_delivered:true,dock_window_reopened:true,offline_gds_shapes_after_reopen:52},null,2));
  }finally{await app.close();}
});
