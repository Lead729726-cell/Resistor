// Explicit opt-in, one paid provider request at most. Uses an existing key and
// the existing atomic workspace budget; never creates keys or raises the cap.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {runtimeConfig,workerRpc} from './runtime.mjs';
import {collectEvidence,chat,status} from './design-assistant.mjs';
import {getProductEdition} from './edition-workspace.mjs';
if(process.argv.slice(2).join(' ')!=='--approve-one-openai-call')throw Error('Opt in with --approve-one-openai-call only after authorizing the existing workspace API budget.');
assert.equal(getProductEdition().edition,'indust','Live public fixture check belongs in the Indust workspace.');
const root=process.cwd(),worker=await runtimeConfig(root),out=path.join(root,'docs/evidence/assistant-chat');await mkdir(out,{recursive:true});
const report={schema_version:1,edition:'indust',checked_at:new Date().toISOString(),public_fixture:true,paid_calls:0,model_inference_verified:false,foundry_signoff:false,cases:[]};
const check=(name,ok)=>{assert(ok,name);report.cases.push({name,pass:true});console.log('PASS '+name);};
const rpc=async(method,params={})=>{const r=await workerRpc(worker,method,params);assert(r.ok,JSON.stringify(r.error));return r.result;};
try{
  const before=await status(root);assert(before.openai.configured&&before.openai.remaining_usd>0,'Existing OpenAI key and positive approved budget are required.');report.budget_before={cap_usd:before.openai.budget_usd,reserved_usd:before.openai.reserved_usd};
  const p=await rpc('design.create_template',{template_id:'rc_lowpass',name:'[Indust QA] AI 실제 근거 · 공개 RC 필터',command_id:randomUUID()});report.project_id=p.id;report.revision=p.revision;
  let run=await rpc('simulation.run',{project_id:p.id,analysis:'tran',netlister:'native'});const deadline=Date.now()+120000;
  while(['queued','running'].includes(run.execution_status)){assert(Date.now()<deadline,'Public RC ngspice job timed out');await new Promise(r=>setTimeout(r,400));run=await rpc('job.status',{run_id:run.id});}
  check('Public RC circuit completed an actual ngspice solve',run.execution_status==='completed'&&run.waveforms?.length>0);report.run={id:run.id,revision:run.revision,execution_status:run.execution_status,analysis_result:run.analysis_result,tool:run.tool,message:run.message};
  const p2=await rpc('project.snapshot',{project_id:p.id}),selected=p2.schematic.devices.filter(d=>d.kind==='resistor').slice(0,1).map(d=>d.id),context={device_ids:selected};
  const evidence=await collectEvidence(worker,{project_id:p.id,expected_revision:p2.revision,context});report.evidence=evidence;
  const measured=evidence.runs.find(r=>r.id===run.id);check('Waveform summaries equal the actual stored native samples',run.waveforms.every(w=>{const s=measured.waveform_summary.find(s=>s.name===w.name);return s?.available&&s.samples===w.x.length&&s.min===Math.min(...w.y)&&s.max===Math.max(...w.y)&&s.last===w.y.at(-1);}));
  const originalRuns=p2.runs.length;
  console.log('Sending one explicitly authorized OpenAI question against public RC evidence.');report.paid_calls=1;
  const answer=await chat(worker,{project_id:p.id,expected_revision:p2.revision,context,provider:'openai',evidence_hash:evidence.fingerprint,approved:true,expected_turn:0,question:'이 공개 RC 필터의 실제 파형 요약에 있는 OUT 전압 범위와 전류 부호를 설명해줘. 자료에 없는 전류나 전압 강하를 만들어내지 말고, DRC/LVS/PEX의 미실행 상태와 다음 확인 항목도 구분해줘.'});
  check('Actual OpenAI response is complete and pinned to current evidence',answer.turns.length===1&&answer.freshness==='current');
  check('All reply citations exist in the supplied native evidence',answer.turns[0].reply.evidence_ids.every(id=>evidence.evidence_ids.includes(id))&&answer.turns[0].reply.findings.every(f=>f.evidence_ids.every(id=>evidence.evidence_ids.includes(id))));
  check('AI answer executed no geometry edits or engine jobs',(await rpc('project.snapshot',{project_id:p.id})).runs.length===originalRuns&&(await rpc('project.snapshot',{project_id:p.id})).revision===p2.revision);
  report.model_inference_verified=true;report.reply=answer.turns[0];report.session_id=answer.id;
  const after=await status(root);report.budget_after={cap_usd:after.openai.budget_usd,reserved_usd:after.openai.reserved_usd,additional_reservation_usd:after.openai.reserved_usd-before.openai.reserved_usd};check('Existing numeric budget cap was preserved',after.openai.budget_usd===before.openai.budget_usd&&after.openai.reserved_usd<=before.openai.budget_usd);report.completed=true;
}catch(e){report.completed=false;report.error={code:e.code||'LIVE_CHECK_FAILED',message:e.code?e.message:'Live assistant verification did not complete.'};throw e;}
finally{report.source_sha256=createHash('sha256').update(await readFile('scripts/design-assistant.mjs')).digest('hex');await writeFile(path.join(out,'native-openai.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({completed:report.completed,paid_calls:report.paid_calls,cases:report.cases.length,error:report.error}));}
