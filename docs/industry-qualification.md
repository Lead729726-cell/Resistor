# Resistor Indust — 전기적 검사와 제품 검증

공개 회로의 실제 엔진 검사, 상용 도구 연결, 고객 가치, 제조 승인은 서로 다른 근거가 필요합니다. 이 문서는 실행한 검사와 아직 확보하지 못한 외부 근거를 구분합니다. [미리 고정한 조건](evidence/industry-qualification/plan.json) · [실제 실행과 판정](evidence/industry-qualification/verification.json) · [저장한 검토 보고서](evidence/industry-qualification/layout-review.json).

## 실제 전기적 검사

공개 SKY130 물리 Miller OTA를 새로운 격리 작업 공간에 생성하고, 원본을 보존한 검토 사본에서 Magic DRC, Magic/Netgen LVS, Magic PEX를 실행합니다. 전기적 검사는 **OTA unity follower의 회로 전체 출력-입력 오프셋**입니다. 임의의 GDS 두 도형이나 두 트랜지스터의 Id/gm/Vth 매칭을 인증하지 않습니다.

| 조건 | 표본 | 검사 범위 |
|---|---:|---|
| TT · 27°C · 1.8 V | 추출 전/후 각각 32 | 활성화된 공개 local mismatch 모델, OP |
| FF · -40°C · 1.8 V | 추출 전/후 각각 32 | 같은 seed 시작값, OP |
| SS · 125°C · 1.6 V | 추출 전/후 각각 32 | 같은 seed 시작값, OP |

각 추출 후 실행은 실제 Magic RC 추출을 수행합니다. 이 3개 조건은 대표 조건이며 전체 PVT 조합이나 foundry 통계 수율을 뜻하지 않습니다. 1 pF 외부 부하·0.9 V 외부 bias의 한정된 follower fixture를 사용합니다. 시뮬레이션의 supply current도 원본 표본에 A 단위로 보존합니다.

실행 전에 예제 허용 기준을 모든 관측 표본의 `abs(Vout − Vin) ≤ 0.010 V`로 고정했습니다. 이는 제품/고객의 성능 사양을 대신하지 않습니다. 표본 평균·표본 표준편차·최대 절대 오프셋은 실제 값에서 계산합니다. 32개 표본을 모두 통과해도 검증되지 않은 분포의 tail/yield를 예측하지 않습니다. 전후에 같은 seed를 사용해도 추출된 회로의 소자 순서가 달라지므로 같은 seed의 각 표본을 같은 물리적 mismatch realization이라고 가정하지 않습니다.

### 검토 화면에서 연결

기존 시뮬레이션의 **SoC OTA follower mismatch**를 실행한 후보 프로젝트에서 **설계 의도 · 변경 검토 → 현재 후보 검사 · 비교 → 전기적 매칭 → 실제 미스매치 실행 기록으로 기준 채우기**를 선택합니다. 필요한 run ID, PVT, seed, 표본 수, 허용 전압을 확인하고 제약을 저장한 뒤 다시 평가합니다. 추출 전후 coverage가 부족하면 미평가입니다. 이 항목은 도형 선택을 비운 회로 전체 검사입니다.

```json
{
  "assessment": "ota_follower_offset",
  "run_ids": ["actual-pre-run-id", "actual-post-run-id"],
  "offset_limit_V": 0.01,
  "minimum_samples": 32,
  "seed": 729726,
  "conditions": [{"corner": "tt", "temperature_C": 27, "supply_V": 1.8}],
  "require_pre_and_post": true
}
```

위 run ID 자리는 실제 실행의 32자리 ID로 바꿉니다. 서버는 project/revision, 현재 모델·엔진, manifest identity/checksum, 활성 mismatch 설정, PVT, 모든 표본의 native OP 값·seed·파일 checksum을 확인하고 통계를 다시 계산합니다. 네이티브 실행 자체가 fail인 경우도 원래 상태를 보존하며, 검토 항목은 명시적으로 정한 별도 전압 기준을 판정합니다.

[실제 GUI 검사](evidence/industry-qualification/ui-verification.json)는 별도의 TT 4개 표본 전후 fixture로 실제 run ID 선택·전압 수치·판정·현재 보고서 저장·모바일 화면을 확인합니다. 이는 위의 192개 표본 검증과 별도이며 UI 검사 표본을 192개 측정에 합산하지 않습니다. [데스크톱](evidence/industry-qualification/electrical-desktop.png) · [모바일](evidence/industry-qualification/electrical-mobile.png).

