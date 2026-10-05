import { spawn } from 'node:child_process';
import { startWorker } from './worker.mjs';
await startWorker();
const child=spawn(process.execPath,['node_modules/vite/bin/vite.js'],{stdio:'inherit',windowsHide:true});
process.on('SIGINT',()=>child.kill());child.on('exit',code=>process.exitCode=code??0);
