// Test-only authority with ephemeral signing keys and a private owned workspace.
// Never changes production licensing configuration or issues a customer order.
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {generateKeyPairSync,randomBytes} from 'node:crypto';
import {createLicenseService} from '../../platform/licensing/service.mjs';
import {createLicenseHttpServer} from '../../platform/licensing/http.mjs';
import {LicenseClient,fileLicenseVault} from '../../apps/desktop/licensing.mjs';

export async function disposableUiLicense(workspace,edition){
  if(!['edu','indust'].includes(edition))throw Error('Explicit QA edition required.');
  const directory=path.join(workspace,'.runtime/license-qa');await mkdir(directory,{recursive:true});
  const keys=generateKeyPairSync('ed25519'),keyId='ephemeral-ui-qa-only';
  const service=createLicenseService({filename:path.join(directory,'qa.sqlite'),masterKey:randomBytes(32),privateKey:keys.privateKey.export({type:'pkcs8',format:'pem'}),keyId});
  const server=createLicenseHttpServer(service,{adminToken:randomBytes(32).toString('base64url')});
  const close=async()=>{await new Promise(r=>server.close(r));service.close();};
  try{
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const config={schema_version:1,required:true,server_url:'http://127.0.0.1:'+server.address().port,public_keys:{[keyId]:keys.publicKey.export({type:'spki',format:'pem'})},deployment_status:'synthetic-ui-qa-only'};
    const configFile=path.join(directory,'public-config.json');await writeFile(configFile,JSON.stringify(config));
    const order=service.issue({provider:'inflearn',purchase_ref:'SYNTHETIC_UI_QA_ONLY',edition,email:'qa@example.invalid',evidence_sha256:'0'.repeat(64),verified:true,device_limit:2});
    const clientDirectory=path.join(workspace,'.runtime/license');
    const client=new LicenseClient({directory:clientDirectory,edition,config,...await fileLicenseVault(clientDirectory),allowLocalServer:true});
    const status=await client.rpc('license.activate',{serial:service.operatorDelivery(order.delivery_id).serial});
    if(!status.authorized)throw Error('Disposable QA license did not activate.');
    return {client,configFile,close};
  }catch(e){await close();throw e;}
}
