// Native conversion QA. New owned projects only; preserve every attempt.
import {readFile,writeFile,mkdir,readdir,copyFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {runtimeConfig,workerRpc} from './runtime.mjs';
const cfg=await runtimeConfig(),source={};
for(const file of ['conversion.py','custom_circuit.py','physical_library.py','server.py','native.py','geometry.py'])source[file]=createHash('sha256').update(await readFile('workers/eda/'+file)).digest('hex');
const version=createHash('sha256').update(JSON.stringify(source)).digest('hex').slice(0,12),root=`examples/conversion-20261013/${version}`,stateFile=`.runtime/conversion/state-${version}.json`;
await mkdir(root,{recursive:true});await mkdir('.runtime/conversion',{recursive:true});
let state;try{state=JSON.parse(await readFile(stateFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;state={source,projects:{},jobs:{},applied:{},records:[]};}
const save=()=>writeFile(stateFile,JSON.stringify(state,null,2));
const rpc=async(method,p={})=>{const r=await workerRpc(cfg,method,p);if(!r.ok)throw Object.assign(Error(r.error.message),{code:r.error.code});return r.result;};
const local=file=>{if(!file.startsWith('/workspace/'))throw Error('Unexpected artifact path');return path.resolve(file.slice(11));};
async function job(key,method,params){
 const folder=root+'/'+key;await mkdir(folder,{recursive:true});let run=state.jobs[key]?await rpc('job.status',{run_id:state.jobs[key]}):await rpc(method,{...params,command_id:randomUUID()});state.jobs[key]=run.id;await save();
 const end=Date.now()+900000;while(['queued','running'].includes(run.execution_status)){if(Date.now()>end)throw Error('Native job still running; retained');await new Promise(r=>setTimeout(r,1200));run=await rpc('job.status',{run_id:run.id});}
 await writeFile(folder+'/run.json',JSON.stringify(run,null,2));
 const nativeFolder=path.dirname(local(run.manifest_path));const manifest=JSON.parse(await readFile(local(run.manifest_path),'utf8'));
 for(const [name,want] of Object.entries(source))if(manifest.adapter_sources?.[name]!==want)throw Error('Image source differs: '+name);
 for(const f of await readdir(nativeFolder))if(f==='manifest.json'||f.endsWith('.log')||f.endsWith('.spice')||f.endsWith('.tcl')||f==='conversion.json'||f==='schematic.json'||f==='pex-quality.json')await copyFile(nativeFolder+'/'+f,folder+'/'+f);
 state.records=state.records.filter(v=>v.key!==key);state.records.push({key,run_id:run.id,kind:run.kind,revision:run.revision,execution:run.execution_status,result:run.analysis_result,message:run.message});await save();
 console.log(JSON.stringify(state.records.at(-1)));return run;
}
async function project(key,template='cell_inv',empty=false){
 if(state.projects[key])return rpc('project.open',{project_id:state.projects[key]});
 const p=empty?await rpc('project.create',{example:'layout',name:'변환 QA · '+key+' ['+version+']'}):await rpc('design.create_template',{template_id:template,name:'변환 QA · '+key+' ['+version+']',physical_core:false,command_id:randomUUID()});state.projects[key]=p.id;await save();return p;
}
const cases=process.argv.includes('--smoke')?[['left','cell_inv']]:[['left','cell_inv'],['right','cell_nand2'],['top','cell_mux2'],['bottom','cell_inv'],['rc','rc_lowpass'],['ota','soc_miller_ota']];
for(const [key,template]of cases){
 let p=await project(key,template);const settings={chip_limits:{width_um:key==='bottom'?200:600,height_um:key==='bottom'?600:300,max_area_um2:key==='bottom'?120000:180000,edge_um:10},pin_side:['rc','ota'].includes(key)?'left':key,order:key==='ota'?'kind':'source',body_net:'VGND'};
 if(!state.applied[key]){
  const run=await job(key+'/forward','conversion.forward',{project_id:p.id,expected_revision:p.revision,settings});if(run.execution_status!=='completed')throw Error(key+' generation failed');
  const value=await rpc('conversion.result',{project_id:p.id,run_id:run.id});if(!value.report.ready||!value.report.envelope.fits)throw Error('Native preview not ready');
  if((await rpc('project.open',{project_id:p.id})).revision!==p.revision)throw Error('Preview changed source');
  const args={project_id:p.id,expected_revision:p.revision,run_id:run.id,preview_hash:value.report.preview_hash,approved:true,command_id:randomUUID()};
  p=await rpc('conversion.apply',args);const repeated=await rpc('conversion.apply',args);if(repeated.revision!==p.revision)throw Error('Apply was not idempotent');state.applied[key]=p.revision;await save();
 }
 for(const [kind,method]of [['drc','verification.run_drc'],['lvs','verification.run_lvs'],['pex','extraction.run_pex']]){const r=await job(key+'/'+kind,method,{project_id:p.id,expected_revision:p.revision});if(r.execution_status!=='completed'||r.analysis_result!=='pass')throw Error(key+' '+kind+' did not pass');}
 for(const format of ['gds','oas']){const e=await rpc('layout.export',{project_id:p.id,format});if(!e.roundtrip.geometry_equal)throw Error('Layout roundtrip differs');await copyFile(local(e.path),root+'/'+key+'/'+template+'.'+format);}
 const bundle=await rpc('project.export_bundle',{project_id:p.id,inline:true});await writeFile(root+'/'+key+'/'+template+'.register.zip',Buffer.from(bundle.bundle_base64,'base64'));
 if(['left','ota','rc'].includes(key)){
  let raw=await project(key+'-bare-v2','',true);
  if(raw.revision===1){const e=await rpc('layout.export',{project_id:p.id,format:'gds'});const name=randomUUID()+'.gds';await mkdir('.runtime/conversion/bare',{recursive:true});await copyFile(local(e.path),'.runtime/conversion/bare/'+name);await rpc('layout.import',{project_id:raw.id,expected_revision:raw.revision,path:'/workspace/.runtime/conversion/bare/'+name,command_id:randomUUID()});raw=await rpc('project.open',{project_id:raw.id});}
  if(!state.applied[key+'-bare']){
   // Bare GDS has no sidecar and intentionally no electrical reference.
   if(raw.schematic.devices.length)throw Error('Bare GDS import unexpectedly carried a schematic');
   const r=await job(key+'/reverse','conversion.reverse',{project_id:raw.id,expected_revision:raw.revision,profile_id:'sky130A',top_cell:raw.cell});if(r.execution_status!=='completed')throw Error('Native extraction failed');
   const value=await rpc('conversion.result',{project_id:raw.id,run_id:r.id});if(!value.report.ready||value.report.parser_equivalence!=='pass')throw Error('Recovered graph comparison failed');
   raw=await rpc('conversion.apply',{project_id:raw.id,expected_revision:raw.revision,run_id:r.id,preview_hash:value.report.preview_hash,approved:true,command_id:randomUUID()});state.applied[key+'-bare']=raw.revision;await save();
  }
  const r=await job(key+'/recovered-lvs','verification.run_lvs',{project_id:raw.id,expected_revision:raw.revision});if(r.analysis_result!=='pass')throw Error('Applied recovered graph differs from geometry');
  const bundle=await rpc('project.export_bundle',{project_id:raw.id,inline:true});await writeFile(root+'/'+key+'/recovered.register.zip',Buffer.from(bundle.bundle_base64,'base64'));
 }
}
await writeFile(root+'/summary.json',JSON.stringify({source_version:version,source,records:state.records,foundry_signoff:false,scope:'Actual owned native previews and verification. No source metadata used for bare-GDS electrical recovery.'},null,2));
console.log(JSON.stringify({source_version:version,records:state.records.length,completed:true}));
