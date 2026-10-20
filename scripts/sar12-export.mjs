// Export exact native artifacts and editable projects. Never transfer PASS to imports.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,copyFile,readdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import path from 'node:path';
import {runtimeConfig,workerRpc} from './runtime.mjs';
const root=process.cwd(),workspace=path.join(root,'.runtime/sar12/lab'),out='examples/sar12-lab';
assert.equal(JSON.parse(await readFile(path.join(workspace,'.runtime/product-context.json'),'utf8')).edition,'indust','Do not export another product edition workspace.');
const config=await runtimeConfig(workspace),api=async(method,params={})=>{const r=await workerRpc(config,method,params);assert(r.ok,method+': '+JSON.stringify(r.error));return r.result;};
const sha=b=>createHash('sha256').update(b).digest('hex');
const write=async(file,data)=>{await mkdir(path.dirname(file),{recursive:true});await writeFile(file,typeof data==='string'||Buffer.isBuffer(data)?data:JSON.stringify(data,null,2)+'\n');};
const local=file=>{const relative=file.startsWith('/workspace/')?file.slice(11):file.startsWith('/mnt/d/Coldbrew/Resistor/.runtime/sar12/lab/')?file.slice('/mnt/d/Coldbrew/Resistor/.runtime/sar12/lab/'.length):null;assert(relative!==null,'Unexpected native artifact path');const resolved=path.resolve(workspace,relative);assert(resolved.startsWith(workspace+path.sep));return resolved;};
const catalog=(await api('design.catalog')).templates.filter(t=>t.id==='sar_adc12'||t.id.startsWith('sar12_'));
assert.equal(catalog.length,12);const projects=await api('project.list',{metadata_only:true}),blocks=[];
await write(out+'/paper-reference.json',catalog.find(t=>t.id==='sar_adc12').research);
for(const t of catalog){
 const name='SAR12 · '+t.name.replace(/^SAR12 · /,'');let p=projects.find(p=>p.cell===t.id&&p.name===name);
 p=p?await api('project.open',{project_id:p.id}):await api('design.create_template',{template_id:t.id,name,parameters:t.parameter_defaults,physical_core:false,chip_limits:{width_um:1000,height_um:1000,max_area_um2:1000000,edge_um:10},command_id:randomUUID()});
 const dir=out+'/hierarchy/'+t.id,b=await api('project.export_bundle',{project_id:p.id,inline:true});
 await write(dir+'/'+t.id+'.register.zip',Buffer.from(b.bundle_base64,'base64'));await write(dir+'/schematic.json',p.schematic);await write(dir+'/core.spice',(await api('schematic.export_spice',{project_id:p.id})).text);
 blocks.push({id:t.id,project_id:p.id,name:p.name,ports:p.ports,dependencies:Object.keys(p.schematic.cells||{}),physical_supported:t.physical_supported});
}
await write(out+'/blocks.json',{schema_version:1,edition:'Resistor Indust',blocks});
const id=process.argv.find(a=>a.startsWith('--physical='))?.slice(11)||JSON.parse(await readFile('.runtime/sar12/latest-physical-project.json','utf8')).project_id;
const physical=await api('project.open',{project_id:id});assert(physical.design_template?.layout_status==='generated-public-core'&&physical.cell==='sar12_analog');
const b=await api('project.export_bundle',{project_id:id,inline:true});await write(out+'/analog/sar12_analog.register.zip',Buffer.from(b.bundle_base64,'base64'));
await write(out+'/analog/core.spice',(await api('schematic.export_spice',{project_id:id})).text);
const exchanges=[];for(const format of ['gds','oas']){const e=await api('layout.export',{project_id:id,format});assert(e.roundtrip.geometry_equal&&e.roundtrip.hierarchy_preserved&&e.roundtrip.stable_ids_preserved);const bytes=await readFile(local(e.path));await write(out+'/analog/sar12_analog.'+format+(format==='gds'?'.gz':''),format==='gds'?gzipSync(bytes,{level:9}):bytes);await copyFile(local(e.sidecar_path),out+'/analog/sar12_analog.'+format+'.mos.json');exchanges.push({format,original_bytes:bytes.length,original_sha256:sha(bytes),roundtrip:e.roundtrip});}
await write(out+'/analog/exchange.json',{project:id,revision:physical.revision,exchanges});
// Copy only task-created generator evidence, never user workspace files or keys.
const generator=path.join(workspace,'.runtime/eda/projects',id,'generator');
for(const file of ['routing-report.json','envelope.json'])try{await copyFile(path.join(generator,file),out+'/analog/'+file);}catch(e){if(e.code!=='ENOENT')throw e;}
await write(out+'/analog/project-metadata.json',{id,revision:physical.revision,chip_limits:physical.chip_limits,layout_status:physical.design_template.layout_status,physical_adapter:physical.design_template.physical_adapter,manufacturing_signoff:false});
const imported=await api('project.import_bundle',{bundle_base64:b.bundle_base64,mode:'new',command_id:randomUUID()});assert.equal(imported.runs.length,0);
const independent=await api('project.export_bundle',{project_id:imported.id,inline:true});assert.equal(independent.geometry_hash,b.geometry_hash);
await write('.runtime/sar12/imported-project.json',{project_id:imported.id,revision:imported.revision});
await write(out+'/import-verification.json',{schema_version:1,edition:'Resistor Indust',original_project:id,imported_project:imported.id,geometry_equal:true,inherited_runs:imported.runs.length,rerun_status:'not-run'});
console.log(JSON.stringify({blocks:blocks.length,physical:id,imported:imported.id,exchanges}));