1 µV 기준의 실제 위반, 누락된 post/PVT, 부족한 표본, 다른 프로젝트의 실행, 손상된 통계와 revision 변경을 검사합니다. 손상된 근거는 error, 오래되거나 부족한 근거는 not_run입니다. 과거 보고서는 checksum과 함께 보존하고 stale로 표시합니다. 검증 스크립트 끝의 후보 변경은 이 실패 경로를 시험하기 위한 것이며, 저장된 r1 판정을 r2에 재사용하지 않습니다.

## 상용 실행

등록된 Spectre·Virtuoso·agent profile의 실제 실행 파일/자원/접속을 다시 점검합니다. 사용자가 현재 라이선스 환경이 없다고 확인했으므로 **실제 vendor 실행은 unavailable / 미검증**입니다. 상용 실행 파일이나 라이선스를 대신 생성하지 않습니다.

[backend 경로의 34개 실제 검사](evidence/industry-qualification/backend-transport.json)는 공개 ngspice로 local 실행, 인증된 companion agent, 1 V / 1 kΩ의 실제 ±1 mA, 파일 checksum 전송, 중복 요청, 취소, 실패, 재시작, 소스 변경과 비밀 값 차단을 확인합니다. 이는 backend의 실행/전송 경로 검사이며 Spectre·Calibre 등의 실행 증명이 아닙니다. 자세한 연결 절차는 [상용 backend](commercial-backends.md)에 있습니다.

## 고객 가치

KLayout의 직접 Python 확장을 포함한 [14개 동일 기하 과제](evidence/industry-review/comparison-results.json)는 자동 판정의 정확도를 확인합니다. 준비/검토/인수인계 시간과 고객 효용은 실제 참여자가 없어 **미측정**입니다.

[실제 사용자 비교 계획](evidence/industry-qualification/customer-study.json)에 도구 순서 교차 배정, 같은 파일·공정·기준·교육 시간, 독립 정답, 누락·false pass·보고서 재열기·작업 시간과 원본 기록 조건을 고정했습니다. 오류가 난 세션도 보존합니다. 소규모 pilot 결과만으로 시장 우위를 주장하지 않습니다. 녹화와 참여자 기록은 동의를 받은 뒤 수집합니다.

## 제조 signoff 준비도

공개 DRC/LVS/PEX 통과는 확인했지만 **제조 승인은 불가**입니다. 실제 파운드리/공정과 승인된 deck/tool 버전, 필수 corner·RC·통계 모델, fill 이후 최종 DRC/LVS/PEX, 해당 공정이 요구하는 antenna/density·EM/IR·ESD/latch-up·신뢰성, package/IO/top 통합, waiver와 책임 검토자 및 파운드리 수락 기록이 아직 없습니다. [실행 기록의 manufacturing.gaps](evidence/industry-qualification/verification.json)를 다음 연결의 체크리스트로 사용합니다. 적용 여부와 허용 기준은 대상 공정/파운드리 문서로 결정해야 하며 일반 목록 자체를 signoff deck으로 취급하지 않습니다.

공개 SKY130의 현재 [공식 상태 문서](https://skywater-pdk.readthedocs.io/en/main/versioning.html)는 초기 설계 검증/시험 칩과 생산 사용을 구분합니다. 따라서 공개 모델·Magic 룰의 이번 통과를 고객 공정의 제조 signoff로 승격하지 않습니다. seed를 먼저 설정하고 회로를 다시 읽는 실행 절차는 [ngspice 42 공식 매뉴얼](https://ngspice.sourceforge.io/docs/ngspice-42-manual.pdf)의 Monte Carlo control 흐름을 따릅니다.

## 재실행

```sh
npm run tools:prepare
npm run tools:connect
npm run test:industry-qualification
npm run test:industry-electrical-ui
npm run test:industry-review
npm run test:industry-ui
npm run typecheck
```

Windows는 준비된 독립 ResistorEDA WSL을 사용하며 Docker가 필요하지 않습니다. Mac/Linux는 설치된 native Magic·Netgen·KLayout·ngspice와 공개 SKY130 자원이 필요합니다. 새 격리 프로젝트만 생성하고 기존 설계와 실행 중인 사용자 엔진을 교체하지 않습니다. 원본 run/manifest/log와 characterization 표본은 `docs/evidence/industry-qualification/runs/` 및 기록된 로컬 workspace에 있습니다. 고객 PDK나 비밀 키를 공개 자료로 복사하지 않습니다. 새 설치 파일의 발행/상용 실기기·silicon 검증은 이 소스 검사와 별개입니다.

화면 스타일만 다시 확인할 때는 `npm run test:industry-electrical-ui -- --reuse-native`로 해당 격리 프로젝트의 현재 실제 실행을 다시 읽습니다. 다른 revision이나 stale 결과를 재사용하지 않습니다. [Backend 원본 파일 checksum](evidence/industry-qualification/backend-files.json)도 별도로 보존합니다.
