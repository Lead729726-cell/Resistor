import { spawn } from 'node:child_process';
import { startWorker } from './worker.mjs';
await startWorker();
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js'],{stdio:'inherit',windowsHide:true});
let desktop;
for(let attempt=0;attempt<50;attempt++){try{const r=await fetch('http://127.0.0.1:5173');if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
const {default:electron}=await import('electron');
desktop=spawn(electron,['apps/desktop/main.cjs'],{stdio:'inherit',windowsHide:true,env:{...process.env,MOS_DEV_URL:'http://127.0.0.1:5173'}});
function stop(){desktop?.kill();vite.kill();}
process.on('SIGINT',stop);desktop.once('exit',()=>vite.kill());vite.once('exit',code=>{if(code)stop();});
