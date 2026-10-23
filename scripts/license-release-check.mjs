import {readFile} from 'node:fs/promises';
import {createPublicKey,createHash} from 'node:crypto';
import path from 'node:path';
export async function assertLicenseReleaseReady(root=process.cwd(),fetchImpl=fetch){
 const c=JSON.parse(await readFile(path.join(root,'platform/licensing/public-config.json'),'utf8'));
 let url;try{url=new URL(c.server_url);}catch{}
 if(c.schema_version!==1||c.required!==true||c.deployment_status!=='production_ready'||!url||url.protocol!=='https:'||url.hostname==='localhost'||url.hostname==='127.0.0.1'||url.username||url.password||url.pathname!=='/'||url.search||url.hash||!Object.keys(c.public_keys??{}).length)throw Error('Official serial-required installers cannot be published before a production HTTPS license service and trusted public key are configured. Existing release remains unchanged.');
 for(const key of Object.values(c.public_keys))if(typeof key!=='string'||key.includes('PRIVATE KEY')||!key.includes('BEGIN PUBLIC KEY')||createPublicKey(key).asymmetricKeyType!=='ed25519')throw Error('Invalid license release public key');
 const response=await fetchImpl(new URL('/health',url).href,{redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('License authority health check failed');
 const health=(await response.json()).result,configured=c.public_keys[health?.key_id];
 if(health?.service!=='resistor-licensing'||!configured||health.public_key_fingerprint!==createHash('sha256').update(createPublicKey(configured).export({type:'spki',format:'der'})).digest('hex'))throw Error('Production license authority does not match packaged signing key');
 return {required:true,editions:['edu','indust'],server:url.origin};
}
