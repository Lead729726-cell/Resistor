// Actual routed public-PDK integration and before/after-layout solver checks.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {hardwareWorkspace} from './hardware-workspace.mjs';
import {nativeResourcesHash} from './native-worker.mjs';
const {api,wait}=await hardwareWorkspace(),version=(await nativeResourcesHash(process.cwd())).slice(0,12)+'-ports-v2',file='.runtime/hardware/physical-'+version+'.json';
const original=JSON.parse(await readFile('.runtime/hardware/qualification.json','utf8'));let state;
try{state=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;state={edition:'Resistor Indust',version,projects:{},records:[],jobs:{}};}
const save=()=>writeFile(file,JSON.stringify(state,null,2)+'\n');await mkdir('.runtime/hardware/physical',{recursive:true});
async function job(key,method,p,args={}){
 let r=state.jobs[key]?await api('job.status',{run_id:state.jobs[key]}):await api(method,{project_id:p.id,expected_revision:p.revision,command_id:randomUUID(),...args});state.jobs[key]=r.id;await save();r=await wait(r);
 await writeFile('.runtime/hardware/physical/'+r.id+'.json',JSON.stringify(r,null,2));const row={label:key,id:r.id,project_id:p.id,revision:r.revision,execution:r.execution_status,analysis:r.analysis_result,message:r.message,parasitics:r.parasitics,measurements:r.measurements};state.records=state.records.filter(x=>x.label!==key);state.records.push(row);await save();console.log(JSON.stringify(row));return r;
}
for(const kind of ['assembly','analog']){
 let p;if(state.projects[kind])p=await api('project.open',{project_id:state.projects[kind]});else{const b=await api('project.export_bundle',{project_id:original.projects[kind],inline:true});p=await api('project.import_bundle',{bundle_base64:b.bundle_base64,mode:'new',command_id:randomUUID()});state.projects[kind]=p.id;await save();}
 if(!p.conversion){
  if(kind==='assembly')for(const [i,name]of ['VPWR','VGND','IN','DIGITAL_OUT','ANALOG_OUT'].entries())p=await api('schematic.apply_command',{project_id:p.id,expected_revision:p.revision,command_id:randomUUID(),command:{type:'add_device',device:{id:'boundary_'+name,name:'PORT_'+name,kind:'port',pins:{P:name},parameters:{},x:50,y:80+i*80}}});
  const r=await job(kind+'-route','conversion.forward',p,{settings:{chip_limits:{width_um:1000,height_um:1000,max_area_um2:1000000,edge_um:10},pin_side:'left',order:'source',body_net:'VGND'}});assert.equal(r.execution_status,'completed',r.message);
  const v=await api('conversion.result',{project_id:p.id,run_id:r.id});assert(v.report.ready);assert(v.report.routing);await writeFile('.runtime/hardware/physical/'+kind+'-conversion.json',JSON.stringify(v.report,null,2));
  p=await api('conversion.apply',{project_id:p.id,expected_revision:p.revision,command_id:randomUUID(),run_id:r.id,preview_hash:v.report.preview_hash,approved:true});assert.equal(p.mixed_signal.physical_interface_complete,true);assert.equal(p.mixed_signal.combined_verification,'not-run');
 }
 if(kind==='assembly'&&!p.analysis_setup){
  const settings={profile_id:'sky130A',corner:'tt',temperature_C:27,analysis:'dc',sweep_port:'IN',start_V:0,end_V:1.8,step_V:.1,pex:true,ports:p.ports.map(name=>({name,mode:name==='VGND'?'ground':name==='VPWR'||name==='IN'||name==='ANALOG_OUT'?'voltage':'floating',dc_V:name==='VPWR'?1.8:name==='ANALOG_OUT'?.9:0}))};
  p=await api('analysis.configure',{project_id:p.id,expected_revision:p.revision,command_id:randomUUID(),settings});
 }
 for(const [suffix,method]of [['drc','verification.run_drc'],['lvs','verification.run_lvs'],['pex','extraction.run_pex']]){const r=await job(kind+'-'+suffix,method,p);assert.equal(r.execution_status,'completed',r.message);assert.equal(r.analysis_result,'pass',r.message);}
 if(kind==='analog'){
  for(const [corner,temperature_C] of [['tt',27],['ss',125],['ff',-40]])for(const post_layout of [false,true]){const r=await job(kind+'-'+corner+(post_layout?'-post':'-pre'),'simulation.run',p,{...p.testbench,corner,temperature_C,post_layout});assert.equal(r.execution_status,'completed',r.message);assert(r.waveforms?.length);assert(['available','available_partial'].includes(r.measurements.current_flow_status));}
 }else{
  const r=await job(kind+'-post-dc','analysis.run',p);assert.equal(r.execution_status,'completed',r.message);
 }
 const bundle=await api('project.export_bundle',{project_id:p.id,inline:true});await writeFile('.runtime/hardware/physical/'+kind+'.register.zip',Buffer.from(bundle.bundle_base64,'base64'));
 const check=await api('project.import_bundle',{bundle_base64:bundle.bundle_base64,mode:'new',command_id:randomUUID()});assert.equal(check.runs.length,0);assert.deepEqual(check.mixed_signal,p.mixed_signal);if(kind==='assembly')assert.deepEqual(check.integration_bindings,p.integration_bindings);
}
await writeFile('.runtime/hardware/physical-latest.json',JSON.stringify(state,null,2)+'\n');console.log(JSON.stringify({records:state.records.length,source_version:version,completed:true,manufacturing_signoff:false}));
