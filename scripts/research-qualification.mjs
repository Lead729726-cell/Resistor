// Reproducible literature-driven characterization, using actual local worker RPC.
// Projects, failed runs and previous source versions are preserved.
import {readFile,writeFile,mkdir,readdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {runtimeConfig,workerRpc} from './runtime.mjs';
const cfg=await runtimeConfig(),root=process.cwd(),base='examples/research-20261013';
await mkdir(base,{recursive:true});await mkdir('.runtime/research',{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
const source={};for(const f of (await readdir('workers/eda')).filter(f=>(f.endsWith('.py')&&!f.startsWith('test_'))||f==='literature.json').sort())source['workers/eda/'+f]=sha(await readFile('workers/eda/'+f));
for(const f of (await readdir('workers/eda/rtl')).sort())source['workers/eda/rtl/'+f]=sha(await readFile('workers/eda/rtl/'+f));
const version=sha(JSON.stringify(source)).slice(0,12),folder=path.join(base,version);await mkdir(folder,{recursive:true});
const small=process.argv.includes('--smoke'),matrix=process.argv.includes('--matrix'),mode=matrix?'matrix':'catalog';
const stateFile=`.runtime/research/state-${version}-${mode}.json`;let state;try{state=JSON.parse(await readFile(stateFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;state={source,projects:{},commands:{},jobs:{},results:{}};}
// Serialize state writes even while native jobs execute independently.
let writes=Promise.resolve();const save=()=>{const data=JSON.stringify(state,null,2);writes=writes.then(()=>writeFile(stateFile,data));return writes;};
const rpc=async(method,params={})=>{const r=await workerRpc(cfg,method,params);if(!r.ok)throw Error(`${r.error.code}: ${r.error.message}`);return r.result;};
const catalog=await rpc('design.catalog'),digital=await rpc('digital.catalog');
if(!catalog.literature?.coverage||catalog.literature.coverage.length!==catalog.templates.length+digital.units.length)throw Error('Incomplete literature coverage from current engine');
await writeFile(path.join(folder,'catalog.json'),JSON.stringify(catalog,null,2));
const local=file=>{if(!file.startsWith('/workspace/'))throw Error('Unexpected artifact root');return path.join(root,file.slice(11));};
const wait=async run=>{const deadline=Date.now()+1200000;while(['queued','running'].includes(run.execution_status)){if(Date.now()>deadline)throw Error(`Native job ${run.id} still running; preserved, not canceled`);await new Promise(r=>setTimeout(r,1200));run=await rpc('job.status',{run_id:run.id});}return run;};
const jobs=[];
const gateIds=catalog.templates.filter(t=>t.id.startsWith('cell_')).map(t=>t.id);
const chosen=small?['cell_inv','chip_ldo','sar8_analog']:catalog.templates.map(t=>t.id);
const physicalIds=new Set([...gateIds,'soc_miller_ota','chip_ldo','sar8_analog']);
for(const id of chosen){const t=catalog.templates.find(t=>t.id===id);jobs.push({id,key:id+'/default',parameters:t.parameter_defaults,physical:physicalIds.has(id),settings:{}});}
if(!small&&!matrix)for(const d of digital.units)jobs.push({id:d.id,digital:true,key:d.id+'/default',physical:false,period_ns:d.id.startsWith('cpu')?400:100,settings:{}});
if(matrix){jobs.length=0;for(const id of gateIds)for(const scale of [1,4])for(const slew of [.1,1])for(const load of [5e-15,40e-15])jobs.push({id,key:`${id}/x${scale}-slew${slew}-load${load}`,parameters:{drive_scale:scale,input_slew_ns:slew},physical:false,settings:{load_F:load}});}
if(!small&&!matrix){
 for(const resistance of [500,15000,50000])jobs.push({id:'soc_miller_ota',key:'soc_miller_ota/nulling-'+resistance,parameters:{nulling_Ohm:resistance},physical:resistance===15000,settings:{}});
 for(const corner of ['ss','ff'])for(const id of gateIds)jobs.push({id,key:id+'/'+corner,parameters:{drive_scale:1,input_slew_ns:1},physical:false,settings:{corner,temperature_C:corner==='ss'?125:-40,supply_V:corner==='ss'?1.6:1.8,load_F:40e-15}});
 jobs.push({id:'cell_inv',key:'cell_inv/physical-x4',parameters:{drive_scale:4,input_slew_ns:1},physical:true,settings:{load_F:40e-15}});
}
async function qualify(item){
 const key=item.key;state.commands[key]??=randomUUID();await save();
 const p=state.projects[key]?await rpc('project.open',{project_id:state.projects[key]}):item.digital?await rpc('digital.create',{kind:item.id,name:`논문 검토 · ${key} [${version}]`,physical:false,period_ns:item.period_ns,command_id:state.commands[key]}):await rpc('design.create_template',{template_id:item.id,name:`논문 검토 · ${key} [${version}]`,parameters:item.parameters,physical_core:item.physical,chip_limits:{width_um:1000,height_um:1000,max_area_um2:1000000,edge_um:10},command_id:state.commands[key]});
 if(p.revision!==1)throw Error('Edited project is preserved; choose a new source-state generation.');state.projects[key]=p.id;await save();
 const out=path.join(folder,key);await mkdir(out,{recursive:true});await writeFile(path.join(out,'schematic.json'),JSON.stringify(p.schematic,null,2));
 await writeFile(path.join(out,'configuration.json'),JSON.stringify({source_version:version,item,project_id:p.id,parameters:p.design_template?.parameters,testbench:p.testbench},null,2));
 const stages=[['pre','simulation.run',item.settings]];
 if(item.physical)stages.push(['drc','verification.run_drc',{}],['lvs','verification.run_lvs',{}],['pex','extraction.run_pex',{}],['post','simulation.run',{...item.settings,post_layout:true}]);
 if(item.id==='chip_ldo')stages.push(['psrr','simulation.run',{analysis:'ac'}]);
 const result=[];
 for(const [stage,method,settings]of stages){
  const runkey=key+'/'+stage;let run=state.jobs[runkey]?await rpc('job.status',{run_id:state.jobs[runkey]}):null;
  if(!run){run=await rpc(method,{project_id:p.id,expected_revision:1,...(method==='simulation.run'?{...p.testbench,...settings}:{}),command_id:randomUUID()});state.jobs[runkey]=run.id;await save();}
  run=await wait(run);if(run.freshness!=='current')throw Error('Native evidence became stale; never publish it as current.');
  const manifest=JSON.parse(await readFile(local(run.manifest_path),'utf8'));for(const[f,hash]of Object.entries(manifest.adapter_sources||{})){if(source['workers/eda/'+f]&&source['workers/eda/'+f]!==hash)throw Error('Worker image differs from host source: '+f);}
  const record={id:item.id,key,stage,project_id:p.id,run_id:run.id,revision:run.revision,execution_status:run.execution_status,analysis_result:run.analysis_result,freshness:run.freshness,message:run.message,elapsed_s:run.elapsed_s,measurements:run.measurements,verification:run.reference_verification||run.unit_verification||run.digital_verification,parasitics:run.parasitics,marker_count:run.markers?.length,source:manifest.adapter_sources};
  await writeFile(path.join(out,stage+'.json'),JSON.stringify(record,null,2));
  const runFolder=path.dirname(local(run.manifest_path)),nativeDir=path.join(out,stage);await mkdir(nativeDir,{recursive:true});
  for(const f of await readdir(runFolder))if(/^(manifest\.json|stdout\.log|.*\.spice|lvs\.log|markers\.tsv|pex-quality\.json|sar-verification\.json|routing-report\.json)$/.test(f))await copyFile(path.join(runFolder,f),path.join(nativeDir,f));
  result.push(record);console.log(JSON.stringify({key,stage,execution:run.execution_status,result:run.analysis_result,arcs:run.measurements?.timing_characterization?.observed_arcs,psrr:run.measurements?.psrr_rejection_at_10Hz_dB,message:run.execution_status==='failed'?run.message:undefined}));
 }
 if(item.physical){for(const format of ['gds','oas']){const e=await rpc('layout.export',{project_id:p.id,format});if(!e.roundtrip?.geometry_equal)throw Error('Native layout roundtrip changed geometry');await copyFile(local(e.path),path.join(out,item.id+'.'+format));}}
 if(item.physical||item.id==='cpu16'||item.id==='sigma_delta8'){const b=await rpc('project.export_bundle',{project_id:p.id,inline:true});await writeFile(path.join(out,item.id+'.register.zip'),Buffer.from(b.bundle_base64,'base64'));}
 const report={...item,project_id:p.id,stages:result};state.results[key]=report;await save();return report;
}
const errors=[];let cursor=0;await Promise.all(Array.from({length:3},async()=>{while(cursor<jobs.length){const item=jobs[cursor++];try{await qualify(item);}catch(error){errors.push({key:item.key,message:error.message});console.log(JSON.stringify({key:item.key,error:error.message}));}}}));await writes;
const report={schema_version:1,reviewed_at:'2026-10-13',source_sha256:source,source_version:version,generated_at:new Date().toISOString(),catalog_templates:catalog.templates.length,digital_units:digital.units.length,rows:Object.values(state.results),errors,scope:'Only recorded actual native runs. Nominal/PVT points and power-source completeness are stated per run. Literature review, code width, DRC and replay do not imply chip performance replication or manufacturing signoff.',foundry_signoff:false};
await writeFile(path.join(folder,`evidence-${mode}.json`),JSON.stringify(report,null,2));
// Each mode owns its own state and report, so independent simulations cannot
// overwrite the other mode's checkpoint or claim its work was completed.
await writeFile(base+`/latest-${mode}.json`,JSON.stringify({source_version:version,evidence:`${version}/evidence-${mode}.json`,catalog:`${version}/catalog.json`},null,2));
console.log(JSON.stringify({source_version:version,requested:jobs.length,records:Object.keys(state.results).length,errors}));if(errors.length)process.exitCode=1;
