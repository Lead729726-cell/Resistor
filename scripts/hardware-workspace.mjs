import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import {startWorker} from './worker.mjs';
import {runtimeConfig,workerRpc} from './runtime.mjs';
export async function hardwareWorkspace(){
 const root=process.cwd(),workspace=path.resolve(root,'.runtime/hardware/lab');await mkdir(path.join(workspace,'.runtime'),{recursive:true});
 const marker={schema_version:1,edition:'indust',product_id:'resistor.indust'};try{const old=JSON.parse(await readFile(path.join(workspace,'.runtime/product-context.json'),'utf8'));assert.equal(old.edition,'indust');}catch(e){if(e.code!=='ENOENT')throw e;}
 await writeFile(path.join(workspace,'.runtime/product-context.json'),JSON.stringify(marker));
 try{await readFile(path.join(workspace,'.runtime/worker.json'));}catch(e){if(e.code!=='ENOENT')throw e;const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const port=s.address().port;await new Promise(r=>s.close(r));await writeFile(path.join(workspace,'.runtime/worker.json'),JSON.stringify({url:'http://127.0.0.1:'+port,token:randomUUID()+randomUUID()}));}
 let settings={};try{settings=JSON.parse(await readFile(path.join(workspace,'.runtime/engine.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const mode=settings.mode||(process.platform==='win32'?'wsl':'native');assert(['wsl','native'].includes(mode),'Use a separately configured native/WSL hardware lab.');await writeFile(path.join(workspace,'.runtime/engine.json'),JSON.stringify({...settings,mode,...(mode==='wsl'?{wsl_distribution:settings.wsl_distribution||'ResistorEDA'}:{})}));
 await startWorker(workspace,{resourcesRoot:root,mode,prepare:false});const config=await runtimeConfig(workspace);
 const api=async(method,params={})=>{const b=await workerRpc(config,method,params);if(!b.ok)throw Object.assign(Error(method+': '+JSON.stringify(b.error)),{code:b.error?.code});return b.result;};
 const wait=async run=>{const end=Date.now()+600000;while(['queued','running'].includes(run.execution_status)){assert(Date.now()<end,'Native job remains in progress; retained '+run.id);await new Promise(r=>setTimeout(r,350));run=await api('job.status',{run_id:run.id});}return run;};
 return {root,workspace,config,api,wait};
}
