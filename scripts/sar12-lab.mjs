// Own workspace and native WSL engine; never replaces the user's open engine.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {createRequire} from 'node:module';
import {startWorker} from './worker.mjs';
import {runtimeConfig,workerRpc} from './runtime.mjs';
const root=process.cwd(),workspace=path.join(root,'.runtime/sar12/lab');await mkdir(path.join(workspace,'.runtime'),{recursive:true});
const {getProductEdition}=createRequire(import.meta.url)(path.resolve('apps/desktop/product-edition.cjs'));
assert.equal(getProductEdition().edition,'indust','SAR12 qualification uses a separate Resistor Indust workspace.');
try{const marker=JSON.parse(await readFile(path.join(workspace,'.runtime/product-context.json'),'utf8'));assert.equal(marker.edition,'indust','Never overwrite an Edu workspace marker.');}catch(e){if(e.code!=='ENOENT')throw e;}
try{await readFile(path.join(workspace,'.runtime/worker.json'));}catch(e){if(e.code!=='ENOENT')throw e;const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const port=s.address().port;await new Promise(r=>s.close(r));await writeFile(path.join(workspace,'.runtime/worker.json'),JSON.stringify({url:'http://127.0.0.1:'+port,token:randomUUID()+randomUUID()}));}
let savedEngine={};try{savedEngine=JSON.parse(await readFile(path.join(workspace,'.runtime/engine.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const engineMode=process.env.SAR12_ENGINE_MODE||savedEngine.mode||(process.platform==='win32'?'wsl':'native');assert(['wsl','native'].includes(engineMode),'Use a native or WSL engine for this isolated lab.');
await writeFile(path.join(workspace,'.runtime/engine.json'),JSON.stringify({...savedEngine,mode:engineMode,...(engineMode==='wsl'?{wsl_distribution:process.env.SAR12_WSL_DISTRIBUTION||savedEngine.wsl_distribution||'ResistorEDA'}:{})}));
await writeFile(path.join(workspace,'.runtime/product-context.json'),JSON.stringify({schema_version:1,product_id:'resistor.indust',edition:'indust'}));
await startWorker(workspace,{resourcesRoot:root,mode:engineMode,prepare:false});
const config=await runtimeConfig(workspace),api=async(method,params={})=>{const b=await workerRpc(config,method,params);assert(b.ok,method+': '+JSON.stringify(b.error));return b.result;};
const wait=async job=>{const deadline=Date.now()+2400000;while(['queued','running'].includes(job.execution_status)){if(Date.now()>deadline)throw Error('Preserved running job '+job.id);await new Promise(r=>setTimeout(r,500));job=await api('job.status',{run_id:job.id});}return job;};
const physical=process.argv.includes('--physical'),mode=Number(process.argv.find(a=>a.startsWith('--mode='))?.slice(7)||0),reuse=process.argv.find(a=>a.startsWith('--reuse='))?.slice(8);
const input=process.argv.find(a=>a.startsWith('--input='));
assert(!reuse||!input,'--input creates a new project; an existing project is never silently changed.');
if(input)assert(input.slice(8).trim()!==''&&Number.isFinite(Number(input.slice(8))),'--input needs a finite differential voltage in V.');
let p=reuse?await api('project.open',{project_id:reuse}):await api('design.create_template',{template_id:'sar12_analog',name:'SAR12 · 논문 기반 분할 CDAC ['+Date.now()+']',parameters:{test_mode:mode,...(input?{input_differential_V:Number(input.slice(8))}:{})},physical_core:physical,chip_limits:{width_um:1000,height_um:1000,max_area_um2:1000000,edge_um:10},command_id:randomUUID()});
assert.equal(p.design_template?.id,'sar12_analog','Only an actual SAR12 analog project can be qualified here.');
await mkdir('.runtime/sar12/results',{recursive:true});await writeFile('.runtime/sar12/latest-project.json',JSON.stringify({workspace,project_id:p.id,revision:p.revision},null,2));
if(physical)await writeFile('.runtime/sar12/latest-physical-project.json',JSON.stringify({workspace,project_id:p.id,revision:p.revision},null,2));
if(process.argv.includes('--create-only')){console.log(JSON.stringify({project:p.id,revision:p.revision,physical,primitive_count:p.schematic.devices.length}));process.exit(0);}
if(process.argv.includes('--checks')){
 for(const [stage,method]of [['drc','verification.run_drc'],['lvs','verification.run_lvs'],['pex','extraction.run_pex']]){
  const j=await wait(await api(method,{project_id:p.id,expected_revision:p.revision}));
  await writeFile('.runtime/sar12/results/'+j.id+'.json',JSON.stringify(j,null,2));console.log(JSON.stringify({stage,project:p.id,run:j.id,status:j.execution_status,result:j.analysis_result,message:j.message,markers:j.markers?.length}));
  if(j.execution_status!=='completed'||j.analysis_result!=='pass')process.exitCode=1;
 }
}
if(process.argv.includes('--skip-sim'))process.exit(0);
const conditions={};for(const [flag,key]of [['corner','corner'],['temperature','temperature_C'],['supply','supply_V']]){const arg=process.argv.find(a=>a.startsWith('--'+flag+'='));if(arg)conditions[key]=flag==='corner'?arg.slice(flag.length+3):Number(arg.slice(flag.length+3));}
const job=await wait(await api('simulation.run',{project_id:p.id,...p.testbench,...conditions,post_layout:process.argv.includes('--post')}));
await writeFile('.runtime/sar12/results/'+job.id+'.json',JSON.stringify(job,null,2));
console.log(JSON.stringify({project:p.id,run:job.id,status:job.execution_status,result:job.analysis_result,message:job.message,measurements:job.measurements,checks:job.reference_verification?.checks,frames:job.reference_verification?.frames}));
if(job.execution_status!=='completed'||job.analysis_result!=='pass'){if(job.execution_status!=='completed')console.log((await api('job.logs',{run_id:job.id})).text?.slice(-2200));process.exitCode=1;}
