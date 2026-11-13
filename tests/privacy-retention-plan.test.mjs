import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {buildInquiryRetentionPlan,checkInquiryPlan,inquiryReviewDate,inquiryPlanLimits,runInquiryPlanCli,buildOperationalRetentionPlan,checkOperationalPlan} from '../scripts/privacy-retention-plan.mjs';
import {privacyRetentionDesign} from '../scripts/privacy-retention-policy.mjs';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const record=(n,resolved_on,retention_basis='general_inquiry')=>({case_id:id(n),resolved_on,retention_basis});
const register=records=>({schema_version:1,edition:'edu',authority:'resistor-support-inquiries',revision:1,records});

test('approved inquiry review date separates the exact anniversary, pending work and legally held records',()=>{
 const input=register([record(1,'2025-11-12'),record(2,'2025-11-13'),record(3,'2025-11-14'),record(4,null),record(5,'2020-01-01','statutory_hold'),record(6,'2020-01-01','unclassified'),record(7,'2027-01-01')]),before=structuredClone(input);
 const result=buildInquiryRetentionPlan(input,{asOf:'2026-11-13'});
 assert.deepEqual(result.records.map(row=>row.status),['review_due','review_due','not_due','unresolved','statutory_hold','classification_required','future_resolution_review']);
 assert.deepEqual(result.summary,{review_due:2,not_due:1,unresolved:1,statutory_hold:1,classification_required:1,future_resolution_review:1});
 assert.equal(result.records[4].review_on,null);assert.equal(result.deletion_supported,false);assert.equal(result.execution_status,'not_run');assert.deepEqual(input,before);
 assert.ok(result.records.every(row=>row.automatic_deletion===false));
});

test('calendar-year review handles leap dates without treating 365 days as every year',()=>{
 assert.equal(inquiryReviewDate('2024-02-29'),'2025-02-28');assert.equal(inquiryReviewDate('2023-03-01'),'2024-03-01');assert.equal(inquiryReviewDate('2025-12-31'),'2026-12-31');
 assert.equal(buildInquiryRetentionPlan(register([record(1,'2024-02-29')]),{asOf:'2025-02-27'}).records[0].status,'not_due');
 for(const value of ['2025-02-29','2026-04-31','2026-00-01','2026-13-01','2026-1-01','2026-11-13T00:00:00Z',''])assert.throws(()=>inquiryReviewDate(value),/INVALID_DATE/);
});

test('edition, authority, case IDs, fields and classification are fail-closed',()=>{
 const input=register([record(1,'2025-01-01')]);
 for(const patch of [{edition:'indust'},{authority:'another-server'},{revision:0},{schema_version:2},{email:'not-allowed@example.test'}])assert.throws(()=>buildInquiryRetentionPlan({...input,...patch},{asOf:'2026-11-13'}),/INVALID_SCOPE_OR_SCHEMA/);
 for(const bad of [{...input.records[0],email:'not-allowed@example.test'},{...input.records[0],case_id:'someone@example.test'},{...input.records[0],retention_basis:'delete_after_30_days'}])assert.throws(()=>buildInquiryRetentionPlan(register([bad]),{asOf:'2026-11-13'}));
 assert.throws(()=>buildInquiryRetentionPlan(register([input.records[0],input.records[0]]),{asOf:'2026-11-13'}),/DUPLICATE_CASE_ID/);
 assert.throws(()=>buildInquiryRetentionPlan(register(Array.from({length:1001},(_,n)=>record(n,null))),{asOf:'2026-11-13'}),/INVALID_RECORD_LIMIT/);
});

test('plan hash binds the source revision, dates, case scope and as-of day, never deletion completion',()=>{
 const input=register([record(1,'2025-01-01')]),plan=buildInquiryRetentionPlan(input,{asOf:'2026-11-13'});
 assert.deepEqual(buildInquiryRetentionPlan(input,{asOf:'2026-11-13'}),plan);
 assert.deepEqual(checkInquiryPlan(input,plan,{asOf:'2026-11-13'}),{plan_matches:true,execution_status:'not_run',deletion_performed:false});
 for(const changed of [{...input,revision:2},register([record(1,'2025-12-01')]),register([record(2,'2025-01-01')])])assert.throws(()=>checkInquiryPlan(changed,plan,{asOf:'2026-11-13'}),/PLAN_OR_SOURCE_CHANGED/);
 assert.throws(()=>checkInquiryPlan(input,plan,{asOf:'2026-11-14'}),/PLAN_OR_SOURCE_CHANGED/);
 assert.throws(()=>checkInquiryPlan(input,{...plan,deletion_performed:true},{asOf:'2026-11-13'}),/PLAN_OR_SOURCE_CHANGED/);
});

