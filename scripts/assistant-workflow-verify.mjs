// Read-only evidence verifier. It never creates keys, calls a model, edits a
// design, or starts a job. Use the isolated UI QA workspace, not a user design.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {runtimeConfig,workerRpc} from './runtime.mjs';
import {collectEvidence} from './design-assistant.mjs';
import {getProductEdition} from './edition-workspace.mjs';
import {ASSISTANT_MODELS} from './assistant-models.mjs';
const flags=Object.fromEntries(process.argv.slice(2).map(v=>{const m=v.match(/^--(workspace|project-id)=(.+)$/);if(!m)throw Error('Use --workspace=PATH --project-id=ID');return [m[1],m[2]];}));
assert(flags.workspace&&/^[a-f0-9]{32}$/.test(flags['project-id']),'An explicit isolated QA workspace and project ID are required.');
assert.equal(getProductEdition().edition,'indust');
const root=process.cwd(),out=path.resolve('docs/evidence/assistant-workflow-20261027'),worker=await runtimeConfig(path.resolve(flags.workspace)),projectId=flags['project-id'];
const recorded=JSON.parse(await readFile(path.join(out,'ui-workflows.json'),'utf8'));
const rows=recorded.events.filter(e=>e.method==='assistant.workflow_plan'&&e.ok).map(e=>e.result);
assert(rows.length>=3,'Expected actual model responses from the UI exercise.');
const api=async(m,p)=>{const r=await workerRpc(worker,m,p);assert(r.ok,JSON.stringify(r.error));return r.result;};
const project=await api('project.snapshot',{project_id:projectId});
const evidence=await collectEvidence(worker,{project_id:projectId,expected_revision:project.revision});
const applied=recorded.events.find(e=>e.method==='assistant.workflow_execute'&&e.ok&&e.result.engine.status==='completed'&&e.result.before),checks=[];
const check=(name,result)=>{assert(result,name);checks.push({name,pass:true});};
check('Live Luna decisions use the requested model',rows.every(r=>r.decision.status==='completed'&&r.decision.model==='gpt-6-luna'));
check('Completed Sol proposals use the requested model',rows.filter(r=>r.proposal.status==='completed').every(r=>r.proposal.model==='gpt-6.1-sol'));
check('Every plan initially executed no engine action',rows.every(r=>r.engine.status==='not_run'));
check('The model clarification case did not call Sol',rows.some(r=>r.decision_result.verdict==='needs_input'&&r.proposal.status==='not_run'));
check('Actual approved R1 edit changed 10000 ohm to 2200 ohm',applied?.result.before.value===10000&&applied.result.proposal_result.action.value===2200&&project.schematic.devices.find(d=>d.id==='r1').parameters.value===2200);
check('Only the approved edit created a new revision',project.revision===2);
check('Unapproved 3300 ohm proposal was not applied',rows.some(r=>r.proposal_result?.action.value===3300)&&project.schematic.devices.find(d=>d.id==='r1').parameters.value===2200);
check('A later actual engine result invalidates the same-revision plan',rows.some(r=>r.revision===project.revision&&r.proposal_result?.action.value===3300&&r.evidence_hash!==evidence.fingerprint));
const dispatch=recorded.events.find(e=>e.method==='assistant.workflow_execute'&&e.ok&&e.result.engine.run),run=dispatch&&await api('job.status',{run_id:dispatch.result.engine.run.id});
check('The approved simulation completed in actual ngspice',run?.execution_status==='completed'&&run.tool==='ngspice'&&run.revision===2&&run.waveforms?.length>0);
check('Actual waveform arrays contain 2022 native samples',run.waveforms.every(w=>w.x.length===2022&&w.y.length===2022));
const stages=rows.flatMap(r=>[r.decision,r.proposal]).filter(s=>s.status==='completed'),reserved=stages.reduce((sum,s)=>sum+(s.budget_reservation?.reserved_usd||0),0),ledger=JSON.parse(await readFile(path.join(root,'.runtime/assistant/budget.json'),'utf8')),settings=JSON.parse(await readFile(path.join(root,'.runtime/assistant/settings.json'),'utf8'));
check('The existing US$1 cap was preserved',settings.budget_usd===1&&ledger.reserved_usd<=1&&reserved<1);
const standardEstimate=stages.reduce((sum,s)=>{const rate=Object.values(ASSISTANT_MODELS).find(r=>r.model===s.model);return sum+((s.usage?.input_tokens||0)*rate.input+(s.usage?.output_tokens||0)*rate.output)/1e6;},0);
const coreLog=await readFile(path.join(out,'core-tests.log'),'utf8'),assistantLog=await readFile(path.join(out,'assistant-tests.log'),'utf8');
const coreCounts=[...coreLog.matchAll(/ℹ tests (\d+)/g)].map(m=>Number(m[1]));assert.equal(coreCounts.length,2);assert.equal([...coreLog.matchAll(/ℹ fail (\d+)/g)].some(m=>Number(m[1])!==0),false);assert.match(assistantLog,/ℹ fail 0/);
const localValidation={core_tests:coreCounts.reduce((a,b)=>a+b,0),assistant_tests:Number(assistantLog.match(/ℹ tests (\d+)/)[1]),typecheck:'passed',builds:{},docs:null,source_audit:null};
assert(!/error TS/.test(await readFile(path.join(out,'typecheck.log'),'utf8')));
for(const edition of ['indust','edu']){const log=await readFile(path.join(out,'build-'+edition+'.log'),'utf8');assert.match(log,/Verified canonical debug maps: 3/);localValidation.builds[edition]='passed';}
for(const [file,key]of [['docs-check.log','docs'],['source-audit.log','source_audit']]){const text=await readFile(path.join(out,file),'utf8');localValidation[key]=JSON.parse(text.slice(text.indexOf('{')));}
const sourceFiles=['scripts/assistant-models.mjs','scripts/assistant-workflow.mjs','scripts/design-assistant.mjs','packages/ui/src/AssistantWorkflow.tsx','packages/ui/src/DesignAssistantWorkbench.tsx','packages/contracts/src/assistant.ts','tests/assistant-workflow.test.mjs','tests/design-assistant.test.mjs','workers/eda/server.py'];
const sourceHashes=Object.fromEntries(await Promise.all(sourceFiles.map(async f=>[f,createHash('sha256').update(await readFile(f)).digest('hex')])));
const report={schema_version:1,edition:'indust',checked_at:new Date().toISOString(),scope:'Isolated public RC; actual UI calls to OpenAI and native ngspice. No user design was changed.',models:ASSISTANT_MODELS,model_calls:stages.length,model_calls_by_role:{decision:stages.filter(s=>s.model==='gpt-6-luna').length,execution:stages.filter(s=>s.model==='gpt-6.1-sol').length},api_budget:{cap_usd:settings.budget_usd,additional_reserved_usd:reserved,total_reserved_usd:ledger.reserved_usd,standard_usage_estimate_usd:standardEstimate,reservations_are_not_final_billing:true},project:{id:project.id,revision:project.revision,resistor_ohm:2200},actual_run:{id:run.id,revision:run.revision,tool:run.tool,execution_status:run.execution_status,analysis_result:run.analysis_result,samples:2022,waveforms:run.waveforms.map(w=>({name:w.name,unit:w.unit,min:Math.min(...w.y),max:Math.max(...w.y)}))},checks,local_validation:localValidation,manual_ui:{approval_buttons_disabled_before_consent:true,history_restored_after_reload:true,same_revision_stale_plan_apply_disabled:true,mobile:{viewport_width:390,panel_width:255,panel_scroll_width:255},screenshots:['actual-plan.jpg','actual-ngspice.jpg','mobile.jpg','plan-preview-fixed.jpg','stale-plan.jpg']},notes:['The initial live requests exposed an overly literal plan-only clarification. The final prompt clarification and response-wait labels were then rebuilt and verified with a real plan-only request.','DRC/LVS/PEX dispatch is covered by bounded schemas; no live DRC/LVS/PEX job was executed in this exercise.','Windows native engine and bundled Node ESM were tested. macOS/Linux native execution, commercial engines, full-chip STA and foundry signoff were not run.'],source_sha256:sourceHashes,foundry_signoff:false,production_deployed:false,new_installer_published:false};
await mkdir(out,{recursive:true});await writeFile(path.join(out,'verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({edition:report.edition,checks:checks.length,model_calls:stages.length,reserved_usd:reserved,standard_usage_estimate_usd:standardEstimate,actual_run:report.actual_run}));
