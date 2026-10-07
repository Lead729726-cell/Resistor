const {app,BrowserWindow,ipcMain,dialog,Menu}=require('electron');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {prepareWorkspace}=require('./workspace.cjs');
const {macMenuTemplate}=require('./menu.cjs');
let mainWindow,ownedHub;
let runtimePromise;
app.setName('레지스터');
if(process.env.REGISTER_USER_DATA)app.setPath('userData',path.resolve(process.env.REGISTER_USER_DATA));
async function boot(){
  const root=path.resolve(__dirname,'../..');
  const workspace=await prepareWorkspace({root,userData:app.getPath('userData'),executable:app.getPath('exe'),override:process.env.MOS_WORKSPACE,packaged:app.isPackaged});
  const {runtimeConfig,workerRpc}=await import(pathToFileURL(path.join(root,'scripts/runtime.mjs')));
  const {assistantRpc}=await import(pathToFileURL(path.join(root,'scripts/design-assistant.mjs')));
  // A viewer session opens immediately and never starts Docker or a server.
  // Design transport starts the native runtime once, on the first design request.
  const ensureRuntime=()=>runtimePromise??=(async()=>{
    const config=await runtimeConfig(workspace);
    const {startWorker}=await import(pathToFileURL(path.join(root,'scripts/worker.mjs')));await startWorker(workspace,{resourcesRoot:root});
    let present=false;try{const r=await fetch('http://127.0.0.1:18766/health',{signal:AbortSignal.timeout(1500)});if(r.ok){const body=await r.json();if(body.service!=='register-cloud')throw new Error('다른 서비스가 공동 작업 포트18766을 사용 중입니다.');present=true;}}catch(e){if(e.message.includes('다른 서비스'))throw e;}
    if(!present){const {startHub}=await import(pathToFileURL(path.join(root,'platform/cloud/hub.mjs')));ownedHub=await startHub({workspace,workerConfig:config,staticDirectory:path.join(root,'dist')});}
    return config;
  })().catch(e=>{runtimePromise=undefined;throw e;});
  mainWindow=new BrowserWindow({width:1600,height:1000,minWidth:1050,minHeight:720,title:'레지스터',icon:path.join(root,'apps/desktop/assets/register.png'),backgroundColor:'#121c29',show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
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
      if(payload.method==='desktop.diagnostics'){
        if(Object.keys(payload.params??{}).length)return {ok:false,error:{code:'INVALID_PARAMETER',message:'환경 진단은 사용자 경로나 명령을 받지 않습니다.'}};
        const {desktopDiagnostics}=await import(pathToFileURL(path.join(root,'scripts/desktop-diagnostics.mjs')));
        return {ok:true,result:await desktopDiagnostics({workspace,resourcesRoot:root})};
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
app.whenReady().then(boot).catch(e=>{dialog.showErrorBox('레지스터',e.message);app.quit();});
app.on('will-quit',()=>{void ownedHub?.close();});
app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)void boot().catch(e=>dialog.showErrorBox('레지스터',e.message));});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
