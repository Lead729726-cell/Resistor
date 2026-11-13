# Resistor Edu — 제공자 개인정보 문의 발송 기록·보관 초안

2026-11-13 · **사용자 승인에 따라 Cloudflare·Google·Vercel·OpenAI에 각각 1회 발송했고, 보낸편지(SENT)에서 발신자·수신자·제목·본문을 재확인했다.** 수신함 도착, 담당팀 접수·답변, 실제 계약·처리 국가·보관기간은 아직 확인되지 않았다. 고객 주소/답안/시리얼/refresh token/API key/DB 파일이나 첨부파일은 보내지 않았다. 실제 메시지·스레드 ID는 비공개 `.runtime` 증거에만 보관한다. Resend는 이번 발송 요청 대상이 아니며 미발송이다. 아래 1–4절의 승인된 문의 본문은 발송 당시 그대로 유지한다.

| 제공자 | 실제 수신자 | 발송 시각(KST) | 공개 가능한 검증 증거 |
| --- | --- | --- | --- |
| Cloudflare | `privacyquestions@cloudflare.com` | 2026-11-13 09:45:17 | [1회 발송·SENT 재조회](evidence/legal/provider-inquiries/cloudflare-20261113.json) |
| Google | `googlekrsupport@google.com` | 2026-11-13 09:44:30 | [1회 발송·SENT 재조회](evidence/legal/provider-inquiries/google-20261113.json) |
| Vercel | `privacy@vercel.com` | 2026-11-13 09:45:28 | [1회 발송·SENT 재조회](evidence/legal/provider-inquiries/vercel-20261113.json) |
| OpenAI | `privacy@openai.com` | 2026-11-13 09:44:52 | [1회 발송·SENT 재조회](evidence/legal/provider-inquiries/openai-20261113.json) |

공통 답변 요청: 적용 서비스·요금제·계정 기준, 수탁/처리 법인과 연락처, 실제 처리·보관 국가/하위처리자, 데이터 종류, 보관 기산점/기간/예외, 삭제·백업·복원 절차, 요청 가능한 증거 또는 계약 문서. 설명 문서와 **이 계정에 실제 적용되는 조건**을 구분해 달라고 요청한다.

## 1. Cloudflare — 라이선스 Worker/SQLite Durable Object

