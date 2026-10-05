import {runtimeConfig,workerRpc} from './runtime.mjs';
import {writeFile} from 'node:fs/promises';

const sourceId=process.argv[2];
if(sourceId&&!/^[A-Za-z_][A-Za-z0-9_.:-]{0,127}$/.test(sourceId))throw new Error('Use a registered source ID, without paths or command text.');
const config=await runtimeConfig();
const call=async(method,params={})=>{const data=await workerRpc(config,method,params);if(!data.ok)throw Object.assign(new Error(data.error.message),{code:data.error.code});return data.result;};
const catalog=await call('database.catalog'),sources=await call('database.list_sources');
const selected=sourceId?sources.filter(source=>source.id===sourceId):sources.slice(0,32);
if(sourceId&&!selected.length)throw new Error('The source ID is not registered in this local workspace.');
const checks=[];
for(const source of selected){
  try{
    const probe=await call('database.probe',{source_id:source.id});
    checks.push({id:source.id,adapter:source.adapter,status:probe.status,available:probe.available??false,fingerprint:probe.fingerprint,vendor_execution_verified:probe.vendor_execution_verified===true,checks:probe.checks});
  }catch(error){checks.push({id:source.id,adapter:source.adapter,status:'unavailable',available:false,vendor_execution_verified:false,error:{code:error.code||'READER_UNAVAILABLE',message:error.message}});}
}
const report={checked_at:new Date().toISOString(),adapters:catalog.adapters.map(adapter=>({id:adapter.id,tool_id:adapter.tool_id,status:adapter.status})),sources:checks,source_limit:32,external_hosting:'deferred',scope:'Actual registered source availability; only successful native DB API evidence can establish vendor execution.'};
await writeFile('docs/evidence/native-database-local-check.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({sources_checked:checks.length,available:checks.filter(check=>check.available).length,vendor_verified:checks.filter(check=>check.vendor_execution_verified).length,evidence:'docs/evidence/native-database-local-check.json'},null,2));
