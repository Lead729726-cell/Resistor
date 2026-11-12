/** Product guidance, not an acceptance record or a replacement for a purchase contract. */
export const eduGuideAccess = Object.freeze({edition:'edu',device_limit:2,industry_included:false});
export type EduLegalPage = {
 id:string; title:string; summary:string;
 sections:readonly {title:string;text:string}[];
 note:string; links:readonly {label:string;href:string}[];
 sources:readonly string[];
};

export const eduLegalPages:readonly EduLegalPage[] = [
 {
  id:'scope',title:'실습 결과를 읽는 기준',
  summary:'Resistor Edu는 회로를 직접 바꾸고, 결과의 이유를 설명하는 학습 도구입니다.',
  sections:[
   {title:'체크한 학습과 실행한 검증은 다릅니다',text:'실습 단계의 완료 표시가 DRC·LVS·PEX·시뮬레이션 통과를 뜻하지는 않습니다. 결과에 표시된 실행 상태, 사용한 엔진·모델, 프로젝트 revision을 함께 확인하세요.'},
   {title:'설계가 바뀌면 결과의 조건도 확인하세요',text:'이전 설계의 실행 기록은 비교에 쓸 수 있습니다. 현재 설계의 결과로 읽으려면 같은 조건과 revision에서 다시 실행해야 합니다. 엔진이나 모델이 없으면 실행 불가 또는 미실행 상태가 표시됩니다.'},
  ],
  note:'이 안내를 읽거나 다음 페이지로 이동해도 구매·인증·동의 처리는 발생하지 않습니다.',
  links:[{label:'실습 튜토리얼',href:'https://resistor.kr/tutorial/library/'}],
  sources:['docs/product-editions.md','packages/ui/src/InverterLesson.tsx'],
 },
 {
  id:'access',title:'Edu 사용권과 기기 인증',
  summary:`인프런 강의의 사용권은 Resistor Edu · 개인 기기 ${eduGuideAccess.device_limit}대입니다.`,
  sections:[
   {title:'사용권의 범위',text:'Resistor Industry는 별도 제품입니다. Edu 시리얼로 Industry를 인증할 수 없습니다. 앱 소스의 MIT 라이선스와 공식 배포본의 인증·강의 이용 조건은 구분됩니다.'},
   {title:'처음 인증하거나 기기를 바꿀 때',text:'첫 인증과 기기 인증 해제에는 인터넷이 필요합니다. 기기를 바꿀 때는 기존 기기에서 인증을 해제한 뒤 새 기기를 등록하세요. 통신이 실패해도 이미 받은 인증의 유효기간 안에서는 사용할 수 있으며, 만료 시각은 인증 화면에서 확인할 수 있습니다.'},
  ],
  note:'인증 오류나 이 기기 인증 해제는 설계 파일을 삭제하지 않습니다. 시리얼은 다른 사람과 공유하거나 공개하지 마세요.',
  links:[{label:'이용약관·제품 조건',href:'https://resistor.kr/terms/'},{label:'Edu 공식 다운로드',href:'https://resistor.kr/download/edu/'},{label:'소스 MIT 라이선스',href:'https://github.com/Lead729726-cell/Resistor/blob/main/LICENSE'}],
  sources:['platform/licensing/access-policy.mjs','docs/serial-licensing.md','LICENSE'],
 },
 {
  id:'records',title:'내 기록을 안전하게 보관하기',
  summary:'브라우저 워크북, 임시 답안, 엔진의 프로젝트 기록은 저장 위치가 다릅니다.',
  sections:[
   {title:'브라우저·앱 프로필에 남는 기록',text:'워크북과 작성 중 임시 답안은 현재 브라우저·앱 프로필의 저장소를 사용합니다. 다른 프로필이나 기기에 자동으로 옮겨지지 않습니다. 워크북의 JSON 보관 기능으로 중요한 기록을 따로 내려받으세요.'},
   {title:'설계와 실행 기록',text:'설계 프로젝트와 제출·실행 기록은 연결된 엔진의 저장 공간에 남습니다. 로컬 Edu 작업 공간은 Industry와 구분됩니다. 저장 오류가 보이면 현재 입력이 화면에만 남아 있을 수 있으니, 복사하거나 내보낸 뒤 복구하세요.'},
  ],
  note:'브라우저 데이터 초기화·프로필 변경·재설치 전에 기록을 백업하세요. 다운로드 버튼을 누른 뒤 실제 저장된 파일도 확인하세요.',
  links:[{label:'개인정보 처리 범위·보관 안내',href:'https://resistor.kr/privacy/'}],
  sources:['packages/education/src/course-workbook-store.ts','packages/ui/src/study-draft.ts','docs/product-editions.md'],
 },
 {
  id:'ai',title:'AI 도움은 선택해서 사용하기',
  summary:'기본 계산·저장과 외부 AI 호출은 별개입니다.',
  sections:[
   {title:'전송 범위와 비용을 먼저 확인하세요',text:'학습 코치에서 “전송 내용·최대 비용 확인 · 0토큰”을 누르면 보낼 질문·답안·실행 근거와 최대 비용을 볼 수 있습니다. 새 외부 호출은 화면의 승인 절차 뒤 진행됩니다. 비밀 회로, 개인정보, API 키를 답안이나 질문에 넣지 마세요.'},
   {title:'저장된 피드백과 새 호출을 구분합니다',text:'같은 근거의 저장된 학습 활동은 재사용할 수 있습니다. 실제 재사용 여부와 호출 상태를 화면에서 확인하세요. 외부 AI API 사용 비용은 Edu 강의 사용권에 포함되지 않으며, 키·예산이 없으면 새 AI 호출을 사용할 수 없습니다.'},
  ],
  note:'AI는 학습 설명을 돕습니다. 수치 계산·채점·실제 엔진 검증과 AI의 설명은 서로 다른 근거로 읽으세요.',
  links:[],
  sources:['packages/ui/src/EduLearningCoach.tsx','packages/ui/src/SelfStudy.tsx','platform/commerce/catalog.json'],
 },
 {
  id:'online',title:'리그와 공동 설계의 공개 범위',
  summary:'온라인 기능을 이용할 때는 연결한 서버와 공유 대상을 확인하세요.',
  sections:[
   {title:'리그·커뮤니티',text:'등록 후 닉네임, 리그 점수·시간, 직접 게시한 커뮤니티 글은 같은 서버의 이용자에게 공개됩니다. 리그 제출 답안은 서버에서 채점합니다. 기존 개인 실습 기록·회로 파일을 리그로 보내는 기능은 아닙니다. 개인정보와 공개할 수 없는 회로는 글에 올리지 마세요.'},
   {title:'공동 설계는 별도의 공유 공간입니다',text:'공동 설계 방에서 여는 프로젝트·편집 내용은 연결된 협업 서버와 권한이 있는 참여자에게 공유됩니다. 선택한 서버, 방, 권한, 동기화 상태를 확인하세요. 리그 서버와 EDA 협업 서버는 서로 다릅니다.'},
  ],
  note:'리그 닉네임은 현재 등록 키에 묶입니다. 브라우저·앱 프로필의 키를 지우면 이전 등록을 복구할 수 없습니다. 서버 연결 상태에 따라 온라인 기능을 사용할 수 없을 수 있습니다.',
  links:[],
  sources:['packages/ui/src/StudyLeague.tsx','packages/ui/src/league-device.ts','packages/cloud/src/index.ts'],
 },
 {
  id:'mail',title:'시리얼 안내 메일을 기다리고 있나요?',
  summary:'운영자가 실제 구매와 수신 주소를 확인한 뒤 개인 시리얼 안내를 준비합니다.',
  sections:[
   {title:'구매 확인과 발송은 별도 단계입니다',text:'현재 인프런 결제·환불을 자동 수신하는 연동은 제공하지 않습니다. 운영자가 확인해 등록한 주문을 발송 큐가 처리합니다. Gmail의 발송 접수는 받은편지함 도착이나 읽음 확인을 뜻하지 않습니다.'},
   {title:'구매자의 Google 계정 연결은 필요하지 않습니다',text:'시리얼 안내 발송에는 운영자의 Gmail 계정을 사용합니다. 수신 주소와 안내 메일 내용은 Google이 처리하고, 라이선스 서버는 Cloudflare에 호스팅됩니다. 아래 Google 연동 안내는 운영자 계정 연결 범위에 관한 문서입니다.'},
  ],
  note:'문의할 때 Google 비밀번호·인증 코드·API 키·전체 시리얼은 보내지 마세요. 이 기능 안내는 상품의 구매·환불 조건이나 전체 제품 개인정보 처리방침을 대신하지 않습니다.',
  links:[{label:'시리얼 발송·문의 안내',href:'https://resistor.kr/license-mail/'},{label:'운영자 Google 연동 개인정보 안내',href:'https://resistor.kr/license-mail/privacy/'}],
  sources:['scripts/download-license-mail.mjs','docs/serial-licensing.md'],
 },
 {
  id:'help',title:'필요한 도움으로 바로 이동하기',
  summary:'설치 파일, 사용법, 변경 기록을 공식 경로에서 확인하세요.',
  sections:[
   {title:'오류를 문의할 때',text:'제품 이름 Resistor Edu, 앱 버전, 운영체제, 오류 문구와 마지막으로 누른 버튼을 알려 주세요. 화면을 보내기 전 시리얼·개인정보·비공개 설계가 보이는지 확인하세요.'},
   {title:'운영·사용권 문의',text:'콜드브루 · creditlsh00726@gmail.com. 구매·환불 관련 조건은 구매한 상품의 안내를 확인하고 문의해 주세요. 이 화면에서 결제나 환불을 처리하지 않습니다.'},
  ],
  note:'외부 안내는 새 창에서 열립니다. 설치 파일과 사용권은 구분되며, 다운로드만으로 인증되지는 않습니다.',
  links:[{label:'Edu 다운로드',href:'https://resistor.kr/download/edu/'},{label:'사용 튜토리얼',href:'https://resistor.kr/tutorial/library/'},{label:'단축키 안내',href:'https://resistor.kr/shortcuts/'},{label:'릴리스·변경 기록',href:'https://github.com/Lead729726-cell/Resistor/releases'}],
  sources:['scripts/download-license-mail.mjs','scripts/download-editions.mjs','docs/serial-licensing.md'],
 },
];

export type EduGuideAction='next'|'back'|'reset';
export function eduGuidePage(index:number,action:EduGuideAction):number {
 const current=Number.isInteger(index)?Math.max(0,Math.min(eduLegalPages.length-1,index)):0;
 return action==='reset'?0:Math.max(0,Math.min(eduLegalPages.length-1,current+(action==='next'?1:-1)));
}
