import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {structuredModel} from '../packages/contracts/src/ai-models.ts';
import {readProviderCredential,providerConfig,reserveProviderBudget,PRICING} from './design-assistant.mjs';

export async function structuredStatus(workspace){
 const config=await providerConfig(workspace);let ledger={reserved_usd:0};
 try{ledger=JSON.parse(await readFile(path.join(workspace,'.runtime/assistant/budget.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(!Number.isFinite(ledger.reserved_usd)||ledger.reserved_usd<0)throw Error('Invalid shared budget ledger.');
 return {configured:!!await readProviderCredential(workspace),model:PRICING.model,budget_usd:config.budget_usd,reserved_usd:ledger.reserved_usd,remaining_usd:Math.max(0,config.budget_usd-ledger.reserved_usd),pricing:PRICING};
}
export function structuredEstimate(system,content,schema,{model=PRICING.model,max_output_tokens=4096,input_byte_bound}={}){
 const pricing=structuredModel(model);if(!Number.isSafeInteger(max_output_tokens)||max_output_tokens<256||max_output_tokens>4096)throw Error('Invalid structured output limit.');
 const inputBytes=Buffer.byteLength(system+JSON.stringify(content)+JSON.stringify(schema));
 if(input_byte_bound!==undefined&&(!Number.isSafeInteger(input_byte_bound)||input_byte_bound<1||input_byte_bound>64000||inputBytes>input_byte_bound))throw Error('AI 전송 데이터가 승인된 크기 범위를 넘었습니다. 답안·질문을 줄여 다시 준비하세요.');
 // UTF-8 bytes provide a conservative token bound; no cache discount or refund assumed.
 return Math.ceil(((input_byte_bound??inputBytes)+2048)*pricing.input+max_output_tokens*pricing.output)/1e6;
}
export async function requestStructured(workspace,request,options={}){
 const {system,content,schema}=request,estimate=structuredEstimate(system,content,schema,request);
 const session=await reserveStructuredSession(workspace,estimate,{approved:request.approved,fetcher:options.fetcher});return session.request(request);
}

// One approved learning activity can reserve both stages atomically in the shared ledger.
// The credit exists only in this server closure; clients cannot submit reservation IDs.
export async function reserveStructuredSession(workspace,upperBound,{approved,fetcher=fetch}={}){
 if(approved!==true)throw Error('이 요청의 외부 전송·API 호출 승인이 필요합니다.');
 if(!Number.isFinite(upperBound)||upperBound<=0||upperBound>1)throw Error('Invalid structured session reservation.');
 const status=await structuredStatus(workspace);if(!status.configured)throw Error('기존 OpenAI 키가 연결되지 않았습니다.');
 const reservation=await reserveProviderBudget(workspace,status.budget_usd,upperBound);let remaining=upperBound;
 return {reservation,request:async request=>{const estimate=structuredEstimate(request.system,request.content,request.schema,request);if(estimate>remaining+1e-9)throw Error('AI 세션의 승인된 비용 예약을 초과했습니다.');remaining=Math.round((remaining-estimate)*1e9)/1e9;return callStructured(workspace,request,{fetcher,reservation:{...reservation,stage_upper_bound_usd:estimate}});}};
}

async function callStructured(workspace,{system,content,schema,name,approved,model=PRICING.model,max_output_tokens=4096,reasoning_effort,input_byte_bound},{fetcher,reservation}){
 if(approved!==true)throw Error('이 요청의 외부 전송·API 호출 승인이 필요합니다.');
 const status=await structuredStatus(workspace);if(!status.configured)throw Error('기존 OpenAI 키가 연결되지 않았습니다.');
 const estimate=structuredEstimate(system,content,schema,{model,max_output_tokens,input_byte_bound});
 const key=await readProviderCredential(workspace);
 try{
  const response=await fetcher('https://api.openai.com/v1/responses',{method:'POST',redirect:'error',signal:AbortSignal.timeout(45000),headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model,store:false,...(reasoning_effort?{reasoning:{effort:reasoning_effort}}:{}),service_tier:'default',max_output_tokens,input:[{role:'system',content:system},{role:'user',content:JSON.stringify(content)}],text:{format:{type:'json_schema',name,strict:true,schema}}})});
  if(!response.ok)throw Error('OpenAI HTTP '+response.status+' · 자동 재시도하지 않았습니다.');
  const reader=response.body?.getReader(),chunks=[];let bytes=0,raw;
  if(reader){try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>512000){await reader.cancel();throw Error('AI 응답 크기 제한을 초과했습니다.');}chunks.push(part.value);}}finally{reader.releaseLock();}raw=Buffer.concat(chunks).toString('utf8');}
  else{raw=await response.text();if(Buffer.byteLength(raw)>512000)throw Error('AI 응답 크기 제한을 초과했습니다.');}
  const body=JSON.parse(raw);if(body.model&&body.model!==model&&!body.model.startsWith(model+'-'))throw Error('Unexpected response model.');if(body.status!=='completed')throw Error('AI 응답이 완료되지 않았습니다.');
  const output=(body.output||[]).flatMap(o=>o.content||[]).filter(o=>o.type==='output_text').map(o=>o.text).join('');
  if(!output)throw Error('AI가 구조화된 답변을 반환하지 않았습니다.');
  return {value:JSON.parse(output),receipt:{provider:'openai',model:body.model||model,requested_model:model,reservation,upper_bound_usd:estimate,usage:body.usage?{input_tokens:body.usage.input_tokens,output_tokens:body.usage.output_tokens,total_tokens:body.usage.total_tokens}:null}};
 }catch{throw Error('AI 요청이 완료되지 않았습니다. 예약 비용은 보수적으로 유지되며 같은 요청을 자동 재시도하지 않습니다.');}
}
