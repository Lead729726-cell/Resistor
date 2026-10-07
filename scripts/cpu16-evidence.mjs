import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {runtimeConfig,workerRpc} from './runtime.mjs';
const root=process.cwd(),folder=path.join(root,'examples/cpu16');await mkdir(folder,{recursive:true});
const config=await runtimeConfig();
const rpc=async(method,params={})=>{const r=await workerRpc(config,method,params);if(!r.ok)throw Error(method+': '+r.error?.message);return r.result;};
const pid='19fb836774ca44858b1a64cfa80b0f4d',project=await rpc('project.open',{project_id:pid});
if(project.digital_unit?.kind!=='cpu16')throw Error('Expected the actual UI-created CPU16.');
const copyArtifact=async(file,name)=>{
  if(!file.startsWith('/workspace/'))throw Error('Artifact is not owned by this workspace.');
  const local=path.resolve(root,file.slice('/workspace/'.length));
  if(!local.startsWith(root+path.sep))throw Error('Artifact escapes the workspace.');
  await copyFile(local,path.join(folder,name));
};
const bundle=await rpc('project.export_bundle',{project_id:pid,inline:true});
await writeFile(path.join(folder,'cpu16.register.zip'),Buffer.from(bundle.bundle_base64,'base64'));
for(const format of ['gds','oas']){
  const file=await rpc('layout.export',{project_id:pid,format});await copyArtifact(file.path,'cpu16.'+format);
}
const spice=await rpc('schematic.export_spice',{project_id:pid});await writeFile(path.join(folder,'cpu16.spice'),spice.text);
const runs=[];
for(const summary of project.runs){
  const r=await rpc('job.status',{run_id:summary.id});const {waveforms,...record}=r;
  const filename=r.kind==='simulation'?'pre-layout':`${r.kind}-${r.id.slice(0,8)}`;
  await writeFile(path.join(folder,filename+'.run.json'),JSON.stringify(record,null,2)+'\n');
  const manifest=path.join(root,'.runtime/eda/runs',r.id,'manifest.json');
  try{await copyFile(manifest,path.join(folder,filename+'.manifest.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
  runs.push({id:r.id,kind:r.kind,execution_status:r.execution_status,analysis_result:r.analysis_result,elapsed_s:r.elapsed_s,message:r.message,unit_verification:r.unit_verification??null});
}
const scene=await rpc('view.get_scene',{project_id:pid,max_shapes:300000});
const imported=await rpc('project.import_bundle',{bundle_base64:bundle.bundle_base64,command_id:randomUUID()});
const reopened=await rpc('project.export_bundle',{project_id:imported.id});
if(reopened.geometry_hash!==bundle.geometry_hash||imported.runs.length!==0)throw Error('Bundle geometry or unexecuted result state changed.');
const artifacts={};
for(const name of ['cpu16.register.zip','cpu16.gds','cpu16.oas','cpu16.spice']){const bytes=await readFile(path.join(folder,name));artifacts[name]={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};}
const evidence={schema_version:1,checked_at:new Date().toISOString(),created_through_actual_ui:true,project_id:pid,revision:project.revision,testbench:project.testbench,digital_unit:project.digital_unit,scene:{total_shape_count:scene.total_shape_count,returned_shape_count:scene.returned_shape_count,truncated:scene.truncated},runs,bundle_roundtrip:{imported_project_id:imported.id,geometry_hash:bundle.geometry_hash,exact_geometry_preserved:true,imported_runs:0},artifacts,physical_signoff:false};
await writeFile(path.join(folder,'native-evidence.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({project_id:pid,scene:evidence.scene,runs:runs.map(({unit_verification,...r})=>({...r,truth_passed:unit_verification?.passed_cases})),bundle_roundtrip:evidence.bundle_roundtrip},null,2));
