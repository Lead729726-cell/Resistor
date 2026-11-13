# Resistor Edu 개인정보 운영 코드 점검

2026-11-13 · 소스 및 합성 데이터 검사. 운영 DB, 실제 Gmail, 사용자 프로젝트, 키, 백업에는 접근하지 않았다. 이 문서는 제품 약관이나 새 보관기간을 정하는 문서가 아니다.

## 자동으로 지워지는 것과 남는 것

| 영역 | 실제 구현 | 개인정보 보관 기준과 구분할 점 |
| --- | --- | --- |
| 리그 요청 캐시 | `platform/league/service.mjs`의 서명 요청 트랜잭션에서 `limits.expires_at` 경과분과 생성 후 1일 지난 `receipts` 삭제 | 요청이 들어올 때 실행한다. 사용자·답안·게시글 전체를 지우는 작업이나 주기적 탈퇴 처리기가 아니다. 공개 읽기 요청과 이전 영수증을 반환하는 경로는 이 정리 코드를 실행하지 않는다. |
| 라이선스 제한 캐시 | `platform/licensing/domain.mjs`의 `rateLimit()`에서 `window_start < now - 2*windowMs` 삭제 | 기본 windowMs는 60초다. 인증·주문·발송 기록의 보관기간을 의미하지 않는다. |
| 사용권·세션 만료 | 라이선스 lease/QA grant와 협업 session/invite에 만료 검사 존재 | 만료는 접근 거부 기준이다. 해당 DB 행의 파기를 입증하지 않는다. |
| 발송 Cron | Cloudflare Worker의 scheduled 작업은 설정에 따라 outbox 처리 | 개인정보 삭제 스케줄이 아니다. |
| 백업 | `scripts/cloud-backup.mjs`가 SQLite online backup과 프로젝트/실행/업로드 사본 생성 | 저장소에서 백업 회전·보관기한 파기·삭제 요청 재적용 기능을 확인하지 못했다. 외부 운영 설정은 별도 확인 대상이다. |

## 현재 지원하는 수동 동작

- **문의 메일**: 운영자가 실제 Gmail에서 확인·처리한다. 기존 시리얼 발송 OAuth의 `gmail.send`는 메일 읽기·삭제 권한을 제공하지 않는다. 아래 계획기도 Gmail에 연결하지 않는다.
- **리그**: 작성자 `community.hide`는 `posts.status`를 바꾸며 본문을 남긴다. `community.react`의 취소는 해당 사용자의 반응 행을 삭제한다. 운영 CLI의 `moderate`는 숨김/차단 수단이며 탈퇴나 원문 파기가 아니다. 공개 키·기기 ID·닉네임의 불변 트리거를 임의 UPDATE로 우회하지 않는다.
- **라이선스**: 기기 해제, 환불·사용권 회수, 운영 grant 회수, outbox 상태 조회만 현재 동작이다. 개인정보 삭제 API가 없다. `/admin/delivery`는 내용을 복호화해 반환할 수 있으므로 일반 상태 확인에는 최소 정보 outbox 조회를 우선하고, 공개 로그에 응답을 남기지 않는다.
- **협업**: `cloud.auth.signOut`은 현재 세션을 지운다. 방 소유자의 `cloud.setRole` removed는 지정된 멤버 관계를 지우지만 users·rooms·commands·공유 프로젝트를 삭제하지 않는다. 방 소유자는 이 방법으로 제거할 수 없다.
- **로컬 학습 기록**: 사용자 기기의 내보내기·저장소 관리는 운영 서버 요청과 별개다. 기기 키나 다른 학습 기록까지 지우는 조작을 기본 삭제 방법으로 제시하지 않는다.

## 아직 운영 결정을 필요로 하는 범위

