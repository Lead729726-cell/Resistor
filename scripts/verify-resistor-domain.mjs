import assert from 'node:assert/strict';
import {resolve4,resolveCname} from 'node:dns/promises';
import {get} from 'node:https';
import {mkdir,writeFile} from 'node:fs/promises';
const report={schema_version:1,checked_at:new Date().toISOString(),domain:'resistor.kr',canonical_origin:'https://resistor.kr',checks:[]};
report.dns={apex:await resolve4('resistor.kr'),www:await resolveCname('www.resistor.kr')};
for(const pathname of ['/','/download/edu/','/download/industry/','/tutorial/library/','/pdk-links.html']){
  const r=await fetch('https://resistor.kr'+pathname,{signal:AbortSignal.timeout(30000)});assert.equal(r.status,200);const html=await r.text();assert(html.includes('<html'));if(process.argv.includes('--canonical'))assert(html.includes('rel="canonical" href="https://resistor.kr'));report.checks.push({url:r.url,status:r.status,title:html.match(/<title>(.*?)<\/title>/)?.[1]});
}
const www=await fetch('https://www.resistor.kr/download/edu/?from=domain-check',{redirect:'manual',signal:AbortSignal.timeout(30000)});assert.equal(www.status,308);assert.equal(www.headers.get('location'),'https://resistor.kr/download/edu/?from=domain-check');report.www_redirect={status:www.status,location:www.headers.get('location')};
report.tls=await new Promise((resolve,reject)=>{const req=get('https://resistor.kr/',r=>{const c=r.socket.getPeerCertificate();resolve({authorized:r.socket.authorized,subject_alt_name:c.subjectaltname,issuer:c.issuer?.O,valid_from:c.valid_from,valid_to:c.valid_to});r.resume();});req.setTimeout(30000,()=>req.destroy(Error('TLS timeout')));req.on('error',reject);});assert.equal(report.tls.authorized,true);report.completed=true;
await mkdir('docs/evidence/domain-resistor-kr',{recursive:true});await writeFile('docs/evidence/domain-resistor-kr/verification.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
