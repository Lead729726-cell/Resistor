# Resistor Edu — 승인된 보관 설계와 적용 전 조건

2026-11-13 · **소유자 승인 완료: 설계 기준만 승인, 운영 미적용**. 승인 범위는 발송 원문 **30일**, 불필요한 기술 상세 **90일**, 운영자 생성 백업 **30일**이며 사용권 제공 기록과 적용되는 법정 기록은 분리한다. 실제 DB·메일·백업을 조회하거나 삭제하지 않았다. 기간 승인은 법률 검토 완료, 자동 파기 구현, 제공자 사본 삭제 또는 공개 정책 시행을 뜻하지 않는다. 관계 보존 마이그레이션·복원 검증·운영 적용 증거가 필요하다.

## 이미 정해진 기준

- 일반 문의: 해결 후 **1년**. 법정 거래·분쟁 기록과 분리한다.
- 리그·커뮤니티: 이용 중 보관하며 본인·범위를 확인한 삭제/탈퇴 요청을 처리한다. 임의의 활동 중단 만료일은 만들지 않는다.
- 실제 적용 대상 거래·분쟁 기록: 해당 법정 기간과 기산점을 확인하여 별도 보존한다. 모든 기술 로그·메일 본문에 일괄 적용하지 않는다.
- 온라인 14세 이상 자기 확인: 새 Edu 소스에 최소 확인 기록이 추가되었지만 공개 서버의 연령 확인 강제나 기존 설치 파일 업데이트가 완료되었다는 뜻은 아니다.

## 승인된 설계: 목적 종료 + 짧은 기술 기록

확정한 설계 숫자는 **발송 원문 30일 / 기술 상세 90일 / 운영자 백업 30일**이다. 서비스 이용권·구매 증빙·공유 설계는 이 숫자로 일괄 만료시키지 않는다. 아래 표의 해제 기기·공유 방에 관한 별도 30일 제안과 제공자 관리 사본은 이번 세 항목의 승인에 포함하지 않는다.

| 실제 저장 항목 | 설계 기준·기산점과 승인 범위 | 적용 전 필요한 처리 |
| --- | --- | --- |
| `orders`, `licenses`, `order_revocations` | 유효한 사용권 제공에 필요한 동안. 사용권 종료 후에는 적용되는 거래·분쟁 보존만 분리 | 환불·주문 재입력 시 같은 시리얼을 또 발급하지 않도록 최소 주문 연결과 회수 표식을 보존. `purchase_ref`, 증빙 해시, 코드 해시는 익명정보가 아니며 목적·기간 분류 필요 |
| 활성 `activations`, `activation_secrets` | 기기 활성화 중 | 현재 `activate` 재요청은 암호화된 기존 secret을 재사용한다. 활성 secret의 임의 삭제·키 교체 금지. 기존 서명 lease의 7일 유효성은 별개이며 조기 취소로 처리하지 않음 |
| 해제된 기기의 secret·기기 연결 | 해제 확정·진행 요청 종료 후 불필요한 secret을 제거하는 구조를 권장. 제한된 장애 진단 연결의 **해제 후 30일은 별도 미확정 제안** | 현재 `deactivate`는 active=0만 저장하고 해제 시각이 없다. `deactivated_at`과 진행 요청 경계를 먼저 추가해야 정확한 기산 가능. 동일 기기 재등록·2대 제한·복원 회귀 검증 필요 |
| `operator_grants`의 시험용 복구 payload | 시험 사용권 만료 또는 회수·진행 작업 종료 후 최소화 | 만료와 DB 파기는 다름. 실제 구매 행과 분리하며 암호화된 시험 serial을 장기 보관할 이유를 별도 확인 |
| `deliveries.payload`, `delivery_jobs.message` 및 Gmail 보낸편지의 수신자·시리얼 포함 원문 | **30일 설계 승인**. 접수 완료는 `accepted_at`부터, 실패/취소는 운영자가 확인한 처리 종료 시각 `closed_at`부터 계산한다. `closed_at`은 아직 운영 스키마에 없으며, `failed_at`을 종료 시각으로 간주하지 않는다. `pending`/전송 결과 불명/분쟁은 해결 전 보류 | 현재 payload는 이메일·serial·entitlement를 함께 암호화한다. 이 전체를 지우면 재발송·주문 idempotency 검사가 깨짐. 아래 분리 설계 필수. Gmail 보관은 DB 파기와 별도 수동 처리 |
| `delivery_jobs`, `delivery_attempts`, `delivery_events`, `audit`의 불필요한 기술 상세 | 사건 발생 후 **90일 설계 승인**, 미해결 사건·분쟁·관계 보존은 보류 | 주문 공급 증거, 환불 차단, 발송 중복 방지 tombstone은 별도 분류. `accepted`는 메일 API 접수이며 수신함 도착 아님. 불명 전송은 만료 후 새 발송처럼 재시도 금지 |
| `mail_smoke_deliveries`, `mail_smoke_jobs`, `mail_smoke_attempts` | 시험 원문 **30일**, 불필요한 진단 상세 **90일** 설계 범위에 포함 | 운영자 본인 테스트이며 고객 사용권 부여가 아님. 동일 request_id 재발송 방지와 실제 송신 결과 구분 유지 |
| 협업 `users` / `rooms.snapshot` / `members` | 계정·공유 방 제공에 필요한 동안, 확인된 계정 삭제·방 종료 요청 후 처리하는 기준 제안 | 리그 보관 승인과 별개로 승인 필요. 방 소유권 이전/종료, 타인의 권리·공유 프로젝트와 사용자 로컬 사본을 먼저 분리 |
| 협업 `sessions`, `invites` | 로그아웃·만료·사용 한도 소진 후 다음 정리에서 제거하는 기준 제안 | session은 현재 7일 접근 유효기간이며 자동 파기가 아님. invite는 설정한 만료/사용 한도 검사만 있음. 현재 signOut은 해당 session만 삭제 |
| 협업 `commands.params/result/error` | 방 제공·변경 복구에 필요한 동안. 방 종료 확정 후 **30일은 별도 미확정 제안** | 명령 idempotency, `uncertain` 실행 복구, revision 충돌 검사에 사용. 30일 된 행을 일괄 지우면 오래된 명령이 다시 실행될 수 있음. 원문과 최소 중복 방지 식별자를 먼저 분리 |
| 운영자가 생성한 `.runtime/backups/*` 사본 | 백업 생성 후 **30일 설계 승인**, 수량 제한만으로 기간을 대체하지 않음 | 현재 스크립트는 회전/자동 파기 없음. DB·프로젝트·실행·업로드·선택 PDK가 포함됨. 삭제 요청 적용 목록을 별도 보관하고 복구 전에 재적용. 별도 법정 보존 사본은 목적·접근·기한을 따로 관리 |
| 제공자 PITR·장애/보안 사본 | **제공자 답변 대기**, 위 운영자 30일과 동일하다고 보지 않음 | Cloudflare, Google, Vercel 및 선택 AI/메일 제공자의 실제 상품·계약·로그 범위 확인. 기능 화면에서 삭제했다고 전체 시스템 파기 완료로 표시하지 않음 |

