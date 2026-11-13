// Metadata-only operator assistance. No mailbox, database, credential or network access.
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {privacyRetentionDesign} from './privacy-retention-policy.mjs';

export const inquiryPlanLimits=Object.freeze({records:1000,inputBytes:262144});
const fail=code=>{throw Object.assign(new Error(code),{code});};
const fields=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const statuses=['review_due','not_due','unresolved','statutory_hold','classification_required','future_resolution_review'];
function day(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))fail('INVALID_DATE');
 const [year,month,date]=value.split('-').map(Number);
 if(year<1000||year>9998||new Date(Date.UTC(year,month-1,date)).toISOString().slice(0,10)!==value)fail('INVALID_DATE');
 return {year,month,date};
}
export function inquiryReviewDate(resolvedOn){
 const {year,month,date}=day(resolvedOn),nextYear=year+1;
 const lastDay=new Date(Date.UTC(nextYear,month,0)).getUTCDate();
 return `${nextYear}-${String(month).padStart(2,'0')}-${String(Math.min(date,lastDay)).padStart(2,'0')}`;
}
function normalize(register){
 if(!fields(register,['schema_version','edition','authority','revision','records'])||register.schema_version!==1||register.edition!=='edu'||register.authority!=='resistor-support-inquiries'||!Number.isSafeInteger(register.revision)||register.revision<1)fail('INVALID_SCOPE_OR_SCHEMA');
 if(!Array.isArray(register.records)||register.records.length>inquiryPlanLimits.records)fail('INVALID_RECORD_LIMIT');
 const seen=new Set(),records=register.records.map(record=>{
  if(!fields(record,['case_id','resolved_on','retention_basis']))fail('UNSUPPORTED_RECORD_FIELDS');
  if(typeof record.case_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(record.case_id))fail('OPAQUE_CASE_ID_REQUIRED');
  const id=record.case_id.toLowerCase();if(seen.has(id))fail('DUPLICATE_CASE_ID');seen.add(id);
  if(record.resolved_on!==null)day(record.resolved_on);
  if(!['general_inquiry','statutory_hold','unclassified'].includes(record.retention_basis))fail('UNSUPPORTED_RETENTION_BASIS');
  return {case_id:id,resolved_on:record.resolved_on,retention_basis:record.retention_basis};
 });
 return {schema_version:1,edition:'edu',authority:'resistor-support-inquiries',revision:register.revision,records};
}

/** One calendar-year anniversary is a manual review date, never a deletion verdict. */
export function buildInquiryRetentionPlan(register,{asOf}={}){
 day(asOf);const input=normalize(register);
 const records=input.records.map(record=>{
  let status,reviewOn=null;
  if(record.retention_basis==='statutory_hold')status='statutory_hold';
  else if(record.retention_basis==='unclassified')status='classification_required';
  else if(record.resolved_on===null)status='unresolved';
  else if(record.resolved_on>asOf)status='future_resolution_review';
  else{reviewOn=inquiryReviewDate(record.resolved_on);status=asOf>=reviewOn?'review_due':'not_due';}
  return {...record,review_on:reviewOn,status,automatic_deletion:false};
 });
 const plan={schema_version:1,edition:'edu',authority:input.authority,tool:'inquiry-retention-plan-v1',source_revision:input.revision,input_sha256:sha(input),as_of:asOf,time_zone:'Asia/Seoul',scope:'operator-supplied inquiry metadata only',mode:'dry_run',execution_status:'not_run',mailbox_inspected:false,database_inspected:false,deletion_supported:false,deletion_performed:false,review_date_rule:'one calendar-year anniversary; Feb 29 becomes Feb 28 in a non-leap year; operator review date only',summary:Object.fromEntries(statuses.map(status=>[status,records.filter(record=>record.status===status).length])),records};
 return {...plan,plan_sha256:sha(plan)};
}

export function checkInquiryPlan(register,plan,{asOf}={}){
 const expected=buildInquiryRetentionPlan(register,{asOf});
 if(JSON.stringify(expected)!==JSON.stringify(plan))fail('PLAN_OR_SOURCE_CHANGED');
 return {plan_matches:true,execution_status:'not_run',deletion_performed:false};
}

