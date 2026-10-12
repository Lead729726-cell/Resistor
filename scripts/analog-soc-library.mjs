import {mkdir,readFile,writeFile,copyFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {zipSync,strToU8} from 'fflate';
import {runtimeConfig,workerRpc} from './runtime.mjs';
const root=process.cwd(),out='examples/analog-soc',cfg=await runtimeConfig();
await mkdir(out,{recursive:true});await mkdir('.runtime/analog-soc',{recursive:true});
const rpc=async(method,params={})=>{const r=await workerRpc(cfg,method,params);if(!r.ok)throw Error(`${r.error.code}: ${r.error.message}`);return r.result;};
const sha=b=>createHash('sha256').update(b).digest('hex');
const files=['workers/eda/analog_soc.py','workers/eda/digital_units.py','workers/eda/physical_library.py','workers/eda/native.py','workers/eda/design_tools.py','workers/eda/chip_references.py','workers/eda/server.py','workers/eda/pex_reduce.py','workers/eda/profile.py'];
const source=Object.fromEntries(await Promise.all(files.map(async f=>[f,sha(await readFile(f))])));const version=sha(JSON.stringify(source)).slice(0,12);
const stateFile=`.runtime/analog-soc/state-${version}.json`;let state;try{state=JSON.parse(await readFile(stateFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;state={source,projects:{},commands:{},jobs:{}};}
const save=()=>writeFile(stateFile,JSON.stringify(state,null,2));
const local=f=>{if(!f.startsWith('/workspace/'))throw Error('Unexpected native artifact root');return path.join(root,f.slice(11));};
const wait=async run=>{const until=Date.now()+420000;while(['queued','running'].includes(run.execution_status)){if(Date.now()>until)throw Error(`Job ${run.id} deadline; preserved on worker`);await new Promise(r=>setTimeout(r,800));run=await rpc('job.status',{run_id:run.id});}return run;};
const templates=(await rpc('design.catalog')).templates.filter(t=>t.id.startsWith('soc_'));
const requested=process.argv.slice(2).filter(a=>!a.startsWith('--'));const rows=[];
for(const t of templates.filter(t=>!requested.length||requested.includes(t.id))){
 const folder=path.join(out,t.id);await mkdir(folder,{recursive:true});state.commands[t.id]??=randomUUID();await save();
 const p=state.projects[t.id]?await rpc('project.open',{project_id:state.projects[t.id]}):await rpc('design.create_template',{template_id:t.id,name:'물리 · '+t.name.replace(/^SoC · /,'')+' ['+version+']',physical_core:true,parameters:t.parameter_defaults,command_id:state.commands[t.id]});
 if(p.revision!==1)throw Error('Preserve edited reference; use a fresh generation state');state.projects[t.id]=p.id;await save();
 const jobs=[];
 for(const [key,method,extra] of [['drc','verification.run_drc',{}],['lvs','verification.run_lvs',{}],['pex','extraction.run_pex',{}],['pre','simulation.run',{}],['post','simulation.run',{post_layout:true}]]){
  const id=t.id+'/'+key;let run=state.jobs[id]?await rpc('job.status',{run_id:state.jobs[id]}):null;
  if(!run){run=await rpc(method,{project_id:p.id,expected_revision:p.revision,...(key==='pre'||key==='post'?p.testbench:{}),...extra,command_id:randomUUID()});state.jobs[id]=run.id;await save();}
  run=await wait(run);const record={reference:t.id,stage:key,project_id:p.id,run_id:run.id,revision:run.revision,execution_status:run.execution_status,analysis_result:run.analysis_result,message:run.message,elapsed_s:run.elapsed_s,parasitics:run.parasitics,measurements:run.measurements,verification:run.reference_verification,marker_count:run.markers?.length,artifacts:run.artifacts};
  await writeFile(path.join(folder,key+'-result.json'),JSON.stringify(record,null,2)+'\n');jobs.push(record);
  const nativeDir=path.dirname(local(run.manifest_path));const dest=path.join(folder,key);await mkdir(dest,{recursive:true});
  for(const f of await readdir(nativeDir))if(/^(manifest.json|lvs.log|markers.tsv|pex-quality.json|pex-reduction.json|.*\.spice)$/.test(f)){const text=(await readFile(path.join(nativeDir,f),'utf8')).replaceAll(path.posix.dirname(run.manifest_path)+'/','./');await writeFile(path.join(dest,f),text);}
  if(run.waveforms?.length){const waves=run.waveforms,csv=['time_or_frequency,'+waves.map(w=>`${w.name} [${w.unit}]`).join(',')];for(let i=0;i<waves[0].x.length;i++)csv.push([waves[0].x[i],...waves.map(w=>w.y[i])].join(','));await writeFile(path.join(folder,key+'-waveforms.csv'),csv.join('\n')+'\n');}
  console.log(JSON.stringify({reference:t.id,stage:key,status:run.execution_status,result:run.analysis_result,markers:run.markers?.length,parasitics:run.parasitics,message:run.execution_status==='failed'?run.message:undefined}));
 }
 for(const format of ['gds','oas']){const e=await rpc('layout.export',{project_id:p.id,format});if(!e.roundtrip?.geometry_equal)throw Error('Native layout round-trip changed mask geometry');await copyFile(local(e.path),path.join(folder,t.id+'.'+format));if(e.sidecar_path)await copyFile(local(e.sidecar_path),path.join(folder,t.id+'.'+format+'.mos.json'));}
 const bundle=await rpc('project.export_bundle',{project_id:p.id,inline:true});await writeFile(path.join(folder,t.id+'.register.zip'),Buffer.from(bundle.bundle_base64,'base64'));
 const ir=await rpc('schematic.export_spice',{project_id:p.id});await writeFile(path.join(folder,'core.spice'),ir.text);
 await writeFile(path.join(folder,'physical-conversion.json'),JSON.stringify({ports:p.ports,parameters:p.design_template.parameters,passive_replacements:p.design_template.passive_replacements,rc_corner:'typical',manufacturing_signoff:false},null,2)+'\n');
 const summary={reference:t.id,name:t.name,project_id:p.id,revision:p.revision,jobs,physical_verification_pass:jobs.slice(0,3).every(j=>j.execution_status==='completed'&&j.analysis_result==='pass'),post_layout_criteria_pass:jobs.at(-1).analysis_result==='pass',foundry_signoff:false};rows.push(summary);
 await writeFile(path.join(folder,'README.md'),`# ${t.name}\n\n실제 SKY130 MOS·폴리 저항·MIM 소자로 만든 물리 레퍼런스입니다. 최신 소스 엔진에서 프로젝트 ZIP을 가져오세요. 원래 회로 레퍼런스는 보존됩니다.\n\n| 단계 | 실행 | 결과 |\n|---|---|---|\n${jobs.map(j=>`| ${j.stage} | ${j.execution_status} | ${j.analysis_result} |`).join('\n')}\n\n[GDS](${t.id}.gds) · [OASIS](${t.id}.oas) · [편집 프로젝트](${t.id}.register.zip) · [회로 SPICE](core.spice) · [RC 변환](physical-conversion.json)\n\n외부 전압 기준·바이어스·클록·출력 부하와 1nF DC-DC flying/output C는 testbench입니다. DC-DC FLYTOP/FLYBOTTOM은 물리 입출력 핀입니다. 기생 RC는 실제 Magic extresist 출력이며 원본을 조작하지 않습니다. 기능 실패는 그대로 남깁니다.\n\n의도적으로 넓은 참조 배선입니다. matching/common-centroid, 고밀도 셀 행·LEF/Liberty, full-chip 밀도/antenna/ESD/패드/봉지, 파운드리 승인, 잡음·통계·EM/IR·수율 검증은 별도입니다. 공개 DRC deck 통과는 foundry signoff가 아닙니다.\n`);
 await writeFile(path.join(out,'evidence.json'),JSON.stringify({schema_version:1,generated_at:new Date().toISOString(),source_sha256:source,source_version:version,rows,paid_calls:0,foundry_signoff:false},null,2)+'\n');
}
const archive={},checks=[];async function collect(dir){for(const f of await readdir(dir,{withFileTypes:true})){const full=path.join(dir,f.name);if(f.isDirectory())await collect(full);else if(f.isFile()&&f.name!=='SHA256SUMS.json'){const b=await readFile(full);const rel=path.relative(out,full).replaceAll('\\','/');archive[rel]=new Uint8Array(b);checks.push({file:rel,bytes:b.length,sha256:sha(b)});}}}
await collect(out);await writeFile(path.join(out,'SHA256SUMS.json'),JSON.stringify(checks,null,2));archive['SHA256SUMS.json']=strToU8(JSON.stringify(checks,null,2));await writeFile('examples/Resistor-Analog-SoC.zip',zipSync(archive,{level:6}));
console.log(JSON.stringify({references:rows.length,physical_pass:rows.filter(r=>r.physical_verification_pass).length,post_pass:rows.filter(r=>r.post_layout_criteria_pass).length,stateFile}));
