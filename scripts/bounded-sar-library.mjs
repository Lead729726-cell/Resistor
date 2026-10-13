import{mkdir,readFile,writeFile,rename,copyFile,readdir}from'node:fs/promises';
import{createHash,randomUUID}from'node:crypto';
import path from'node:path';
import{runtimeConfig,workerRpc}from'./runtime.mjs';
const cfg=await runtimeConfig(),out='examples/bounded-sar',policy={width_um:1000,height_um:1000,max_area_um2:1000000,edge_um:10};
const rpc=async(m,p={})=>{const r=await workerRpc(cfg,m,p);if(!r.ok)throw Error(r.error.code+': '+r.error.message);return r.result;};
const sha=b=>createHash('sha256').update(b).digest('hex');
const source={};for(const f of(await readdir('workers/eda')).filter(f=>f.endsWith('.py')&&!f.startsWith('test_')).sort())source['workers/eda/'+f]=sha(await readFile('workers/eda/'+f));
for(const f of(await readdir('workers/eda/rtl')).sort())source['workers/eda/rtl/'+f]=sha(await readFile('workers/eda/rtl/'+f));
const version=sha(JSON.stringify(source)).slice(0,12),stateFile='.runtime/sar8/physical-'+version+'.json';await mkdir('.runtime/sar8',{recursive:true});await mkdir(out,{recursive:true});
let state;try{state=JSON.parse(await readFile(stateFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;state={source,projects:{},commands:{},jobs:{}};}
const write=async(f,b)=>{const temp=f+'.'+randomUUID()+'.tmp';await writeFile(temp,b,{flag:'wx'});await rename(temp,f);};
const save=()=>write(stateFile,JSON.stringify(state,null,2));
const wait=async r=>{const until=Date.now()+1200000;while(['queued','running'].includes(r.execution_status)){if(Date.now()>until)throw Error('Preserved running job '+r.id);await new Promise(t=>setTimeout(t,1000));r=await rpc('job.status',{run_id:r.id});}return r;};
const local=p=>{if(!p.startsWith('/workspace/'))throw Error('Unexpected artifact');return path.resolve(p.slice(11));};
const catalog=(await rpc('design.catalog')).templates;
const requested=process.argv.slice(2).filter(a=>!a.startsWith('--'));
const templates=catalog.filter(t=>(t.id==='sar8_analog'||t.id.startsWith('soc_'))&&(!requested.length||requested.includes(t.id)));const rows=[];
for(const t of templates){
 const folder=out+'/'+t.id;await mkdir(folder,{recursive:true});state.commands[t.id]??=randomUUID();await save();
 const p=state.projects[t.id]?await rpc('project.open',{project_id:state.projects[t.id]}):await rpc('design.create_template',{template_id:t.id,name:'영역 규격 · '+t.name+' ['+version+']',parameters:t.parameter_defaults,physical_core:true,chip_limits:policy,command_id:state.commands[t.id]});
 if(p.revision!==1)throw Error('Preserve user-edited reference '+p.id);state.projects[t.id]=p.id;await save();
 const envelope=await rpc('design.floorplan_preview',{project_id:p.id});if(!envelope.fits)throw Error('Physical envelope exceeded');await write(folder+'/envelope.json',JSON.stringify(envelope,null,2)+'\n');
 const jobs=[];
 for(const [stage,method,extra]of[['drc','verification.run_drc',{}],['lvs','verification.run_lvs',{}],['pex','extraction.run_pex',{}],['pre','simulation.run',{}],['post','simulation.run',{post_layout:true}]]){
   const key=t.id+'/'+stage;let r=state.jobs[key]?await rpc('job.status',{run_id:state.jobs[key]}):null;
   if(!r){r=await rpc(method,{project_id:p.id,expected_revision:p.revision,...(['pre','post'].includes(stage)?p.testbench:{}),...extra,command_id:randomUUID()});state.jobs[key]=r.id;await save();}
   r=await wait(r);if(r.freshness!=='current')throw Error('Stale engine evidence '+key);
   const record={reference:t.id,stage,project_id:p.id,run_id:r.id,revision:r.revision,freshness:r.freshness,execution_status:r.execution_status,analysis_result:r.analysis_result,message:r.message,elapsed_s:r.elapsed_s,parasitics:r.parasitics,marker_count:r.markers?.length,measurements:r.measurements,verification:r.reference_verification,artifacts:r.artifacts};jobs.push(record);
   await write(folder+'/'+stage+'-result.json',JSON.stringify(record,null,2)+'\n');const dest=folder+'/'+stage;await mkdir(dest,{recursive:true});const native=path.dirname(local(r.manifest_path));
   for(const f of await readdir(native))if(/^(manifest.json|lvs.log|markers.tsv|pex-quality.json|pex-reduction.json|decisions.csv|.*-replay.csv|sar-verification.json|.*\.spice|ngspice.log|.*-replay.log|.*-compile.log)$/.test(f))await copyFile(native+'/'+f,dest+'/'+f);
   if(r.waveforms?.length){const waves=r.waveforms;await write(folder+'/'+stage+'-waveforms.json',JSON.stringify(waves)+'\n');}
   console.log(JSON.stringify({reference:t.id,stage,status:r.execution_status,result:r.analysis_result,markers:r.markers?.length,message:r.analysis_result==='pass'?undefined:r.message}),{flush:true});
 }
 for(const format of['gds','oas']){const e=await rpc('layout.export',{project_id:p.id,format});if(!e.roundtrip.geometry_equal)throw Error('Layout roundtrip changed geometry');await copyFile(local(e.path),folder+'/'+t.id+'.'+format);await copyFile(local(e.sidecar_path),folder+'/'+t.id+'.'+format+'.mos.json');}
 const bundle=await rpc('project.export_bundle',{project_id:p.id,inline:true});await write(folder+'/'+t.id+'.register.zip',Buffer.from(bundle.bundle_base64,'base64'));
 const spice=await rpc('schematic.export_spice',{project_id:p.id});await write(folder+'/core.spice',spice.text);
 await copyFile('.runtime/eda/projects/'+p.id+'/generator/routing-report.json',folder+'/routing-report.json');
 rows.push({reference:t.id,name:t.name,project_id:p.id,revision:p.revision,envelope,jobs,all_executed_pass:jobs.every(j=>j.execution_status==='completed'&&j.analysis_result==='pass'),foundry_signoff:false});
 await write(out+'/evidence.json',JSON.stringify({schema_version:1,source_version:version,source_sha256:source,policy,rows},null,2)+'\n');
}
console.log(JSON.stringify({references:rows.length,pass:rows.filter(r=>r.all_executed_pass).length,stateFile}));
