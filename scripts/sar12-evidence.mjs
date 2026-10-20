// Preserve revision-bound native evidence, including failures and unavailable gates.
import assert from 'node:assert/strict';
import {createReadStream,createWriteStream} from 'node:fs';
import {readFile,writeFile,mkdir,copyFile,readdir,stat,unlink} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import {createGzip,gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {runtimeConfig,workerRpc} from './runtime.mjs';
const workspace=path.resolve('.runtime/sar12/lab'),out='examples/sar12-lab',plan=JSON.parse(await readFile('.runtime/sar12/qualification-plan.json','utf8'));
const config=await runtimeConfig(workspace),api=async(method,params)=>{const r=await workerRpc(config,method,params);assert(r.ok,JSON.stringify(r.error));return r.result;};
const sha=b=>createHash('sha256').update(b).digest('hex'),hashFile=async file=>{const h=createHash('sha256');for await(const chunk of createReadStream(file))h.update(chunk);return h.digest('hex');};
const write=async(file,value)=>{await mkdir(path.dirname(file),{recursive:true});await writeFile(file,typeof value==='string'?value:JSON.stringify(value,null,2)+'\n');};
const report={schema_version:1,edition:'Resistor Indust',captured_at:new Date().toISOString(),reference_paper:'https://arxiv.org/abs/2610.15240v1',manufacturing_signoff:false,full_controller_physical:false,runs:[],raw_scope:'Native decision records, logs, manifests and available traces. Large raw traces stay in the isolated local workspace with exact hashes; no synthetic waveform or inherited verification.'};
for(const entry of plan.runs){
 const job=await api('job.status',{run_id:entry.id});assert(!['queued','running'].includes(job.execution_status),'Do not publish an unfinished job');
 const dir=path.join(workspace,'.runtime/eda/runs',job.id),dest=out+'/runs/'+job.id;
 const compact={...job};delete compact.waveforms;
 await write(dest+'/result.json',compact);
 if(job.waveforms?.length)await writeFile(dest+'/waveforms.json.gz',gzipSync(Buffer.from(JSON.stringify(job.waveforms)),{level:9}));
 const available=await readdir(dir),artifacts=[];
 // Historical jobs are output, not an input to this circuit. Keep the exact
 // original in the private workspace and publish a named, hashed projection.
 const original=await readFile(path.join(dir,'project.json')),input=JSON.parse(original);const previousRunCount=input.runs?.length||0;input.runs=[];
 await write(dest+'/project-input.json',{projection:'Only previous run payloads removed; schematic, ports, parameters and testbench unchanged',original_sha256:sha(original),original_bytes:original.length,original_retained_at:path.join(dir,'project.json'),previous_runs_omitted:previousRunCount,project:input});
 for(const name of ['project.json','project.json.gz'])await unlink(dest+'/'+name).catch(e=>{if(e.code!=='ENOENT')throw e;});
 for(const name of [...new Set(['manifest.json','project.json','analog.spice','testbench.spice','decisions.csv','pause-times.txt','sar12-verification.json','spectrum.json','coupling-audit.json','rtl-replay.csv','gate-replay.csv','ir-replay.csv','replay.v','ir-controller.v','decisions.mem','ngspice.log','magic-drc.log','markers.tsv','drc-status.json','drc.tcl','extract-lvs.tcl','pex.tcl','layout.spice','reference.spice','netgen-lvs.log','lvs.json','lvs.spice','pex-quality.json','pex-reduction.json','pex.spice','pex-simulation.spice',...available.filter(f=>f.endsWith('.log'))])]){
  if(name==='project.json'||!available.includes(name))continue;const source=path.join(dir,name),bytes=(await stat(source)).size;
  if(bytes>4000000||name.endsWith('.spice')&&bytes>500000){const target=dest+'/'+name+'.gz';await pipeline(createReadStream(source),createGzip({level:9}),createWriteStream(target));await unlink(dest+'/'+name).catch(e=>{if(e.code!=='ENOENT')throw e;});artifacts.push({file:name+'.gz',original_sha256:await hashFile(source),original_bytes:bytes});}
  else{await copyFile(source,dest+'/'+name);artifacts.push({file:name,sha256:await hashFile(source),bytes});}
 }
 if(available.includes('waveform.dat')){
  const file=path.join(dir,'waveform.dat'),bytes=(await stat(file)).size,raw={original_sha256:await hashFile(file),original_bytes:bytes,retained_at:file,repository_copy:false};
  if(bytes<12000000){await pipeline(createReadStream(file),createGzip({level:9}),createWriteStream(dest+'/waveform.dat.gz'));raw.repository_copy=true;raw.file='waveform.dat.gz';}
  await write(dest+'/raw-trace.json',raw);artifacts.push(raw);
 }
 report.runs.push({label:entry.label,id:job.id,project_id:job.project_id,revision:job.revision,execution_status:job.execution_status,analysis_result:job.analysis_result,freshness:job.freshness,message:job.message,measurements:job.measurements,reference_verification:job.reference_verification,artifacts});
}
await mkdir(out+'/controller',{recursive:true});for(const f of ['evidence.json','qa.v','ir.v','rtl.log','gate.log','editable_ir.log','fault-x.log'])await copyFile('.runtime/sar12/controller-qa/'+f,out+'/controller/'+f);
for(const f of ['sar12.v','sar12_gate.v','sar12_cmos.json'])await copyFile('workers/eda/rtl/'+f,out+'/controller/'+f);
await mkdir(out+'/coupling',{recursive:true});for(const f of ['comparison.json','capacitance-only.spice','capacitance-only.tcl','magic.log'])await copyFile('.runtime/sar12/coupling-audit/'+f,out+'/coupling/'+f);
const imported=JSON.parse(await readFile(out+'/import-verification.json','utf8')),rerun=report.runs.find(r=>r.project_id===imported.imported_project&&r.label==='imported');
if(rerun){imported.rerun_status=rerun.execution_status;imported.rerun_analysis_result=rerun.analysis_result;imported.rerun_id=rerun.id;await write(out+'/import-verification.json',imported);}
await write(out+'/qualification.json',report);
const table=report.runs.map(r=>`| ${r.label} | ${r.execution_status} | ${r.analysis_result} | ${r.freshness} | [${r.id.slice(0,8)}](runs/${r.id}/result.json) |`).join('\n');
const coherent=report.runs.find(r=>r.label==='coherent64'),m=coherent?.measurements;
const post=report.runs.find(r=>r.label==='post-single');report.post_layout_qualified=post?.execution_status==='completed'&&post?.analysis_result==='pass'&&post?.freshness==='current';await write(out+'/qualification.json',report);
await write(out+'/README.md',`# Resistor Indust · 12-bit SAR ADC lab\n\n[사용법·계산·논문 반영 범위](../../docs/sar12.md) · [12개 편집 블록](blocks.json) · [실행 근거](qualification.json) · [파일 해시](SHA256SUMS.json)\n\n아날로그 코어 **841.205 × 718.720 µm**를 **1,000 × 1,000 µm, edge 10 µm** 안에 배치했습니다. 508 unit + 2 bridge 차동 6+6 CDAC, 자체 바이어스 2단 preamp·동적 latch, 12-bit RTL/합성 gate/편집 CMOS 제어기입니다. 전체 디지털 제어기 마스크·pad/ESD·제조 signoff는 포함하지 않습니다.\n\n![실제 마스크와 unit 위치](layout-and-matching.png)\n\n## 열기\n\n- [아날로그 마스크 편집 프로젝트](analog/sar12_analog.register.zip)\n- [OASIS](analog/sar12_analog.oas) + [sidecar](analog/sar12_analog.oas.mos.json)\n- [원본 GDS gzip](analog/sar12_analog.gds.gz) + [sidecar](analog/sar12_analog.gds.mos.json) — 압축 해제 후 사용. 브라우저 업로드에는 OASIS/bundle을 사용합니다.\n- [SPICE](analog/core.spice), [배치·배선·영역 검사](analog/routing-report.json), [교환 형식 round-trip](analog/exchange.json)\n- 전체 ADC와 하위 블록은 [hierarchy](hierarchy/)의 각 register.zip으로 가져옵니다. 가져온 프로젝트는 과거 PASS 없이 새 검사로 시작합니다.\n\n## 실행된 검사\n\n| 검사 | 실행 | 분석 | 소스 상태 | 원본 근거 |\n|---|---|---|---|---|\n${table}\n\n${m?`64점 sampled-input coherent sequence: TT 1.8 V/27°C, Fs ${m.sample_rate_Hz.toFixed(3)} Hz, SNDR **${m.SNDR_dB.toFixed(2)} dB**, SFDR **${m.SFDR_dB.toFixed(2)} dB**, 무잡음 ENOB **${m.ENOB_noiseless_bits.toFixed(2)} bit**. `:''}열잡음·편차·지터와 연속 정현파 track/hold 성능은 제외합니다. 배선 후 ENOB나 실물 12-bit 정확도는 입증하지 않았습니다. SS/FF는 한 입력의 smoke 검사이며 전체 corner 정확도 검사가 아닙니다.\n\n![실제 native 변환](native-waveforms.png)\n\n${m?'![실제 출력 코드 스펙트럼](native-spectrum.png)\n\n':''}[제어기 검사](controller/evidence.json)는 세 구현에서 각각 4,096개 oracle 코드·159,751개 assertion을 통과한 디지털 논리 검사입니다. 4,096 MOS ADC 변환을 측정한 결과가 아닙니다. [C-only/R+C 비교](coupling/comparison.json)는 실제 독립 추출 결과이며 아직 bit별 전기적 매칭·결합 추출 완전성을 승인하지 않습니다.\n\n실패한 post-layout 실행과 과거 DRC 오류도 표에 남깁니다. 수렴·시각 검사 실패는 PASS로 바꾸지 않습니다. 큰 원본 raw trace는 isolated workspace에 보존하며 각 실행의 raw-trace.json에 바이트 수·SHA-256을 기록합니다. 표시용 waveforms.json.gz는 실제 시간축의 선택 샘플입니다. 원본 입력 자극·12회 결정 전체·netlist·로그·manifest로 검사를 재현할 수 있습니다. 공개 SKY130 모델과 도구는 별도 설치가 필요합니다.\n`);
if(!report.post_layout_qualified){const readme=await readFile(out+'/README.md','utf8'),reason=String(post?.message||'실행 기록 없음').replace(/[\r\n|]/g,' ');await write(out+'/README.md',readme.replace('\n\n',`\n\n> **연구용 레퍼런스 · 배선 후 검증 미달.** Post-layout ${post?.execution_status||'not-run'} / ${post?.analysis_result||'unknown'}: ${reason} DRC/LVS/PEX 생성과 배선 전 파형 통과는 제조용 전기적 승인을 뜻하지 않습니다.\n\n`));}
const sums=[];async function collect(dir){for(const e of await readdir(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())await collect(f);else if(e.name!=='SHA256SUMS.json')sums.push({file:path.relative(out,f).replaceAll('\\','/'),bytes:(await stat(f)).size,sha256:await hashFile(f)});}}
await collect(out);await write(out+'/SHA256SUMS.json',sums);console.log(JSON.stringify({runs:report.runs.length,files:sums.length,bytes:sums.reduce((a,b)=>a+b.bytes,0)}));
