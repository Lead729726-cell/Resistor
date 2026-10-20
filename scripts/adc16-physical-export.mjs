import assert from'node:assert/strict';
import {readFile,writeFile,mkdir,copyFile}from'node:fs/promises';
import {randomUUID,createHash}from'node:crypto';
import {gzipSync}from'node:zlib';
import path from'node:path';
import {runtimeConfig,workerRpc}from'./runtime.mjs';
const workspace=path.resolve('.runtime/adc16/lab'),out='examples/adc16-lab',index=JSON.parse(await readFile('.runtime/adc16/projects/index.json','utf8'));
const config=await runtimeConfig(workspace),api=async(method,params={})=>{const b=await workerRpc(config,method,params);assert(b.ok,JSON.stringify(b.error));return b.result;};
const local=file=>{assert(file.startsWith('/workspace/'));const target=path.resolve(workspace,file.slice(11));assert(target.startsWith(workspace+path.sep));return target;};
const checks=[];
for(const kind of['sar_adc16','sigma_delta16','pipeline_adc16','sar16_analog-physical','pipeline16_stage-physical','sdm16_integrator-physical']){
 const p=await api('project.open',{project_id:index.projects[kind]}),bundle=await api('project.export_bundle',{project_id:p.id,inline:true});
 const imported=await api('project.import_bundle',{bundle_base64:bundle.bundle_base64,mode:'new',command_id:randomUUID()});assert.equal(imported.runs.length,0);
 const exported=await api('project.export_bundle',{project_id:imported.id,inline:true});assert.equal(exported.geometry_hash,bundle.geometry_hash);assert.deepEqual(imported.schematic,p.schematic);
 const entry={kind,original_project:p.id,imported_project:imported.id,geometry_equal:true,schematic_equal:true,inherited_runs:0,imported_engine_status:'not-run'};
 if(kind.endsWith('-physical')){
  const e=await api('layout.export',{project_id:p.id,format:'gds'});assert(e.roundtrip.geometry_equal&&e.roundtrip.hierarchy_preserved&&e.roundtrip.stable_ids_preserved);
  const bytes=await readFile(local(e.path)),dir=out+'/physical/'+kind;await mkdir(dir,{recursive:true});await writeFile(dir+'/'+kind+'.gds.gz',gzipSync(bytes,{level:9}));await copyFile(local(e.sidecar_path),dir+'/'+kind+'.gds.mos.json');
  Object.assign(entry,{exchange:e.roundtrip,original_gds_bytes:bytes.length,original_gds_sha256:createHash('sha256').update(bytes).digest('hex')});
 }
 checks.push(entry);console.log(JSON.stringify({kind,imported_no_verdicts:true,gds:kind.endsWith('-physical')}));
}
await writeFile(out+'/import-exchange.json',JSON.stringify({edition:'Resistor Indust',checks},null,2)+'\n');
