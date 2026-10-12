import {mkdir,readFile,writeFile,copyFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {zipSync,strToU8} from 'fflate';
import {runtimeConfig,workerRpc} from './runtime.mjs';
const root=process.cwd(),out=path.join(root,'examples/chip-portfolio'),config=await runtimeConfig();
await mkdir(out,{recursive:true});await mkdir('.runtime/chip-portfolio',{recursive:true});
const rpc=async(method,params={})=>{const r=await workerRpc(config,method,params);if(!r.ok)throw Error(`${r.error.code}: ${r.error.message}`);return r.result;};
const wait=async run=>{const until=Date.now()+180000;while(['queued','running'].includes(run.execution_status)){if(Date.now()>until)throw Error('Native job deadline exceeded; inspect preserved logs');await new Promise(r=>setTimeout(r,800));run=await rpc('job.status',{run_id:run.id});}return run;};
const local=file=>{if(!file.startsWith('/workspace/'))throw Error('Artifact is outside the workspace');return path.join(root,file.slice('/workspace/'.length));};
const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
const catalog=await rpc('design.catalog'),templates=catalog.templates.filter(t=>t.id.startsWith('chip_'));
if(templates.length!==6)throw Error('The current source engine with six chip templates is required');
let state;try{state=JSON.parse(await readFile('.runtime/chip-portfolio/generation-state.json','utf8'));}catch(error){if(error.code!=='ENOENT')throw error;state={command_ids:{},projects:{}};}
const saveState=()=>writeFile('.runtime/chip-portfolio/generation-state.json',JSON.stringify(state));
const native=[];const safety=[];
for(const t of templates){
 const folder=path.join(out,t.id);await mkdir(folder,{recursive:true});
 state.command_ids[t.id]??=randomUUID();await saveState();
 const p=await rpc('design.create_template',{template_id:t.id,name:'포트폴리오 · '+t.name,parameters:t.parameter_defaults,physical_core:false,command_id:state.command_ids[t.id]});state.projects[t.id]=p.id;await saveState();
 if(p.revision!==1)throw Error('Reference project has user edits; preserve it and create a new generation state');
 const net=await rpc('schematic.export_spice',{project_id:p.id});await writeFile(path.join(folder,'core.spice'),net.text);
 const bundle=await rpc('project.export_bundle',{project_id:p.id,inline:true});await writeFile(path.join(folder,`${t.id}.register.zip`),Buffer.from(bundle.bundle_base64,'base64'));
 // An imported copy must start without inherited successful jobs or masks.
 const reopened=await rpc('project.import_bundle',{bundle_base64:bundle.bundle_base64,mode:'new',command_id:randomUUID()});
 if(reopened.runs.length!==0)throw Error('Import incorrectly inherited jobs');
 const scene=await rpc('view.get_scene',{project_id:reopened.id,max_shapes:100});if(scene.shapes.length!==0)throw Error('Schematic reference unexpectedly advertises physical geometry');
 for(const method of ['verification.run_drc','verification.run_lvs','extraction.run_pex']){
  const r=await workerRpc(config,method,{project_id:reopened.id,command_id:randomUUID()});if(r.ok||r.error?.code!=='NO_PHYSICAL_LAYOUT')throw Error('Empty reference must reject physical verification');
 }
 safety.push({reference:t.id,bundle_reopens:true,imported_runs:0,shapes:0,drc_lvs_pex_rejected:true});
 const conditions=process.argv.includes('--all-corners')?[['tt',27,1.8],['ss',125,1.62],['ff',-40,1.8]]:[['tt',27,1.8]];
 const cases=[];
 for(const [corner,temp,supply] of conditions){
  const run=await wait(await rpc('simulation.run',{project_id:p.id,...p.testbench,corner,temperature_C:temp,supply_V:supply,command_id:randomUUID()}));
  if(run.execution_status!=='completed')throw Error(`${t.id}/${corner}: ${run.message}`);
  for(const w of run.waveforms)if(w.x.some((x,i)=>i>0&&x<=w.x[i-1]))throw Error('Native waveform lost time/frequency precision');
  if(p.testbench.analysis!=='ac'&&(!run.current_flow?.branches?.length||run.current_flow.x.some((x,i,a)=>i>0&&x<=a[i-1])))throw Error('Current-flow axis/data unavailable or not increasing');
  if(corner==='tt'&&(run.analysis_result!=='pass'||run.reference_verification?.pass!==true))throw Error(`Nominal reference criteria failed for ${t.id}`);
  const record={reference:t.id,project_id:p.id,run_id:run.id,revision:run.revision,corner,temperature_C:temp,supply_V:supply,execution_status:run.execution_status,analysis_result:run.analysis_result,elapsed_s:run.elapsed_s,measurements:run.measurements,verification:run.reference_verification};
  cases.push(record);native.push(record);await writeFile(path.join(folder,`results-${corner}.json`),JSON.stringify(record,null,2)+'\n');
  if(corner==='tt'){
   const wav=run.waveforms;const csv=['time_or_frequency,'+wav.map(w=>`${w.name} [${w.unit}]`).join(',')];
   for(let i=0;i<wav[0].x.length;i++)csv.push([wav[0].x[i],...wav.map(w=>w.y[i])].join(','));
   await writeFile(path.join(folder,'waveforms.csv'),csv.join('\n')+'\n');
   const runDir=path.dirname(local(run.manifest_path));const target=path.join(folder,'spice');await mkdir(target,{recursive:true});
   for(const file of await readdir(runDir))if(file.endsWith('.spice')){
    const text=(await readFile(path.join(runDir,file),'utf8')).replaceAll(path.posix.dirname(run.manifest_path)+'/','./');
    await writeFile(path.join(target,file),text);
   }
   await copyFile(local(run.manifest_path),path.join(folder,'native-manifest.json'));
   await copyFile(local(run.artifacts.stdout),path.join(folder,'ngspice.log'));
  }
  console.log(JSON.stringify({reference:t.id,corner,status:run.execution_status,criteria:run.analysis_result,passed:run.reference_verification?.checks.filter(c=>c.pass).length,total:run.reference_verification?.checks.length,elapsed_s:run.elapsed_s}));
 }
 const nominal=cases[0];
 const metrics=Object.entries(nominal.measurements).filter(([k])=>/frequency|gain_|bandwidth|output_V|undershoot|power_|efficiency|phase_error|relative_frequency/.test(k));
 const rows=metrics.map(([k,v])=>`| ${k} | ${typeof v==='number'?v.toPrecision(7):v??'미관측'} |`).join('\n');
 await writeFile(path.join(folder,'README.md'),`# ${t.name}\n\n${t.scope}.\n\n## 열고 재실행\n\nResistor 최신 소스의 프로젝트 도구 → 내 반도체에서 이 설계를 선택하거나 [프로젝트 ZIP](${t.id}.register.zip)을 워크스페이스에서 가져옵니다. 회로도에서 하위 셀·MOS W/L·RC를 편집하고 Simulation을 실행하세요. 기존 0.16.1 설치본에는 새 template adapter가 없으므로 최신 소스 엔진이 필요합니다.\n\n[회로 SPICE](core.spice) · [TT 결과](results-tt.json) · [실제 파형 CSV](waveforms.csv) · [실제 실행 manifest](native-manifest.json).\n\nDocker의 SKY130 모델은 별도로 필요합니다. 폴더 전체를 유지하고 컨테이너에서 다음 testbench를 실행할 수 있습니다.\n\n\`\`\`sh\ndocker exec -w /workspace/examples/chip-portfolio/${t.id}/spice mos-studio-eda /foss/tools/ngspice/bin/ngspice -b testbench.spice\n\`\`\`\n\n## 실제 기본 관측값\n\nTT · 27°C · 1.8V · ${p.testbench.analysis.toUpperCase()} · ${nominal.verification.checks.filter(c=>c.pass).length}/${nominal.verification.checks.length} 파형 기준.\n\n| 항목 | 실제 표본으로 계산한 값 |\n|---|---|\n${rows}\n\n## 포트폴리오 작성 순서\n\n1. 요구 사양·입출력·전원·동작 영역과 이 외부 testbench 가정을 설명합니다.\n2. 계층 회로·소자 크기·바이어스·보상 선택 이유를 보여줍니다.\n3. 원본 파형과 표의 계산 방법을 제시하고 수정 전후를 비교합니다.\n4. SS/TT/FF·온도·전원에서 목표가 충족되는지 확인합니다. 실패한 조건을 숨기지 않습니다.\n5. 실제 소자 PCell, matching, guard ring, well tap, 배선·기생·DRC/LVS/PEX를 추가한 뒤 다시 검사합니다.\n\n레이아웃은 미생성입니다. 이 ZIP의 빈 OASIS는 앱 교환 컨테이너이며 칩 레이아웃이 아닙니다. DRC/LVS/PEX·post-layout·Monte Carlo·잡음·칩 제조 signoff는 이번 참조에 포함하지 않습니다. 스위치드 커패시터 효율은 외부 클록 드라이버 전력을 제외한 power-stage 값입니다. PLL은 Type-I XOR, N=1이며 PFD/charge-pump 또는 RF jitter 검증이 아닙니다.\n`);
}
const sources=['workers/eda/chip_references.py','workers/eda/design_tools.py','workers/eda/native.py','workers/eda/semiconductor_starters.py','workers/eda/server.py','workers/eda/test_chip_references.py','packages/ui/src/ChipReferenceResults.tsx','scripts/chip-portfolio.mjs'];
const evidence={schema_version:1,generated_at:new Date().toISOString(),public_pdk:'SKY130A',source_sha256:Object.fromEntries(await Promise.all(sources.map(async f=>[f,sha(await readFile(f))]))),native_runs:native,bundle_checks:safety,physical_layout_generated:false,physical_signoff:false,paid_api_calls:0};
await writeFile(path.join(out,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
const archive={};const files=[];
async function collect(folder){for(const item of await readdir(folder,{withFileTypes:true})){const full=path.join(folder,item.name);if(item.isDirectory())await collect(full);else if(item.isFile()&&item.name!=='SHA256SUMS.json'){const b=await readFile(full);const rel=path.relative(out,full).replaceAll('\\','/');archive[rel]=new Uint8Array(b);files.push({file:rel,bytes:b.length,sha256:sha(b)});}}}
await collect(out);await writeFile(path.join(out,'SHA256SUMS.json'),JSON.stringify(files,null,2)+'\n');archive['SHA256SUMS.json']=strToU8(JSON.stringify(files,null,2)+'\n');
await writeFile('examples/Resistor-Chip-Portfolio.zip',zipSync(archive,{level:6}));
console.log(JSON.stringify({references:6,native_runs:native.length,bundle_checks:safety.length,archive:'examples/Resistor-Chip-Portfolio.zip',native_scope:'named waveform criteria; schematic only'}));
