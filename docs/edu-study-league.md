# Resistor Edu · 오늘의 공부 리그

교육용 연습 경쟁과 커뮤니티를 기존 공통 계산·단위 채점 위에 연결했습니다. 공식 성적, 시험 보안, 교육 효과, 회로의 DRC/LVS/PEX 성공을 의미하지 않습니다. Industry의 프로젝트·키·엔진 설정을 리그에 복사하지 않습니다.

- [공개 리그 화면](https://lead729726-cell.github.io/Resistor/)
- 앱: **교육 실습 → AI 자율학습 → 오늘의 리그·커뮤니티**
- [실제 QA 순위 화면](evidence/edu-study-league/league-desktop.png) · [커뮤니티 모바일 화면](evidence/edu-study-league/community-mobile.png) · [앱 안의 리그](evidence/edu-study-league/embedded-app.png)

## 참가와 문제 재사용

1. 같은 리그 서버 주소를 사용합니다. 공개 화면에서는 서버가 미리 연결됩니다. 앱에서는 **리그 서버 연결**을 열어 원하는 HTTPS 서버 주소를 붙여 넣습니다.
2. **이 기기 등록·닉네임 받기**를 누르면 서버가 `반짝이는 바지 #6384` 형태의 닉네임을 무작위 배정합니다. 실제 이름·이메일·회원가입은 요구하지 않습니다. 등록 전에 공개되는 항목을 표시합니다.
3. **오늘 리그 참가**를 누르면 서버 기준 10분이 시작됩니다. 매일 한국시간 00시에 교체하며 자정이 먼저 오면 자정까지 제출합니다. 등록 키당 하루 한 번 시작하고 한 번 제출합니다. 재접속해도 시작 시각·마감은 유지됩니다.
4. 다섯 답안을 제출합니다. 각 20점, 허용 오차는 기준값의 0.1%입니다. `900 mV`, `0.9 V`, `10 us`, `23.5 kΩ`처럼 차원이 같은 단위를 받습니다. 형식·차원 오류는 제출을 확정하지 않아 수정할 수 있습니다. 정답 여부는 서버의 공통 `gradeObjective`가 계산합니다.
5. 점수 우선, 동점은 서버 소요시간·제출시각·등록 ID 순으로 정렬합니다. 시간에는 네트워크 지연이 포함됩니다. 최근 7일은 합계 점수·완료일수·합계 시간 순입니다. 상위 50명과 자신의 순위를 표시하고 15초마다 갱신합니다.
6. 오늘 1·2·3위만 허용 목록의 이모지 **한 개**를 상태로 저장합니다. 4위 이하로 내려가면 이전 이모지도 숨깁니다. 주간 순위에 일일 이모지를 승계하지 않습니다.
7. 내 제출 답안은 다시 열 수 있습니다. 기준값·공식·해설은 해당 날짜가 종료된 뒤 공개합니다. 이전 날짜 14개를 복습할 수 있습니다.

현재 출제 영역은 분압, 병렬 저항, 옴의 법칙, RC 시정수, 저항 소비 전력, 주파수/주기입니다. 하루에 다른 영역 5개를 고릅니다. 이상 소자·무부하 등 적용 조건을 문항에 표시합니다. 수치·공식·단위는 [공통 계산기](../packages/calculators/src/index.ts)를 재사용합니다. 수식은 이 기능에 복제하지 않습니다.

기본 모드는 **AI가 작성한 저장 템플릿의 일일 조합**입니다. 실시간 모델 호출로 새 자유형 문제를 생성했다고 표시하지 않습니다. 서버 키를 사용해 날짜별 조합을 한 번 고정하고 전원이 재사용합니다. 읽기·참가·채점·복습·커뮤니티는 추가 AI 호출 0회입니다.

운영자는 아직 열리지 않은 날짜의 조합만 OpenAI로 미리 준비할 수 있습니다. AI는 허용된 문제 종류·정수 변형 조건만 고릅니다. 정답, 채점 코드, 사용자 점수는 생성하지 않습니다. 같은 날짜는 불변이며 실패·불확실한 요청을 자동 재시도하지 않습니다.

```sh
node scripts/study-league.mjs generate --data .runtime/league-public --day YYYY-MM-DD --approved --max-usd 0.05
```

이 명령은 기존 Edu `provider.json`의 자격 증명 **참조**와 공통 비용 원장을 사용합니다. 새 키를 만들거나 리그 폴더에 키를 복사하지 않습니다. 명시한 요청 상한·공통 잔여를 확인하고 비용을 보수적으로 예약합니다. 공개 HTTP에는 출제·설정·운영자 API가 없습니다. 이번 검증은 공급자 모의 응답을 사용했고 실제 API 비용을 추가하지 않았습니다.

## 커뮤니티

질문·오늘의 배움·학습 팁을 작성하고, 원글에 답글·공감/취소·신고를 남깁니다. 글·답글은 각각 20개씩 더 읽습니다. 본인 글 숨기기/다시 공개를 지원합니다. 개인정보·회로 원본·진행 중 리그 답안 유출을 올리지 않도록 안내합니다. HTML은 실행하지 않고 텍스트로 표시합니다.

동일 글의 신고는 등록당 한 건입니다. 서로 다른 등록 3건이면 임시 숨김 처리하며, 작성자가 임의로 신고 숨김을 해제할 수 없습니다. 운영자가 감사 기록과 함께 복구·제한합니다. 독립 등록은 독립된 사람을 증명하지 않으므로 악의적 다중 등록·집단 신고를 완전히 방지하는 시스템은 아닙니다.

```sh
node scripts/study-league.mjs moderate --data .runtime/league-public --post 12 --reason "검토 후 제한"
node scripts/study-league.mjs moderate --data .runtime/league-public --post 12 --reason "검토 후 복구" --restore
node scripts/study-league.mjs moderate --data .runtime/league-public --device DEVICE_ID --reason "반복 위반 제한"
```

IP당 분당 HTTP 600회, 등록 키당 서명 요청 90회, 등록 IP당 하루 신규 키 100개, 글·답글 10초 간격/하루 30개로 제한합니다. 학교의 공유 IP를 고려한 값이며 동시 100명 부하 시험을 했다는 뜻은 아닙니다. 서버 상한은 등록 5,000개·글/답글 100,000개입니다. 대규모 운영 전에는 운영자 도구·부하 측정·보관 정책이 필요합니다.

## 기기 키와 저장 범위

- 브라우저/앱 프로필의 IndexedDB에 P-256 ECDSA 개인 키와 AES-GCM 임시 답안 키를 **non-extractable CryptoKey**로 보관합니다. 개인 키는 서버로 전송하지 않습니다. 서버가 공개 키의 SHA-256으로 등록을 식별합니다.
- 변경 요청은 메서드·입력·시각·nonce를 정규화해 서명합니다. 서버는 서명, ±3분 시각 범위, 명령 중복·충돌을 확인합니다. 중복 변경은 저장된 영수증을 재사용합니다. 점수·소요시간·순위·이모지 자격을 클라이언트에서 정할 수 없습니다.
- 닉네임은 등록 시 서버가 생성하며 변경 API가 없습니다. DB 트리거도 ID·키·닉네임 수정을 금지합니다. 다른 브라우저·다른 앱 프로필·저장소 초기화·재설치는 새 키가 될 수 있습니다. **물리적 하드웨어에 영구 고정된 신원이나 부정행위 방지를 보장하지 않습니다.** 키 분실 시 기존 등록 복구는 지원하지 않습니다.
- 공개 웹 화면은 고정 publisher namespace를 사용해 운영자가 API 주소를 갱신해도 같은 웹 출처의 키를 유지합니다. 고정 웹 출처와 namespace를 유지해야 합니다. 임의 서버 연결은 endpoint별로 키를 분리합니다. 앱과 웹은 별도 프로필이므로 닉네임이 다를 수 있습니다.
- 리그 전용 `league.sqlite3`는 WAL/트랜잭션으로 저장합니다. 정답 세트·제출 답안·변경 영수증은 서버 AES-256-GCM 키로 암호화합니다. 닉네임·게시글·순위는 공개 데이터입니다. HTTPS는 인터넷 전송을 보호합니다. 서버 파일 권한을 얻어 `server-secret`도 읽을 수 있는 공격에 대한 보호를 보장하지 않습니다.
- `server-secret`을 자동 교체하지 않습니다. 백업은 서버를 정상 중지한 뒤 전용 데이터 폴더 전체(DB·WAL 포함)와 키를 함께 비공개로 보관합니다. 학생의 기존 실습 기록·회로·API 키를 이 폴더에 복사하지 않습니다. 서버 실행 중 DB 파일 하나만 복사하는 방식은 사용하지 않습니다.

## 실행과 공개 연결

Node.js 24와 기존 저장소 의존성을 사용합니다. Docker·EDA worker·PDK는 필요하지 않습니다.

```sh
npm ci
npm run build
npm run league:start -- --data .runtime/league-local --port 18786
```

`http://127.0.0.1:18786/`에서 리그 전용 화면을 엽니다. `npm run dev:edu`의 개발 서버에는 Edu 전용 workspace 아래 `.runtime/study-league`로 API가 연결됩니다. 개발 서버 자체를 인터넷에 노출하지 않습니다.

공개 서버는 다음처럼 별도로 실행합니다. 직접 공개할 때 HTTPS reverse proxy를 앞에 두세요.

```sh
node scripts/study-league.mjs start --port 18786 --mode public --data .runtime/league-public --static dist --trust-cloudflare
cloudflared tunnel --no-autoupdate --protocol http2 --url http://127.0.0.1:18786
```

`--trust-cloudflare`는 loopback-only origin에서 명시적으로만 허용합니다. 기본 모드는 전달된 IP 헤더를 신뢰하지 않습니다. 이 모드는 [Cloudflare의 CF-Connecting-IP](https://developers.cloudflare.com/fundamentals/reference/http-headers/)를 등록·요청 제한에만 사용하고, DB에는 IP의 HMAC을 보관합니다. 원본 IP를 공개 프로필에 넣지 않습니다.

현재 공개 화면은 기존 공개 저장소의 `codex/edu-league-site` 브랜치를 GitHub Pages에 연결했습니다. [Pages 설정 API](https://docs.github.com/en/rest/pages/pages)로 기존 서비스가 없는 것을 확인한 뒤 생성했습니다. Vercel의 연결 팀은 Pro였으므로 신규 Vercel 배포·유료 호스팅·구독을 생성하지 않았습니다. 리그 API는 운영 PC의 별도 서버를 무료 Quick Tunnel로 연결했습니다. [Quick Tunnel 공식 안내](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)대로 임시 origin은 PC·인터넷·터널이 켜져 있어야 하며 재생성 시 hostname이 바뀝니다. 상시 가동 클라우드 서비스로 표현하지 않습니다.

터널 주소가 바뀌면 공개 설정을 갱신합니다. publisher namespace와 고정 웹 주소는 유지하세요.

```sh
npm run league:site -- --endpoint https://NEW-ORIGIN.example/api/league --out .runtime/NEW-FRESH-site
```

[공개 패키지 도구](../platform/league/site.mjs)는 `league.html`의 JS/CSS 의존성만 수집합니다. EDA 앱·튜토리얼 영상·sourcemap·서버·데이터 폴더를 포함하지 않습니다. 새 staging 디렉터리를 사용한 뒤 정적 브랜치의 기존 생성 파일을 교체·커밋·푸시합니다. 해당 브랜치에는 `index.html`, 공개 `league-config.json`, `.nojekyll`, 해당 JS/CSS만 둡니다. 소스 개발은 `codex/resistor-edu`에서 계속합니다.

공개 서버는 `/`, `/league`, `/league.html`, 허용된 정적 asset, `/health`, `/api/league`만 제공합니다. `/api/rpc`, 환경 파일, DB, source map, 작업 공간은 404입니다. community와 league의 공개/서명 메서드는 [서버 allowlist](../platform/league/service.mjs)에 고정됩니다.

## 확인한 결과와 한계

- `npm run test:core`: **265/265 통과**. 새 리그 검사 12개 포함. 알려진 수치·SI 단위, 24,576개 허용 변형의 유한한 결과, 서명 위조/충돌/재시도, 불변 닉네임, 자정·시간 제한, 중복/다른 등록 제출, 일일/7일 순위, TOP 3 이모지, 신고·페이지 이동·운영 감사, AI 조합 캐시/비용 한도, HTTP 공개 경로와 정적 패키지 경계를 확인했습니다.
- `npm run build`: TypeScript와 production build 통과. 기존 main app chunk 크기 경고는 남습니다.
- 실제 브라우저: 서로 다른 두 웹 출처의 키로 QA 등록 → 동일 순위표 → 글·답글 공유를 확인했습니다. 첫 등록은 다섯 문제를 단위 변환해 제출하여 100점, 1위 이모지 🔬를 서버에 저장했습니다. 답안 작성 중 새로고침과 서버 재시작 후의 닉네임·타이머·제출 답안도 보존했습니다.
- 1366×900, 390×844에서 커뮤니티 문서 가로 넘침 없음. 앱 내부 새 탭을 실제로 열었습니다. 고정 공개 주소에서도 실사용 서버 연결·참가자 0명을 확인했습니다. **공개 리그에는 QA 경쟁자나 샘플 글을 넣지 않았습니다.**
- API 키·DB·회로·학습 기록은 공개 패키지에 포함되지 않습니다. 이번 작업은 추가 AI API 호출 0회입니다. 새 플랫폼 설치 파일은 만들지 않았습니다.

현재는 제한된 공학 수치 문제의 연습 리그입니다. 자유 서술의 공식 채점, 하드웨어 신원 인증, 부정행위 완전 방지, 상시 가동 origin, 다중 서버 DB·대규모 부하, 운영자 웹 콘솔은 지원 범위 밖입니다. 다음 우선순위는 고정 HTTPS origin/지속 저장 운영, 신고 검토 화면과 교실 단위 리그, 측정된 사용자 평가입니다.
