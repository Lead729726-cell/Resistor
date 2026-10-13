const {app,BrowserWindow,ipcMain,dialog,Menu,net,shell}=require('electron');
const {spawn}=require('node:child_process');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {prepareWorkspace}=require('./workspace.cjs');
const {macMenuTemplate}=require('./menu.cjs');
const {configureAppIdentity}=require('./identity.cjs');
const {makeUpdateFetch}=require('./update-network.cjs');
let mainWindow,ownedHub;
let runtimePromise;
let windowBootPromise;
let updater;
let quitting=false,quitReady=false;
configureAppIdentity(app,{userDataOverride:process.env.REGISTER_USER_DATA});
async function boot(){
  const root=path.resolve(__dirname,'../..');
  if(!updater){
    const {DesktopUpdater}=await import(pathToFileURL(path.join(__dirname,'updates.mjs')));
    updater=new DesktopUpdater({version:app.isPackaged?app.getVersion():require(path.join(root,'package.json')).version,userData:app.getPath('userData'),packaged:app.isPackaged,fetchImpl:makeUpdateFetch(net),install:async({file,update,folder})=>{
      const choice=await dialog.showMessageBox(mainWindow,{type:'question',title:'Resistor 업데이트',message:`Resistor ${update.version}를 설치할까요?`,detail:'입력 중인 설정과 브라우저 로컬 뷰어 파일을 먼저 저장하세요. 기존 설계 저장 폴더와 실행 중인 Docker 해석은 보존됩니다. Windows는 설치 안내를 열고, Mac·Linux는 사용자 앱 폴더에 설치한 뒤 다시 시작합니다.',buttons:['취소','설치'],defaultId:0,cancelId:0});
      if(choice.response!==1)return false;
      // Native interpreters and modules live in the installed app. Finish jobs
      // before stopping this owned worker so the installer can replace them.
      const {runtimeIdentity,stopNativeWorker}=await import(pathToFileURL(path.join(root,'scripts/native-worker.mjs')));
      const {runtimeConfig}=await import(pathToFileURL(path.join(root,'scripts/runtime.mjs')));
      const currentWorkspace=await prepareWorkspace({root,userData:app.getPath('userData'),executable:app.getPath('exe'),override:process.env.MOS_WORKSPACE,packaged:app.isPackaged});
      const identity=await runtimeIdentity(await runtimeConfig(currentWorkspace));
      if(identity?.runtime_kind.startsWith('native-')||identity?.runtime_kind.startsWith('wsl-'))await stopNativeWorker(currentWorkspace);
      if(process.platform==='win32'){
        const child=spawn(file,[],{detached:true,stdio:'ignore',windowsHide:false});
        await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();
      }else{
        const {prepareInstallation,startInstallHelper}=await import(pathToFileURL(path.join(__dirname,'update-install.mjs')));
        const plan=await prepareInstallation({file,update,folder});plan.viewer=process.argv.includes('--viewer');await startInstallHelper(plan);
      }
      await ownedHub?.close();ownedHub=undefined;app.quit();return true;
    }});
    await updater.initialize();
    const initial=setTimeout(()=>void updater.check({automatic:true}),10000);initial.unref();
    const periodic=setInterval(()=>void updater.check({automatic:true}),6*60*60*1000);periodic.unref();
  }
  const workspace=await prepareWorkspace({root,userData:app.getPath('userData'),executable:app.getPath('exe'),override:process.env.MOS_WORKSPACE,packaged:app.isPackaged});
  const {runtimeConfig,workerRpc}=await import(pathToFileURL(path.join(root,'scripts/runtime.mjs')));
  const {localEngineFetch}=await import(pathToFileURL(path.join(root,'scripts/local-http.mjs')));
  const {assistantRpc}=await import(pathToFileURL(path.join(root,'scripts/design-assistant.mjs')));
  // A viewer session opens immediately and never starts Docker or a server.
  // Design transport starts the native runtime once, on the first design request.
  const ensureRuntime=()=>runtimePromise??=(async()=>{
    const {startWorker}=await import(pathToFileURL(path.join(root,'scripts/worker.mjs')));const config=await startWorker(workspace,{resourcesRoot:root});
    let present=false;try{const r=await localEngineFetch('http://127.0.0.1:18766/health',{signal:AbortSignal.timeout(1500)});if(r.ok){const body=await r.json();if(body.service!=='register-cloud')throw new Error('다른 서비스가 공동 작업 포트18766을 사용 중입니다.');present=true;}}catch(e){if(e.message.includes('다른 서비스'))throw e;}
    if(!present){const {startHub}=await import(pathToFileURL(path.join(root,'platform/cloud/hub.mjs')));ownedHub=await startHub({workspace,workerConfig:config,staticDirectory:path.join(root,'dist')});}
    return config;
  })().catch(e=>{runtimePromise=undefined;throw e;});
  mainWindow=new BrowserWindow({width:1600,height:1000,minWidth:1050,minHeight:720,title:'Resistor',icon:path.join(root,'apps/desktop/assets/register.png'),backgroundColor:'#121c29',show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
  if(process.platform==='darwin')Menu.setApplicationMenu(Menu.buildFromTemplate(macMenuTemplate({name:app.getName(),send:command=>mainWindow?.webContents.send('mos:menu-command',command)})));
  else mainWindow.removeMenu();
  mainWindow.once('ready-to-show',()=>mainWindow.show());
  const devURL=process.env.MOS_DEV_URL;const fileURL=pathToFileURL(path.join(root,'dist/index.html')).href;
  if(devURL&&devURL!=='http://127.0.0.1:5173')throw new Error('Invalid dev URL');
  const viewerOnly=process.argv.includes('--viewer');const expected=devURL?new URL(devURL).href:fileURL;
  ipcMain.removeHandler('mos:rpc');
  ipcMain.handle('mos:rpc',async(event,payload)=>{
    if(event.sender!==mainWindow.webContents||event.senderFrame!==mainWindow.webContents.mainFrame||event.senderFrame.url.split(/[?#]/)[0]!==expected)throw new Error('Untrusted IPC sender');
    if(JSON.stringify(payload).length>32*1024*1024)throw new Error('IPC request too large');
    try{
      if(typeof payload.method==='string'&&payload.method.startsWith('desktop.update.')){
        if(['desktop.update.website','desktop.update.notes'].includes(payload.method)){
          if(Object.keys(payload.params??{}).length)return {ok:false,error:{code:'UPDATE_ERROR',message:'업데이트 링크는 주소를 받지 않습니다.'}};
          const url=payload.method==='desktop.update.website'?'https://resistor-downloads.vercel.app/':updater.status().update?.releaseUrl;
          if(!url)return {ok:false,error:{code:'UPDATE_ERROR',message:'확인된 릴리스가 없습니다.'}};
          await shell.openExternal(url);return {ok:true,result:updater.status()};
        }
        try{return {ok:true,result:await updater.rpc(payload.method,payload.params??{})};}catch(e){return {ok:false,error:{code:'UPDATE_ERROR',message:e.message}};}
      }
      if(payload.method==='desktop.diagnostics'){
        if(Object.keys(payload.params??{}).length)return {ok:false,error:{code:'INVALID_PARAMETER',message:'환경 진단은 사용자 경로나 명령을 받지 않습니다.'}};
        const {desktopDiagnostics}=await import(pathToFileURL(path.join(root,'scripts/desktop-diagnostics.mjs')));
        return {ok:true,result:await desktopDiagnostics({workspace,resourcesRoot:root})};
      }
      if(['desktop.engine.settings','desktop.engine.configure','desktop.engine.migrate'].includes(payload.method)){
        const {engineSettings,configureEngine}=await import(pathToFileURL(path.join(root,'scripts/engine-settings.mjs')));
        if(payload.method==='desktop.engine.configure'){
          const result=await configureEngine(workspace,payload.params??{});await ownedHub?.close();ownedHub=undefined;runtimePromise=undefined;return {ok:true,result};
        }
        if(Object.keys(payload.params??{}).length)throw Error('엔진 설정 조회·전환은 사용자 명령을 받지 않습니다.');
        if(payload.method==='desktop.engine.migrate'){
          const {stopDockerWorker}=await import(pathToFileURL(path.join(root,'scripts/worker.mjs')));await stopDockerWorker(workspace);await ownedHub?.close();ownedHub=undefined;runtimePromise=undefined;
          return {ok:true,result:await configureEngine(workspace,{mode:'native'})};
        }
        return {ok:true,result:await engineSettings(workspace)};
      }
      const runtime=await ensureRuntime();
      if(typeof payload.method==='string'&&payload.method.startsWith('assistant.'))return await assistantRpc(runtime,payload.method,payload.params??{});
      return await workerRpc(runtime,payload.method,payload.params??{});
    }catch(e){return {ok:false,error:{code:'WORKER_UNAVAILABLE',message:e.message}};}
  });
  mainWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  mainWindow.webContents.on('will-navigate',(e,url)=>{if(url!==expected)e.preventDefault();});
  mainWindow.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  mainWindow.on('closed',()=>{mainWindow=null;});
  if(devURL)await mainWindow.loadURL(devURL+(viewerOnly?'?mode=viewer':''));else await mainWindow.loadFile(path.join(root,'dist/index.html'),viewerOnly?{query:{mode:'viewer'}}:undefined);
}
const ensureWindow=()=>windowBootPromise??=(boot().finally(()=>{windowBootPromise=undefined;}));
app.whenReady().then(ensureWindow).catch(e=>{dialog.showErrorBox('Resistor',e.message);app.quit();});
app.on('before-quit',event=>{
  quitting=true;
  if(ownedHub&&!quitReady){event.preventDefault();const hub=ownedHub;ownedHub=undefined;void hub.close().catch(()=>{}).finally(()=>{quitReady=true;app.quit();});}
});
app.on('activate',()=>{if(quitting)return;if(BrowserWindow.getAllWindows().length===0)void ensureWindow().catch(e=>dialog.showErrorBox('Resistor',e.message));else{mainWindow?.show();mainWindow?.focus();}});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
