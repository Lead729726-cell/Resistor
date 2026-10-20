import {writeFile,mkdir} from 'node:fs/promises';import {randomUUID}from 'node:crypto';import assert from 'node:assert/strict';
import {createHardwareAssembly}from './hardware-assembly.mjs';
import {hardwareWorkspace}from './hardware-workspace.mjs';import {hardwareExamples}from '../packages/ui/src/hardware-examples.ts';
const {workspace,api,wait}=await hardwareWorkspace(),records=[],projects={};await mkdir('.runtime/hardware/results',{recursive:true});
const capture=async(label,job)=>{const r=await wait(job);records.push({label,id:r.id,project_id:r.project_id,execution:r.execution_status,analysis:r.analysis_result,message:r.message,measurements:r.measurements});await writeFile('.runtime/hardware/results/'+r.id+'.json',JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify(records.at(-1)));return r;};
const create=async(label,spec)=>{const p=await api('hdl.create',{name:'Hardware QA · '+label,design:spec,command_id:randomUUID()});projects[label]=p.id;return p;};
for(const id of ['inverter','adder','counter','vhdl','c','blif','rtlil','rom']){
 const spec=structuredClone(hardwareExamples[id].design);
 if(id==='adder'||id==='vhdl')spec.vectors=Array.from({length:256},(_,i)=>({inputs:{a:String(i&15),b:String(i>>4)},expect:{[id==='adder'?'sum':'sum']:String((i&15)+(i>>4))}}));
 if(id==='c'){let seed=123456789;for(let i=0;i<64;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const a=seed;seed=(Math.imul(seed,1664525)+1013904223)>>>0;spec.vectors.push({inputs:{a:String(a),b:String(seed),sel:String(i%2)}});}}
 const p=await create(id,spec),r=await capture(id+'-simulate',await api('hdl.run',{project_id:p.id,expected_revision:p.revision,action:'simulate'}));
 if(r.execution_status==='completed'){const value=await api('hdl.result',{project_id:p.id,run_id:r.id});await writeFile('.runtime/hardware/results/'+r.id+'.report.json',JSON.stringify(value.report,null,2)+'\n');}
 if(['counter','adder','vhdl','c'].includes(id)){await capture(id+'-synthesize',await api('hdl.run',{project_id:p.id,expected_revision:p.revision,action:'synthesize'}));}
}
const mixed=structuredClone(hardwareExamples.vhdl.design);mixed.top='mixed_top';mixed.vhdl_entity='vhdl_adder';mixed.files.push({name:'mixed_top.sv',language:'systemverilog',text:'module mixed_top(input [3:0] a,b, output [4:0] y);wire [4:0] sum;vhdl_adder u(a,b,sum);assign y=sum ^ 5\'b10101;endmodule\n'});mixed.vectors=Array.from({length:64},(_,i)=>({inputs:{a:String(i&15),b:String(i>>4)},expect:{y:String(((i&15)+(i>>4))^21)}}));const mp=await create('mixed-language',mixed);await capture('mixed-language-simulate',await api('hdl.run',{project_id:mp.id,expected_revision:mp.revision,action:'simulate'}));
const sp=await create('spice',hardwareExamples.spice.design);await capture('spice-import',await api('hdl.run',{project_id:sp.id,expected_revision:sp.revision,action:'synthesize'}));
let p=await api('project.open',{project_id:projects.inverter});const physical=await capture('inverter-physical',await api('hdl.run',{project_id:p.id,expected_revision:p.revision,action:'physical'}));
if(physical.execution_status==='completed'){
 const preview=await api('hdl.result',{project_id:p.id,run_id:physical.id});assert(preview.report.layout_generated);assert(preview.scene.shapes.length>0);
 try{await api('hdl.apply',{project_id:p.id,expected_revision:p.revision,command_id:randomUUID(),run_id:physical.id,preview_hash:'wrong',approved:true});throw Error('Wrong preview unexpectedly applied');}catch(e){assert.equal(e.code,'STALE_PREVIEW');}
 p=await api('hdl.apply',{project_id:p.id,expected_revision:p.revision,command_id:randomUUID(),run_id:physical.id,preview_hash:preview.report.preview_hash,approved:true});projects.applied=p.id;
 for(const [label,method]of [['hdl-drc','verification.run_drc'],['hdl-lvs','verification.run_lvs']])await capture(label,await api(method,{project_id:p.id,expected_revision:p.revision}));
 const analog=await api('hdl.analog_test',{project_id:p.id,expected_revision:p.revision,command_id:randomUUID(),output:'y',resistance_Ohm:1000,capacitance_F:1e-12});projects.analog=analog.id;
 try{await api('simulation.run',{project_id:analog.id,expected_revision:analog.revision,...analog.testbench,post_layout:true});throw Error('Unrouted RC was accepted for post-layout');}catch(e){assert.equal(e.code,'MIXED_INTERFACE_UNROUTED');}
 const analogRun=await capture('mixed-mos-rc',await api('simulation.run',{project_id:analog.id,expected_revision:analog.revision,...analog.testbench}));assert.equal(analogRun.execution_status,'completed');assert(analogRun.waveforms.some(w=>w.name==='ANALOG_OUT'));assert.equal(analogRun.measurements?.current_flow_status,'available');assert(analogRun.current_flow?.branches?.length>0);
 const bundle=await api('project.export_bundle',{project_id:p.id,inline:true}),imported=await api('project.import_bundle',{bundle_base64:bundle.bundle_base64,mode:'new',command_id:randomUUID()});assert.deepEqual(imported.hdl_design,p.hdl_design);assert.equal(imported.runs.length,0);projects.imported=imported.id;
 const copy=await api('hdl.analog_test',{project_id:imported.id,expected_revision:imported.revision,command_id:randomUUID(),output:'y',resistance_Ohm:1000,capacitance_F:1e-12});projects.imported_analog=copy.id;
 const assembly=await createHardwareAssembly(api,p);projects.assembly=assembly.assembly.id;projects.assembly_imported=assembly.imported.id;projects.analog_macro=assembly.analog.id;

}
const failSpec=structuredClone(hardwareExamples.inverter.design);failSpec.vectors[0].expect.y='0';const fail=await create('wrong-output',failSpec);const negative=await capture('negative-wrong-output',await api('hdl.run',{project_id:fail.id,expected_revision:fail.revision,action:'simulate'}));assert.equal(negative.execution_status,'failed');
const summary={schema_version:1,edition:'Resistor Indust',captured_at:new Date().toISOString(),workspace,projects,records,manufacturing_signoff:false};await writeFile('.runtime/hardware/qualification.json',JSON.stringify(summary,null,2)+'\n');
assert(records.filter(r=>r.label.endsWith('-simulate')).every(r=>r.execution==='completed'&&r.analysis==='pass'),'One or more native language simulations failed; original logs preserved.');assert.equal(physical.execution_status,'completed');
assert(records.filter(r=>['hdl-drc','hdl-lvs'].includes(r.label)).every(r=>r.analysis==='pass'));
