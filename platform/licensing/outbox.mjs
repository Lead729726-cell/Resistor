import {randomUUID} from 'node:crypto';
import {licenseError} from './token.mjs';

const MAX_ATTEMPTS=8,LEASE_MS=60000,RETRY_MS=[60000,300000,900000,3600000,7200000,14400000,21600000];
const EVENT_COLUMNS=Object.freeze({'email.delivered':'delivered_at','email.bounced':'bounced_at','email.complained':'complained_at','email.failed':'failed_at','email.suppressed':'suppressed_at','email.delivery_delayed':'delayed_at'});
const fail=(code,message)=>{throw licenseError(code,message);};
const id=value=>typeof value==='string'&&value.length>0&&value.length<=200&&!/[\r\n\0]/.test(value);

/** Shared durable outbox. Network awaits are outside SQL transactions; claims,
 * budgets, acknowledgments and refund races are reconciled inside transactions.
 * An API acknowledgment never establishes inbox delivery or student receipt. */
export function createDeliveryOutbox({db,transaction,encrypt,decrypt,audit,now,mailer,dailyAttemptLimit=80,kind='license'}){
 if(!['license','mail_smoke'].includes(kind))throw Error('Unsupported outbox kind');
 const smoke=kind==='mail_smoke',deliveries=smoke?'mail_smoke_deliveries':'deliveries',jobs=smoke?'mail_smoke_jobs':'delivery_jobs',attempts=smoke?'mail_smoke_attempts':'delivery_attempts';
 if(smoke)transaction(()=>db.exec(`CREATE TABLE IF NOT EXISTS mail_smoke_deliveries(id TEXT PRIMARY KEY,request_id TEXT UNIQUE NOT NULL,owner_identity TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL,provider_id TEXT,attempts INTEGER NOT NULL DEFAULT 0,last_error TEXT,created_at INTEGER NOT NULL);`));
 if(!Number.isInteger(dailyAttemptLimit)||dailyAttemptLimit<1||dailyAttemptLimit>100)throw Error('Mail daily attempt limit must be 1..100');
 transaction(()=>db.exec(`CREATE TABLE IF NOT EXISTS ${jobs}(delivery_id TEXT PRIMARY KEY REFERENCES ${deliveries}(id),provider TEXT,transport_identity TEXT,message TEXT,first_attempt_at INTEGER,lease_until INTEGER NOT NULL DEFAULT 0,lease_token TEXT,next_attempt_at INTEGER NOT NULL DEFAULT 0,accepted_at INTEGER,delivered_at INTEGER,bounced_at INTEGER,complained_at INTEGER,failed_at INTEGER,suppressed_at INTEGER,delayed_at INTEGER);
 CREATE TABLE IF NOT EXISTS ${attempts}(id TEXT PRIMARY KEY,delivery_id TEXT NOT NULL REFERENCES ${deliveries}(id),started_at INTEGER NOT NULL,finished_at INTEGER,outcome TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS ${attempts}_started ON ${attempts}(started_at);
 CREATE TABLE IF NOT EXISTS delivery_events(event_id TEXT PRIMARY KEY,provider TEXT NOT NULL,provider_id TEXT NOT NULL,event_type TEXT NOT NULL,occurred_at INTEGER NOT NULL,received_at INTEGER NOT NULL,payload_sha256 TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS delivery_events_message ON delivery_events(provider,provider_id);`));
 const row=id=>db.prepare(`SELECT * FROM ${deliveries} WHERE id=?`).get(id);
 const job=id=>db.prepare(`SELECT * FROM ${jobs} WHERE delivery_id=?`).get(id);
 const license=delivery=>db.prepare('SELECT l.status AS license_status,o.status AS order_status FROM licenses l JOIN orders o ON o.id=l.order_id WHERE l.id=?').get(delivery.license_id);
 const active=delivery=>{if(smoke)return !!mailer&&delivery.owner_identity===mailer.identity;const l=license(delivery);return l?.license_status==='active'&&l.order_status==='paid';};
 function ensure(delivery){let state=job(delivery.id);if(!state){db.prepare(`INSERT INTO ${jobs}(delivery_id,next_attempt_at) VALUES(?,?)`).run(delivery.id,now());state=job(delivery.id);
   // A historical failed attempt has no known 24h provider deduplication window.
   // Never silently retry it after upgrading this code.
   if(delivery.attempts>0&&delivery.status==='pending'){db.prepare(`UPDATE ${deliveries} SET status=?,last_error=? WHERE id=?`).run('review_required','legacy_attempt_window_unknown',delivery.id);delivery.status='review_required';delivery.last_error='legacy_attempt_window_unknown';}
  }return state;}
 function view(delivery,state=job(delivery.id)){
  const eventState=state?.complained_at?'complained':state?.bounced_at?'bounced':state?.suppressed_at?'suppressed':state?.failed_at?'failed':state?.delivered_at?'delivered_to_recipient_server':state?.delayed_at?'delayed':delivery.provider_id?'accepted':'not_confirmed';
  return {kind,delivery_id:delivery.id,status:delivery.status,provider_id:delivery.provider_id??null,provider_accepted:!!delivery.provider_id,delivery_event_state:eventState,delivered_to_inbox:false,recipient_server_delivered:!!state?.delivered_at,license_revoked:smoke?null:license(delivery)?.license_status!=='active',...(smoke?{license_granted:false}:{}),attempts:delivery.attempts,next_attempt_at:state?.next_attempt_at??null,last_error:delivery.last_error??null};
 }
 function applyEvents(delivery){if(!delivery.provider_id)return;const state=job(delivery.id);if(!state?.provider)return;for(const event of db.prepare('SELECT * FROM delivery_events WHERE provider=? AND provider_id=? ORDER BY occurred_at,event_id').all(state.provider,delivery.provider_id)){
   const column=EVENT_COLUMNS[event.event_type];if(column)db.prepare(`UPDATE ${jobs} SET ${column}=CASE WHEN ${column} IS NULL OR ${column}<? THEN ? ELSE ${column} END WHERE delivery_id=?`).run(event.occurred_at,event.occurred_at,delivery.id);
  }}
 function claim(deliveryId){return transaction(()=>{
  const delivery=row(deliveryId);if(!delivery)fail('DELIVERY_NOT_FOUND','발송 기록이 없습니다.');const state=ensure(delivery),clock=now();
  if(['accepted','canceled','failed','review_required'].includes(delivery.status))return {result:{...view(delivery,state),idempotent:true}};
  if(!active(delivery)){db.prepare(`UPDATE ${deliveries} SET status=? WHERE id=?`).run('canceled',deliveryId);return {result:view(row(deliveryId),state)};}
  if(!mailer)return {result:{...view(delivery,state),reason:'mail_transport_unavailable'}};
  if(state.lease_until>clock)return {result:{...view(delivery,state),reason:'delivery_in_progress'}};
  if(state.next_attempt_at>clock)return {result:{...view(delivery,state),reason:'retry_scheduled'}};
  const provider=mailer.provider??'custom',identity=mailer.identity??'custom';
  const noDedup=mailer.retrySafety==='no-provider-idempotency';
  if(noDedup&&delivery.attempts>0&&delivery.last_error!=='provider_pre_send_failed'){
   db.prepare(`UPDATE ${deliveries} SET status=?,last_error=? WHERE id=?`).run('review_required','provider_has_no_safe_retry',deliveryId);audit('mail_review_required',deliveryId);return {result:view(row(deliveryId),state)};
  }
  const window=noDedup?Infinity:Math.min(mailer.idempotencyWindowMs??86400000,86400000)-3600000;
  if(delivery.attempts>=MAX_ATTEMPTS||(state.first_attempt_at!==null&&clock-state.first_attempt_at>=window)||(state.transport_identity&&state.transport_identity!==identity)){
   const reason=state.transport_identity&&state.transport_identity!==identity?'transport_configuration_changed':delivery.attempts>=MAX_ATTEMPTS?'retry_limit_reached':'idempotency_window_expired';
   db.prepare(`UPDATE ${deliveries} SET status=?,last_error=? WHERE id=?`).run('review_required',reason,deliveryId);audit('mail_review_required',deliveryId);return {result:view(row(deliveryId),state)};
  }
  const count=db.prepare('SELECT COUNT(*) AS n,MIN(started_at) AS oldest FROM (SELECT started_at FROM delivery_attempts UNION ALL SELECT started_at FROM mail_smoke_attempts) WHERE started_at>?').get(clock-86400000);
  if(count.n>=dailyAttemptLimit){db.prepare(`UPDATE ${jobs} SET next_attempt_at=? WHERE delivery_id=?`).run(count.oldest+86400000+1000,deliveryId);return {result:{...view(delivery,job(deliveryId)),reason:'daily_attempt_limit'}};}
  const payload=decrypt(delivery.payload),token=randomUUID();let message;
  try{message=state.message?decrypt(state.message):(mailer.prepare?.({...payload,created_at:delivery.created_at})??null);}catch{db.prepare(`UPDATE ${deliveries} SET status=?,last_error=? WHERE id=?`).run('failed','message_preparation_failed',deliveryId);audit('mail_preparation_failed',deliveryId);return {result:view(row(deliveryId),state)};}
  db.prepare(`UPDATE ${jobs} SET provider=?,transport_identity=?,message=?,first_attempt_at=COALESCE(first_attempt_at,?),lease_until=?,lease_token=?,next_attempt_at=? WHERE delivery_id=?`).run(provider,identity,message===null?null:encrypt(message),clock,clock+LEASE_MS,token,clock+LEASE_MS,deliveryId);
  db.prepare(`UPDATE ${deliveries} SET attempts=attempts+1,last_error=? WHERE id=?`).run('provider_request_in_progress',deliveryId);
  db.prepare(`INSERT INTO ${attempts}(id,delivery_id,started_at,outcome) VALUES(?,?,?,?)`).run(token,deliveryId,clock,'started');
  return {delivery_id:deliveryId,token,payload,message};
 });}
 async function deliver(deliveryId){
  if(!id(deliveryId))fail('INVALID_PARAMETER','발송 ID가 필요합니다.');const claimed=claim(deliveryId);if(claimed.result)return claimed.result;
  const beforeSend=()=>transaction(()=>{const d=row(deliveryId),j=job(deliveryId);if(d.status!=='pending'||j.lease_token!==claimed.token||!active(d))throw Object.assign(Error('Delivery no longer active'),{mailFailure:'terminal',safePreSendFailure:true});});
  let result,error;try{result=await mailer({...claimed.payload,idempotency_key:deliveryId,prepared_message:claimed.message,before_send:beforeSend});if(!id(result?.id))throw Error('Provider acknowledgment missing');}catch(e){result=undefined;error=e;}
  return transaction(()=>{
   const delivery=row(deliveryId),state=job(deliveryId),revoked=delivery.status==='canceled'||!active(delivery);
   // A late result cannot overwrite a newer claim. A late successful ack still
   // records the real provider ID, provided it agrees with any earlier ack.
   if(result?.id){
    if(delivery.provider_id&&delivery.provider_id!==result.id){db.prepare(`UPDATE ${deliveries} SET status=?,last_error=? WHERE id=?`).run(revoked?'canceled':'review_required','provider_ack_conflict',deliveryId);}
    else{db.prepare(`UPDATE ${deliveries} SET status=?,provider_id=?,last_error=NULL WHERE id=?`).run(revoked?'canceled':'accepted',result.id,deliveryId);db.prepare(`UPDATE ${jobs} SET accepted_at=COALESCE(accepted_at,?) WHERE delivery_id=?`).run(now(),deliveryId);audit(revoked?'mail_accepted_after_refund':'mail_accepted',deliveryId);applyEvents(row(deliveryId));}
    db.prepare(`UPDATE ${attempts} SET finished_at=?,outcome=? WHERE id=?`).run(now(),'accepted',claimed.token);
   }else if(delivery.provider_id){
    // A newer attempt can fail after an older timed-out request has already
    // produced an acknowledgment. Never downgrade that durable evidence.
    db.prepare(`UPDATE ${attempts} SET finished_at=?,outcome=? WHERE id=?`).run(now(),'failed_after_acknowledgment',claimed.token);
   }else if(state.lease_token===claimed.token){
    const noDedup=mailer.retrySafety==='no-provider-idempotency';
    const terminal=error?.mailFailure==='terminal',review=error?.mailFailure==='review'||delivery.attempts>=MAX_ATTEMPTS||(noDedup&&!error?.safePreSendFailure);
    const status=revoked?'canceled':terminal?'failed':review?'review_required':'pending';
    const reason=terminal?'provider_rejected':review?'provider_reconciliation_required':error?.safePreSendFailure?'provider_pre_send_failed':'provider_request_failed_or_uncertain';
    const retry=Math.max(RETRY_MS[Math.min(delivery.attempts-1,RETRY_MS.length-1)],Math.min(error?.retryAfterMs??0,3600000));
    db.prepare(`UPDATE ${deliveries} SET status=?,last_error=? WHERE id=?`).run(status,reason,deliveryId);db.prepare(`UPDATE ${jobs} SET next_attempt_at=? WHERE delivery_id=?`).run(now()+retry,deliveryId);
    db.prepare(`UPDATE ${attempts} SET finished_at=?,outcome=? WHERE id=?`).run(now(),reason,claimed.token);
   }else db.prepare(`UPDATE ${attempts} SET finished_at=?,outcome=? WHERE id=?`).run(now(),'superseded_attempt_failed',claimed.token);
   if(state.lease_token===claimed.token)db.prepare(`UPDATE ${jobs} SET lease_until=0,lease_token=NULL WHERE delivery_id=?`).run(deliveryId);
   return view(row(deliveryId));
  });
 }
 async function processDue({limit=5}={}){
  if(smoke)return {enabled:false,processed:[],reason:'operator_request_required'};
  if(!Number.isInteger(limit)||limit<1||limit>5)fail('INVALID_PARAMETER','한 번에 1~5개 발송만 처리할 수 있습니다.');
  if(!mailer)return {enabled:false,processed:[],reason:'mail_transport_unavailable'};
  // Automatic fulfillment is scoped to verified Inflearn Edu purchases. Other
  // editions/providers retain their explicitly operated delivery workflows.
  const rows=db.prepare(`SELECT d.id FROM ${deliveries} d JOIN licenses l ON l.id=d.license_id JOIN orders o ON o.id=l.order_id LEFT JOIN ${jobs} j ON j.delivery_id=d.id WHERE l.edition='edu' AND o.provider='inflearn' AND d.status='pending' AND (j.delivery_id IS NULL OR (j.next_attempt_at<=? AND j.lease_until<=?)) ORDER BY d.created_at,d.id LIMIT ?`).all(now(),now(),limit);
  const processed=[];for(const {id} of rows)processed.push(await deliver(id));return {enabled:true,processed};
 }
 function summary({limit=50}={}){if(!Number.isInteger(limit)||limit<1||limit>100)fail('INVALID_PARAMETER','조회 수는 1~100이어야 합니다.');return {provider:mailer?.provider??null,sending_enabled:!!mailer,daily_attempt_limit:dailyAttemptLimit,maximum_attempts:MAX_ATTEMPTS,counts:db.prepare(`SELECT status,COUNT(*) AS count FROM ${deliveries} GROUP BY status`).all(),deliveries:db.prepare(`SELECT * FROM ${deliveries} ORDER BY created_at DESC,id LIMIT ?`).all(limit).map(r=>view(r))};}
 function event(value){
  if(value?.provider!=='resend'||!id(value.event_id)||!id(value.provider_id)||!['email.sent',...Object.keys(EVENT_COLUMNS)].includes(value.event_type)||!Number.isSafeInteger(value.occurred_at)||!Number.isSafeInteger(value.received_at)||!/^[a-f0-9]{64}$/.test(value.payload_sha256??''))fail('DELIVERY_EVENT_INVALID','검증된 발송 이벤트 형식이 필요합니다.');
  return transaction(()=>{const old=db.prepare('SELECT * FROM delivery_events WHERE event_id=?').get(value.event_id);if(old){if(old.payload_sha256!==value.payload_sha256)fail('DELIVERY_EVENT_CONFLICT','기존 이벤트 ID의 내용이 다릅니다.');return {recorded:true,idempotent:true};}
   db.prepare('INSERT INTO delivery_events VALUES(?,?,?,?,?,?,?)').run(value.event_id,value.provider,value.provider_id,value.event_type,value.occurred_at,value.received_at,value.payload_sha256);
   const matched=db.prepare(`SELECT * FROM ${deliveries} WHERE provider_id=?`).all(value.provider_id);for(const delivery of matched)applyEvents(delivery);
   return {recorded:true,idempotent:false,matched_deliveries:matched.length};
  });
 }
 return {deliver,processDue,summary,event};
}
