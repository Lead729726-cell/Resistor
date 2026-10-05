// Live public source-author validation is separate from synthetic grammar tests.
// It downloads bounded text into memory only; no PDK scripts are executed.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {inspectCompatText} from '../../packages/importer/src/index';
const sha=(text:string)=>createHash('sha256').update(text).digest('hex');
const repo='YZU-EDALAB/asap7_bb_pdk';
const response=await fetch(`https://api.github.com/repos/${repo}/commits/main`,{signal:AbortSignal.timeout(20000)});assert.ok(response.ok);
const commit=(await response.json()).sha;assert.match(commit,/^[a-f0-9]{40}$/);
const files=['asap7_bb_TechLib.tf','asap7_bb_fromAPR.tf'];const records=[];
for(const name of files){const url=`https://raw.githubusercontent.com/${repo}/${commit}/tf/${name}`;const result=await fetch(url,{signal:AbortSignal.timeout(20000)});assert.ok(result.ok);const text=await result.text();assert.ok(text.length<4*1024*1024);const report=inspectCompatText(text,name);assert.notEqual(report.support,'unsupported',JSON.stringify(report.diagnostics));const expectedLayerNames=name.includes('TechLib')?[...text.matchAll(/^\s*\(\s*(\S+)\s+\d+\s+\S+\s*\)\s*$/gm)].map(m=>m[1]):[...text.matchAll(/^Layer\s+"([^"]+)"\s*\{/gm)].map(m=>m[1]);assert.ok((report.technology?.layers.length??0)>=30,`${name} layers=${report.technology?.layers.length}`);if(!name.includes('TechLib'))assert.deepEqual(report.technology?.layers.map(l=>l.name),expectedLayerNames,'Every actual ICC2 Layer block must be parsed');assert.equal(report.pdk,undefined,'No explicit GDS stream mapping may be guessed');assert.ok(report.unsupported.length>0,'Rules not implemented must be reported');records.push({name,url,sha256:sha(text),bytes:Buffer.byteLength(text),format:report.format,support:report.support,layers:report.technology?.layers.length,purposes:report.technology?.purposes.length,displays:report.technology?.displays.length,colors:report.technology?.colors.length,unsupported:report.unsupported.length,diagnostic_errors:report.diagnostics.filter(d=>d.severity==='error').length,no_inferred_gds:true});}
const evidence={schema_version:1,verified_at:new Date().toISOString(),parser_sha256:sha(readFileSync(new URL('../../packages/importer/src/compat.ts',import.meta.url),'utf8')),source_author:repo,commit,license:'BSD-3-Clause (repository LICENSE)',records,native_execution:false,vendor_execution_verified:false,scope:'Actual public PDK source text parsing only; no commercial binary, foundry/signoff or physical stack validation'};
writeFileSync(new URL('./interchange/primary-evidence.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence,null,2));
const packaged=new URL('../../docs/evidence/',import.meta.url);mkdirSync(packaged,{recursive:true});writeFileSync(new URL('interchange-primary.json',packaged),JSON.stringify(evidence,null,2)+'\n');
