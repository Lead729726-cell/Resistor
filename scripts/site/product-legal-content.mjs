// Verified product behavior and operator review items are deliberately separate.
// Do not turn a missing operator decision or provider data-location check into a promise.
export const productLegalVersion='2026-11-12.2';
export const legalOperator=Object.freeze({
 name:'콜드브루',representative:'이석형',business_number:'114-19-75350',mail_order_number:'2026-경기양평-0293',
 address:'(12524) 경기도 양평군 용문면 장대1길 165',email:'creditlsh00726@gmail.com',phone:'010-5039-9175',
 source:'scripts/course-store-site.mjs',
});
export const legalSourceReferences=Object.freeze([
 {id:'guideline',title:'개인정보보호위원회 · 개인정보 처리방침 작성지침(2026.4.)',url:'https://pipc.go.kr/np/cop/bbs/selectBoardArticle.do?bbsId=BS217&mCode=D010030030&nttId=12018'},
 {id:'privacy-law',title:'개인정보 보호법 제30조 · 처리방침 공개',url:'https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1029334949'},
 {id:'privacy-officer',title:'개인정보 보호법 제31조 · 보호책임자 지정',url:'https://www.law.go.kr/LSW/lsLawLinkInfo.do?chrClsCd=010202&lsJoLnkSeq=900079330'},
 {id:'transfer-law',title:'개인정보 보호법 제28조의8 · 국외 이전',url:'https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1029334957'},
 {id:'retention-law',title:'전자상거래법 시행령 제6조 · 거래기록 보존',url:'https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lspttninfSeq=63460'},
 {id:'cloudflare-location',title:'Cloudflare Durable Objects · 데이터 위치',url:'https://developers.cloudflare.com/durable-objects/reference/data-location/'},
 {id:'cloudflare-privacy',title:'Cloudflare 개인정보 안내',url:'https://www.cloudflare.com/privacypolicy/'},
 {id:'google-privacy',title:'Google 개인정보처리방침',url:'https://policies.google.com/privacy?hl=ko'},
 {id:'vercel-privacy',title:'Vercel 개인정보 안내',url:'https://vercel.com/legal/privacy-notice'},
 {id:'openai-data',title:'OpenAI API · 데이터 처리 및 보관',url:'https://developers.openai.com/api/docs/guides/your-data'},
]);

// A future final policy must have real review evidence for every item; no guessed dates.
export const legalReview=Object.freeze({
 status:'review_required',effective_date:null,reviewed_at:null,
 items:[
  {id:'privacy-contact',status:'verified',title:'개인정보 보호책임자 지정',detail:'2026-11-12 운영자 확인: 대표 이석형을 개인정보 보호책임자로 지정하고 creditlsh00726@gmail.com을 담당 연락처로 사용합니다.'},
  {id:'retention',status:'policy_approved',title:'승인한 보관 기준의 운영 실행 검증',detail:'일반 문의 해결 후 1년, 리그·커뮤니티 이용 중 보관 및 삭제·탈퇴 요청 수동 처리, 해당 법정 거래·분쟁 기록 별도 보존 기준을 운영자가 승인했습니다. 자동 파기 기능은 없으며, 서버별 수동 처리 도구·확인 절차의 실제 검증과 인증·발송·협업 기록의 세부 보관 기준은 남아 있습니다.'},
  {id:'international',status:'pending',title:'국외 이전 국가·수탁자·기간과 적용 근거',detail:'Cloudflare·Google·Vercel의 실제 계정·계약에 적용되는 처리 국가와 보관 조건을 확인해야 합니다. 미국 법인이라는 사실만으로 저장 국가를 미국으로 단정하지 않습니다.'},
  {id:'minors',status:'pending',title:'아동 개인정보 처리 범위',detail:'현재 생년월일 수집이나 법정대리인 동의·확인 절차는 없습니다. 만 14세 미만 이용자를 위한 온라인 기능의 제공 범위를 확정해야 합니다.'},
  {id:'policy-approval',status:'pending',title:'시행일·최종 운영 검토',detail:'운영자가 확정한 보관·문의·변경 절차와 실제 제공 상품을 대조한 뒤 시행일을 정합니다.'},
 ],
});
export function productLegalReadiness(review=legalReview){
 const required=legalReview.items.map(item=>item.id);
 const missing=required.filter(id=>!review.items?.some(item=>item.id===id&&item.status==='verified'));
 if(!/^\d{4}-\d{2}-\d{2}$/.test(review.effective_date??''))missing.push('effective-date');
 if(!review.reviewed_at||!Number.isFinite(Date.parse(review.reviewed_at)))missing.push('reviewed-at');
 return {ready:review.status==='approved'&&missing.length===0,missing};
}

