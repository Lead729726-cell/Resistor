import {readFile,writeFile,mkdir,copyFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {zipSync,strToU8} from 'fflate';
import path from 'node:path';
import {runtimeConfig,workerRpc} from './runtime.mjs';
const out='examples/analog-soc',cfg=await runtimeConfig();
const rpc=async(m,p={})=>{const r=await workerRpc(cfg,m,p);if(!r.ok)throw Error(r.error.message);return r.result;};
const e=JSON.parse(await readFile(out+'/evidence.json','utf8'));
if(e.rows.length!==7||e.rows.some(r=>!r.physical_verification_pass||!r.post_layout_criteria_pass))throw Error('Seven executed physical references required');
if(!process.argv.includes('--bundle-only')){
 const projects=await rpc('project.list',{metadata_only:true});const catalog=(await rpc('design.catalog')).templates;
 const blocks=[];
 for(const row of e.rows){
  const t=catalog.find(t=>t.id===row.reference),name=`아날로그 SoC v0.21 · ${t.name.replace(/^SoC · /,'')}`;
  const matches=projects.filter(p=>p.cell===t.id&&p.name===name);
  if(matches.length!==1)throw Error('Expected one actual app-created hierarchy for '+t.id);
  const p=await rpc('project.open',{project_id:matches[0].id});const folder=out+'/'+t.id;
  await writeFile(folder+'/hierarchy.json',JSON.stringify(p.schematic,null,2)+'\n');
  const spice=await rpc('schematic.export_spice',{project_id:p.id});await writeFile(folder+'/hierarchy.spice',spice.text);
  const zip=await rpc('project.export_bundle',{project_id:p.id,inline:true});await writeFile(folder+'/'+t.id+'.hierarchy.register.zip',Buffer.from(zip.bundle_base64,'base64'));
  const routing='.runtime/eda/projects/'+row.project_id+'/generator/routing-report.json';await copyFile(routing,folder+'/routing-report.json');
  const counts={};for(const d of Object.values(p.schematic.cells||{}).flatMap(c=>c.devices).concat(p.schematic.devices))counts[d.kind]=(counts[d.kind]||0)+1;
  blocks.push({id:t.id,name:t.name,ports:p.ports,hierarchy_project_id:p.id,physical_project_id:row.project_id,dependencies:Object.keys(p.schematic.cells||{}),cell_definition_counts:counts,parameters:t.parameter_defaults});
  await writeFile(folder+'/README.md',`# ${t.name}\n\n실제 SKY130 MOS/poly/MIM 회로입니다. 계층 프로젝트와 flat 물리 프로젝트를 따로 제공합니다.\n\n[계층 프로젝트](${t.id}.hierarchy.register.zip) · [물리 프로젝트](${t.id}.register.zip) · [GDS](${t.id}.gds) · [OASIS](${t.id}.oas) · [계층 SPICE](hierarchy.spice) · [배선 보고서](routing-report.json)\n\n| 단계 | 실행 | 판정 |\n|---|---|---|\n${row.jobs.map(j=>`| ${j.stage} | ${j.execution_status} | ${j.analysis_result} |`).join('\n')}\n\n실제 job ID·revision·파형·모델 조건은 각 result JSON에 있습니다. AFE/bias는 자체 VDD/2 및 MOS 바이어스입니다. 나머지 블록의 VCM/BIAS, 공급·신호·클록·출력 부하와 cascode IREF는 외부 testbench입니다. OTA의 1G/1F DC servo·1pF 부하도 외부입니다. Magic PEX 원본과 정확한 RC 축약 기록을 보존합니다.\n\nnominal TT/27°C/1.8V와 typical RC 범위입니다. [원본 18조건](../pvt.json)과 [실제 PEX 18조건](../pvt-pex.json)을 따로 제공합니다. ABBA 입력쌍의 실제 중심 일치만 검사했으며 guard ring/dummy, substrate, full-chip density/antenna, ESD/EM/IR 또는 foundry signoff는 별도입니다.\n`);
 }
 await writeFile(out+'/blocks.json',JSON.stringify({blocks},null,2)+'\n');
 const pvt=JSON.parse(await readFile(out+'/pvt.json','utf8'));
 await writeFile(out+'/README.md',`# Resistor · Analog SoC references\n\n7개 실제 SKY130 매크로와 계층 회로·물리 프로젝트입니다. 바이어스, cascode mirror, Miller OTA, PGA, 2극 필터, TIA, 통합 센서 AFE를 제공합니다. ADC/CPU/패드가 통합된 완성 SoC는 아닙니다.\n\n| 회로 | DRC/LVS/PEX | pre/post 파형 기준 |\n|---|---|---|\n${e.rows.map(r=>`| [${r.name}](${r.reference}/README.md) | PASS | PASS |`).join('\n')}\n\nNominal TT/27°C/1.8V. 18개 MOS corner/온도/전압 조건 중 ${pvt.cases.filter(r=>r.verification?.pass).length}개 통과, ${pvt.cases.filter(r=>!r.verification?.pass).length}개 기준 실패. 이득 허용 오차 3%. [실제 PEX 조건](pvt-pex.json)과 [OTA 잡음·편차·재현성](characterization/evidence.json)은 별도 기록입니다. 제조 승인과 전역 통계 수율은 미완료입니다. 이전 실패는 [v0.20 이력](history/v0.20.0/pvt.json)과 [수렴 보조 전 PEX 이력](history/v0.21-before-nodeset/pvt-pex.json)에 보존합니다.\n\n[사용 절차·공식·제한](../../docs/analog-soc.md) · [원본 실행 기록](evidence.json) · [PVT 기록](pvt.json) · [하위 블록 목록](blocks.json)\n\n![실제 pre/post 측정](measurements.png)\n\n![실제 GDS 레이아웃](layouts.png)\n`);
}
const files={},sums=[];const sha=b=>createHash('sha256').update(b).digest('hex');
async function collect(dir){for(const f of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,f.name);if(f.isDirectory())await collect(p);else if(f.name!=='SHA256SUMS.json'){const b=await readFile(p),name=path.relative(out,p).replaceAll('\\','/');files[name]=new Uint8Array(b);sums.push({file:name,bytes:b.length,sha256:sha(b)});}}}
await collect(out);await writeFile(out+'/SHA256SUMS.json',JSON.stringify(sums,null,2)+'\n');files['SHA256SUMS.json']=strToU8(JSON.stringify(sums,null,2)+'\n');await writeFile('examples/Resistor-Analog-SoC.zip',zipSync(files,{level:6}));
console.log(JSON.stringify({files:sums.length,archive:'examples/Resistor-Analog-SoC.zip'}));
