import { spawn } from 'node:child_process';
import { startWorker } from './worker.mjs';
import {getProductEdition,prepareEditionWorkspace} from './edition-workspace.mjs';
const edition=getProductEdition(),workspace=await prepareEditionWorkspace({edition,workspace:process.env.MOS_WORKSPACE});
await startWorker(workspace,{resourcesRoot:process.cwd()});
const child=spawn(process.execPath,['node_modules/vite/bin/vite.js'],{env:{...process.env,MOS_WORKSPACE:workspace,RESISTOR_EDITION:edition.edition},stdio:'inherit',windowsHide:true});
process.on('SIGINT',()=>child.kill());child.on('exit',code=>process.exitCode=code??0);
