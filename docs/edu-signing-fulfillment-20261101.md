# Resistor Edu 서명·구매자 발급 작업 기록

2026-11-01. 대상은 `codex/resistor-edu` / **Resistor Edu**이며, 발급·서명 도구는 두 에디션에서 공유한다. 강의 사용권은 **Edu만, 개인 기기 2대**다.

## 실제 적용한 변경

- 인프런 강의 `345103`의 진도율 0% 시작 메시지를 전체 프로그램 다운로드, 개인 코드, Edu/Industry 구분, 코드 문의 및 개인정보 보호 안내로 수정했다. 저장 후 새로고침해 메시지와 `https://resistor.kr/download/edu/` 링크가 유지됨을 확인했다. 강의는 임시저장 상태이며 제출·판매 개시하지 않았다.
- Windows 앱·설치기·제거기 Authenticode와 Mac Developer ID·hardened runtime·Apple notarization·staple·Gatekeeper 검증 경로를 구현했다. 최종 배포 파일의 해시와 검증 근거를 묶고, 미서명/ad-hoc 결과를 정식 서명으로 바꿔 표시할 수 없게 했다. [운영 절차](native-trusted-signing.md).
- 영구 발송 큐를 추가했다. 주문별 암호화된 원문, 동시 실행 잠금, 시도 횟수·일일 한도, 환불 취소, 중복 이벤트와 재시작을 처리한다.
- 사용자가 선택한 기존 Gmail을 지원한다. Gmail API에는 발송 멱등성이 보장되지 않으므로 전송 후 응답이 불명확하거나 실행이 중단되면 자동 재전송하지 않고 `review_required`로 남긴다. Gmail 접수와 수신자의 실제 수신을 구분한다.
- Gmail 연결 도우미는 `openid email gmail.send`만 요청하고, PKCE·state·nonce·Google 서명·대상 계정·만료를 확인한다. 메일함 읽기·삭제 권한을 요청하지 않는다. Windows 비공개 폴더 ACL을 확인하고 기존 인증 파일을 덮어쓰지 않는다.
- 실제 Windows 연결 준비에서 기존 비공개 폴더를 다시 설정하는 단계가 실패해, 이미 보호된 폴더를 검사하고 재사용하도록 수정했다. 실패 시 비밀값 없는 단계 이름만 출력하며 `inspect`는 브라우저·OAuth·저장 없이 로컬 조건을 확인한다. 실제 승인 경로의 검사와 loopback 연결 시작을 확인했다.
- 실제 인증 완료 뒤 브라우저의 미완료 로컬 연결 때문에 도우미 프로세스가 남는 문제를 수정했다. 완료·취소·시간 초과 시 받아둔 연결까지 종료하며, 불완전한 HTTP 요청을 사용한 실제 localhost 회귀 검사로 확인했다. 이전 완료 프로세스는 소유권을 확인한 뒤 종료했고 저장된 인증 파일은 유지했다.

## 운영 서버 적용

최초 소스 `4335306` 배포 후 Gmail 연결을 마치고, 검증된 `b98f115922fd687ab3ed70fddec2b92a0ae061e7` 작업 폴더의 동일 Worker 코드를 기존 무료 서비스에 다시 배포했다.

- 서비스: `https://resistor-licensing.nuev-official.workers.dev`
- Worker 버전: `ac01788e-3c10-4533-aa4a-5e4c2ef8fd39`
- 기존 Durable Object `production-v1`, SQLite schema 1, 공개키 fingerprint 유지.
- 메일 공급자 `gmail`, 강의 ID `345103`, 일일 시도 상한 80을 선택했으며 **실제 발송은 명시적으로 비활성화**했다.
- 승인된 Gmail 클라이언트 ID·클라이언트 비밀·갱신 토큰 3개만 표준 입력으로 Cloudflare secret에 등록했다. 운영 health에서 `credentials_configured:true`, `sending_enabled:false`를 확인했다. 기존 인증기관 secret 4개는 보존했다.
- 비밀 등록 직후의 첫 health는 이전 준비 상태를 반환했다. 같은 설정의 정상 재배포 후 반영을 확인했으며, 네임스페이스·데이터·키를 교체하지 않았다. 배포 명령 성공과 실제 객체 반영을 구분했다.
- 운영 HTTP 확인: DB 준비됨, 같은 인증기관, 관리자 API 무인증 거부, 인증된 발송 큐 조회, 미설정 이벤트 수신 거부. 로컬의 기존 인증기관 키 파일과 소유자 사용권 파일 내용은 변경하지 않았다.
- 이 확인은 모든 운영 테이블의 전체 대조나 실제 고객 이메일 수신 검증을 뜻하지 않는다. [운영 확인 기록](evidence/licensing/fulfillment-20261101.json).

## 확인한 검사