test('CLI consumes only bounded stdin metadata, rejects apply/options and never echoes rejected personal data',async()=>{
 async function run(args,text){let stdout='',stderr='';const code=await runInquiryPlanCli(args,{input:Readable.from([text]),output:{write:value=>stdout+=value},error:{write:value=>stderr+=value}});return {code,stdout,stderr};}
 const good=await run(['--as-of','2026-11-13'],JSON.stringify(register([record(1,'2025-01-01')])));assert.equal(good.code,0);assert.equal(JSON.parse(good.stdout).mode,'dry_run');assert.equal(good.stderr,'');
 for(const [args,text]of [[['--apply'],'sensitive@example.test'],[['--as-of','2026-11-13'],'{"email":"sensitive@example.test"}'],[['--as-of','2026-11-13'],'invalid sensitive@example.test'],[['--as-of','2026-11-13'],'x'.repeat(inquiryPlanLimits.inputBytes+1)]]){const result=await run(args,text);assert.equal(result.code,1);assert.equal(result.stdout,'');assert.doesNotMatch(result.stderr,/sensitive@example|x{30}/);assert.equal(JSON.parse(result.stderr).deletion_performed,false);}
});

const stamp=value=>Date.parse(value);
const opRecord=(n,patch={})=>({record_id:id(n),category:'dispatch_body',status:'accepted',accepted_at:stamp('2026-10-14T12:30:00.000Z'),closed_at:null,occurred_at:null,created_at:null,retention_basis:'operational',dependency_state:'cleared',dispute_hold:false,...patch});
const opRegister=records=>({schema_version:1,edition:'edu',authority:'resistor-operational-retention',policy_version:privacyRetentionDesign.policy_version,revision:1,records});
const asOf='2026-11-13T12:30:00.000Z';

test('approved 30/90/30 design is versioned and not an implemented deletion policy',()=>{
 assert.deepEqual(privacyRetentionDesign.retention_days,{dispatch_body:30,technical_detail:90,operator_backup:30});
 assert.equal(privacyRetentionDesign.decision_status,'owner_approved_design_only');assert.equal(privacyRetentionDesign.effective_at,null);assert.equal(privacyRetentionDesign.automatic_deletion_implemented,false);
 assert.throws(()=>{privacyRetentionDesign.retention_days.dispatch_body=1;},TypeError);
 const input=opRegister([opRecord(1)]),original=structuredClone(input),before=buildOperationalRetentionPlan(input,{asOf:'2026-11-13T12:29:59.999Z'}),at=buildOperationalRetentionPlan(input,{asOf});
 assert.equal(before.records[0].status,'not_due');assert.equal(at.records[0].status,'review_due');assert.equal(at.records[0].review_anchor,'accepted_at');assert.equal(at.records[0].review_at,asOf);
 assert.equal(at.deletion_supported,false);assert.equal(at.deletion_performed,false);assert.equal(at.database_inspected,false);assert.equal(at.mailbox_inspected,false);assert.equal(at.backup_inspected,false);assert.equal(at.dependency_claims_independently_verified,false);assert.deepEqual(input,original);
});

test('failed or canceled dispatch needs an explicit later closure, not a failed timestamp or provider acceptance assumption',()=>{
 const result=buildOperationalRetentionPlan(opRegister([
  opRecord(1,{status:'failed',accepted_at:null}),
  opRecord(2,{status:'canceled',closed_at:stamp('2026-10-20T12:30:00.000Z')}),
  opRecord(3,{status:'failed',accepted_at:null,closed_at:stamp('2026-10-14T12:30:00.000Z')}),
  opRecord(4,{accepted_at:null}),
 ]),{asOf});
 assert.deepEqual(result.records.map(row=>row.status),['closure_required','not_due','review_due','anchor_missing']);
 assert.equal(result.records[1].review_at,'2026-11-19T12:30:00.000Z');assert.equal(result.records[1].status_before_review,'canceled');
 assert.throws(()=>buildOperationalRetentionPlan(opRegister([opRecord(1,{status:'canceled',closed_at:stamp('2026-10-13T12:30:00.000Z')})]),{asOf}),/INCONSISTENT_ANCHOR/);
 assert.throws(()=>buildOperationalRetentionPlan(opRegister([opRecord(1,{failed_at:stamp('2026-10-14T12:30:00.000Z')})]),{asOf}),/UNSUPPORTED_RECORD_FIELDS/);
});

