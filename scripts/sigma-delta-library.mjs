import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {zipSync} from 'fflate';
import {runtimeConfig,workerRpc} from './runtime.mjs';
const config=await runtimeConfig(),out='examples/sigma-delta8';
const rpc=async(method,params={})=>{const v=await workerRpc(config,method,params);if(!v.ok)throw Error(v.error.code+': '+v.error.message);return v.result;};
const blocks=JSON.parse(await readFile(out+'/blocks.json','utf8')).blocks;
const all=await rpc('project.list',{metadata_only:true}),receipt=[];
await mkdir(out+'/projects',{recursive:true});
for(const block of blocks){
 const candidates=all.filter(p=>p.cell===block.id&&p.name===`ΣΔ8 · ${block.name.replace(/^ΣΔ · /,'')}`);
 if(candidates.length!==1)throw Error(`Expected one app-created ${block.id}; found ${candidates.length}. Preserve existing projects and specify a new inventory.`);
 const p=await rpc('project.open',{project_id:candidates[0].id});
 const bundle=await rpc('project.export_bundle',{project_id:p.id,inline:true});
 await writeFile(out+'/projects/'+block.id+'.register.zip',Buffer.from(bundle.bundle_base64,'base64'));
 receipt.push({id:block.id,project_id:p.id,revision:p.revision,bundle_sha256:bundle.sha256,layout_status:p.design_template.layout_status,runs:p.runs.map(r=>({id:r.id,status:r.execution_status,verdict:r.analysis_result,tool:r.tool}))});
}
await writeFile(out+'/projects.json',JSON.stringify(receipt,null,2)+'\n');
const archive={},inventory=[];
async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const path=dir+'/'+e.name;if(e.isDirectory())await walk(path);else if(e.name!=='SHA256SUMS.json'){const bytes=await readFile(path),file=path.slice(out.length+1);archive[file]=bytes;inventory.push({file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}}}
await walk(out);const manifest=Buffer.from(JSON.stringify(inventory,null,2)+'\n');archive['SHA256SUMS.json']=manifest;
await writeFile(out+'/SHA256SUMS.json',manifest);await writeFile('examples/Resistor-Sigma-Delta8-Library.zip',zipSync(archive,{level:6}));
console.log(JSON.stringify({projects:receipt.length,files:inventory.length,archive:'examples/Resistor-Sigma-Delta8-Library.zip'}));
