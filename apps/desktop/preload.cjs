const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('mos',Object.freeze({
  rpc:(method,params={})=>ipcRenderer.invoke('mos:rpc',{method,params}),
  onMenuCommand:callback=>{
    const listener=(_event,command)=>{if(['save','undo','redo'].includes(command))callback(command);};
    ipcRenderer.on('mos:menu-command',listener);
    return ()=>ipcRenderer.removeListener('mos:menu-command',listener);
  }
}));
