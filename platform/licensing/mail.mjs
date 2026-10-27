import {courseAccessPolicy} from './access-policy.mjs';
// Optional delivery transport. The service keeps an encrypted pending outbox
// until a provider acknowledges the same idempotency key. Never log serials.
export function createResendMailer({apiKey,from,fetchImpl=fetch}){
 if(!apiKey||!from)return undefined;
 return async({email,serial,edition,device_limit,idempotency_key})=>{
  const name=edition==='edu'?'Resistor Edu':'Resistor Industry';
  const response=await fetchImpl('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json','Idempotency-Key':idempotency_key},body:JSON.stringify({from,to:[email],subject:name+' 시리얼 코드 안내',text:`${name} 구매를 확인했습니다.\n\n시리얼: ${serial}\n\n공식 앱에서 이 버전을 선택해 인증하세요. 개인 기기 ${device_limit}대까지 등록할 수 있습니다. 다른 버전은 별도 코드가 필요합니다.\n${edition==='edu'?courseAccessPolicy.notice:'이 코드는 강의와 별도로 구매한 Industry 전용입니다.'}\n다운로드: https://resistor.kr/download/${edition==='edu'?'edu':'industry'}/\n처음 등록할 때 인터넷 연결이 필요하며 인증 확인 후 최대 7일간 오프라인으로 사용할 수 있습니다. 다른 기기로 옮길 때 기존 기기에서 인증을 해제하세요.\n이 코드는 공개 게시하지 마세요.\n\n앱 소스의 MIT 라이선스와 강의 수강권·공식 배포 인증은 별도입니다.`}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('mail provider request failed');return response.json();
 };
}
