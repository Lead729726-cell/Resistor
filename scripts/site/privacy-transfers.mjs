// Public provider documentation is not proof of this customer's account configuration.
// Keep unresolved country/contract/retention evidence explicit; no credentials belong here.
export const privacyTransferReviewDate='2026-11-13';
const pending=(detail)=>({status:'pending',detail,evidence:[]});
export const privacyTransferProviders=Object.freeze([
 {
  id:'cloudflare',name:'Cloudflare, Inc.',service:'공식 인증·시리얼 발송 큐 호스팅',
  contact:'legal@cloudflare.com',contact_source:'https://www.cloudflare.com/cloudflare-customer-dpa/',
  items:'기기 식별 해시, 인증·사용권·주문 확인 기록, 수신 이메일·시리얼·발송 본문, 요청 통신정보',
  purpose:'개인 기기 2대 인증, 사용권 관리, 중복 발급 방지와 발송 작업 보관',
  timing:'인증·갱신·해제 요청 및 운영자가 확인한 주문 등록·발송 처리 시',method:'HTTPS를 통한 전송 및 호스팅 저장',
  transfer_type:'처리위탁·보관 검토 대상',
  countries:{status:'pending',verified_countries:[],evidence:[],public_fact:'현재 공식 인증 저장소는 국가 제한(jurisdiction)을 지정하지 않았습니다. Cloudflare의 위치 힌트는 국가 보장이 아니며, Worker 통신과 저장소 위치는 구분해야 합니다.',required:'기존 production-v1 저장소·백업·지원 접근 및 연결 서비스의 실제 처리 국가와 적용 계약 확인'},
  retention:{...pending('인증·발송 운영 기록의 기산점·기간, 제공자 복구본과 계약 종료 후 처리 범위를 확인해야 합니다.'),operator_rule:'일반 문의·법정 거래기록의 승인 기준은 별도 적용되며 모든 인증·발송 항목의 기간으로 대체하지 않습니다.',provider_rule:'공개 DPA는 서비스 종료 시 반환·삭제와 법정 보존 예외를 규정하지만 이 계정의 모든 데이터에 단일 파기일을 정하지 않습니다.'},
  legal_basis:{...pending('계약 이행에 필요한 위탁·보관인지, 공개 또는 통지 요건을 충족하는지 계정·처리 범위별로 확인합니다.'),candidate:'개인정보 보호법 제28조의8 제1항 제3호(계약에 필요한 위탁·보관) 검토'},
  account:{...pending('2026-11-13 Cloudflare 설정 GET은 성공했으며 기존 binding의 jurisdiction=null, placement={}를 확인했습니다. 이는 실제 처리 국가의 확인이 아닙니다. 국외 처리 확인을 위해 새 저장소로 자동 전환하거나 기존 권한·키를 이동하지 않습니다.'),configuration_evidence:{checked_at:'2026-11-13T00:25:56.200Z',method:'authenticated GET-only metadata',authority:'production-v1',jurisdiction:null,placement:'not_configured',actual_database_country_verified:false,reference:'docs/evidence/legal/privacy-completion-20261113.json'}},
  refusal:'인증·갱신 연결을 하지 않으면 해당 전송을 피할 수 있으나 공식 배포본의 신규 인증·갱신을 진행할 수 없습니다. 이미 처리한 정보는 운영자에게 권리행사를 요청할 수 있습니다.',
  sources:['https://developers.cloudflare.com/durable-objects/reference/data-location/','https://www.cloudflare.com/cloudflare-customer-dpa/','https://www.cloudflare.com/gdpr/subprocessors/'],
 },
 {
  id:'google',name:'Google LLC',service:'운영자 Gmail의 안내 발송·문의 메일',
  contact:'googlekrsupport@google.com',contact_source:'https://policies.google.com/privacy?hl=ko',
  items:'발신·수신 주소, 메일 제목·내용·첨부, 발송 및 통신 메타데이터',
  purpose:'구매 확인 후 개인별 시리얼 안내 및 이용자 문의 답변',
  timing:'운영자 Gmail로 문의하거나 확인된 시리얼 안내 발송을 요청할 때',method:'HTTPS API 또는 이메일 전송',
  transfer_type:'업무용 메일 서비스 이용에 따른 처리 관계·국외 이전 유형 확인 필요',
  countries:{status:'pending',verified_countries:[],evidence:[],public_fact:'현재 소비자 Gmail 계정을 사용합니다. Google은 세계 여러 국가의 서버 처리를 안내하며 이 계정의 처리 국가 목록은 아직 확인되지 않았습니다.',required:'소비자 Gmail에 적용되는 실제 처리·보관·지원 국가 및 업무용 수탁 관계 확인'},
  retention:{...pending('시리얼 발송 메일의 운영 보관기간과 계정별 삭제·복구 처리를 확인해야 합니다.'),operator_rule:'일반 문의 해결 후 1년; 해당 거래·분쟁 기록은 별도 법정 기간. 일반 문의 파기는 수동 처리합니다.',provider_rule:'Google은 이용자 삭제 후에도 시스템 삭제·복구·백업 처리에 시간이 걸릴 수 있다고 안내합니다. 운영자의 삭제와 상대방이 받은 메일의 삭제는 다릅니다.'},
  legal_basis:{...pending('소비자 계정의 실제 계약상 역할과 필요한 처리 범위를 확인해야 하며 Workspace DPA를 적용한 것으로 표시하지 않습니다.'),candidate:'구매 안내·문의 계약 이행 관련 처리 근거 및 국외 이전 근거 검토'},
  account:pending('Google Cloud OAuth 프로젝트 또는 Gmail API 사용만으로 Google Workspace 계약·데이터 지역 설정을 보유한 것은 아닙니다.'),
  refusal:'문의 메일에 개인정보·첨부를 보내지 않거나 운영 연락처로 다른 처리 방법을 문의할 수 있습니다. 이메일 수신을 거부하면 이메일로 시리얼을 전달할 수 없습니다.',
  sources:['https://policies.google.com/privacy?hl=ko','https://policies.google.com/technologies/retention?hl=ko'],
 },
 {
  id:'vercel',name:'Vercel Inc.',service:'공개 웹페이지·파일·카탈로그 호스팅',
  contact:'privacy@vercel.com',contact_source:'https://vercel.com/legal/dpa',
  items:'요청 IP·주소·시각·브라우저 정보와 서비스 전달·보안 로그',
  purpose:'공개 사이트·다운로드 경로 전달, 장애 확인·악용 방지',
  timing:'resistor.kr의 페이지·자산·카탈로그를 요청할 때',method:'HTTPS 요청을 통한 호스팅·네트워크 처리',
  transfer_type:'호스팅 위탁 및 제공자의 통신·보안 정보 처리 관계 확인 필요',
  countries:{status:'pending',verified_countries:[],evidence:[],public_fact:'2026-11-13 계정 조회에서 현재 배포의 함수 실행 지역 설정 iad1을 확인했습니다. Vercel DPA는 주요 처리 시설이 미국에 있으며 세계 각지의 사업자·재수탁자 시설에서도 처리될 수 있다고 설명합니다. 함수 지역 설정은 CDN·로그·지원 접근을 포함한 모든 처리 국가의 확인이 아닙니다.',required:'배포 프로젝트의 실행 지역, CDN·로그·지원 접근과 해당 재수탁자 국가 범위 확인'},
  retention:{...pending('실제 프로젝트의 요청·보안 로그 및 서비스 생성 데이터 보관 범위를 확인해야 합니다.'),operator_rule:'공개 사이트는 워크북 답안을 서버 저장하는 구조가 아닙니다. 요청 로그의 기간은 문의 메일 보관기간과 다릅니다.',provider_rule:'공개 DPA는 서비스 종료 후 합리적 기간 내 삭제와 법정 보존 예외를 구분합니다. 콘솔에서 볼 수 있는 로그 기간이 모든 보관기간을 의미하지 않습니다.'},
  legal_basis:{...pending('사이트 제공에 필요한 호스팅 처리, 제공자 고유 처리 및 국외 이전 근거를 구분해 확인합니다.'),candidate:'계약 이행에 필요한 위탁·보관 여부 등 실제 처리 근거 검토'},
  account:{...pending('2026-11-13 인증된 프로젝트·현재 배포 조회가 HTTP 200이며 배포는 READY, regions와 기본 함수 지역 설정은 iad1입니다. 로그 보관 설정은 확인되지 않았습니다. 실행 지역만으로 CDN·로그·관리 시스템의 국가나 계약 범위를 확정하지 않습니다.'),configuration_evidence:{checked_at:'2026-11-13T00:32:40.963Z',method:'authenticated GET-only metadata',project_http:200,deployment_http:200,deployment_id:'dpl_9YVotLE1xFjsugiKUcv1ouQoES3X',state:'READY',regions:['iad1'],default_function_regions:['iad1'],retention_config_verified:false,all_processing_countries_verified:false,reference:'docs/evidence/legal/privacy-completion-20261113.json'}},
  refusal:'사이트 요청을 하지 않으면 해당 요청 전송을 피할 수 있습니다. 로컬 파일·계산 사용은 공개 웹사이트 열람과 별개이며, 이미 처리한 요청 정보의 권리행사는 운영자에게 문의할 수 있습니다.',
  sources:['https://vercel.com/legal/dpa','https://vercel.com/legal/privacy-notice','https://vercel.com/legal/sub-processors'],
 },
 {
  id:'openai',name:'OpenAI(API 계약의 수령 법인 확인 필요)',service:'선택한 외부 AI 설명·학습 피드백',
  contact:'privacy@openai.com',contact_source:'https://openai.com/policies/sub-processor-list/',
  items:'사용자가 승인한 질문·답안·실행 근거와 요청 메타데이터',
  purpose:'선택한 모델을 통한 설명·피드백 생성',
  timing:'사용자가 새 외부 AI 요청 내용과 비용을 확인하고 실행을 승인할 때',method:'연결된 엔진에서 HTTPS API 전송',
  transfer_type:'연결한 API 계정의 제공자·수탁 관계에 따라 확인 필요',
  countries:{status:'pending',verified_countries:[],evidence:[],public_fact:'연결한 API 프로젝트의 국가 설정은 확인되지 않았습니다. OpenAI의 지역별 저장 기능과 실제 모델 처리 지역은 같지 않을 수 있습니다.',required:'실제 API 계정·계약 법인·프로젝트·모델에 적용되는 저장·처리·로그 및 재수탁 국가 확인'},
  retention:{...pending('실제 연결한 API 프로젝트·모델의 예외와 추가 보관 설정을 확인해야 합니다.'),operator_rule:'새 요청은 선택 실행이며 store:false를 지정합니다. 로컬 학습 기록의 보관과 제공자의 API 기록은 별개입니다.',provider_rule:'일반 API 악용 감시 기록은 최대 30일이 원칙이며 예외와 계정 설정이 있습니다. store:false만으로 무보관 또는 모든 캐시의 즉시 삭제를 보장하지 않습니다.'},
  legal_basis:{...pending('새 호출의 비용·내용 승인만으로 개인정보 국외 이전 별도 동의가 완료되지는 않습니다. 필요한 고지·이전 근거를 따로 확인합니다.'),candidate:'실제 요청·계정 관계에 따른 선택 기능 처리 및 국외 이전 근거 검토'},
  account:pending('운영자가 제공하는 계정과 사용자가 직접 연결한 계정을 구분해야 합니다. 현재 소스만으로 모든 사용자 API 계정의 계약·국가를 확정할 수 없습니다.'),
  refusal:'외부 AI 요청을 실행하지 않으면 해당 전송을 피할 수 있습니다. 기본 계산·지원 엔진 실험·이미 저장된 결과의 열람은 새 AI 요청과 구분됩니다.',
  sources:['https://developers.openai.com/api/docs/guides/your-data','https://openai.com/policies/data-processing-addendum/','https://openai.com/policies/sub-processor-list/'],
 },
]);