- `npm run test:core`: 통과.
- `npm run test:license`: 최종 수정 후 64개 통과(Gmail 연결 도우미 16개·Windows 실제 ACL 검사 포함).
- 실제 workerd/SQLite 테스트: 8개 통과. HTTP 공급자는 격리된 mock이며 실제 메일을 보내지 않았다.
- 서명·네이티브 배포 관련 24개 검사 통과. 기존 공개 v0.32.0 네 플랫폼 기록은 계속 유효하다.
- `npm run typecheck`, `npm run build`, 문서 링크 검사 통과.
- 소스 `b98f115`의 GitHub [Source Validation 41294795763](https://github.com/Lead729726-cell/Resistor/actions/runs/41294795763), [License Authority 41294795669](https://github.com/Lead729726-cell/Resistor/actions/runs/41294795669) 성공을 확인했다. 실제 계정 연결 후 후속 수정의 CI는 해당 커밋에서 별도로 확인한다.
- 실제 서명 preflight: Windows 사용 가능 코드 서명 인증서 0개, Apple 인증 구성 없음. 따라서 **실제 공증·신뢰 서명은 미실행**이다.

`npm test --prefix platform/licensing/cloudflare`는 해당 폴더에 개발 도구를 설치해야 한다. 이 PC에서는 앱의 공유 `node_modules`를 바꾸지 않고 기존 잠금 버전 Miniflare 경로를 `RESISTOR_MINIFLARE_PATH`로 지정해 8개를 실행했다. CI는 별도 도구 패키지에 `npm ci`를 사용한다.

## 외부 연결 상태와 남은 조건

1. Google Cloud에 전용 `resistor-license-mail-20261101` 프로젝트, `Resistor License Mail` 브랜딩과 Desktop OAuth 클라이언트를 생성하고 Gmail API를 활성화했다. 정책 동의·인증 생성·저장 위치·Cloudflare 등록은 사용자의 명시적 답변 후 진행했다. `resistor.kr` 홈페이지·도메인을 저장했고, 소유자 이메일만 테스트 사용자로 등록했다. 클라이언트 JSON은 승인된 `D:\Coldbrew\Resistor\.runtime\licensing\gmail-oauth\client.json`에 비공개로 보관하고 다운로드 임시 사본은 제거했다. **소유자의 본인 확인과 권한 승인 후 Google 서명·계정·최소 권한을 검증했고, 같은 폴더의 `credentials.json`에 저장했다. 실제 토큰 갱신 요청과 Cloudflare secret 등록도 확인했다. 메일 발송은 아직 실행하지 않았다.**
   - 첫 승인은 로컬 callback 대기 만료 이후 도착해 저장되지 않았다. 동일 계정·권한의 새 세션으로 연결을 완료했다. 발송 권한 외에는 `openid email` 계정 확인만 있으며 메일함 읽기 권한이 없다.
   - Google 토큰 응답의 만료 시각은 **2026-11-08 18:57:37 KST**다. 로컬 호스트에서 갱신 성공을 확인했으며, 운영 서버의 실제 Gmail 발송/수신 성공을 뜻하지 않는다.
   - OAuth 앱은 `Testing`이며 운영 게시 버튼은 브랜딩 미완료로 비활성이다. 기존 사이트에 이 Gmail 처리에 맞는 공개 개인정보 안내가 확인되지 않아 임의 URL을 등록하지 않았다. [개인정보 안내 초안](gmail-operator-privacy-draft.md)은 운영 검토용이며 사이트에 게시하지 않았다. Testing 토큰을 만들더라도 7일 제약이 있어 상시 자동 발송 완료의 근거로 쓰지 않는다.
2. 인프런의 실제 강의 설정과 공식 안내에서 확인한 자동 메시지는 수업 시작·완료·진도에 따른 공통 메시지다. 구매/환불 웹훅·API와 구매자별 비밀 코드 삽입 기능은 확인하지 못했다. 서버는 **운영자가 확인한 구매 주문**을 입력받은 이후를 자동화하도록 구현했으며, 구매부터 완전 자동화되었다고 표시하지 않는다.
3. Apple 계정 로그인·Developer Program 가입 여부·Developer ID 개인키·공증 인증정보가 필요하다. 계정/서명 상태는 아직 미확인이다.
4. Windows 신뢰 인증서 또는 Azure Artifact Signing의 승인된 Public Trust 프로필이 필요하다. 이후 Azure 로그인 완료를 확인했으나, 현재 선택된 디렉터리의 구독 목록은 0개였다. 다른 디렉터리의 자격이나 심사 승인을 추정하지 않으며, 조직 심사·유료 구독·서명 리소스 생성은 하지 않았다.
5. 현재 공개된 Edu v0.32.0 설치 파일은 기존 Windows 미서명 / Mac ad-hoc 상태 그대로다. 서명 준비 뒤 새 버전으로 빌드·실제 플랫폼 QA·배포를 진행해야 한다. 네이티브 워크플로는 수동 실행으로 바꾸어, 없는 인증정보/회수한 QA 코드로 불필요한 네 OS 빌드를 시작하지 않는다. 소스 CI와 기존 업데이트 피드는 유지한다.

## 공식 확인 자료

- [Apple 등록 안내](https://developer.apple.com/programs/enroll/): 신규 가입은 연 US$99이며 실제 지역 금액은 결제 화면 기준. 본인 확인·약관·결제 단계는 별도다.
- [Microsoft 요금](https://learn.microsoft.com/en-us/azure/artifact-signing/how-to-change-sku): Basic 월 US$9.99, 5,000회 포함. [지원 범위](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart): 한국은 조직 경로에 포함되며, 한국 개인사업자의 실제 심사 통과를 확인한 것은 아니다.
- [Gmail API 발송](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send), [OAuth 토큰 만료](https://developers.google.com/identity/protocols/oauth2#expiration). Testing 상태에서 Gmail 권한을 포함하는 토큰은 7일 만료 제약이 있으므로 영구 자동화가 완료됐다고 간주하지 않는다.
- [인프런 자동 메시지](https://inflab-1.gitbook.io/inflearn/course-operating/courses/undefined).

유료 가입·서명 비용·실제 고객 메일 발송은 이번 기록 시점에 실행하지 않았다.
