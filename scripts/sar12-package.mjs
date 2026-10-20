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
const originalReadme=files[prefix+'README.md'];
files[prefix+'README.md']=new TextEncoder().encode(new TextDecoder().decode(originalReadme).replace('[OASIS](analog/sar12_analog.oas)','[OASIS: 프로젝트 bundle 안의 layout.oas](analog/sar12_analog.register.zip)')+'\n이 ZIP에서는 같은 도형의 OASIS를 프로젝트 bundle 안에 포함했습니다. bundle을 압축 해제하면 layout.oas를 얻습니다. 별도 raw OASIS export는 GitHub 저장소에서 제공합니다. 파일별 해시는 이 ZIP 전용 SHA256SUMS.json을 사용하세요.\n');
files[prefix+'SHA256SUMS.repository.json']=new TextEncoder().encode(sumsText);
files[prefix+'ARCHIVE-SCOPE.json']=new TextEncoder().encode(JSON.stringify({omitted_raw_oas_export:{sha256:sha(rawOas),retained_in_repository:true},included_oas_in_project:{entry:'analog/sar12_analog.register.zip:layout.oas',sha256:sha(nested['layout.oas']),geometry_hash:bundleManifest.geometry_hash},readme_repository_sha256:sha(originalReadme),readme_archive_sha256:sha(files[prefix+'README.md'])},null,2)+'\n');
const archiveSums=Object.entries(files).filter(([name])=>name.startsWith(prefix)&&name!==prefix+'SHA256SUMS.json').map(([name,bytes])=>({file:name.slice(prefix.length),bytes:bytes.length,sha256:sha(bytes)}));
files[prefix+'SHA256SUMS.json']=new TextEncoder().encode(JSON.stringify(archiveSums,null,2)+'\n');
// Preserve repository-relative documentation links inside the standalone ZIP.
for(const file of ['docs/sar12.md','docs/THIRD-PARTY-NOTICES.md','LICENSE'])files['Resistor-SAR12/'+file]=new Uint8Array(await readFile(file));
files['Resistor-SAR12/README.md']=new TextEncoder().encode('# Resistor Indust · SAR12 research reference\n\n[Guide](docs/sar12.md) · [Editable projects, GDS/OASIS and native results](examples/sar12-lab/README.md)\n\nThis is a design archive, not an application installer. The post-layout attempt failed convergence; no manufacturing qualification or full digital-controller mask is claimed. Use the latest Resistor Indust source and separately installed public SKY130 tools/models.\n');
const bytes=zipSync(files,{level:6});assert(bytes.length<95000000,'The reference archive exceeds the bounded repository artifact budget');
const decoded=unzipSync(bytes);for(const [name,value]of Object.entries(files))assert.equal(sha(decoded[name]),sha(value),'Archive roundtrip changed '+name);
const file='examples/Resistor-SAR12.zip';await writeFile(file,bytes);
const receipt={schema_version:1,edition:'Resistor Indust',file:path.basename(file),bytes:bytes.length,sha256:sha(bytes),files:Object.keys(files).length,archive_roundtrip:'every entry hash matched',post_layout_qualified:post.execution_status==='completed'&&post.analysis_result==='pass'&&post.freshness==='current',scope:'Research reference; packaging is not an electrical or manufacturing qualification.',manufacturing_signoff:false,full_digital_physical:false};
await writeFile('examples/Resistor-SAR12.receipt.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