test('age never overrides pending/ambiguous transmission, legal, entitlement, dispute or dependency holds',()=>{
 const patches=[{status:'pending'},{status:'sending'},{status:'review_required'},{retention_basis:'statutory_hold'},{retention_basis:'active_entitlement'},{retention_basis:'unclassified'},{dispute_hold:true},{dependency_state:'hold'},{dependency_state:'unknown'},{accepted_at:stamp('2026-12-01T00:00:00.000Z')}];
 const result=buildOperationalRetentionPlan(opRegister(patches.map((patch,index)=>opRecord(index+1,patch))),{asOf});
 assert.deepEqual(result.records.map(row=>row.status),['unresolved_hold','unresolved_hold','unresolved_hold','statutory_hold','entitlement_hold','classification_required','dispute_hold','dependency_hold','dependency_review_required','future_timestamp_review']);
 assert(result.records.every(row=>row.review_at===null&&row.automatic_deletion===false));
});

test('only separately classified completed technical detail and operator backup receive their own day windows',()=>{
 const result=buildOperationalRetentionPlan(opRegister([
  opRecord(1,{category:'technical_detail',status:'closed',accepted_at:null,occurred_at:stamp('2026-08-15T12:30:00.000Z')}),
  opRecord(2,{category:'technical_detail',status:'open',accepted_at:null,occurred_at:stamp('2020-01-01T00:00:00.000Z')}),
  opRecord(3,{category:'operator_backup',status:'complete',accepted_at:null,created_at:stamp('2026-10-14T12:30:00.001Z')}),
  opRecord(4,{category:'operator_backup',status:'in_progress',accepted_at:null,created_at:stamp('2020-01-01T00:00:00.000Z')}),
 ]),{asOf});
 assert.deepEqual(result.records.map(row=>row.status),['review_due','unresolved_hold','not_due','unresolved_hold']);
 assert.equal(result.records[0].review_anchor,'occurred_at');assert.equal(result.records[2].review_at,'2026-11-13T12:30:00.001Z');
 for(const patch of [{category:'provider_backup'},{category:'operator_backup',status:'complete'},{dependency_state:false},{dispute_hold:'false'}])assert.throws(()=>buildOperationalRetentionPlan(opRegister([opRecord(1,patch)]),{asOf}));
});

test('operational plan binds policy, revision, closure and holds without reading data or accepting apply commands',async()=>{
 const input=opRegister([opRecord(1)]),plan=buildOperationalRetentionPlan(input,{asOf});
 assert.equal(checkOperationalPlan(input,plan,{asOf}).plan_matches,true);
 for(const candidate of [{...input,revision:2},opRegister([opRecord(1,{dependency_state:'hold'})])])assert.throws(()=>checkOperationalPlan(candidate,plan,{asOf}),/PLAN_OR_SOURCE_CHANGED/);
 assert.throws(()=>checkOperationalPlan(input,{...plan,deletion_performed:true},{asOf}),/PLAN_OR_SOURCE_CHANGED/);
 for(const patch of [{policy_version:'2026-01-01'},{edition:'indust'},{authority:'production-database'}])assert.throws(()=>buildOperationalRetentionPlan({...input,...patch},{asOf}),/INVALID_SCOPE_OR_SCHEMA/);
 for(const instant of ['2026-11-13','2026-02-30T00:00:00.000Z','2026-11-13T12:30:00+00:00'])assert.throws(()=>buildOperationalRetentionPlan(input,{asOf:instant}),/INVALID_INSTANT/);
 async function cli(args,data){let stdout='',stderr='';const code=await runInquiryPlanCli(args,{input:Readable.from([JSON.stringify(data)]),output:{write:value=>stdout+=value},error:{write:value=>stderr+=value}});return {code,stdout,stderr};}
 const args=['--scope','operational','--as-of',asOf],good=await cli(args,input);assert.equal(good.code,0);assert.equal(JSON.parse(good.stdout).deletion_performed,false);
 for(const [options,data]of [[args,opRegister([opRecord(1,{email:'private@example.test'})])],[[...args,'--apply'],input],[[...args,'--database','private.sqlite'],input]]){const bad=await cli(options,data);assert.equal(bad.code,1);assert.equal(bad.stdout,'');assert.doesNotMatch(bad.stderr,/private@example|private.sqlite/);}
});
