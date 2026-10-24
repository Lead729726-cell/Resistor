// Public source bundle only. Explicit allowlist excludes all private state.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash,createPublicKey} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {zipSync} from 'fflate';
const root=process.cwd(),files=['LICENSE','scripts/license-server.mjs','platform/licensing/service.mjs','platform/licensing/http.mjs','platform/licensing/token.mjs','platform/licensing/mail.mjs','platform/licensing/public-config.json','deploy/licensing/resistor-license.service','deploy/licensing/Caddyfile','deploy/licensing/README.md'];
const config=JSON.parse(await readFile('platform/licensing/public-config.json','utf8'));
for(const key of Object.values(config.public_keys??{})){
 if(typeof key!=='string'||key.includes('PRIVATE KEY')||createPublicKey(key).asymmetricKeyType!=='ed25519')throw Error('Only Ed25519 public verification keys may enter the bundle');
}
const entries={},hashes={};
for(const file of files){const data=await readFile(path.join(root,file));if(/-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY-----/.test(data.toString('utf8')))throw Error('Private material detected in '+file);entries[file]=data;hashes[file]=createHash('sha256').update(data).digest('hex');}
entries['package.json']=Buffer.from(JSON.stringify({name:'resistor-license-authority',private:true,type:'module',engines:{node:'>=24 <25'},scripts:{start:'node scripts/license-server.mjs serve'}},null,2)+'\n');
hashes['package.json']=createHash('sha256').update(entries['package.json']).digest('hex');
const source=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const sourceChanges=execFileSync('git',['status','--porcelain','--',...files],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
const manifest={edition:'shared license backend / Resistor Indust and Edu',source_revision:source,source_worktree_changes:sourceChanges,scope:'Deployment preparation only. No production server or installer published.',sha256:hashes};
entries['manifest.json']=Buffer.from(JSON.stringify(manifest,null,2)+'\n');
const destination=path.resolve(process.env.RESISTOR_LICENSE_BUNDLE_OUT??'release/Resistor-License-Server.zip');
await mkdir(path.dirname(destination),{recursive:true});const zip=Buffer.from(zipSync(entries,{level:6}));await writeFile(destination,zip,{flag:'wx'});
console.log(JSON.stringify({artifact:destination,bytes:zip.length,sha256:createHash('sha256').update(zip).digest('hex'),files:Object.keys(entries).length,private_state_included:false,production_deployed:false}));