연령 확인 파일은 현재 해당 기기/브라우저의 edition별 최소 기록이다. 새 정책 재확인이나 사용자가 해당 앱 저장소를 제거할 때의 로컬 처리를 안내하고, 현재 서버 수집 기록처럼 보관기간을 작성하지 않는다. 사용자가 직접 보유하는 학습·회로 파일의 삭제권한을 운영 서버에 부여하지 않는다.

## 발송 원문을 먼저 분리해야 하는 이유

DB에는 이메일·시리얼 원문을 평문으로 저장하지 않는다. 그러나 `deliveries.payload`와 `delivery_jobs.message`는 **복호화 가능한 개인정보**이고, 준비/송신 중 메모리와 Gmail의 보낸편지에는 읽을 수 있는 내용이 존재한다. 암호화되어 있다고 파기 대상에서 제외하지 않는다.

현재 `issue()`는 기존 `delivery.payload.email`을 복호화하여 같은 주문의 수신자를 비교하고, `operatorDelivery()`는 같은 payload에서 시리얼을 다시 꺼낸다. 따라서 원문 30일 방침을 적용하려면 다음처럼 목적을 분리해야 한다.

1. 유효 사용권의 복구용 암호화 serial·entitlement는 사용권 제공 목적에만 보관한다.
2. 수신자 주소·렌더링한 발송 원문은 별도 payload로 분리하고 원문 기간을 적용한다.
3. 주문 재입력 비교에는 별도 최소 수신자 비교값을 검토한다. 해시/HMAC도 연결 가능한 개인정보이며 보존 근거·기간이 필요하다.
4. 원문 삭제 후 재발송은 새로 확인한 수신자와 명시적 운영 요청으로 처리한다. 과거 outbox를 `pending`으로 되살리지 않는다.
5. `delivery_id`, provider 접수 ID, 요청 중복 방지, 환불/회수 표식 중 필요한 최소 기록은 거래·사용권 목적과 연결해 관리한다. 원문과 같은 일괄 purge를 하지 않는다.

협업 명령도 같은 원칙이다. 설계 원문·응답을 줄이더라도 중복 명령을 다시 실행하지 않는 최소 표식과 미확정 작업 복구는 유지해야 한다. 현재 스키마의 외래키/불변 조건을 무시하는 삭제 SQL은 제안하지 않는다.