const operationalStatuses=['review_due','not_due','unresolved_hold','statutory_hold','entitlement_hold','classification_required','dispute_hold','dependency_hold','dependency_review_required','anchor_missing','closure_required','future_timestamp_review'];
const operationalFields=['record_id','category','status','accepted_at','closed_at','occurred_at','created_at','retention_basis','dependency_state','dispute_hold'];
const categoryStates={dispatch_body:['pending','sending','accepted','failed','canceled','review_required'],technical_detail:['open','closed'],operator_backup:['in_progress','complete']};
function instant(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))fail('INVALID_INSTANT');
 const time=Date.parse(value);if(!Number.isFinite(time)||time<0||time>253370764800000||new Date(time).toISOString()!==value)fail('INVALID_INSTANT');return time;
}
function operationalRegister(register){
 if(!fields(register,['schema_version','edition','authority','policy_version','revision','records'])||register.schema_version!==1||register.edition!=='edu'||register.authority!=='resistor-operational-retention'||register.policy_version!==privacyRetentionDesign.policy_version||!Number.isSafeInteger(register.revision)||register.revision<1)fail('INVALID_SCOPE_OR_SCHEMA');
 if(!Array.isArray(register.records)||register.records.length>inquiryPlanLimits.records)fail('INVALID_RECORD_LIMIT');
 const seen=new Set(),records=register.records.map(record=>{
  if(!fields(record,operationalFields))fail('UNSUPPORTED_RECORD_FIELDS');
  if(typeof record.record_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(record.record_id))fail('OPAQUE_RECORD_ID_REQUIRED');
  const id=record.record_id.toLowerCase();if(seen.has(id))fail('DUPLICATE_RECORD_ID');seen.add(id);
  if(!Object.hasOwn(categoryStates,record.category)||!categoryStates[record.category].includes(record.status))fail('UNSUPPORTED_RECORD_STATUS');
  for(const key of ['accepted_at','closed_at','occurred_at','created_at'])if(record[key]!==null&&(!Number.isSafeInteger(record[key])||record[key]<0||record[key]>253370764800000))fail('INVALID_INSTANT');
  if(!['operational','statutory_hold','active_entitlement','unclassified'].includes(record.retention_basis))fail('UNSUPPORTED_RETENTION_BASIS');
  if(!['unknown','hold','cleared'].includes(record.dependency_state)||typeof record.dispute_hold!=='boolean')fail('INVALID_DEPENDENCY_STATE');
  if(record.category==='dispatch_body'&&(record.occurred_at!==null||record.created_at!==null)||record.category==='technical_detail'&&(record.accepted_at!==null||record.closed_at!==null||record.created_at!==null)||record.category==='operator_backup'&&(record.accepted_at!==null||record.closed_at!==null||record.occurred_at!==null))fail('INCONSISTENT_ANCHOR');
  if(record.accepted_at!==null&&record.closed_at!==null&&record.closed_at<record.accepted_at)fail('INCONSISTENT_ANCHOR');
  return Object.fromEntries(operationalFields.map(key=>[key,key==='record_id'?id:record[key]]));
 });
 return {schema_version:1,edition:'edu',authority:register.authority,policy_version:register.policy_version,revision:register.revision,records};
}

