import {startHub} from '../platform/cloud/hub.mjs';
import fs from 'node:fs/promises';
import {getProductEdition,prepareEditionWorkspace} from './edition-workspace.mjs';
const edition=getProductEdition(),workspace=await prepareEditionWorkspace({edition,workspace:process.env.MOS_WORKSPACE});
let workerConfig;
if(process.env.REGISTER_WORKER_URL){const remote=new URL(process.env.REGISTER_WORKER_URL);if(remote.protocol!=='http:'||!['eda','127.0.0.1','localhost'].includes(remote.hostname))throw new Error('Use the private eda container network for the native worker.');const token=(await fs.readFile(process.env.REGISTER_WORKER_TOKEN_FILE||'/run/secrets/worker_session','utf8')).trim();if(token.length<32)throw new Error('Worker session file is invalid.');workerConfig={url:remote.origin,token,workspace};}
const hub=await startHub({workspace,host:process.env.REGISTER_BIND||'127.0.0.1',port:Number(process.env.REGISTER_PORT||edition.hub_port),publicUrl:process.env.REGISTER_PUBLIC_URL,allowOrigins:(process.env.REGISTER_ALLOWED_ORIGINS||'http://127.0.0.1:'+edition.dev_port).split(',').filter(Boolean),workerConfig});
console.log(`${edition.name} collaboration server listening on ${process.env.REGISTER_BIND||'127.0.0.1'}:${hub.port}`);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>void hub.close().then(()=>process.exit()));
