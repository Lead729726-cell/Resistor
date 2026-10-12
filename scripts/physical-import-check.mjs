import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {runtimeConfig,workerRpc} from './runtime.mjs';
const cfg=await runtimeConfig(),rpc=async(m,p)=>{const r=await workerRpc(cfg,m,p);if(!r.ok)throw Error(r.error.message);return r.result;};
const evidence=JSON.parse(await readFile('examples/physical-library/evidence.json','utf8'));
await mkdir('.runtime/physical-import',{recursive:true});let state;try{state=JSON.parse(await readFile('.runtime/physical-import/receipts.json','utf8'));}catch{state={};}
const rows=[];
for(const row of evidence.rows){
 const ref=row.reference;state[ref]??=randomUUID();await writeFile('.runtime/physical-import/receipts.json',JSON.stringify(state));
 let p=await rpc('project.import_bundle',{path:`/workspace/examples/physical-library/${ref}/${ref}.register.zip`,mode:'new',command_id:state[ref]});
 if(p.runs.length!==0)throw Error('Imported project inherited validation results');
 const scene=await rpc('view.get_scene',{project_id:p.id,max_shapes:100});if(!scene.shapes.length)throw Error('Physical reference lost mask geometry');
 const original=await rpc('schematic.export_spice',{project_id:row.project_id}),reopened=await rpc('schematic.export_spice',{project_id:p.id});if(original.text!==reopened.text)throw Error('Circuit changed on project import');
 const exchange=[];
 for(const format of ['gds','oas']){
  const side=JSON.parse(await readFile(`examples/physical-library/${ref}/${ref}.${format}.mos.json`,'utf8'));if(side.project.runs.length||Buffer.byteLength(JSON.stringify(side))>2*1024*1024)throw Error('Exchange metadata is not bounded and free of old jobs');
  p=await rpc('layout.import',{project_id:p.id,expected_revision:p.revision,path:`/workspace/examples/physical-library/${ref}/${ref}.${format}`,command_id:randomUUID()});
  if(!p.import_metadata.sidecar_preserved||p.runs.length)throw Error('Exchange import lost the bounded metadata or inherited jobs');
  if((await rpc('schematic.export_spice',{project_id:p.id})).text!==original.text)throw Error('Circuit changed on mask/sidecar import');
  const fresh=await rpc('layout.export',{project_id:p.id,format});if(!fresh.roundtrip.geometry_equal||!fresh.roundtrip.hierarchy_preserved||!fresh.roundtrip.stable_ids_preserved)throw Error('Mask exchange changed hierarchy/IDs');
  exchange.push({format,...fresh.roundtrip});
 }
 rows.push({reference:ref,bundle_imported:true,runs_inherited:0,physical_shapes_present:true,circuit_equal:true,bounded_job_free_sidecars:true,exchange});console.log(ref+' import and exchange PASS');
}
await writeFile('examples/physical-library/import-verification.json',JSON.stringify({source_version:evidence.source_version,rows},null,2)+'\n');
