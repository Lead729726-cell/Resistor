import {spawn} from 'node:child_process';
import path from 'node:path';
import {getProductEdition,prepareEditionWorkspace} from './edition-workspace.mjs';
const [command='context',selected]=process.argv.slice(2),root=process.cwd();
const edition=getProductEdition({root,edition:selected});
if(!['context','dev','build','desktop','mcp'].includes(command))throw Error('Use context, dev, build, desktop or mcp with edu/indust');
if(command==='context'){console.log(JSON.stringify({...edition,shared_engine:true,foundry_signoff:false},null,2));}
else{
 const env={...process.env,RESISTOR_EDITION:edition.edition};
 if(command==='build')env.RESISTOR_BUILD_DIR='dist-'+edition.edition;
 if(['dev','desktop','mcp'].includes(command))env.MOS_WORKSPACE=await prepareEditionWorkspace({root,edition,workspace:process.env.MOS_WORKSPACE});
 if(command==='dev'){env.REGISTER_DEV_PORT=String(edition.dev_port);const {startWorker}=await import('./worker.mjs');await startWorker(env.MOS_WORKSPACE,{resourcesRoot:root});}
 const args=command==='dev'?['node_modules/vite/bin/vite.js','--host','127.0.0.1']:command==='build'?['scripts/edition-build.mjs']:command==='desktop'?['node_modules/electron/cli.js','apps/desktop/main.cjs']:['scripts/mcp.mjs'];
 const child=spawn(process.execPath,args,{cwd:path.resolve(root),env,stdio:'inherit',windowsHide:true});
 child.once('error',e=>{console.error(e.message);process.exitCode=1;});child.once('exit',code=>{process.exitCode=code??1;});for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
}