## 승인 기록과 완료 조건

`scripts/privacy-retention-policy.mjs`의 정책 `resistor-edu-operational-retention`, 버전 `2026-11-13.1`에 위 세 기간을 고정했다. 상태는 `owner_approved_design_only`, `effective_at:null`, `automatic_deletion_implemented:false`다. 시행일을 임의로 만들지 않았다. 별도 사용권·법정 기록, 불명 전송·분쟁, 관계 미분리, 제공자 관리 사본은 제외·보류한다.

완료 순서는 **설계 승인 완료 → 제공자 보관/국외 처리 확인 → 스키마·복원 검증 → 운영 적용 증거 → 공개 문구·시행일 일치**다. 현재 승인은 즉시 운영 데이터 삭제나 제공자 문의 발송 승인이 아니다. 정책·앱·사이트가 모두 이미 변경됐다고 표현하지 않는다. 관련 근거: [실제 소스 점검](privacy-operations-assessment-20261113.md), [현재 수동 절차](privacy-manual-operations-20261112.md), [제공자 문의 초안](privacy-provider-inquiries-20261113.md).

## 추가한 수동 검토 계획 모드

기존 `scripts/privacy-retention-plan.mjs --as-of YYYY-MM-DD`의 문의 해결 후 1년 검토는 그대로 유지한다. 새 `--scope operational`은 운영자가 분류한 **메타데이터만** 받아 수동 검토 목록을 만든다. 파일·DB·Gmail·백업을 조회하거나 변경하는 코드가 없고 삭제 명령도 없다.

```powershell
# 실자료가 아닌 합성 fixture로 검증한다.
node --test tests/privacy-retention-plan.test.mjs

# 운영자가 별도로 준비한 비공개 메타데이터만 stdin으로 전달한다.
# 예시 경로의 파일을 도구가 직접 탐색하지 않는다.
Get-Content -Raw -LiteralPath '승인한-비공개-대장.json' |
  node scripts/privacy-retention-plan.mjs --scope operational --as-of 2026-11-13T00:00:00.000Z
```

입력 대장은 `schema_version:1`, `edition:edu`, `authority:resistor-operational-retention`, `policy_version:2026-11-13.1`, 양의 `revision`, 최대 1,000개 `records`만 허용한다. 각 행은 다음 필드만 갖는다. 이메일·본문·시리얼·토큰·파일 경로는 허용하지 않는다.

| 필드 | 허용 값·의미 |
| --- | --- |
| `record_id` | 별도 대장 UUID. 실제 수신자·주문번호를 넣지 않음 |
| `category` | `dispatch_body`, `technical_detail`, `operator_backup` |
| `status` | 원문: `pending/sending/accepted/failed/canceled/review_required`; 기술 상세: `open/closed`; 백업: `in_progress/complete` |
| `accepted_at`, `closed_at`, `occurred_at`, `created_at` | Unix milliseconds 또는 `null`. 범주와 관계없는 시각은 `null`. `closed_at`은 운영자가 처리 종료를 확인한 별도 값이며 현재 outbox가 저장한다고 가정하지 않음 |
| `retention_basis` | `operational`, `statutory_hold`, `active_entitlement`, `unclassified` |
| `dependency_state` | `unknown`, `hold`, `cleared`. 원문 분리·중복 방지·복원 관계가 미확인/미완료이면 각각 `unknown/hold` |
| `dispute_hold` | 분쟁 보존 필요 여부 boolean |

`accepted`의 원문은 `accepted_at`, 실패/취소 원문은 `closed_at`, 종료된 기술 상세는 `occurred_at`, 완료 백업은 `created_at`을 기준으로 30/90일의 **24시간 경과**를 계산한다. 날짜만으로 같은 날 자정에 조기 검토하지 않도록 정확한 UTC 시각을 요구한다. 접수 시각은 수신함 도착 증거가 아니다.

보존 예외·미분류·분쟁·관계 미확인/보류·진행 중/전송 불명·미래 시각은 검토를 보류한다. 실패/취소에 종료 시각이 없으면 `closure_required`다. `review_due`도 삭제 판정이 아닌 운영자의 다음 검토 대상이다. `dependency_state:cleared`는 입력자의 주장으로서 도구가 스키마·실자료를 검증했다는 뜻이 아니며, 출력도 `dependency_claims_independently_verified:false`를 유지한다. 모든 출력은 `dry_run`, `execution_status:not_run`, `deletion_supported:false`, `deletion_performed:false`다. 실제 대장과 결과는 UUID가 포함된 비공개 운영 정보이므로 공개 저장소에 올리지 않는다.
