import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { inspectVolume, parseVolumeJSON, processCsv, sectionVolume, tetraOverlap, validateVolume, type ProcessVolume, type Vec3 } from '../packages/process/src/index';
const input=parseVolumeJSON(await readFile('examples/process/step-keyhole.process.json','utf8'));
const criteria={min_thickness_um:.03,min_coverage_ratio:.5};
const report=inspectVolume(input,criteria);
let passed=0;
const check=(name:string,run:()=>void)=>test(name,()=>{run();passed++;});
const clone=()=>structuredClone(input);
check('full analytic XYZ mesh contains stepped metal and thinner sidewall without extrusion inference',()=>{
  assert.equal(report.inspected_cells,1296);assert.equal(report.min_thickness_um,.02);assert.equal(report.min_coverage_ratio,.25);
  assert.equal(report.complete_input,true);assert(Math.abs(report.mesh_volume_um3-32)<1e-9);assert.equal(report.physical_prediction,false);
  const z=input.cells.filter(c=>c.material_id===2).flatMap(c=>c.vertices.map(i=>input.points_um[i][2]));assert.equal(Math.min(...z),.5);assert.equal(Math.max(...z),1.28);
});
check('closed keyhole and exterior air are independently classified over all cells',()=>{
  const closed=report.voids.filter(v=>v.closed),open=report.voids.filter(v=>!v.closed);assert.equal(closed.length,1);assert.equal(open.length,1);
  assert(Math.abs(closed[0].volume_um3-.16)<1e-9);assert(closed[0].cells.every(i=>input.cells[i].region==='sealed hole'));
});
check('material-specific metal and dielectric criteria do not share one physical assumption',()=>{
  const custom=inspectVolume(input,{...criteria,by_material:{'2':{min_thickness_um:.01,min_coverage_ratio:.1},'3':{min_thickness_um:.4,min_coverage_ratio:.1}}});
  assert(custom.issues.filter(i=>i.kind==='thin').every(i=>i.material_id===3));assert(custom.issues.some(i=>i.kind==='thin'));
});
check('a declared ROI never claims whole-device completeness',()=>{const v=clone();v.scope.kind='roi';assert.equal(inspectVolume(v,criteria).complete_input,false);});
check('unknown film data is counted and remains unassessed',()=>{const v=clone();for(const c of v.cells)if(c.material_id===2)c.thickness_um=null;const r=inspectVolume(v,criteria);assert(r.unknown_thickness_cells>0);assert.equal(r.complete_input,false);assert(Math.abs(r.min_thickness_um!-.3)<1e-12);});
check('a missing nominal thickness does not invent coverage',()=>{const v=clone();delete v.materials.find(m=>m.id===2)!.nominal_thickness_um;const r=inspectVolume(v,criteria);assert(r.unknown_coverage_cells>0);assert.equal(r.complete_input,false);});
check('zero film thickness is uncovered even if the chosen minimum is zero',()=>{const v=clone(),c=v.cells.find(c=>c.material_id===2)!;c.thickness_um=0;assert(inspectVolume(v,{min_thickness_um:0,min_coverage_ratio:0}).issues.some(i=>i.kind==='uncovered'));});
check('missing volume is counted instead of guessed as a closed void',()=>{const v=clone();v.scope.domain_um[1][0]=3;const r=inspectVolume(v,criteria);assert(Math.abs(r.unmeshed_volume_um3-8)<1e-8);assert.equal(r.complete_input,false);});
check('all three cuts intersect volumetric cells at correct XYZ coordinates',()=>{
  for(const axis of [0,1,2] as const){const sections=sectionVolume(input,axis,axis===2?.51:.01);assert(sections.length>0);assert(sections.every(s=>s.points.length>=3&&s.points.every(p=>Math.abs(p[axis]-(axis===2?.51:.01))<1e-10)));}
});
check('coplanar and outside cuts neither generate NaNs nor clamp the plane',()=>{assert(sectionVolume(input,2,0).length>0);assert.deepEqual(sectionVolume(input,2,10),[]);assert.throws(()=>sectionVolume(input,2,NaN));});
check('CSV contains every submitted cell and region with unknown values left blank',()=>{const text=processCsv(input,report);assert.equal(text.split('\n').length,input.cells.length+1);assert(text.includes('"step sidewall"'));assert(text.includes('"0.02"'));assert(text.includes('"demo"'));});
check('duplicate, degenerate and invalid connectivity are rejected',()=>{const v=clone();v.cells[1]={...v.cells[0],id:'other'};assert.throws(()=>validateVolume(v),/중복/);v.cells[1].vertices=[0,1,2,2];assert.throws(()=>validateVolume(v));});
check('non-finite coordinates and out-of-domain data cannot be hidden',()=>{const v=clone();v.points_um[0][0]=NaN;assert.throws(()=>validateVolume(v));v.points_um[0][0]=-3;assert.throws(()=>validateVolume(v),/domain/);});
check('negative thickness, empty provenance and wrong units are rejected',()=>{const v=clone();v.cells[0].thickness_um=-1;assert.throws(()=>validateVolume(v));v.cells[0].thickness_um=null;v.provenance.label='';assert.throws(()=>validateVolume(v));v.provenance.label='user';(v as unknown as {unit:string}).unit='nm';assert.throws(()=>validateVolume(v));});
check('invalid independent criteria are rejected',()=>{assert.throws(()=>inspectVolume(input,{min_thickness_um:NaN,min_coverage_ratio:.5}));assert.throws(()=>inspectVolume(input,{...criteria,by_material:{'99':criteria}}));});
check('positive-volume overlap is detected, touching tetrahedra are allowed',()=>{
  const a:Vec3[]=[[0,0,0],[1,0,0],[0,1,0],[0,0,1]],b=a.map(p=>p.map(v=>v+.05) as Vec3);
  assert(tetraOverlap(a,b));assert(!tetraOverlap(a,[[0,0,0],[-1,0,0],[0,-1,0],[0,0,-1]]));
  const v:ProcessVolume={...input,scope:{kind:'roi',domain_um:[[-1,-1,-1],[2,2,2]]},materials:[input.materials[1]],points_um:[...a,...b],cells:[{id:'a',material_id:1,vertices:[0,1,2,3],thickness_um:null},{id:'b',material_id:1,vertices:[4,5,6,7],thickness_um:null}]};assert.throws(()=>inspectVolume(v,criteria),/겹칩니다/);
});
check('large global coordinates retain local volume and section precision',()=>{const v=clone();for(const p of v.points_um)p[0]+=1e6;for(const p of v.scope.domain_um)p[0]+=1e6;const r=inspectVolume(v,criteria);assert(Math.abs(r.mesh_volume_um3-report.mesh_volume_um3)<1e-6);assert(sectionVolume(v,0,1e6+.01).length>0);});
check('unwelded coordinate duplicates are not silently joined into closed voids',()=>{const v=clone();v.points_um.push([...v.points_um[0]]);v.cells[0].vertices[0]=v.points_um.length-1;assert.throws(()=>validateVolume(v),/중복 node/);});
check('input geometry is immutable through inspection, slicing and export',()=>{const original=JSON.stringify(input);inspectVolume(input,criteria);sectionVolume(input,2,.7);processCsv(input,report);assert.equal(JSON.stringify(input),original);});
test.after(async()=>{
  await mkdir('docs/evidence',{recursive:true});const files=['packages/process/src/model.ts','packages/process/src/inspect.ts','packages/process/src/vtu.ts','packages/process/src/index.ts','examples/process/step-keyhole.process.json','examples/process/step-keyhole.vtu','examples/process/step-keyhole.vtu-setup.json'];
  const hashes=Object.fromEntries(await Promise.all(files.map(async f=>[f,createHash('sha256').update(await readFile(f)).digest('hex')])));
  await writeFile('docs/evidence/process-geometry.json',JSON.stringify({checked_at:new Date().toISOString(),passed,expected:19,fixture_kind:'synthetic analytic tetrahedral mesh',physical_process_prediction:false,actual_cells:report.inspected_cells,thin_sidewall_um:report.min_thickness_um,closed_voids:report.voids.filter(v=>v.closed).length,mesh_volume_um3:report.mesh_volume_um3,source_sha256:hashes},null,2));
});
