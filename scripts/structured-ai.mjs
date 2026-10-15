import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {readProviderCredential,providerConfig,reserveProviderBudget,PRICING} from './design-assistant.mjs';

export async function structuredStatus(workspace){
 const config=await providerConfig(workspace);let ledger={reserved_usd:0};
 try{ledger=JSON.parse(await readFile(path.join(workspace,'.runtime/assistant/budget.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(!Number.isFinite(ledger.reserved_usd)||ledger.reserved_usd<0)throw Error('Invalid shared budget ledger.');
 return {configured:!!await readProviderCredential(workspace),model:PRICING.model,budget_usd:config.budget_usd,reserved_usd:ledger.reserved_usd,remaining_usd:Math.max(0,config.budget_usd-ledger.reserved_usd),pricing:PRICING};
}
export function structuredEstimate(system,content,schema){
 // UTF-8 bytes provide a conservative token bound; no cache discount or refund assumed.
 return Math.ceil((Buffer.byteLength(system+JSON.stringify(content)+JSON.stringify(schema))+2048)*PRICING.input+4096*PRICING.output)/1e6;
}
export async function requestStructured(workspace,{system,content,schema,name,approved},{fetcher=fetch}={}){
 if(approved!==true)throw Error('이 요청의 외부 전송·API 호출 승인이 필요합니다.');
 const status=await structuredStatus(workspace);if(!status.configured)throw Error('기존 OpenAI 키가 연결되지 않았습니다.');
 const estimate=structuredEstimate(system,content,schema);
 const reservation=await reserveProviderBudget(workspace,status.budget_usd,estimate);
 const key=await readProviderCredential(workspace);
 try{
  const response=await fetcher('https://api.openai.com/v1/responses',{method:'POST',redirect:'error',signal:AbortSignal.timeout(45000),headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:PRICING.model,store:false,service_tier:'default',max_output_tokens:4096,input:[{role:'system',content:system},{role:'user',content:JSON.stringify(content)}],text:{format:{type:'json_schema',name,strict:true,schema}}})});
  if(!response.ok)throw Error('OpenAI HTTP '+response.status+' · 자동 재시도하지 않았습니다.');
  const reader=response.body?.getReader(),chunks=[];let bytes=0,raw;
  if(reader){try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>512000){await reader.cancel();throw Error('AI 응답 크기 제한을 초과했습니다.');}chunks.push(part.value);}}finally{reader.releaseLock();}raw=Buffer.concat(chunks).toString('utf8');}
  else{raw=await response.text();if(Buffer.byteLength(raw)>512000)throw Error('AI 응답 크기 제한을 초과했습니다.');}
  const body=JSON.parse(raw);if(body.status!=='completed')throw Error('AI 응답이 완료되지 않았습니다.');
  const output=(body.output||[]).flatMap(o=>o.content||[]).filter(o=>o.type==='output_text').map(o=>o.text).join('');
  if(!output)throw Error('AI가 구조화된 답변을 반환하지 않았습니다.');
  return {value:JSON.parse(output),receipt:{provider:'openai',model:PRICING.model,reservation,upper_bound_usd:estimate,usage:body.usage?{input_tokens:body.usage.input_tokens,output_tokens:body.usage.output_tokens,total_tokens:body.usage.total_tokens}:null}};
 }catch{throw Error('AI 요청이 완료되지 않았습니다. 예약 비용은 보수적으로 유지되며 같은 요청을 자동 재시도하지 않습니다.');}
}
