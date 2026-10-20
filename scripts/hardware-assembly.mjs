import assert from 'node:assert/strict';import{randomUUID}from'node:crypto';
/** Actual digital CMOS and analog current mirror; no inferred inter-block mask routes. */
export async function createHardwareAssembly(api,digital){
 let target=await api('hdl.new_assembly',{name:'Hardware QA · digital + analog current mirror',top:'SOC_TOP',command_id:randomUUID()});
 const analog=await api('project.create',{example:'current_mirror',name:'Hardware QA · analog current mirror'});
 for(const[src,namespace,pins,position]of [[digital,'DIGITAL',{a:'IN',y:'DIGITAL_OUT',VPWR:'VPWR',VGND:'VGND'},['100000','100000']],[analog,'ANALOG',{REF:'DIGITAL_OUT',OUT:'ANALOG_OUT',VGND:'VGND'},['200000','100000']]]){
  const request={project_id:target.id,mode:'place',source_project_id:src.id,source_cell:src.cell,target_cell:target.cell,namespace,scope:'both',pins,position},v=await api('hierarchy.preview',request);assert(!v.before.truncated&&!v.after.truncated);
  target=await api('hierarchy.apply',{project_id:target.id,request,expected_revision:target.revision,command_id:randomUUID(),preview_hash:v.preview_hash,approved:true});
 }
 assert.equal(target.integration_bindings.length,1);assert.deepEqual(target.integration_bindings[0].hdl_design,digital.hdl_design);
 const b=await api('project.export_bundle',{project_id:target.id,inline:true}),imported=await api('project.import_bundle',{bundle_base64:b.bundle_base64,mode:'new',command_id:randomUUID()});assert.deepEqual(imported.integration_bindings,target.integration_bindings);assert.equal(imported.runs.length,0);
 return {assembly:target,imported,analog};
}