const hasEvidence=value=>value?.status==='verified'&&Array.isArray(value.evidence)&&value.evidence.some(item=>typeof item==='string'&&item.trim().length>0);
const text=value=>typeof value==='string'&&value.trim().length>0;
/** Completeness gate only: evidence still needs human review; this is not a legal verdict. */
export function privacyTransferReadiness(providers=privacyTransferProviders){
 const missing=[],ids=privacyTransferProviders.map(provider=>provider.id);
 if(Array.isArray(providers)&&providers.some(provider=>!ids.includes(provider?.id)))missing.push('unexpected-provider');
 for(const id of ids){
  const matches=Array.isArray(providers)?providers.filter(provider=>provider?.id===id):[];
  if(matches.length!==1){missing.push(`${id}:provider`);continue;}
  const provider=matches[0];
  if(!['name','contact','items','purpose','timing','method','transfer_type','refusal'].every(key=>text(provider[key])))missing.push(`${id}:disclosure`);
  const countries=provider.countries;
  if(!hasEvidence(countries)||!Array.isArray(countries.verified_countries)||countries.verified_countries.length===0||countries.verified_countries.some(country=>!text(country)||country.length>80||/미확|미정|확인\s*중|글로벌|전\s*세계|unknown|pending|global|world/i.test(country)))missing.push(`${id}:countries`);
  for(const field of ['retention','legal_basis','account'])if(!hasEvidence(provider[field]))missing.push(`${id}:${field}`);
 }
 return {ready:missing.length===0,missing};
}

export function privacyTransferRows(providers=privacyTransferProviders){
 return providers.map(provider=>[
  `${provider.name} · ${provider.service} · 연락처 ${provider.contact}`,
  `${provider.items}. 목적: ${provider.purpose}. ${provider.timing}, ${provider.method}.`,
  provider.countries.status==='verified'?`확인 국가: ${provider.countries.verified_countries.join(', ')}`:`계정별 국가 확인 중. ${provider.countries.public_fact}`,
  `${provider.retention.operator_rule} ${provider.retention.provider_rule} ${provider.retention.detail}`,
  `${provider.legal_basis.candidate}. ${provider.legal_basis.detail} 거부 방법·영향: ${provider.refusal}`,
 ]);
}
