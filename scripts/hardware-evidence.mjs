import{readFile,writeFile,mkdir,readdir,copyFile}from'node:fs/promises';import path from'node:path';import{createHash}from'node:crypto';import{gzipSync}from'node:zlib';
import{hardwareWorkspace}from'./hardware-workspace.mjs';
const {workspace,api,wait}=await hardwareWorkspace(),root='examples/hardware-lab',sha=b=>createHash('sha256').update(b).digest('hex');await mkdir(root,{recursive:true});
const original=JSON.parse(await readFile('.runtime/hardware/qualification.json','utf8')),runs=[];
const selected=original.records.map(r=>({label:r.label,id:r.id}));
for(const arg of process.argv.filter(x=>x.startsWith('--history='))){const [label,id]=arg.slice(10).split(':');selected.push({label:'historical-'+label,id});}
for(const arg of process.argv.filter(x=>x.startsWith('--run='))){const [label,id]=arg.slice(6).split(':');selected.push({label,id});}
for(const item of selected){
 const r=await wait(await api('job.status',{run_id:item.id})),from=path.join(workspace,'.runtime/eda/runs',r.id),to=root+'/runs/'+r.id;await mkdir(to,{recursive:true});const files=[];
 for(const f of await readdir(from,{withFileTypes:true})){
  if(!f.isFile()||!(/\.(json|v|sv|vhd|vhdl|sp|spice|ys|tcl|log|vcd|c|il|blif|mem|hex|dat|txt|oas|gds|raw)$/.test(f.name)))continue;
  const bytes=await readFile(path.join(from,f.name));if(bytes.length>32*1024*1024)throw Error('Oversized native evidence: '+f.name);
  const compress=bytes.length>300000&&!/\.oas$|\.gds$/.test(f.name),name=f.name+(compress?'.gz':'');await writeFile(to+'/'+name,compress?gzipSync(bytes,{level:9}):bytes);files.push({file:name,original_sha256:sha(bytes),original_bytes:bytes.length});
 }
 const snapshot={...r};for(const key of ['waveforms','current_flow'])if(snapshot[key]){const b=Buffer.from(JSON.stringify(snapshot[key]));await writeFile(to+'/'+key+'.json.gz',gzipSync(b,{level:9}));snapshot[key]={published_file:key+'.json.gz',sha256:sha(b),bytes:b.length};}
 await writeFile(to+'/run-snapshot.json',JSON.stringify(snapshot,null,2)+'\n');const manifest=JSON.parse(await readFile(path.join(from,'manifest.json'),'utf8'));
 if(!item.label.startsWith('historical-'))for(const[file,hash]of Object.entries(manifest.adapter_sources||{})){if(sha(await readFile('workers/eda/'+file))!==hash)throw Error('Engine source changed after '+item.label+': '+file);}
 runs.push({label:item.label,id:r.id,project_id:r.project_id,revision:r.revision,execution_status:r.execution_status,analysis_result:r.analysis_result,freshness:r.freshness,measurements:r.measurements,files});
}
const projects=[];
for(const [label,id]of Object.entries(original.projects)){
 if(label==='wrong-output'||label==='applied'||label==='assembly_imported'||label==='imported_analog')continue;
 const p=await api('project.open',{project_id:id}),bundle=await api('project.export_bundle',{project_id:id,inline:true}),dir=root+'/projects/'+label;await mkdir(dir,{recursive:true});await writeFile(dir+'/'+label+'.register.zip',Buffer.from(bundle.bundle_base64,'base64'));
 if(p.hdl_design){await writeFile(dir+'/design.json',JSON.stringify(p.hdl_design,null,2)+'\n');for(const f of p.hdl_design.files)await writeFile(dir+'/'+f.name,f.text);}
 projects.push({label,id,revision:p.revision,cell:p.cell,hdl_source_preserved:!!p.hdl_design,tracked_hdl_blocks:p.integration_bindings?.length||0,geometry_hash:bundle.geometry_hash,inherited_verification:false});
 if(['inverter','assembly'].includes(label)){const scene=await api('view.get_scene',{project_id:id,max_shapes:100000});if(scene.truncated)throw Error('Full reference geometry exceeded the declared visualization scope.');await writeFile(dir+'/layout-scene.json.gz',gzipSync(Buffer.from(JSON.stringify(scene)),{level:9}));}
}
const qualification={schema_version:1,edition:'Resistor Indust',captured_at:new Date().toISOString(),source:'actual native RPC and immutable run artifacts; no worker configuration or keys copied',runs,projects,digital_assertions:runs.filter(r=>r.label.endsWith('-simulate')&&!r.label.startsWith('ui-')).reduce((n,r)=>n+(r.measurements?.assertions||0),0),scope:{vhdl:'GHDL synthesis -> generated Verilog -> Icarus vector assertions',c:'Stateless uint32 combinational subset, independently compiled GCC oracle',physical:'Only the small HDL-derived CMOS layout has demonstrated DRC/LVS. The joint SoC preserves block geometry and explicit logical pin mapping; inter-block routing and complete LVS/PEX not performed.',mixed_rc:'Actual MOS plus ideal external RC ngspice; no RC physical mask or event-driven HDL/analog co-simulation'},manufacturing_signoff:false};
await writeFile(root+'/qualification.json',JSON.stringify(qualification,null,2)+'\n');await copyFile('LICENSE',root+'/LICENSE.txt');console.log(JSON.stringify({runs:runs.length,projects:projects.length,digital_assertions:qualification.digital_assertions}));
