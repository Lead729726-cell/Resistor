import{hardwareWorkspace}from'./hardware-workspace.mjs';
import{readFile,writeFile}from'node:fs/promises';import{randomUUID}from'node:crypto';
const{api,wait}=await hardwareWorkspace(),q=JSON.parse(await readFile('.runtime/hardware/qualification.json','utf8')),records=[],projects={};
const save=()=>writeFile('.runtime/hardware/digital-physical.json',JSON.stringify({edition:'Resistor Indust',projects,records},null,2));
for(const label of ['adder','counter','c']){
 const b=await api('project.export_bundle',{project_id:q.projects[label],inline:true});let p=await api('project.import_bundle',{bundle_base64:b.bundle_base64,mode:'new',command_id:randomUUID()});projects[label]=p.id;
 const call=async(suffix,method,args={})=>{const r=await wait(await api(method,{project_id:p.id,expected_revision:p.revision,...(method==='hdl.run'?{}:{command_id:randomUUID()}),...args}));records.push({label:label+'-'+suffix,id:r.id,project_id:p.id,revision:r.revision,execution:r.execution_status,analysis:r.analysis_result,message:r.message,parasitics:r.parasitics,measurements:r.measurements});await save();console.log(JSON.stringify(records.at(-1)));return r;};
 const r=await call('physical','hdl.run',{action:'physical'});
 if(label==='c'){if(r.execution_status!=='failed'||!/512|physical_limit/i.test(r.message))throw Error('Oversize physical graph incorrectly accepted');continue;}
 if(r.execution_status!=='completed')throw Error(r.message);const v=await api('hdl.result',{project_id:p.id,run_id:r.id});
 p=await api('hdl.apply',{project_id:p.id,expected_revision:p.revision,command_id:randomUUID(),run_id:r.id,preview_hash:v.report.preview_hash,approved:true});
 for(const[suffix,method]of[['drc','verification.run_drc'],['lvs','verification.run_lvs'],['pex','extraction.run_pex']]){const x=await call(suffix,method);if(x.execution_status!=='completed'||x.analysis_result!=='pass')throw Error(x.message);}
 await save();
}
