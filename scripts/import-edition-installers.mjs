// Import only actual native installation receipts and exact locally hashed bytes.
// Publishing happens separately; --published additionally verifies every public asset.
import assert from 'node:assert/strict';
import {readFile,readdir,writeFile,mkdir,cp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {targets} from './site/system-detection.mjs';
import {validateEditionDownloads} from './download-editions.mjs';
const root=path.resolve(process.argv[2]||'.runtime/edition-verified'),out=path.resolve('.runtime/edition-release/0.28.0');await mkdir(out,{recursive:true});
const files=[];async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())await walk(p);else files.push(p);}}await walk(root);
const manifest=JSON.parse(await readFile('platform/download-site/edition-downloads.json','utf8')),definitions=JSON.parse(await readFile('apps/desktop/product-editions.json','utf8')),sum=[];
for(const e of manifest.editions){const downloads=[];
  for(const [target]of targets){
    const jsons=files.filter(f=>path.basename(f).startsWith(`Resistor-${e.edition==='edu'?'Edu':'Indust'}-0.28.0-`)&&f.endsWith('-'+target+'.json'));assert.equal(jsons.length,1,'Expected one verified receipt: '+e.edition+' '+target);
    const jsonPath=jsons[0],receiptBytes=await readFile(jsonPath),r=JSON.parse(receiptBytes);assert.equal(r.product_id,e.product_id);assert.equal(r.edition,e.edition);assert.equal(r.version,'0.28.0');assert.equal(r.platform+'-'+r.arch,target);assert.equal(r.native_qa.completed,true);assert.equal(r.installation_qa?.completed,true);assert.equal(r.installation_qa?.app_execution?.completed,true);assert.equal(r.installation_qa.arch,r.arch);assert(r.native_qa.checks.length>=6&&r.native_qa.checks.every(c=>c.pass));assert(r.installation_qa.app_execution.checks.length>=6&&r.installation_qa.app_execution.checks.every(c=>c.pass));assert.equal(r.native_qa.run.voltage_V,.9);assert.equal(r.native_qa.run.execution_status,'completed');assert.equal(r.native_qa.run.analysis_result,'unknown');assert.equal(r.manufacturing_signoff,false);assert.equal(r.source_revision,r.build_overlay.source_revision);
    const artifact=path.join(path.dirname(jsonPath),r.file),b=await readFile(artifact);assert.equal(b.length,r.bytes);assert.equal(createHash('sha256').update(b).digest('hex'),r.sha256);
    await cp(artifact,path.join(out,r.file));await cp(jsonPath,path.join(out,path.basename(jsonPath)));sum.push(r.sha256+'  '+r.file);
    const base='https://github.com/Lead729726-cell/Resistor/releases/download/editions-v'+r.version+'/';
    downloads.push({target,name:r.file,url:base+r.file,product_id:r.product_id,version:r.version,bytes:r.bytes,sha256:r.sha256,receipt_url:base+path.basename(jsonPath),receipt_sha256:createHash('sha256').update(receiptBytes).digest('hex'),source_revision:r.source_revision,build_tools_revision:r.build_tools_revision,runtime_arch:r.runtime_arch,requires_emulation:r.requires_emulation,qa_completed:true});
  }
  e.native_installer={status:'published',files:downloads};
}
validateEditionDownloads(manifest,definitions);
await writeFile(path.join(out,'SHA256SUMS.txt'),sum.join('\n')+'\n');
if(process.argv.includes('--published')){
  for(const e of manifest.editions)for(const f of e.native_installer.files){
    const response=await fetch(f.url,{method:'HEAD',signal:AbortSignal.timeout(90000)});assert(response.ok,'Published installer unavailable: '+f.name);const length=response.headers.get('content-length');assert(length&&Number(length)===f.bytes,'Published installer size mismatch');
    const receipt=await fetch(f.receipt_url,{signal:AbortSignal.timeout(90000)});assert(receipt.ok);assert.equal(createHash('sha256').update(Buffer.from(await receipt.arrayBuffer())).digest('hex'),f.receipt_sha256);
  }
  manifest.checked_at=new Date().toISOString();await writeFile('platform/download-site/edition-downloads.json',JSON.stringify(manifest,null,2)+'\n');
  console.log('Verified 10 published edition installers and exact build receipts.');
}else console.log('Staged 10 hashed installers. Public manifest has not been changed.');