| 분류 | 남아 있는 데이터·관계 | 필요한 결정·구현 |
| --- | --- | --- |
| 인증·주문 | orders/evidence/purchase_ref, licenses, activations, activation_secrets, operator_grants, order_revocations, audit | 구매·분쟁 법정 보존과 인증 운영 데이터를 구분할 기간/기산점, 회수·재등록·중복발급 방지에 필요한 최소 정보, 만료·탈퇴 후 처리 방식 |
| 시리얼/시험 발송 | deliveries와 암호화 payload, delivery_jobs의 암호화 message, attempts/events, provider IDs, mail_smoke_* | 발송/환불/중복 방지 관계를 보존하는 최소화 설계, 본문·수신자와 상태 기록의 별도 기간, 외부 Gmail/Resend 보관분 및 복원 시 재발송 방지 |
| 리그·커뮤니티 | devices, attempts, emojis, receipts, posts, reactions, reports, difficulty_preferences, audit | 기기 서명 등 본인 확인, 본인 데이터와 타인의 답글·신고 분리, 삭제 후 닉네임/ID 연결과 재등록 처리, 단일 트랜잭션·복원 재적용 검증. 승인된 기준은 ‘이용 중 보관·확인된 요청 수동 처리’이며 고정 연수는 추가하지 않음 |
| 협업 | users, sessions, rooms/snapshot, members, invites, commands/params/result와 EDA 프로젝트·실행·업로드 | 계정·방·공동 작업의 각각 다른 관리 주체와 기간, 소유권 이전/종료, 실행 중 명령과 공유 기록 처리. 리그 기준을 자동 적용하지 않음 |
| 백업·외부 사본 | cloud/EDA 사본, 리그 DB/WAL/서버키의 별도 운영 백업, 인증 저장소의 제공자 복구 기능 | 실제 보관 위치·관리자·기간·파기 확인·복구 전 삭제 재적용 대장. 제공자의 복구 기능이 곧 요청자의 삭제 완료라는 뜻이 아님 |

현재 기능만으로 전체 탈퇴·개인정보 파기가 완료되었다고 안내할 수 없다. 임의 SQL API, 전체 DB 삭제, 키 교체, 메일 권한 확대는 추가하지 않았다.

## 구현한 문의 보관 검토 계획기

`scripts/privacy-retention-plan.mjs`는 **직접 확인한 해결일 메타데이터**를 stdin으로 받아 수동 검토 목록을 만든다. 입력에 메일 주소·제목·본문·시리얼·토큰·파일 경로를 넣을 수 없다. 사례 UUID, 해결일, 분류와 대장 revision만 허용한다. 입력 최대 256 KiB/1,000건이며 Edu의 `resistor-support-inquiries` 대장만 받는다.

```json
{
  "schema_version": 1,
  "edition": "edu",
  "authority": "resistor-support-inquiries",
  "revision": 1,
  "records": [
    {
      "case_id": "00000000-0000-4000-8000-000000000001",
      "resolved_on": "2025-11-13",
      "retention_basis": "general_inquiry"
    }
  ]
}
```

위 값은 합성 예시다. 실제 대장은 비공개 운영 저장소에서 별도로 관리하며 공개 저장소·검증 자료에 복사하지 않는다.

```powershell
# 운영자가 준비한 메타데이터 대장을 파이프로 전달한다.
Get-Content -Raw -LiteralPath '승인한-비공개-대장.json' |
  node scripts/privacy-retention-plan.mjs --as-of 2026-11-13

# 합성 데이터 검증만 실행한다.
node --test tests/privacy-retention-plan.test.mjs
```

계획기는 파일을 열거나 쓰지 않으며 네트워크·DB·메일에도 접근하지 않는다. stdin 입력을 검사하고 계획을 stdout으로 출력할 뿐이다. 실제 대장의 출력도 사례 ID가 포함된 비공개 정보이므로 공개 콘솔 수집·GitHub·지원 게시물에 올리지 않는다. 기기/프로필 저장소를 직접 변경하지 않는다.

출력의 `review_due`는 해결일의 다음 해 같은 달·날에 도달한 **수동 검토 대상**이다. 2월 29일은 다음 해 2월 28일을 검토일로 삼는다. 이는 삭제 실행일이나 법정 기한 판정이 아니므로 운영자가 분류·기산점·보존 예외를 다시 확인해야 한다. 미해결·미분류·미래 해결일은 보류하고, `statutory_hold`에는 임의 만료일을 계산하지 않는다.

모든 결과는 `dry_run`, `execution_status:not_run`, `deletion_supported:false`, `deletion_performed:false`다. 계획 해시는 edition·authority·revision·사례 범위·해결일·검토 기준일에 묶인다. `checkInquiryPlan`의 일치 확인도 삭제 완료가 아니다. 적용/삭제/메일 발송 명령은 존재하지 않는다.

검증한 범위: 1년 경계, 윤년, 잘못된 날짜, unresolved/법정보존 분리, 다른 edition/authority·추가 개인정보 필드 거부, 중복 사례·상한, source revision/계획 변조, CLI apply 거부 및 오류 출력에서 입력 원문 배제. 합성 테스트 5개 통과. 실제 문의 처리·DB 삭제·백업 파기·권리행사 완료는 **not_run**이다.