export const termsSections=[
 {id:'operator',title:'1. 운영자와 적용 범위',paragraphs:[
  '이 문서는 콜드브루가 안내하는 Resistor Edu 공식 앱, resistor.kr의 공개 실습·도움말과 관련 지원의 이용 범위를 설명합니다. 인프런의 계정·결제·강의 제공에는 해당 플랫폼의 약관과 실제 구매 상품의 조건도 적용됩니다.',
  '현재 문서는 검토본입니다. 열람·다운로드·화면 이동만으로 새로운 약관 동의나 결제 승인을 받은 것으로 처리하지 않습니다. 기존 구매 조건을 소급해 바꾸거나 법령에 따른 이용자의 권리를 제한하지 않습니다.',
 ]},
 {id:'product',title:'2. 제공하는 제품과 한계',paragraphs:[
  'Resistor Edu는 회로 계산, 회로도·레이아웃 실습, 연결한 엔진의 해석, 퀴즈·퍼즐, 학습 기록을 돕는 교육용 도구입니다. 사용 가능한 기능은 설치 버전, 운영체제, 엔진·모델 및 별도 서비스 연결 상태에 따라 달라집니다.',
  '학습 단계의 완료, 예제 그림, AI 설명은 제조 승인이나 DRC·LVS·PEX·시뮬레이션 통과의 증거가 아닙니다. 실제 실행 여부, 적용 모델·공정, 프로젝트 revision과 결과의 범위를 확인해야 합니다. 지원되지 않거나 실행하지 않은 검증을 성공으로 제시하지 않습니다.',
 ],links:[{label:'Edu 사용 가이드',href:'/tutorial/library/'},{label:'설치 파일과 지원 운영체제',href:'/download/edu/'}]},
 {id:'access',title:'3. Edu 사용권과 개인 기기 2대',paragraphs:[
  '인프런 Edu 강의로 발급하는 공식 사용권은 Resistor Edu 전용이며 개인 기기 2대까지 활성화할 수 있습니다. Resistor Industry, 외부 유료 AI 호출료, 상용 EDA 도구·PDK의 별도 라이선스는 포함하지 않습니다.',
  '시리얼은 구매 확인 후 개인별로 발급합니다. 코드를 공개·공유하거나 다른 사람의 사용권을 이용하지 마세요. 기기를 바꿀 때는 기존 기기에서 인증을 해제한 뒤 새 기기를 등록할 수 있습니다. 기존 기기를 사용할 수 없으면 문의해 주세요.',
  '첫 인증과 기기 인증 해제에는 인터넷이 필요합니다. 서버가 발급한 기기 인증은 만료 시각이 있으며 유효기간 내에는 연결 실패 시에도 사용할 수 있습니다. 이 기기 인증 해제는 설계 파일 삭제나 구매 취소가 아닙니다. 사용권·제공 기간은 실제 구매 상품에 표시된 조건을 확인해야 하며, 이 문서가 평생 서버 운영이나 모든 후속 버전 제공을 약속하지 않습니다.',
 ]},
 {id:'source',title:'4. 오픈소스와 제3자 자료',paragraphs:[
  'Resistor 소스의 MIT 라이선스와 공식 배포본의 인증·강의 제공 조건은 구분됩니다. 이 안내는 공개 소스에 이미 부여된 MIT 권리를 회수하거나 제한하지 않습니다.',
  '함께 사용하는 엔진, 라이브러리, PDK·모델, 예제와 강의 자료에는 각 권리자의 라이선스나 이용 조건이 적용될 수 있습니다. 업로드·공유할 회로와 자료에 필요한 권한을 확인해 주세요.',
 ],links:[{label:'Resistor MIT 소스 라이선스',href:'https://github.com/Lead729726-cell/Resistor/blob/main/LICENSE'}]},
 {id:'purchase',title:'5. 구매·제공·취소·환불',paragraphs:[
  '현재 resistor.kr에서는 자체 결제, 예약금, 구매자 이메일을 받는 새 구매 신청을 제공하지 않습니다. 인프런 판매 예정가는 250,000원이며, 이는 실제 공개 강의의 확정 판매가나 구매 가능한 상태를 뜻하지 않습니다. 구매 전 인프런 상품 페이지에서 최종 가격, 수강 기간, 구성과 제공 일정을 확인하세요.',
  '운영자가 인프런 구매·수신 주소를 확인해 등록한 주문에 대해 시리얼 안내 메일의 발송을 요청합니다. 인프런의 결제·환불을 자동 수신하는 연동은 현재 제공하지 않습니다. 메일 발송 접수만으로 받은편지함 도착이나 읽음이 확인되는 것은 아닙니다.',
  '인프런에서 구매한 강의의 청약철회·환불 요청은 인프런의 해당 구매 내역과 고객센터를 통해 진행하고, 시리얼 제공·기기 인증 문제는 운영자에게 문의할 수 있습니다. 관계 법령에 따른 청약철회·환불 권리를 제한하지 않습니다. 앱 설치나 이 안내 열람만으로 철회권 포기·환불 불가에 동의한 것으로 처리하지 않습니다.',
 ],links:[{label:'현재 상품·거래 준비 상태',href:'/shop/#conditions'},{label:'인프런 서비스 이용약관',href:'https://www.inflearn.com/policy'},{label:'시리얼 안내 메일',href:'/license-mail/'}]},
 {id:'records',title:'6. 저장·백업과 선택 온라인 기능',paragraphs:[
  '브라우저 워크북·임시 답안은 해당 브라우저 또는 앱 프로필에, 설계·해석·제출 기록은 연결한 엔진의 작업 공간에 저장됩니다. Edu와 Industry의 기본 작업 공간은 분리됩니다. 다른 기기나 프로필에 모든 기록이 자동 동기화되는 것은 아닙니다.',
  '중요한 기록은 제공되는 JSON·프로젝트 내보내기로 별도 보관하고 실제 저장된 파일을 확인하세요. 초기화·재설치 전에 백업을 권장합니다. 저장 오류가 표시되면 입력이 현재 화면에만 남아 있을 수 있습니다.',
  '외부 AI, 리그·커뮤니티, 공동 설계는 선택 기능입니다. 새 AI 요청의 전송 내용과 최대 비용, 게시물의 공개 범위, 공동 설계 서버·방·권한을 확인한 뒤 이용하세요. AI 설명은 공식 성적이나 설계 승인 판단을 대신하지 않습니다.',
 ],links:[{label:'개인정보 처리 범위',href:'/privacy/'}]},
 {id:'conduct',title:'7. 안전한 이용과 공개 게시물',paragraphs:[
  '다른 사람의 개인정보·인증 정보·비공개 회로, 권한 없는 저작물을 게시하거나 서비스에 대한 무단 접근·방해 행위를 하지 마세요. 시리얼, API 키, 비밀번호는 커뮤니티 글이나 문의 첨부에 포함하지 마세요.',
  '리그·커뮤니티의 닉네임, 점수·시간, 게시물은 같은 서버 이용자에게 공개됩니다. 내 글 숨기기는 공개 노출을 줄이는 기능이며 서버 데이터의 완전 삭제와 다릅니다. 신고·악용 방지에 따른 게시물 제한이 있으며, 잘못된 제한이나 개인정보 노출은 운영자에게 문의할 수 있습니다.',
 ]},
 {id:'updates',title:'8. 업데이트와 장애 안내',paragraphs:[
  '공식 업데이트는 Edu와 Industry를 구분합니다. 업데이트·다운로드 안내를 확인하고 설치 전에 작업을 저장하세요. 새 설치 파일의 존재는 모든 엔진·모델·운영체제 조합에서의 실행이나 외부 서비스의 지속적인 가용성을 보장하지 않습니다.',
  '장애·기기 변경·데이터 문제를 문의할 때는 제품명, 버전, 운영체제, 오류 문구와 마지막 동작을 알려 주세요. 실제 오류와 불편은 확인한 범위에서 안내하며, 운영자의 고의·과실 책임이나 법령상 소비자 권리를 일괄 배제하는 조건을 두지 않습니다.',
 ],links:[{label:'공식 릴리스 기록',href:'https://github.com/Lead729726-cell/Resistor/releases'}]},
 {id:'contact',title:'9. 문의와 문서 변경',paragraphs:[
  `운영·사용권·개인정보 문의: ${legalOperator.name} / ${legalOperator.email} / ${legalOperator.phone}. 주소: ${legalOperator.address}.`,
  `개인정보 보호책임자는 대표 ${legalOperator.representative}이며 담당 연락처는 ${legalOperator.email}입니다. 일반 문의는 해결 후 1년 보관하며, 법정 거래·분쟁 기록에 해당하면 별도 법정 보존 기준을 적용합니다. 리그·커뮤니티의 삭제·탈퇴 요청은 본인과 요청 범위 확인 후 수동으로 처리합니다. 자세한 범위와 현재 처리 한계는 개인정보 안내에서 확인하세요.`,
  '문서가 확정되면 시행일과 버전을 표시하고 변경 내용을 공개합니다. 새로운 개인정보 처리 목적이나 별도 동의가 필요한 사항을 단순한 안내 페이지 변경만으로 승인받은 것으로 간주하지 않습니다. 이용계약 관련 분쟁은 관계 법령에 따른 절차와 관할을 따릅니다.',
 ]},
];

