import { spawn } from 'node:child_process';
import { startWorker } from './worker.mjs';
import {getProductEdition,prepareEditionWorkspace} from './edition-workspace.mjs';
const edition=getProductEdition(),workspace=await prepareEditionWorkspace({edition,workspace:process.env.MOS_WORKSPACE});
const port=Number(process.env.REGISTER_DEV_PORT||edition.dev_port),devURL='http://127.0.0.1:'+port;
try{if((await fetch(devURL,{signal:AbortSignal.timeout(500)})).ok)throw Error('The development port is already occupied: '+port);}catch(e){if(e.message.startsWith('The development port'))throw e;}
await startWorker(workspace,{resourcesRoot:process.cwd()});
const env={...process.env,RESISTOR_EDITION:edition.edition,MOS_WORKSPACE:workspace,REGISTER_DEV_PORT:String(port)};
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js'],{stdio:'inherit',windowsHide:true,env});
let desktop;
let ready=false;for(let attempt=0;attempt<50;attempt++){if(vite.exitCode!==null)throw Error('Development server stopped before readiness');try{const r=await fetch(devURL);if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}
if(!ready){vite.kill();throw Error('Development server did not become ready');}
const {default:electron}=await import('electron');
desktop=spawn(electron,['apps/desktop/main.cjs'],{stdio:'inherit',windowsHide:true,env:{...env,MOS_DEV_URL:devURL}});
function stop(){desktop?.kill();vite.kill();}
process.on('SIGINT',stop);desktop.once('exit',()=>vite.kill());vite.once('exit',code=>{if(code)stop();});
