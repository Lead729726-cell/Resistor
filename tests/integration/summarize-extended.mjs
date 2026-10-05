import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const root=process.cwd();const out=path.join(root,'examples/sky130');
const config=JSON.parse(await fs.readFile('.runtime/worker.json','utf8'));
async function rpc(method,params={}) {
  const body=await(await fetch(config.url+'/rpc',{method:'POST',headers:{'content-type':'application/json','X-MOS-Token':config.token},body:JSON.stringify({method,params})})).json();
  assert.equal(body.ok,true,JSON.stringify(body.error));return body.result;
}
const hash=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
const scrub=value=>JSON.parse(JSON.stringify(value,(key,item)=>['waveforms','bundle_base64','token'].includes(key)?undefined:item));
const sections={};
for(const name of ['extensions','native-extended','optimizer','analog','faults','budgets','deadline','bundle-history','interruption']) {
  const source=path.join(root,'.runtime/evidence',name+'.json');const raw=await fs.readFile(source);const data=JSON.parse(raw);
  const cases=Array.isArray(data)?data:[data];
  for(const item of cases)assert.equal(item.result,item.expected??'pass',name+': '+(item.case??item.example));
  sections[name]={source:'.runtime/evidence/'+name+'.json',sha256:hash(raw),case_count:cases.length,cases:scrub(cases)};
}
const exports=[];
for(const example of ['current_mirror','differential_pair']) {
  const cases=sections.analog.cases.filter(item=>item.example===example);assert.equal(cases.length,7);
  const project_id=cases[0].project_id;const exported=await rpc('layout.export',{project_id,format:'gds'});
  for(const key of ['geometry_equal','hierarchy_preserved','stable_ids_preserved'])assert.equal(exported.roundtrip[key],true);
  const local=file=>file.replace('/workspace',root);const sidecar=JSON.parse(await fs.readFile(local(exported.sidecar_path),'utf8'));
  sidecar.project.runs=[];sidecar.project.name='Verified SKY130 '+example;
  await fs.copyFile(local(exported.path),path.join(out,example+'.gds'));
  await fs.writeFile(path.join(out,example+'.gds.mos.json'),JSON.stringify(sidecar,null,2)+'\n');
  exports.push({example,project_id,revision:sidecar.project.revision,gds:example+'.gds',sha256:hash(await fs.readFile(path.join(out,example+'.gds'))),sidecar:example+'.gds.mos.json',roundtrip:exported.roundtrip,parasitics:cases.find(item=>item.method==='extraction.run_pex').parasitics});
}
const baseline=JSON.parse(await fs.readFile(path.join(out,'verified-baseline.json'),'utf8'));
const summary={schema_version:2,recorded_at:new Date().toISOString(),product:'Register',toolchain:await rpc('toolchain.doctor'),
 baseline_evidence:'verified-baseline.json',baseline_case_count:baseline.cases.length,baseline_advanced_count:baseline.advanced.length,
 extended_case_count:Object.values(sections).reduce((n,section)=>n+section.case_count,0),sections,exports,
 limits:['Public full Magic DRC and Netgen LVS are actual deck results, not foundry signoff.','Physical process heights remain unknown; viewer heights are illustrative.','MOS nf=m=1 mapping only; two analog cores use fixed verified physical routing.','Xschem bridge generates flat native cells; native hierarchical SPICE is separately verified.','Optimizer scores require actual PCell, DRC, LVS and ngspice; power_W is Vds times peak sampled DC drain current.','Exact extracted RC element-to-polygon spatial mapping remains unknown.','Arbitrary PDK registration/decks, Monte Carlo and TCAD are unsupported.']};
await fs.writeFile(path.join(out,'verified-extended.json'),JSON.stringify(summary,null,2)+'\n');
console.log(`Exported two actual analog GDS/sidecars and ${summary.extended_case_count} extension regression cases; native logs/manifests remain in runtime evidence.`);
