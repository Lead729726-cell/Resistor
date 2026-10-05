import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd();
const evidence=JSON.parse(await fs.readFile(path.join(root,'.runtime/evidence/physics.json'),'utf8'));
const advanced=JSON.parse(await fs.readFile(path.join(root,'.runtime/evidence/advanced.json'),'utf8'));
for(const c of evidence.cases) {assert.equal(c.run.execution_status,'completed'); assert.equal(c.run.analysis_result,c.expected);}
const summary={schema_version:1,date:evidence.date,toolchain:evidence.doctor,pdk_commit:evidence.doctor.pdk.version,
 cases:evidence.cases.map(c=>({name:c.name,project_id:c.project_id,revision:c.revision,method:c.method,settings:c.params,run_id:c.run.id,execution_status:c.run.execution_status,analysis_result:c.run.analysis_result,expected:c.expected,
 message:c.run.message,marker_count:c.run.markers?.length,parasitics:c.run.parasitics,measurements:c.run.measurements,manifest_path:c.run.manifest_path})),advanced,
 comparisons:[],
 limits:['Public Magic deck pass is not foundry signoff.','Display stack heights are illustrative; physical thicknesses unknown.','Fixed public inverter template plus actual welltap cells; no arbitrary inverter PCell.','MOS nf=m=1 only; see verified-extended.json for geometric schematic, hierarchy, corners and analog extensions.']};
for(const example of ['inverter','MOS PCell']) {
 const before=evidence.cases.find(c=>c.name.includes(example) && c.method==='simulation.run' && !c.params.post_layout);
 const after=evidence.cases.find(c=>c.name.includes(example) && c.method==='simulation.run' && c.params.post_layout);
 if(before && after) {
  const metrics={}; for(const [key,value] of Object.entries(before.run.measurements)) {
   const next=after.run.measurements[key]; if(typeof value==='number' && typeof next==='number' && ['tpHL_s','Id_max','Id_min'].includes(key)) metrics[key]={pre:value,post:next,delta:next-value};
  }
  summary.comparisons.push({example,revision:before.run.revision,pre_run_id:before.run.id,post_run_id:after.run.id,settings:before.params,metrics,method:'Same native testbench, corner, temperature and supply; each waveform comes from actual ngspice. Extracted netlist retains actual junction geometry and additional native R/C.'});
 }
}
const out=path.join(root,'examples/sky130'); await fs.writeFile(path.join(out,'verified-baseline.json'),JSON.stringify(summary,null,2));
const config=JSON.parse(await fs.readFile(path.join(root,'.runtime/worker.json'),'utf8'));
async function rpc(method,params) {const r=await fetch(config.url+'/rpc',{method:'POST',headers:{'content-type':'application/json','X-MOS-Token':config.token},body:JSON.stringify({method,params})}); const b=await r.json(); if(!b.ok)throw new Error(b.error.message);return b.result;}
for(const example of ['inverter','mosfet','wire']) {
 const c=evidence.cases.find(c=>c.name.toLowerCase().includes(example==='mosfet'?'mos pcell':example)); assert.ok(c);
 const result=await rpc('layout.export',{project_id:c.project_id,format:'gds'});
 assert.equal(result.roundtrip.geometry_equal,true); assert.equal(result.roundtrip.hierarchy_preserved,true); assert.equal(result.roundtrip.stable_ids_preserved,true);
 const source=result.path.replace('/workspace',root); const side=JSON.parse(await fs.readFile(result.sidecar_path.replace('/workspace',root),'utf8'));
 side.project.runs=[]; side.project.name=`Verified SKY130 ${example}`;
 await fs.copyFile(source,path.join(out,example+'.gds')); await fs.writeFile(path.join(out,example+'.gds.mos.json'),JSON.stringify(side,null,2));
}
console.log(`Saved ${summary.cases.length} native physical regressions, ${advanced.length} advanced checks and three actual GDS/sidecar examples.`);
