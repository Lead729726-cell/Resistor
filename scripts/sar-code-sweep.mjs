import{mkdir,readFile,writeFile,rename,copyFile,readdir}from'node:fs/promises';
import{randomUUID,createHash}from'node:crypto';
import path from'node:path';
import{runtimeConfig,workerRpc}from'./runtime.mjs';
const cfg=await runtimeConfig(),rpc=async(m,p={})=>{const r=await workerRpc(cfg,m,p);if(!r.ok)throw Error(r.error.code+': '+r.error.message);return r.result;};
await mkdir('.runtime/sar8',{recursive:true});await mkdir('examples/bounded-sar/sweep',{recursive:true});const version=createHash('sha256').update(await readFile('workers/eda/sar_adc.py')).digest('hex').slice(0,12),file='.runtime/sar8/sweep-'+version+'.json';let state;try{state=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;state={command_id:randomUUID(),source_version:version};}
const save=()=>writeFile(file,JSON.stringify(state,null,2));await save();
const payload={template_id:'sar8_analog',name:'SAR8 · 256개 전체 bin center 검사',parameters:{input_V:.6,reference_V:1.2,acquisition_s:2e-6,bit_period_s:2e-6,sweep_codes:1},physical_core:false,chip_limits:{width_um:1000,height_um:1000,max_area_um2:1000000,edge_um:10}};
let p=state.project_id?await rpc('project.open',{project_id:state.project_id}):await rpc('design.create_template',{...payload,command_id:state.command_id});
if(!p.schematic.cells?.SAR8_COMPARATOR?.devices.some(d=>d.name==='RESTORE1')){await rename(file,file+'.older-engine-'+randomUUID()+'.json');state={command_id:randomUUID(),source_version:version};await save();p=await rpc('design.create_template',{...payload,command_id:state.command_id});}
if(!p.schematic.cells?.SAR8_COMPARATOR?.devices.some(d=>d.name==='RESTORE1'))throw Error('Connected engine has an older SAR circuit; source qualification cannot proceed');
state.project_id=p.id;await save();
let run=state.run_id?await rpc('job.status',{run_id:state.run_id}):await rpc('simulation.run',{project_id:p.id,expected_revision:p.revision,...p.testbench,command_id:randomUUID()});state.run_id=run.id;await save();
const until=Date.now()+900000;while(['queued','running'].includes(run.execution_status)){if(Date.now()>until)throw Error('Sweep still running; preserved '+run.id);await new Promise(r=>setTimeout(r,1000));run=await rpc('job.status',{run_id:run.id});}
if(run.freshness!=='current')throw Error('Sweep evidence is stale');const folder='examples/bounded-sar/sweep';const native=path.resolve(path.posix.dirname(run.manifest_path).slice(11));
for(const f of await readdir(native))if(/^(manifest.json|sar-verification.json|decisions.csv|.*-replay.csv|.*\.spice|ngspice.log|.*-replay.log|.*-compile.log)$/.test(f))await copyFile(native+'/'+f,folder+'/'+f);
await writeFile(folder+'/result.json',JSON.stringify({...run,waveforms:undefined},null,2)+'\n');console.log(JSON.stringify({status:run.execution_status,result:run.analysis_result,metrics:run.measurements,message:run.message}));
