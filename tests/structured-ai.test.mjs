import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {requestStructured,structuredEstimate,structuredStatus,reserveStructuredSession} from '../scripts/structured-ai.mjs';
test('structured server helper shares the existing budget, gates consent, fixes endpoint and never returns credential',async()=>{
 const workspace=await mkdtemp(path.join(os.tmpdir(),'resistor-structured-'));let calls=0;
 try{
  await mkdir(path.join(workspace,'.runtime/assistant'),{recursive:true});await writeFile(path.join(workspace,'.env.local'),'OPENAI_API_KEY=test-fixture-not-a-real-key');await writeFile(path.join(workspace,'.runtime/assistant/settings.json'),JSON.stringify({budget_usd:.01}));
  const fetcher=async(url,options)=>{calls++;assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(options.redirect,'error');const body=JSON.parse(options.body);assert.equal(body.store,false);assert.equal(body.text.format.strict,true);return {ok:true,text:async()=>JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:'{"answer":"fixture"}'}]}],usage:{input_tokens:100,output_tokens:100,total_tokens:200}})};};
  const request={approved:false,system:'Test only',content:{question:'fixture'},schema:{type:'object',properties:{answer:{type:'string'}},required:['answer'],additionalProperties:false},name:'qa_fixture'};
  assert.equal((await structuredStatus(workspace)).configured,true);await assert.rejects(requestStructured(workspace,request,{fetcher}),/승인/);assert.equal(calls,0);
  const value=await requestStructured(workspace,{...request,approved:true},{fetcher});assert.equal(value.value.answer,'fixture');assert.equal(value.receipt.upper_bound_usd,structuredEstimate(request.system,request.content,request.schema));assert.ok(!JSON.stringify(value).includes('test-fixture-not-a-real-key'));
  const ledger=JSON.parse(await readFile(path.join(workspace,'.runtime/assistant/budget.json'),'utf8'));assert.equal(ledger.reserved_usd,value.receipt.upper_bound_usd);
  await writeFile(path.join(workspace,'.runtime/assistant/settings.json'),JSON.stringify({budget_usd:ledger.reserved_usd}));await assert.rejects(requestStructured(workspace,{...request,approved:true},{fetcher}));assert.equal(calls,1);
 }finally{await rm(workspace,{recursive:true,force:true});}
});

test('role-specific prices and atomic session credits never exceed the approved reservation',async()=>{
 const workspace=await mkdtemp(path.join(os.tmpdir(),'resistor-structured-session-'));let calls=0;
 try{
  await mkdir(path.join(workspace,'.runtime/assistant'),{recursive:true});await writeFile(path.join(workspace,'.env.local'),'OPENAI_API_KEY=test-fixture-not-a-real-key');await writeFile(path.join(workspace,'.runtime/assistant/settings.json'),JSON.stringify({budget_usd:1}));
  const base={system:'fixture only',content:{a:'example'},schema:{type:'object',properties:{answer:{type:'string'}},required:['answer'],additionalProperties:false},name:'qa_fixture',approved:true,max_output_tokens:256};
  const luna=structuredEstimate(base.system,base.content,base.schema,{...base,model:'gpt-6-luna'}),sol=structuredEstimate(base.system,base.content,base.schema,{...base,model:'gpt-6.1-sol'});assert(sol>luna);
  assert.throws(()=>structuredEstimate(base.system,base.content,base.schema,{model:'unapproved-model'}));assert.throws(()=>structuredEstimate(base.system,base.content,base.schema,{input_byte_bound:1}));
  const fetcher=async(url,o)=>{calls++;const b=JSON.parse(o.body);assert.equal(b.model,'gpt-6.1-sol');return {ok:true,text:async()=>JSON.stringify({status:'completed',model:b.model,output:[{content:[{type:'output_text',text:'{"answer":"fixture"}'}]}]})};};
  const session=await reserveStructuredSession(workspace,sol,{approved:true,fetcher});const r=await Promise.allSettled([session.request({...base,model:'gpt-6.1-sol'}),session.request({...base,model:'gpt-6.1-sol'})]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(calls,1);assert.equal((await structuredStatus(workspace)).model,'gpt-6-luna');
  const ledger=JSON.parse(await readFile(path.join(workspace,'.runtime/assistant/budget.json'),'utf8'));assert.equal(ledger.requests.length,1);assert.equal(ledger.reserved_usd,sol);
  await assert.rejects(requestStructured(workspace,base,{fetcher:async()=>({ok:true,text:async()=>JSON.stringify({model:'wrong-model',status:'completed',output:[]})})}));
 }finally{await rm(workspace,{recursive:true,force:true});}
});