/** Only operators' classified metadata is reviewed. No DB, Gmail or backup is inspected. */
export function buildOperationalRetentionPlan(register,{asOf}={}){
 const now=instant(asOf),input=operationalRegister(register);
 const records=input.records.map(record=>{
  let status,anchor=null,reviewAt=null;
  if(record.retention_basis==='statutory_hold')status='statutory_hold';
  else if(record.retention_basis==='active_entitlement')status='entitlement_hold';
  else if(record.retention_basis==='unclassified')status='classification_required';
  else if(record.dispute_hold)status='dispute_hold';
  else if(record.dependency_state==='hold')status='dependency_hold';
  else if(record.dependency_state==='unknown')status='dependency_review_required';
  else if(['pending','sending','review_required','open','in_progress'].includes(record.status))status='unresolved_hold';
  else if(['accepted_at','closed_at','occurred_at','created_at'].some(key=>record[key]!==null&&record[key]>now))status='future_timestamp_review';
  else{
   anchor=record.category==='dispatch_body'?(record.status==='accepted'?'accepted_at':'closed_at'):record.category==='technical_detail'?'occurred_at':'created_at';
   if(record[anchor]===null)status=anchor==='closed_at'?'closure_required':'anchor_missing';
   else{reviewAt=new Date(record[anchor]+privacyRetentionDesign.retention_days[record.category]*86400000).toISOString();status=now>=Date.parse(reviewAt)?'review_due':'not_due';}
  }
  return {...record,review_anchor:anchor,review_at:reviewAt,status_before_review:record.status,status,automatic_deletion:false};
 });
 const plan={schema_version:1,edition:'edu',authority:input.authority,tool:'operational-retention-plan-v1',policy:privacyRetentionDesign,source_revision:input.revision,input_sha256:sha(input),as_of:asOf,time_zone:'UTC',scope:'operator-supplied operational metadata only; separate statutory and entitlement records',mode:'dry_run',execution_status:'not_run',mailbox_inspected:false,database_inspected:false,backup_inspected:false,dependency_claims_independently_verified:false,deletion_supported:false,deletion_performed:false,review_date_rule:'30/90 elapsed 24-hour days; review_due is manual review only; provider acceptance is not inbox delivery',summary:Object.fromEntries(operationalStatuses.map(status=>[status,records.filter(record=>record.status===status).length])),records};
 return {...plan,plan_sha256:sha(plan)};
}
export function checkOperationalPlan(register,plan,{asOf}={}){
 if(JSON.stringify(buildOperationalRetentionPlan(register,{asOf}))!==JSON.stringify(plan))fail('PLAN_OR_SOURCE_CHANGED');
 return {plan_matches:true,execution_status:'not_run',deletion_performed:false};
}

/** stdin-only prevents accidental filesystem/database discovery by this tool. */
export async function runInquiryPlanCli(args,{input=process.stdin,output=process.stdout,error=process.stderr}={}){
 try{
  const operational=args.length===4&&args[0]==='--scope'&&args[1]==='operational'&&args[2]==='--as-of';
  if(!operational&&(args.length!==2||args[0]!=='--as-of'))fail('USAGE');
  const asOf=operational?args[3]:args[1];if(operational)instant(asOf);else day(asOf);const chunks=[];let size=0;
  for await(const chunk of input){const bytes=Buffer.from(chunk);size+=bytes.length;if(size>inquiryPlanLimits.inputBytes)fail('INPUT_TOO_LARGE');chunks.push(bytes);}
  let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail('INVALID_JSON');}
  const plan=operational?buildOperationalRetentionPlan(data,{asOf}):buildInquiryRetentionPlan(data,{asOf});output.write(JSON.stringify(plan,null,2)+'\n');return 0;
 }catch(failure){
  const known=new Set(['INVALID_DATE','INVALID_INSTANT','INVALID_SCOPE_OR_SCHEMA','INVALID_RECORD_LIMIT','UNSUPPORTED_RECORD_FIELDS','OPAQUE_CASE_ID_REQUIRED','DUPLICATE_CASE_ID','OPAQUE_RECORD_ID_REQUIRED','DUPLICATE_RECORD_ID','UNSUPPORTED_RECORD_STATUS','INVALID_DEPENDENCY_STATE','INCONSISTENT_ANCHOR','UNSUPPORTED_RETENTION_BASIS','USAGE','INPUT_TOO_LARGE','INVALID_JSON']);
  const code=known.has(failure?.code)?failure.code:'PLAN_FAILED';
  error.write(JSON.stringify({ok:false,code,usage:'node scripts/privacy-retention-plan.mjs --as-of YYYY-MM-DD < inquiry-metadata.json; or --scope operational --as-of YYYY-MM-DDTHH:mm:ss.sssZ < operational-metadata.json',execution_status:'not_run',deletion_performed:false})+'\n');return 1;
 }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))process.exitCode=await runInquiryPlanCli(process.argv.slice(2));
