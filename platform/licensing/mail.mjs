import {courseAccessPolicy} from './access-policy.mjs';
import {createHash} from 'node:crypto';
export function licenseMailContent({kind,serial,edition,device_limit,entitlement}){
 if(kind==='mail_smoke')return {subject:'Resistor License Mail 운영자 발송 테스트',text:'Resistor License Mail의 운영자 본인 대상 발송 테스트입니다.\n\n이 메시지는 구매 확인 또는 시리얼 발급이 아닙니다. 주문이나 라이선스를 생성하지 않았습니다.\nGmail API의 발송 접수와 실제 받은편지함 도착은 서로 다른 상태입니다. 이 메일을 직접 확인한 뒤 수신 여부를 판단하세요.\n\n고객 대상 자동 발송 설정은 이 테스트와 별도로 관리합니다.'};
 const name=edition==='edu'?'Resistor Edu':'Resistor Industry';
 return {subject:name+' 시리얼 코드 안내',text:`${name} 구매를 확인했습니다.\n\n시리얼: ${serial}\n\n공식 앱에서 이 버전을 선택해 인증하세요. 개인 기기 ${device_limit}대까지 등록할 수 있습니다. 다른 버전은 별도 코드가 필요합니다.\n${edition==='edu'?(entitlement?.product_id==='resistor.edu.standalone'?'이 구매에는 Edu 앱 사용권이 포함됩니다. 강의와 Industry는 포함되지 않습니다.':entitlement?.product_id==='resistor.edu.course-bundle'?'웹 강의 패키지는 Edu 전용입니다. Industry는 포함되지 않습니다.':courseAccessPolicy.notice):'이 코드는 강의와 별도로 구매한 Industry 전용입니다.'}\n다운로드: https://resistor.kr/download/${edition==='edu'?'edu':'industry'}/\n처음 등록할 때 인터넷 연결이 필요하며 인증 확인 후 최대 7일간 오프라인으로 사용할 수 있습니다. 다른 기기로 옮길 때 기존 기기에서 인증을 해제하세요.\n이 코드는 공개 게시하지 마세요.\n\n앱 소스의 MIT 라이선스와 강의 수강권·공식 배포 인증은 별도입니다.`};
}
// Optional delivery transport. The service keeps an encrypted pending outbox
// until a provider acknowledges the same idempotency key. Never log serials.
export function createResendMailer({apiKey,from,fetchImpl=fetch}){
 if(!apiKey||!from)return undefined;
 if(typeof apiKey!=='string'||typeof from!=='string'||from.length>320||/[\r\n\0]/.test(from)||!/@[^\s<>]+\.[^\s<>]+/.test(from))throw Error('A valid verified sender address is required');
 const prepare=payload=>({schema_version:1,provider:'resend',body:{from,to:[payload.email],...licenseMailContent(payload)}});
 const send=async input=>{
  const message=input.prepared_message??prepare(input);
  if(message?.schema_version!==1||message.provider!=='resend'||!message.body||!Array.isArray(message.body.to)||message.body.to.length!==1)throw Object.assign(Error('Invalid prepared message'),{mailFailure:'terminal'});
  input.before_send?.();
  const response=await fetchImpl('https://api.resend.com/emails',{method:'POST',redirect:'manual',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json','Idempotency-Key':input.idempotency_key},body:JSON.stringify(message.body),signal:AbortSignal.timeout(15000)});
  if(!response.ok){let value;try{value=await response.json();}catch{}const retryAfter=Number(response.headers?.get('retry-after'));
   const retryable=response.status>=500||response.status===429||response.status===408||response.status===409&&value?.name==='concurrent_idempotent_requests';
   throw Object.assign(Error('Mail provider request not acknowledged'),{mailFailure:retryable?'retryable':response.status===409?'review':'terminal',retryAfterMs:Number.isFinite(retryAfter)?Math.min(Math.max(retryAfter*1000,0),3600000):0});
  }
  return response.json();
 };
 return Object.assign(send,{prepare,provider:'resend',idempotencyWindowMs:86400000,identity:createHash('sha256').update('resend-v1\0'+apiKey+'\0'+from).digest('hex')});
}
