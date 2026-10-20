// Isolated Resistor Indust workspace; this never replaces the user's engine.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile}from'node:fs/promises';
import {createServer}from'node:net';
import {randomUUID}from'node:crypto';
import path from'node:path';
import {startWorker}from'./worker.mjs';
import {runtimeConfig,workerRpc}from'./runtime.mjs';
const root=process.cwd(),workspace=path.join(root,'.runtime/adc16/lab'),out=path.join(root,'.runtime/adc16/projects');
await mkdir(path.join(workspace,'.runtime'),{recursive:true});await mkdir(out,{recursive:true});
try{const marker=JSON.parse(await readFile(path.join(workspace,'.runtime/product-context.json'),'utf8'));assert.equal(marker.edition,'indust');}catch(e){if(e.code!=='ENOENT')throw e;}
try{await readFile(path.join(workspace,'.runtime/worker.json'));}catch(e){if(e.code!=='ENOENT')throw e;const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const port=s.address().port;await new Promise(r=>s.close(r));await writeFile(path.join(workspace,'.runtime/worker.json'),JSON.stringify({url:'http://127.0.0.1:'+port,token:randomUUID()+randomUUID()}));}
await writeFile(path.join(workspace,'.runtime/engine.json'),JSON.stringify({mode:process.platform==='win32'?'wsl':'native',wsl_distribution:'ResistorEDA'}));
await writeFile(path.join(workspace,'.runtime/product-context.json'),JSON.stringify({schema_version:1,product_id:'resistor.indust',edition:'indust'}));
await startWorker(workspace,{resourcesRoot:root,mode:process.platform==='win32'?'wsl':'native',prepare:false});
const config=await runtimeConfig(workspace),api=async(method,params={})=>{const b=await workerRpc(config,method,params);assert(b.ok,method+': '+JSON.stringify(b.error));return b.result;};
const wait=async j=>{const deadline=Date.now()+2400000;while(['queued','running'].includes(j.execution_status)){if(Date.now()>deadline)throw Error('Preserved running job '+j.id);await new Promise(r=>setTimeout(r,1000));j=await api('job.status',{run_id:j.id});}return j;};
const catalog=await api('design.catalog');const all=catalog.templates.filter(b=>b.adc_family&&b.id.includes('16'));
let index={edition:'Resistor Indust',workspace,projects:{},runs:[]};try{index=JSON.parse(await readFile(out+'/index.json','utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const save=async()=>{let current;try{current=JSON.parse(await readFile(out+'/index.json','utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}if(current){index.projects={...current.projects,...index.projects};index.runs=[...new Map([...current.runs,...index.runs].map(j=>[j.id,j])).values()];}await writeFile(out+'/index.json',JSON.stringify(index,null,2)+'\n');};
const kind=process.argv.find(a=>a.startsWith('--kind='))?.slice(7),physical=process.argv.includes('--physical');
const blocks=kind?all.filter(b=>b.id===kind):all;assert(blocks.length,'ADC16 catalog kind not found');
for(const b of blocks){
 const key=b.id+(physical?'-physical':''),name=(physical?'ADC16 · ':'ADC16 v1 · ')+b.name+(physical?' · 물리 코어':'');let p;
 if(index.projects[key]){p=await api('project.open',{project_id:index.projects[key]});if(p.name!==name){index.history??=[];index.history.push({kind:key,id:p.id});p=null;}}
 if(!p){const existing=(await api('project.list',{metadata_only:true})).find(p=>p.name===name&&p.cell===b.id);if(existing)p=await api('project.open',{project_id:existing.id});else{index.commands??={};index.commands[name]??=randomUUID();await save();p=await api('design.create_template',{template_id:b.id,name,parameters:b.parameter_defaults,physical_core:physical,chip_limits:{width_um:1000,height_um:1000,max_area_um2:1000000,edge_um:10},command_id:index.commands[name]});}index.projects[key]=p.id;await save();}
 if(process.argv.includes('--checks'))for(const[stage,method]of[['drc','verification.run_drc'],['lvs','verification.run_lvs'],['pex','extraction.run_pex']]){
  const j=await wait(await api(method,{project_id:p.id,expected_revision:p.revision}));index.runs.push({kind:key,stage,id:j.id,status:j.execution_status,result:j.analysis_result});await writeFile(out+'/'+j.id+'.json',JSON.stringify(j,null,2));await save();console.log(JSON.stringify(index.runs.at(-1)));
 }
 if(process.argv.includes('--simulate')){const j=await wait(await api('simulation.run',{project_id:p.id,...p.testbench}));index.runs.push({kind:key,stage:'simulation',id:j.id,status:j.execution_status,result:j.analysis_result});await writeFile(out+'/'+j.id+'.json',JSON.stringify(j,null,2));await save();console.log(JSON.stringify(index.runs.at(-1)));}
 const bundle=await api('project.export_bundle',{project_id:p.id,inline:true});await writeFile(out+'/'+key+'.register.zip',Buffer.from(bundle.bundle_base64,'base64'));
 console.log(JSON.stringify({kind:key,project:p.id,revision:p.revision,layout:physical,exported:true}));
}
