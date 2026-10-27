// Disposable local UI fixture. Never a production order or customer license.
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {generateKeyPairSync,randomBytes} from 'node:crypto';
import {createLicenseService} from '../../platform/licensing/service.mjs';
import {createLicenseHttpServer} from '../../platform/licensing/http.mjs';
const directory=path.resolve('.runtime/license-ui-qa');await mkdir(directory,{recursive:true});
const keys=generateKeyPairSync('ed25519'),privateKey=keys.privateKey.export({type:'pkcs8',format:'pem'}),keyId='qa-ephemeral-never-publish';
const service=createLicenseService({filename:path.join(directory,'qa-'+Date.now()+'.sqlite'),masterKey:randomBytes(32),privateKey,keyId});
const edu=service.issue({provider:'inflearn',purchase_ref:'QA_ONLY_NOT_A_PURCHASE_EDU',edition:'edu',email:'qa@example.invalid',evidence_sha256:'0'.repeat(64),verified:true,device_limit:2});
const indust=service.issue({provider:'direct',purchase_ref:'QA_ONLY_NOT_A_PURCHASE_INDUST',edition:'indust',email:'qa@example.invalid',evidence_sha256:'0'.repeat(64),verified:true,device_limit:2});
await writeFile(path.join(directory,'qa-codes.json'),JSON.stringify({purpose:'local-test-only-not-customer-order',edu:service.operatorDelivery(edu.delivery_id).serial,indust:service.operatorDelivery(indust.delivery_id).serial}),{mode:0o600});
await writeFile(path.join(directory,'public-config.json'),JSON.stringify({schema_version:1,required:true,server_url:'http://127.0.0.1:18949',public_keys:{[keyId]:keys.publicKey.export({type:'spki',format:'pem'})},policy:{edu:{device_limit:2},indust:{device_limit:2}},deployment_status:'qa_only_do_not_publish'}));
const server=createLicenseHttpServer(service,{adminToken:randomBytes(32).toString('base64url')});server.listen(18949,'127.0.0.1',()=>console.log('Disposable QA licensing authority on loopback 18949. No email sent; fixture serials written privately.'));
process.on('SIGINT',()=>server.close(()=>service.close()));