실제 발송 채널: [개인정보 문의 안내](https://www.cloudflare.com/privacypolicy/)에 게시된 `privacyquestions@cloudflare.com`으로 승인 본문을 1회 발송하고 SENT를 확인했다. 수신함 도착·담당팀 답변과 계정별 조건 확정은 별도다.

**Subject: Resistor Edu — retention, locations and deletion scope for SQLite-backed Durable Objects**

Hello Cloudflare Support / Privacy Team,

We operate Resistor Edu for users in South Korea. Our licensing service uses a Worker and a SQLite-backed Durable Object. Application records include purchase references, entitlement and activation identifiers, device hashes, encrypted recipient/license delivery payloads, minimal delivery outcomes and audit events. This inquiry contains no customer records or credentials.

Please confirm for our actual account and service:

1. The applicable processing entity, agreement/DPA, countries of processing/storage and subprocessors. Please distinguish Worker request processing, Durable Object storage, support/security/billing logs and disaster-recovery copies. Does a location hint provide any binding data residency guarantee, and what jurisdiction options actually apply?
2. The retention start point and maximum period for each category above, including any personal data in request metadata. Which logs are enabled/configurable on our plan, and can request bodies be excluded?
3. Your documentation describes a 30-day SQLite PITR window. After we delete specific application rows, what copies remain, how long, and can that content be selectively purged from recovery copies? Please distinguish logical row deletion, PITR expiry and any further recovery/security retention.
4. What procedure should we use to prevent a permitted restoration from reintroducing records subject to a verified deletion request? Is an operator-maintained deletion ledger sufficient within your product, and what confirmation can you provide?
5. What is retained after object/service/account closure, and which published or contractual documents should we cite in a Korean privacy notice?

Please do not delete or change our service as a result of this inquiry. We are requesting documentation and account-specific confirmation only.

Regards, Resistor Edu operator

공식 근거: [DO 데이터 위치](https://developers.cloudflare.com/durable-objects/reference/data-location/)는 jurisdiction과 요청·로그 범위를 구분한다. [SQLite Storage/PITR](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)는 과거 30일 복구를 설명한다. 이 기능 설명을 특정 고객 행의 즉시 완전 파기 보장으로 사용하지 않는다.

## 2. Google — 개인 Gmail 문의함·Gmail API 발송

실제 발송 채널: [Google 개인정보처리방침](https://policies.google.com/privacy?hl=ko)에서 확인한 `googlekrsupport@google.com`으로 승인 본문을 1회 발송하고 SENT를 확인했다. 공개 Gmail 커뮤니티에는 계정 ID·고객 데이터·메일 ID를 게시하지 않았다. **Google Workspace 계약을 체결한 것으로 전제하지 않는다.** 수신함 도착·담당팀 답변은 미확인이다.

**제목: 한국 Resistor Edu 운영자의 개인 Gmail/Gmail API 보관·삭제·국외 처리 조건 확인**

안녕하세요. 한국 이용자를 대상으로 Resistor Edu를 운영하며, 운영자 개인 Gmail 주소에서 고객 문의를 수신하고 Gmail API로 사용권 안내 메일을 보냅니다. 발송 연결은 운영자 한 명의 `openid`, `email`, `gmail.send` 권한을 사용합니다. 학습자에게 Google 로그인을 요구하거나 메일함 읽기·삭제 권한을 요청하지 않습니다.

아래 사항을 이 계정 유형에 맞춰 확인 부탁드립니다.

1. 개인 Gmail과 Gmail API 각각에 적용되는 처리 법인·조건, 보관/처리 국가와 관련 하위처리자, 한국 사업자가 고객 개인정보 처리 사실을 안내할 때 인용할 공식 자료는 무엇인가요? Google Cloud 프로젝트 생성만으로 Workspace의 DPA나 데이터 리전 조건이 적용된다고 보지 않고 있습니다.
2. 문의 메일·첨부·보낸편지, API 발송/인증 메타데이터, 장애·보안 로그별 보관 기준과 운영자가 설정할 수 있는 범위를 알려 주세요.
3. 특정 문의/보낸편지를 영구 삭제했을 때 사용자 화면에서의 복구 불가, 실제 저장 시스템 삭제, 암호화 백업 삭제는 각각 언제 완료되나요? 적용되는 예외와 확인 가능한 증거가 있나요?
4. 공개 보관 설명에 일반 삭제 처리와 백업 보관 설명이 있습니다. 이 내용이 해당 개인 Gmail 계정의 고객 문의·API 발송 사본에 어떻게 적용되는지 확인 부탁드립니다. 수신자가 가진 사본은 저희가 삭제할 수 없다는 점도 별도로 안내하려 합니다.
5. OAuth 연결 해제와 특정 메일 삭제는 어떤 점에서 다르며, 권한 확대 없이 운영자가 수동으로 처리해야 하는 항목은 무엇인가요?

이 문의는 정책 확인만을 위한 것입니다. 메일/계정 삭제, OAuth 권한 확대 또는 서비스 변경을 요청하지 않습니다.

감사합니다. Resistor Edu 운영자

공식 근거: [Gmail 삭제 안내](https://support.google.com/mail/answer/7401?hl=ko)의 휴지통 30일과 영구 삭제 절차는 사용자 기능이다. [Google 보관 설명](https://policies.google.com/technologies/retention?hl=ko)은 일반 삭제 처리와 백업·예외를 별도로 설명하므로, 휴지통 비우기를 모든 사본의 즉시 파기로 표현하지 않는다.

## 3. Vercel — 공개 사이트/API 로그

실제 발송 채널: [공식 DPA](https://vercel.com/legal/dpa)에서 확인한 `privacy@vercel.com`으로 승인 본문을 1회 발송하고 SENT를 확인했다. 사용자 요청 본문·환경 변수는 첨부하지 않았다. 수신함 도착·담당팀 답변은 미확인이다.

**Subject: Resistor Edu website — plan-specific request/log retention and deletion scope**

Hello Vercel Support,

We host the Resistor Edu website at resistor.kr, including static downloads/documentation and configured API routes. Please confirm our actual plan's processing entity/DPA, processing and storage countries, subprocessors, and retention for runtime logs, request/IP metadata, security logs, deployment copies and any backups. Please distinguish runtime logs shown in the dashboard from other infrastructure/security records.

Can we exclude request bodies and sensitive query values, shorten available log retention, and request deletion of a narrowly identified record? What remains after a deployment or log is removed, including recovery copies and legally required records? Please identify the relevant settings and official documentation for our account. This is an information request; do not remove deployments, aliases or logs.

Regards, Resistor Edu operator

공식 근거: [Runtime Logs](https://vercel.com/docs/logs/runtime)는 플랜별 보관을 설명한다. 실제 계정 플랜/옵션과 그 외 보안·요청 로그를 이번 작업에서 조회하지 않았으므로 해당 숫자를 전체 서비스 파기 기한으로 옮기지 않는다.

## 4. OpenAI — 선택적 외부 AI 학습

실제 발송 채널: [공식 DPA](https://openai.com/policies/data-processing-addendum/)의 Data Protection Officer 연락처 `privacy@openai.com`으로 승인 본문을 1회 발송하고 SENT를 확인했다. API key나 실제 학습 데이터는 보내지 않고 아래 처리 형태만 설명했다. 수신함 도착·담당팀 답변은 미확인이다.

**Subject: Resistor Edu — applicable retention and processing locations for optional Responses API requests**

Hello OpenAI Support,

Resistor Edu optionally sends a bounded learner question/answer and selected circuit or simulation evidence to the Responses API after explicit per-request approval. Our implementation sets `store:false`, does not use background mode, and does not send mailbox data, API credentials or full PDK files. Stored exercises can be reused without a new API request.

For the actual organization/project and models in use, please confirm: (1) the applicable processing entity/DPA, processing/storage countries and subprocessors; (2) abuse-monitoring, application-state and prompt-cache retention, including exceptions despite `store:false`; (3) whether any zero/modified retention or residency option is actually enabled and what eligibility/configuration is required; and (4) how a verified deletion request can be scoped, what evidence is available, and which security/legal copies may remain. Please distinguish default documentation from this account's effective settings. Do not change retention settings or billing in response to this inquiry.

Regards, Resistor Edu operator

공식 근거: [API 데이터 제어](https://developers.openai.com/api/docs/guides/your-data)는 Responses의 application state와 abuse monitoring, 모델/기능별 예외를 구분한다. `store:false`를 무보관 보증으로 안내하지 않는다. 사용자의 별도 제공자 계정과 운영자가 직접 제공하는 계정은 책임 범위를 따로 확인한다.

## 5. Resend — 사용 재개·전환을 검토할 때만

**Resend 문의는 이번 사용자 발송 요청에 포함되지 않았으며 보내지 않았다(`not_run`).** 현재 수신자 메일 발송 경로가 Gmail인 범위에서는 Resend가 실제 처리했다고 적지 않는다. Resend 경로를 활성화하거나 과거 전송이 있었다고 확인한 경우에만 아래 초안을 사용한다. 코드 어댑터 존재는 실제 전송 증거가 아니다.

채널: [Resend 공식 지원](https://resend.com/support) 또는 [공개 정책](https://resend.com/legal/privacy-policy)의 `support@resend.com`.

**Subject: Retention/deletion confirmation before using Resend for Resistor Edu license delivery**

Hello Resend Support,

We are reviewing Resend as an optional transactional email provider for Resistor Edu. Please confirm for the intended account/plan the processing entity and DPA, countries/subprocessors, retention for message content, recipient addresses, delivery events, webhook metadata and backups, and the process to remove specific messages and recovery copies. Please distinguish the sending region from where customer content/logs are stored. Does a request made before the normal retention window remove every copy or only the customer-visible message? What records and exceptions remain after account closure? No real customer data is included, and we are not requesting activation, a paid plan or deletion at this stage.

Regards, Resistor Edu operator

공식 근거: [Resend GDPR 안내](https://resend.com/security/gdpr/)는 데이터 위치·플랜별 보관 및 특정 메일 삭제 문의를 설명한다. 실제 적용 계약과 백업 범위는 제공자 답변에 연결해 확정한다.

## 답변을 받으면 남길 최소 증거

제공자/서비스·계정 범위(비공개 참조), 문의 일시·사례 ID, 공식 답변 원본의 비공개 위치, 처리 법인·국가·항목·기산점/기간·예외·삭제/복구 절차, 확인자·확인일을 기록한다. 공개 문서에는 필요한 조건과 공식 근거만 반영하고 계정/고객 데이터는 게시하지 않는다. 미응답·일반 FAQ만 받은 항목은 `unconfirmed`, 실제 계정 적용이 확인된 항목만 `confirmed`로 둔다. 현재 1–4절은 각각 1회 발송과 SENT 재조회까지 검증했으며, 재발송하지 않는다. 제공자 수신함 도착·답변·실제 계정 적용 조건은 `unconfirmed`로 유지한다. Resend 발송과 모든 제공자의 삭제 이행은 `not_run`이다. 보낸편지 확인을 개인정보 처리 국가·기간 확정이나 삭제 완료로 취급하지 않는다.
