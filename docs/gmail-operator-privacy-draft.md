# Resistor License Mail 개인정보 안내 초안

**운영자 검토 필요 · 미게시 초안 · 2026-11-01**

단일 운영자용 Gmail 연동의 실제 구현을 설명하는 초안입니다. 법률 검토 완료,
Google 승인, 운영 연결·발송 완료를 뜻하지 않습니다. 미확정 사항을 검토하고
실제로 게시하기 전에는 OAuth 개인정보처리방침 URL로 사용할 수 없습니다.
Resistor 제품 전체의 개인정보처리방침을 대신하지 않습니다.

## 목적과 접근 범위

이 도구는 운영자가 확인한 Resistor Edu 구매의 개인 시리얼 안내를 기존 Gmail
`creditlsh00726@gmail.com`에서 발송하기 위한 도구입니다. 구매자는 Google 로그인이나
Gmail 권한 동의를 하지 않습니다. 인프런 구매·환불 자동 수신 연동은 미확인이며,
확인된 주문을 운영자가 관리자 경로로 입력합니다. 현재 발송 설정은 꺼져 있습니다.

- `openid`, `email`: Google 서명과 이메일·계정 식별자·이메일 확인 여부를 검증해
  승인된 운영자 계정인지 확인합니다.
- `gmail.send`: 해당 구매자의 이메일로 개인 시리얼과 사용 안내를 보냅니다.
- 메일함 읽기·검색·수정·삭제, 연락처 또는 구매자 Google 계정 접근 권한은
  요청하지 않습니다. Google 비밀번호를 받지 않습니다.

이 구현은 해당 Google 데이터를 계정 확인과 안내 발송에 사용합니다.
광고·판매·AI 학습이나 모델 호출에 사용하는 기능은 없습니다.

## 처리·저장·전달 정보

계정 연결 도우미는 확인된 이메일·Google 계정 식별자·권한 범위·확인 시각,
OAuth 클라이언트 정보와 갱신 토큰을 접근 제한 로컬 파일에 저장합니다.
발급 과정의 액세스 토큰과 ID 토큰은 그 파일에 저장하지 않습니다.
서버 연결 시 OAuth 비밀값은 Cloudflare Worker 비밀 설정에 전달하며,
갱신된 액세스 토큰은 발송 처리 중 메모리에서 사용합니다.

라이선스 서버에는 주문 참조번호·출처·증빙 해시·사용권·발송 식별정보와 시도
시각·상태·오류 분류가 남습니다. 수신 이메일, 시리얼과 준비된 메일은 영구
발송 큐에 AES-GCM으로 암호화해 저장합니다. 모든 항목이 같은 방식으로
암호화된다는 의미는 아닙니다. 비밀값을 공개 소스·설치 파일·상태 응답에 넣지 않습니다.

Google은 계정 연결·토큰 갱신과 수신 주소·안내 메일을 처리합니다. 발송 메일은
운영자 보낸편지함에도 남을 수 있습니다. Cloudflare는 서버 비밀 설정과 영구
데이터베이스를 호스팅합니다. 구매자는 본인 시리얼·안내·발신 주소를 받습니다.
현재 선택은 Gmail이며 Resend에 동시에 구매자 정보를 보내지 않습니다.

## 보관·철회·삭제·문의

**보관 기간, 제공자 백업 처리와 실제 삭제 절차는 운영자 확정 전입니다.**
현재 특정 기간 뒤 모든 주문·발송 기록·로컬 인증 파일을 자동 삭제하지 않습니다.
미확정 기간이나 즉시 완전 삭제를 보장하는 안내를 게시해서는 안 됩니다.

운영자는 [Google 연결 관리](https://myaccount.google.com/connections)에서 권한을
철회하고 서버 발송 설정을 끌 수 있습니다. 권한 철회는 이미 전달된 메일을
회수하거나 로컬 파일·Cloudflare 기록·Google 보낸편지함을 자동 삭제하지 않습니다.
각 저장소와 백업 삭제는 별도 처리해야 합니다.

확인·정정·연결 해제·삭제 문의: **creditlsh00726@gmail.com**.
문의 담당, 본인 확인 방법, 처리 범위와 기한도 공개 전에 확정해야 합니다.

## 상태 표시와 공개 전 확인

Gmail 메시지 ID는 발송 요청 접수를 뜻합니다. 수신 서버 도착·받은편지함 배치·읽음을
증명하지 않으며, 발송 전용 권한으로 확인하는 기능도 없습니다. 불확실한 발송은
자동 재발송하지 않고 운영자 확인 대상으로 남깁니다.

현재 `/privacy/`, `/terms/`, `/privacy.html`, `/terms.html`은 HTTP 404입니다.
`/shop/#conditions`는 판매 준비 안내로서 이 OAuth 데이터 처리를 설명하지 않습니다.
미확정 방침 검토 후 `resistor.kr`에 실제 공개 페이지를 만들고 기능을 설명하는
홈페이지에서 연결해야 합니다. Google 도메인·브랜딩·권한 검증과 앱 게시 상태도
별도로 확인해야 합니다. **Production 게시 여부는 이 문서에서 확정하지 않습니다.**
Testing 상태에서 Gmail 권한을 포함하는 갱신 토큰에는 7일 만료 제약이 있으므로
무기한 자동 발송이 완성되었다고 안내하지 않습니다.

기술 확인 자료(2026-11-01):
[Google 브랜딩·개인정보 페이지 요건](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification),
[Google 사용자 데이터 정책](https://developers.google.com/terms/api-services-user-data-policy),
[Gmail 발송 권한](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send),
[OAuth 갱신](https://developers.google.com/identity/protocols/oauth2/web-server#offline),
[토큰 만료](https://developers.google.com/identity/protocols/oauth2#expiration),
[Cloudflare 비밀 설정](https://developers.cloudflare.com/workers/configuration/secrets/).
