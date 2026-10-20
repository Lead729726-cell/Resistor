import assert from 'node:assert/strict';
import {readFile,writeFile,readdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {zipSync,unzipSync} from 'fflate';
const root='examples/sar12-lab',files={},sums=[];
const sha=b=>createHash('sha256').update(b).digest('hex');
const qualification=JSON.parse(await readFile(root+'/qualification.json','utf8'));
for(const label of ['drc','lvs','pex','directed','coherent64','imported']){
 const run=qualification.runs.find(r=>r.label===label);assert(run?.execution_status==='completed'&&run?.analysis_result==='pass'&&run?.freshness==='current','A current actual '+label+' result is required for this reference package');
}
const post=qualification.runs.find(r=>r.label==='post-single');assert(post&&!['queued','running'].includes(post.execution_status),'A recorded actual post-layout attempt, including failure, is required');
async function scan(dir){for(const e of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,e.name);if(e.isDirectory())await scan(file);else if(e.name!=='SHA256SUMS.json'){const bytes=await readFile(file),name=path.relative(root,file).replaceAll('\\','/');assert(bytes.length<50000000,'Use compressed or local-retained raw artifacts');files['Resistor-SAR12/examples/sar12-lab/'+name]=new Uint8Array(bytes);sums.push({file:name,bytes:bytes.length,sha256:sha(bytes)});}}}
await scan(root);const sumsText=JSON.stringify(sums,null,2)+'\n';await writeFile(root+'/SHA256SUMS.json',sumsText);files['Resistor-SAR12/examples/sar12-lab/SHA256SUMS.json']=new TextEncoder().encode(sumsText);
// A project already contains a losslessly verified OASIS layout. Keep the
// separate raw OAS export in the repository and avoid duplicating it in ZIP.
const prefix='Resistor-SAR12/examples/sar12-lab/',nested=unzipSync(files[prefix+'analog/sar12_analog.register.zip']);
const bundleManifest=JSON.parse(new TextDecoder().decode(nested['manifest.json'])),exchange=JSON.parse(await readFile(root+'/analog/exchange.json','utf8'));
assert.equal(bundleManifest.geometry_hash,exchange.exchanges.find(e=>e.format==='oas').roundtrip.before_hash);
const rawOas=files[prefix+'analog/sar12_analog.oas'];delete files[prefix+'analog/sar12_analog.oas'];
const rawGds=files[prefix+'analog/sar12_analog.gds.gz'];delete files[prefix+'analog/sar12_analog.gds.gz'];
const originalReadme=files[prefix+'README.md'];
const selectedRuns=new Set(qualification.runs.map(r=>r.id)),omittedHistory=new Set();
const historicalRuns=new Set(qualification.runs.filter(r=>r.freshness!=='current').map(r=>r.id)),omittedPayloads=[];
// Keep every current native proof complete. Historical result/provenance/logs
// stay visible; the original failing KLU mesh remains complete for reproduction.
const reproductionRun='4b5d8c07679a4efda589d495092c2fe2';
for(const name of Object.keys(files)){
 const match=name.startsWith(prefix+'runs/')&&name.slice((prefix+'runs/').length).split('/')[0];
 if(match&&!selectedRuns.has(match)){delete files[name];omittedHistory.add(match);}
 else if(match&&historicalRuns.has(match)&&match!==reproductionRun&&!/\/(?:result|manifest)\.json$|\.log$/.test(name)){
  omittedPayloads.push({file:name.slice(prefix.length),bytes:files[name].length,sha256:sha(files[name])});delete files[name];
 }
}
files[prefix+'README.md']=new TextEncoder().encode(new TextDecoder().decode(originalReadme).replace('[OASIS](analog/sar12_analog.oas)','[OASIS: 프로젝트 bundle 안의 layout.oas](analog/sar12_analog.register.zip)').replace('[원본 GDS gzip](analog/sar12_analog.gds.gz)','[원본 GDS gzip: GitHub 별도 다운로드](https://github.com/Lead729726-cell/Resistor/raw/refs/heads/codex/resistor-indust/examples/sar12-lab/analog/sar12_analog.gds.gz)')+'\n이 ZIP은 모든 현재 실행의 근거와 편집 프로젝트를 포함합니다. 같은 도형의 OASIS는 프로젝트 bundle 안의 layout.oas로 제공합니다. 별도 raw GDS/OASIS export 및 과거 실행의 큰 파형·netlist는 GitHub 저장소에 보존합니다. 과거 result/manifest/log와 동일 mesh 재현용 4b5d8c07 실행은 포함합니다. 생략 목록은 ARCHIVE-SCOPE.json, 파일별 해시는 이 ZIP 전용 SHA256SUMS.json을 사용하세요.\n');
files[prefix+'SHA256SUMS.repository.json']=new TextEncoder().encode(sumsText);
files[prefix+'ARCHIVE-SCOPE.json']=new TextEncoder().encode(JSON.stringify({omitted_historical_run_directories:[...omittedHistory].sort(),omitted_historical_payloads:omittedPayloads,historical_runs_retained_in_repository:true,all_current_run_artifacts_included:true,reproduction_run_included:reproductionRun,historical_file_hashes:'SHA256SUMS.repository.json',omitted_raw_oas_export:{sha256:sha(rawOas),retained_in_repository:true},omitted_raw_gds_export:{sha256:sha(rawGds),retained_in_repository:true},included_oas_in_project:{entry:'analog/sar12_analog.register.zip:layout.oas',sha256:sha(nested['layout.oas']),geometry_hash:bundleManifest.geometry_hash},readme_repository_sha256:sha(originalReadme),readme_archive_sha256:sha(files[prefix+'README.md'])},null,2)+'\n');
const archiveSums=Object.entries(files).filter(([name])=>name.startsWith(prefix)&&name!==prefix+'SHA256SUMS.json').map(([name,bytes])=>({file:name.slice(prefix.length),bytes:bytes.length,sha256:sha(bytes)}));
files[prefix+'SHA256SUMS.json']=new TextEncoder().encode(JSON.stringify(archiveSums,null,2)+'\n');
// Preserve repository-relative documentation links inside the standalone ZIP.
for(const file of ['docs/sar12.md','docs/sar12-convergence.md','docs/THIRD-PARTY-NOTICES.md','LICENSE'])files['Resistor-SAR12/'+file]=new Uint8Array(await readFile(file));
files['Resistor-SAR12/README.md']=new TextEncoder().encode('# Resistor Indust · SAR12 research reference\n\n[Guide](docs/sar12.md) · [Convergence and native post-layout results](docs/sar12-convergence.md) · [Editable projects, GDS/OASIS and native results](examples/sar12-lab/README.md)\n\nThis is a design archive, not an application installer. Post-layout smoke: '+(qualification.post_layout_smoke_passed?'three selected inputs passed.':'incomplete; inspect the recorded results.')+' Full-range electrical characterization, manufacturing qualification and the full digital-controller mask are not established. Use the latest Resistor Indust source and separately installed public SKY130 tools/models.\n');
const bytes=zipSync(files,{level:6});assert(bytes.length<=50*1024*1024,'The reference archive exceeds the 50 MiB source artifact budget');
const decoded=unzipSync(bytes);for(const [name,value]of Object.entries(files))assert.equal(sha(decoded[name]),sha(value),'Archive roundtrip changed '+name);
const file='examples/Resistor-SAR12.zip';await writeFile(file,bytes);
const receipt={schema_version:1,edition:'Resistor Indust',file:path.basename(file),bytes:bytes.length,sha256:sha(bytes),files:Object.keys(files).length,archive_roundtrip:'every entry hash matched',post_layout_smoke_passed:qualification.post_layout_smoke_passed,post_layout_qualified:false,scope:'Research reference; three selected inputs are a smoke test, not full electrical or manufacturing qualification.',manufacturing_signoff:false,full_digital_physical:false};
await writeFile('examples/Resistor-SAR12.receipt.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
