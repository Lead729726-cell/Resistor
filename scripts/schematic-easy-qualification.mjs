// Actual native solver and revision gates; creates owned QA projects only.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,copyFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {runtimeConfig,workerRpc} from './runtime.mjs';
const cfg=await runtimeConfig(),records=[];
const root='docs/evidence/conversion';await mkdir(root,{recursive:true});
const rpc=async(m,p={})=>{const r=await workerRpc(cfg,m,p);if(!r.ok)throw Object.assign(Error(r.error.message),{code:r.error.code});return r.result;};
const local=f=>{assert(f.startsWith('/workspace/'));return path.resolve(f.slice(11));};
async function job(m,p){let r=await rpc(m,{...p,command_id:randomUUID()});const end=Date.now()+180000;while(['queued','running'].includes(r.execution_status)){assert(Date.now()<end,'Retained job timed out');await new Promise(r=>setTimeout(r,200));r=await rpc('job.status',{run_id:r.id});}records.push({method:m,run:r});console.log(JSON.stringify({method:m,id:r.id,status:r.execution_status,result:r.analysis_result}));return r;}
async function command(p,c){return rpc('schematic.apply_command',{project_id:p.id,expected_revision:p.revision,command_id:randomUUID(),command:c});}
let p=await rpc('project.create',{example:'schematic',name:'직접 회로 QA · 1.8V / 10kΩ ×2'});
const device=(id,kind,x,y,parameters)=>({id,name:id.toUpperCase(),kind,x,y,parameters,pins:kind==='ground'?{G:'0'}:{'+':'','-':''}});
for(const d of [device('v1','voltage',100,100,{dc:1.8}),device('r1','resistor',300,100,{value:10000}),device('r2','resistor',500,220,{value:10000}),device('g1','ground',100,300,{})])p=await command(p,{type:'add_device',device:d});
const connect=async(a,ap,b,bp,points)=>{p=await command(p,{type:'connect_pins',id:randomUUID(),from_device_id:a,from_pin:ap,to_device_id:b,to_pin:bp,points});};
await connect('v1','+','r1','+',[[100,56],[300,56]]);
await connect('r1','-','r2','+',[[300,144],[400,144],[400,176],[500,176]]);
await connect('v1','-','g1','G',[[100,144],[100,270]]);
await connect('r2','-','g1','G',[[500,264],[600,264],[600,350],[50,350],[50,270],[100,270]]);
assert.equal((await rpc('schematic.validate',{project_id:p.id})).valid,true);
const op=await job('simulation.run',{project_id:p.id,analysis:'op'});assert.equal(op.execution_status,'completed',op.message);assert.equal(op.analysis_result,'unknown');
const output=p.schematic.devices.find(d=>d.id==='r1').pins['-'];const outputV=op.waveforms.find(w=>w.name===output).y[0];assert(Math.abs(outputV-.9)<1e-8);
const currents=op.current_flow.branches.filter(b=>b.device_id==='r1'||b.device_id==='r2');assert.equal(currents.length,2);for(const b of currents)assert(Math.abs(Math.abs(b.values_A[0])-90e-6)<1e-10);
// No physical shapes must never become a successful DRC job.
await assert.rejects(rpc('verification.run_drc',{project_id:p.id}),{code:'NO_PHYSICAL_LAYOUT'});
let blank=await rpc('project.create',{example:'schematic',name:'직접 회로 QA · 빈 회로 해석 거절'});const empty=await job('simulation.run',{project_id:blank.id,analysis:'op'});assert.equal(empty.execution_status,'failed');
// The preview is immutable until the exact matching approved revision applies.
const settings={chip_limits:{width_um:600,height_um:300,max_area_um2:180000,edge_um:10},body_net:'0',pin_side:'left',order:'schematic'};
const fwd=await job('conversion.forward',{project_id:p.id,expected_revision:p.revision,settings});assert.equal(fwd.execution_status,'completed',fwd.message);
const preview=await rpc('conversion.result',{project_id:p.id,run_id:fwd.id});assert(preview.report.ready);assert.equal((await rpc('project.open',{project_id:p.id})).revision,p.revision);
const apply={project_id:p.id,expected_revision:p.revision,run_id:fwd.id,preview_hash:preview.report.preview_hash,approved:true,command_id:randomUUID()};
await assert.rejects(rpc('conversion.apply',{...apply,command_id:randomUUID(),preview_hash:'0'.repeat(64)}),{code:'STALE_PREVIEW'});
await assert.rejects(rpc('conversion.apply',{...apply,command_id:randomUUID(),approved:false}),{code:'APPROVAL_REQUIRED'});
p=await rpc('conversion.apply',apply);assert.equal(p.conversion.external_sources.length,1);
for(const m of ['verification.run_drc','verification.run_lvs','extraction.run_pex']){const r=await job(m,{project_id:p.id});assert.equal(r.execution_status,'completed',r.message);assert.equal(r.analysis_result,'pass',r.message);}
const after=await job('simulation.run',{project_id:p.id,analysis:'op'});assert.equal(after.execution_status,'completed',after.message);assert(Math.abs(after.waveforms.find(w=>w.name===output).y[0]-.9)<1e-8);
const post=await job('simulation.run',{project_id:p.id,analysis:'op',post_layout:true});assert.equal(post.execution_status,'completed',post.message);assert(post.waveforms.every(w=>w.y.every(Number.isFinite)));
const stale=await job('conversion.forward',{project_id:p.id,expected_revision:p.revision,settings});assert.equal(stale.execution_status,'completed');const staleReport=await rpc('conversion.result',{project_id:p.id,run_id:stale.id});const actual=p.schematic.devices[0];p=await command(p,{type:'move_device',id:actual.id,x:actual.x+10,y:actual.y});
await assert.rejects(rpc('conversion.apply',{...apply,expected_revision:p.revision,command_id:randomUUID(),run_id:stale.id,preview_hash:staleReport.report.preview_hash}),{code:'STALE_PREVIEW'});
const tiny=await job('conversion.forward',{project_id:p.id,expected_revision:p.revision,settings:{...settings,chip_limits:{width_um:21,height_um:21,max_area_um2:441,edge_um:10}}});assert.equal(tiny.execution_status,'failed');assert.equal((await rpc('project.open',{project_id:p.id})).revision,p.revision);
const source_sha256={};for(const f of ['workers/eda/conversion.py','workers/eda/custom_circuit.py','workers/eda/server.py','workers/eda/native.py','workers/eda/physical_library.py','workers/eda/geometry.py'])source_sha256[f]=createHash('sha256').update(await readFile(f)).digest('hex');
for(const record of records){const r=record.run;const folder=root+'/'+r.id;await mkdir(folder,{recursive:true});for(const file of await readdir(path.dirname(local(r.manifest_path))))if(/\.(json|log|spice|tcl)$/.test(file))await copyFile(path.dirname(local(r.manifest_path))+'/'+file,folder+'/'+file);}
await writeFile(root+'/native.json',JSON.stringify({checked_at:new Date().toISOString(),source_sha256,checks:{explicit_pin_connections:true,actual_ngspice_output_V:outputV,actual_resistor_current_A:currents.map(b=>b.values_A[0]),blank_physical_verification_rejected:true,blank_simulation_rejected:true,preview_source_unchanged:true,hash_gate:true,approval_gate:true,stale_gate:true,small_envelope_no_mutation:true,external_bias_replayed:true,actual_post_layout_completed:true},records,foundry_signoff:false},null,2)+'\n');