export const privacySections=[
 {id:'scope',title:'1. 적용 범위와 운영 연락처',paragraphs:[
  `운영자는 ${legalOperator.name}(대표 ${legalOperator.representative})입니다. 이 문서는 Resistor Edu와 resistor.kr에서 실제 처리하는 정보, 사용자 기기에만 남는 기록, 선택한 외부 서비스로 전달되는 정보를 구분합니다. 문의는 ${legalOperator.email} 또는 ${legalOperator.phone}으로 접수합니다.`,
  `개인정보 보호책임자: 대표 ${legalOperator.representative}. 담당 연락처: ${legalOperator.email}. 운영자가 2026-11-12 지정과 일반 문의·리그·커뮤니티·법정 기록의 보관 기준을 확인했습니다.`,
  '현재 검토본이며 시행일은 미확정입니다. 보관 기준의 승인과 실제 삭제 도구·절차의 검증은 구분합니다. 서버별 처리 검증, 국외 이전 세부사항 등 남은 확인 항목을 아래에 표시합니다. 공개된 운영자 Google 연동 안내는 별도 범위이며, 전체 제품 정책을 대신하지 않습니다.',
 ],links:[{label:'운영자 Gmail 연동 안내',href:'/license-mail/privacy/'}]},
 {id:'local',title:'2. 기기에 저장되는 학습·설계 기록',paragraphs:[
  '워크북에는 예측·입력 조건·계산 결과·학생 설명·진행 상태가 포함될 수 있습니다. 워크북과 작성 중 임시 답안, 화면 설정은 현재 브라우저·앱 프로필의 localStorage 등을 사용합니다. 리그 기기 키와 임시 답안은 IndexedDB를 사용합니다.',
  '설계 프로젝트, 가져온 회로·레이아웃, 실제 실행 결과, 제출·학습 코치 기록은 연결된 엔진의 작업 공간에 저장됩니다. 기본 로컬 Edu 작업 공간은 Industry와 분리되어 있습니다. 이 로컬 저장 자체를 운영자에게 전송하는 것으로 취급하지 않습니다.',
  'JSON·프로젝트 백업은 사용자가 지정한 파일에 남습니다. 브라우저 데이터나 앱 프로필을 삭제하면 로컬 기록·등록 키가 사라질 수 있습니다. 인증 해제, 앱 제거, 서버 계정 정리는 서로 다른 동작이며 모든 사본이 함께 삭제되지 않습니다.',
 ]},
 {id:'server-data',title:'3. 온라인 기능별 처리 정보와 목적',table:{headers:['기능','처리하는 정보','목적·발생 시점'],rows:[
  ['공식 앱 인증','제품 버전(edition), 시리얼, 설치마다 생성한 식별자의 해시, 활성화 ID·갱신 인증 정보, 인증·해제 시각과 상태','인증 요청 시 해당 사용권과 개인 기기 수 확인. 설치 식별자는 임의 생성값 기반이며 주민등록번호나 하드웨어 일련번호를 수집하는 구조가 아닙니다.'],
  ['구매 확인·시리얼 메일','운영자가 확인한 주문 출처·주문 참조번호·상품 범위·확인 증빙 해시, 수신 이메일, 시리얼, 발송 본문·시각·결과 식별정보','실제 구매의 Edu 사용권 발급·안내, 중복 발급 방지와 환불 확인에 따른 회수. 인프런 결제정보를 자동 수신하지 않습니다.'],
  ['문의','사용자가 보낸 이메일 주소, 연락처, 문의 내용·첨부, 처리 기록','문의 답변·오류 확인·권리행사 요청 처리. 비밀번호·전체 시리얼·API 키는 요청하지 않습니다.'],
  ['리그·커뮤니티(선택)','기기 공개키·해시 ID·고정 닉네임, 답안·점수·소요시간·난이도·참가 기록, 글·답글·반응·신고 및 운영 기록','같은 서버의 문제 출제·채점·순위·게시물 기능과 악용 방지. 닉네임·점수·시간·공개 글은 다른 이용자가 볼 수 있습니다.'],
  ['공동 설계(선택)','연결한 서버의 계정 이메일·이름, 비밀번호의 검증용 해시, 세션·방·권한·초대 정보, 프로젝트·명령·실행 기록·접속 표시','사용자가 선택한 협업 서버에서 계정 확인·권한 관리·공동 편집. 로컬 허브와 외부 운영 서버의 처리 주체·저장 위치는 다를 수 있습니다.'],
  ['접속·악용 방지','요청 주소·시각·브라우저 정보·IP 등 통신정보; 인증 서버의 요청 제한용 IP 기반 HMAC 값','웹·API 전달, 장애 및 악용 방지. 앱의 기기 해시와 네트워크 IP는 서로 다른 정보입니다.'],
 ]},paragraphs:[
  '확인된 주문의 인증·발송에 필요한 처리는 계약의 체결·이행에 필요한 범위를 기준으로 검토하고, 법정 거래기록은 관련 법령에 따른 보존 대상으로 구분합니다. 선택 기능의 실행·공개 범위는 해당 화면에서 확인합니다. 현재 화면의 AI 호출 승인만으로 모든 종류의 국외 이전·민감정보 처리 동의까지 받았다고 보지 않습니다.',
  'resistor.kr의 현재 자체 결제는 비활성화되어 있습니다. 공개 강의 안내 페이지에서 카드번호·주민등록번호·새 구매 신청 이메일을 입력받지 않습니다. 인프런에서 직접 처리하는 계정·결제·수강 정보에는 인프런의 개인정보 안내도 적용됩니다.',
 ]},
 {id:'ai',title:'4. 선택 AI와 자동 채점',paragraphs:[
  '기본 수치 계산·문제 채점은 프로그램 로직 또는 실제 엔진이 수행합니다. 학습 코치의 새 외부 호출은 사용자가 전송할 질문·답안·예측·실행 근거와 최대 비용을 확인하고 승인한 뒤 연결된 엔진이 OpenAI API로 요청합니다. 기존 학습 결과를 재사용하면 새 호출 없이 열 수 있습니다.',
  '요청에는 학습 입력·근거, 모델·응답 형식이 포함됩니다. API 키는 요청 인증에 사용되며 브라우저 안내나 공개 결과에 표시하지 않습니다. 사용자 자신의 API 계정·엔진을 연결한 경우 해당 제공자의 조건도 확인해야 합니다. 비공개 설계와 개인정보는 전송 입력에서 제외하세요.',
  '현재 API 요청은 store:false를 사용하지만 이것이 제공자의 악용 방지 기록까지 0일 보관한다는 뜻은 아닙니다. OpenAI는 API 데이터의 학습 사용 여부와 악용 감시 보관을 별도로 안내합니다. 일반 API 악용 감시 기록은 원칙적으로 최대 30일이며 예외·계정별 설정이 있어 무보관이나 즉시 파기를 보장하지 않습니다.',
  'AI 피드백·난이도 추천·리그 점수는 개인 연습을 위한 기능입니다. 앱은 이를 공식 학교 성적, 입학·채용 결정 또는 제조 승인으로 제공하지 않습니다. 설명·오류 문의는 운영자에게 요청할 수 있습니다.',
 ],links:[{label:'OpenAI API 데이터 처리 안내',href:'https://developers.openai.com/api/docs/guides/your-data'}]},
 {id:'recipients',title:'5. 처리 위탁·외부 서비스와 공유',table:{headers:['대상','현재 확인한 역할','전달 범위와 구분'],rows:[
  ['Cloudflare','공식 라이선스 Worker·Durable Object SQLite 호스팅, 사용하는 경우 리그 인터넷 터널','인증 요청·사용권·발송 큐와 네트워크 정보. 수신 이메일·시리얼·준비된 메일 본문은 앱이 AES-GCM 암호화해 저장합니다. 모든 DB 항목이 동일하게 암호화되는 것은 아닙니다.'],
  ['Google / Gmail','운영자 계정의 시리얼 안내 발송 및 사용자가 보내는 문의 메일','수신·발신 주소와 메일 내용. 구매자의 Google 로그인이나 메일함 접근은 요구하지 않습니다. Gmail API send-only 권한은 구매자 메일함 읽음 확인을 제공하지 않습니다.'],
  ['Vercel','resistor.kr 공개 웹페이지·정적 자산·카탈로그 경로 호스팅','페이지·파일 요청의 통신정보 및 호스팅 로그. 워크북 입력을 호스팅 서버에 저장하는 기능은 아닙니다.'],
  ['OpenAI(선택)','연결된 API 계정으로 요청한 학습 설명·피드백','사용자가 승인한 질문·답안·실행 근거와 요청 메타데이터. 기본 계산을 실행한다고 자동으로 호출하지 않습니다.'],
  ['리그·협업 이용자(선택)','같은 서버의 공개 순위·커뮤니티 또는 권한을 가진 공동 설계 참여자','공개 닉네임·점수·시간·게시물, 또는 해당 공유 방의 프로젝트·편집 상태. 다른 개인 실습을 일괄 공개하지 않습니다.'],
  ['인프런·GitHub 등 외부 링크','인프런 구매·강의 이용, GitHub 릴리스·소스 다운로드','링크를 연 뒤 해당 사이트가 처리하는 계정·접속 정보는 해당 운영자의 안내를 확인해야 합니다.'],
 ]},paragraphs:[
  '이 표는 실제 연결·공유 범위의 안내입니다. 수탁 계약, 재위탁자와 실제 보관 국가·기간의 확인은 아래 국외 이전 항목과 함께 완료해야 합니다. 사용자가 별도로 운영하거나 선택한 리그·협업 서버를 콜드브루의 동일한 호스팅·보관 정책으로 단정하지 않습니다.',
 ]},
 {id:'international',title:'6. 국외 이전과 현재 확인 범위',paragraphs:[
  '해외 서비스에 전송·처리위탁·보관되는 정보가 있을 수 있습니다. 개인정보 보호법 제28조의8은 적용 근거와 함께 이전 항목, 국가·시기·방법, 이전받는 자·연락처, 목적·보유기간, 거부 방법과 영향을 알리도록 규정하고 있습니다.',
  '공식 라이선스 서버는 Cloudflare를 사용하지만 기존 Durable Object의 저장 국가가 이 저장소에 고정되어 있지 않습니다. Cloudflare 문서의 위치 힌트는 국가 보장을 의미하지 않습니다. Google과 Vercel도 글로벌 처리 체계를 안내하므로 미국 법인이라는 이유만으로 “미국에만 저장”한다고 표시하지 않습니다.',
  '실제 계정·계약별 처리 국가, 수탁자·재위탁 범위, 보유기간 및 해당 기능의 이전 근거를 운영자가 확인해야 합니다. 이 검토본은 그 확인을 완료했거나 모든 국외 이전 동의를 이미 받았다고 표시하지 않습니다.',
  '외부 AI를 사용하지 않거나 리그·공동 설계에 등록·게시하지 않으면 해당 선택 기능의 전송을 피할 수 있습니다. 공식 앱의 첫 인증·갱신은 라이선스 서버 연결이 필요하므로 그 전송을 거부하면 인증·갱신이 제한됩니다. 기기에만 남는 기록과 MIT 소스 사용 권리는 별개입니다. 이미 처리된 정보의 확인·삭제 요청은 운영 연락처로 문의할 수 있습니다.',
 ],links:[{label:'국외 이전에 관한 법령',href:legalSourceReferences.find(item=>item.id==='transfer-law').url},{label:'Cloudflare 데이터 위치 설명',href:legalSourceReferences.find(item=>item.id==='cloudflare-location').url},{label:'Google 개인정보 안내',href:'https://policies.google.com/privacy?hl=ko'},{label:'Vercel 개인정보 안내',href:'https://vercel.com/legal/privacy-notice'}]},
 {id:'retention',title:'7. 보관 기간과 파기',paragraphs:[
  '사용자 기기의 워크북·초안·프로젝트·백업은 사용자가 해당 저장소·파일을 삭제할 때까지 남을 수 있습니다. 서버의 리그·시리얼·협업 DB에는 전체 데이터의 기간 만료 자동 삭제가 구현되어 있지 않습니다. 글 숨김·기기 인증 해제·사용권 회수는 삭제가 아니며, 실제 삭제 범위와 운영 절차를 확인해야 합니다.',
  '일반 문의의 이메일·내용·첨부·처리 기록은 문의 해결 후 1년 보관합니다. 기간이 지난 일반 문의는 담당자가 법정 보존 대상 여부를 확인하여 수동 파기합니다. 실제 파기 전에는 처리 완료로 안내하지 않습니다. 계약·청약철회·공급·소비자 분쟁에 해당하는 기록은 일반 문의와 구분하여 아래 법정 기간 동안 별도 보존합니다.',
  '리그·커뮤니티 기록은 이용 중 보관하며 삭제·탈퇴 요청을 받으면 본인 확인, 대상·영향 확인, 법정 보존 대상 분리를 거쳐 수동 처리합니다. 공개 글 숨김만 수행한 경우에는 삭제 완료로 안내하지 않습니다. 다른 이용자의 답글·신고, 백업, 법정 보존 기록 또는 운영자가 제어하지 않는 사본은 삭제 범위와 제한을 구분해 안내합니다.',
  '개인정보 보호책임자가 요청·기한 도래 대상을 확인하고 적용 근거와 처리 결과를 관리합니다. 현재 모든 서버를 일괄 삭제하는 도구나 자동 파기 작업은 없습니다. 지원되지 않는 데이터 정리에는 별도 검증이 필요하며, 완료하지 않은 단계는 대기·추가 확인으로 안내합니다. 인증·시리얼 발송·공동 설계 운영 기록의 세부 기간과 백업 파기 절차는 추가 확인 항목입니다.',
 ],table:{headers:['해당하는 거래기록','법정 보존 기간','근거'],rows:[
  ['표시·광고','6개월','전자상거래법 시행령 제6조'],
  ['계약 또는 청약철회','5년','전자상거래법 시행령 제6조'],
  ['대금결제 및 재화 등의 공급','5년','전자상거래법 시행령 제6조'],
  ['소비자 불만 또는 분쟁처리','3년','전자상거래법 시행령 제6조'],
 ]},links:[{label:'거래기록 보존 범위 확인',href:legalSourceReferences.find(item=>item.id==='retention-law').url}]},
 {id:'rights',title:'8. 정보 확인·정정·삭제·처리정지 요청',paragraphs:[
  `운영자에게 보관된 정보의 확인·정정·삭제·처리정지나 동의 철회를 요청하려면 ${legalOperator.email}으로 대상 기능과 요청 범위를 알려 주세요. 기기에서만 보관하는 파일은 운영자가 원격으로 확인·삭제할 수 없으며, 별도 서버는 해당 서버 운영자에게 요청해야 합니다.`,
  '요청 대상과 본인임을 확인하는 데 필요한 최소 정보만 확인합니다. 비밀번호·인증 코드·API 키·전체 시리얼은 보내지 마세요. 개인정보 보호책임자가 요청 범위, 본인 확인, 별도 보존할 근거를 검토한 뒤 수동 처리하고 결과를 안내합니다. 삭제·처리정지의 제한, 지원 도구 부족 또는 추가 확인이 있으면 해당 대상과 이유를 구분합니다. 현 버전에는 모든 저장소에서 한 번에 탈퇴·삭제하는 버튼이 없습니다.',
  '전자 파일·DB·메일·백업·수신자가 보관한 사본의 삭제는 범위가 다릅니다. Google 연결 해제만으로 이미 발송한 메일이나 라이선스 거래기록이 삭제되지는 않습니다. 리그 기기 키를 지우면 해당 등록을 다시 증명하기 어려울 수 있으므로 키 삭제 전 요청 방법을 문의해 주세요.',
 ],links:[{label:'개인정보 침해신고·상담',href:'https://privacy.kisa.or.kr/'},{label:'개인정보 분쟁조정',href:'https://www.kopico.go.kr/'}]},
 {id:'storage',title:'9. 브라우저 저장소·쿠키와 접속 정보',paragraphs:[
  '화면 테마·최근 학습 화면·워크북·초안은 localStorage, 리그 키·임시 답안은 IndexedDB, 공동 설계 로그인 복원은 edition별 sessionStorage 등을 사용합니다. 브라우저 사이트 데이터 설정에서 차단·삭제할 수 있으나 저장·로그인·기기 등록 유지 기능이 제한되거나 기록을 잃을 수 있습니다.',
  '현재 공개 강의 사이트 소스에는 광고 추적이나 Google Analytics SDK를 추가하지 않았습니다. 이것이 호스팅 사업자의 접속·보안 로그 처리까지 없다는 뜻은 아닙니다. Vercel·Cloudflare 등은 요청 전달을 위해 IP·요청 주소·브라우저 정보를 처리할 수 있습니다. 사이트의 자체 결제는 비활성화되어 있으며 새 결제용 세션 쿠키를 발급하는 구매 흐름은 제공하지 않습니다.',
 ]},
 {id:'security',title:'10. 적용된 보호 조치와 한계',paragraphs:[
  '공식 인증 통신은 HTTPS를 사용하고 관리용 주문 발급·회수 API는 인증으로 제한합니다. 시리얼과 갱신 비밀값의 서버 검증에는 해시를 사용하며 수신 이메일·시리얼·준비된 발송 본문은 암호화해 저장합니다. 배포 앱에는 서명 검증용 공개키를 포함하고 운영자 비밀키는 포함하지 않습니다.',
  '데스크톱 인증의 갱신 정보는 운영체제의 보안 저장 기능을 사용합니다. 리그는 기기 서명과 서버 검증을 사용하고 답안·문제 세트는 서버 키로 암호화합니다. 이 조치가 모든 파일·DB 항목의 암호화, 영구 익명성 또는 유출이 절대 발생하지 않음을 보장하지 않습니다.',
 ]},
 {id:'children',title:'11. 아동 정보와 정책 변경',paragraphs:[
  '현재 앱에는 생년월일 수집이나 만 14세 미만 법정대리인 동의·확인 절차가 없습니다. 아동의 개인정보를 처리하는 온라인 기능의 제공 범위와 필요한 절차는 운영자 확인 항목입니다. 보호자가 아동의 정보가 전송되었다고 판단하면 운영 연락처로 알려 주세요.',
  '이 문서는 버전과 작성일을 표시합니다. 실제 운영 정책과 필수 확인 사항을 확정한 뒤 시행일과 변경 이력을 공개해야 합니다. 안내 페이지를 읽거나 단순히 계속 사용한다는 이유만으로 새로운 처리 목적에 대한 동의를 받았다고 보지 않습니다.',
 ]},
];

export const legalImplementationSources=Object.freeze([
 'platform/licensing/access-policy.mjs','platform/licensing/domain.mjs','platform/licensing/outbox.mjs','platform/licensing/cloudflare/worker.mjs','platform/licensing/cloudflare/wrangler.jsonc','apps/desktop/licensing.mjs',
 'platform/league/service.mjs','platform/league/http.mjs','packages/ui/src/league-device.ts','platform/cloud/hub.mjs','packages/cloud/src/browser-storage.ts',
 'scripts/structured-ai.mjs','scripts/self-study-service.mjs','packages/ui/src/EduLearningCoach.tsx','packages/education/src/course-workbook-store.ts',
 'platform/commerce/catalog.json','platform/download-site/api/shop.mjs','scripts/course-store-site.mjs','scripts/download-license-mail.mjs',
]);
