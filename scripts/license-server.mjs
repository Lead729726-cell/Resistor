import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {generateKeyPairSync,randomBytes,createHash} from 'node:crypto';
import {createLicenseService} from '../platform/licensing/service.mjs';
import {createLicenseHttpServer} from '../platform/licensing/http.mjs';
import {createResendMailer} from '../platform/licensing/mail.mjs';
const command=process.argv[2]||'status',directory=path.resolve(process.env.RESISTOR_LICENSE_HOME||'.runtime/licensing');
const secretFile=path.join(directory,'server-secrets.json');
if(command==='init'){
 await mkdir(directory,{recursive:true});const {publicKey,privateKey}=generateKeyPairSync('ed25519');
 const config={schema_version:1,key_id:'resistor-20261023',master_key:randomBytes(32).toString('base64'),admin_token:randomBytes(32).toString('base64url'),private_key:privateKey.export({type:'pkcs8',format:'pem'}),public_key:publicKey.export({type:'spki',format:'pem'})};
 await writeFile(secretFile,JSON.stringify(config,null,2)+'\n',{mode:0o600,flag:'wx'});
 await writeFile(path.join(directory,'public-config.json'),JSON.stringify({schema_version:1,required:true,server_url:'',public_keys:{[config.key_id]:config.public_key},offline_lease_days:7,policy:{edu:{device_limit:2},indust:{device_limit:2}},deployment_status:'server_not_connected'},null,2)+'\n',{flag:'wx'});
 console.log('License signing material created in the private license home. Only public-config.json may be included in official app builds. No serial or secret printed.');
}else{
 const secrets=JSON.parse(await readFile(secretFile,'utf8'));
 const service=createLicenseService({filename:path.join(directory,'licensing.sqlite'),masterKey:Buffer.from(secrets.master_key,'base64'),privateKey:secrets.private_key,keyId:secrets.key_id,mailer:createResendMailer({apiKey:process.env.RESEND_API_KEY,from:process.env.RESISTOR_LICENSE_FROM})});
 try{
  if(command==='serve'){const port=Number(process.env.RESISTOR_LICENSE_PORT||18948);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid license server port');const server=createLicenseHttpServer(service,{adminToken:secrets.admin_token});server.listen(port,'127.0.0.1',()=>console.log('License operator service listening on loopback port '+port+'. Public HTTPS and verified order intake are not connected.'));server.on('close',()=>service.close());process.on('SIGINT',()=>server.close());}
  else if(command==='status')console.log(JSON.stringify(service.status(),null,2));
  else if(command==='import-orders'){
   const input=path.resolve(process.argv[3]||'');if(!process.argv[3])throw Error('Provide an operator-reviewed order JSON file');const bytes=await readFile(input),orders=JSON.parse(bytes);if(!Array.isArray(orders)||orders.length>1000)throw Error('Order array, maximum 1000 rows');const result=[];for(const order of orders){const issued=service.issue(order);result.push({...issued,...(process.argv.includes('--send')?{mail:await service.deliver(issued.delivery_id)}:{})});}await writeFile(path.join(directory,'last-import-receipt.json'),JSON.stringify({schema_version:1,source_sha256:createHash('sha256').update(bytes).digest('hex'),results:result},null,2)+'\n',{mode:0o600});console.log('Processed '+result.length+' verified order rows. Receipt saved privately; no buyer address or serial printed.');
  }else if(command==='refund'){console.log(JSON.stringify(service.refund({purchase_ref:process.argv[3]})));}
  else if(command==='export-delivery'){
   const row=service.operatorDelivery(process.argv[3]);if(!process.argv[4])throw Error('Provide a private output path for buyer delivery');await writeFile(path.resolve(process.argv[4]),JSON.stringify(row,null,2)+'\n',{mode:0o600,flag:'wx'});console.log('Buyer delivery saved privately. Use only for this verified buyer; never publish this file.');
  }else throw Error('Commands: init, status, serve, import-orders FILE [--send], refund PURCHASE_REF, export-delivery DELIVERY_ID PRIVATE_FILE');
 }finally{if(command!=='serve')service.close();}
}
