# 통합 설계 UI

메인 화면의 **통합 설계** 버튼으로 엽니다. 패널을 열거나 탭을 바꾸는 동작은 worker 요청을 보내지 않습니다. 읽기·저장·실행·적용 버튼에서만 실제 API를 호출합니다. 다른 탭으로 이동해도 입력 초안과 시작한 PVT poll을 유지하며, 패널을 닫으면 poll을 정리합니다.

## PVT 일괄 해석

1. **실제 공급원 · 지원 범위 읽기**로 현재 해석 경로의 실제 공급원, corner와 지원 분석을 읽고 공급원을 선택합니다. 표시용 VDD 이름을 추정하지 않습니다.
2. Corner, 온도와 공급 전압 목록을 명시합니다. 최대 32개 Cartesian 조건을 지원합니다. Metric은 실제 Run.measurements key, waveform vector 또는 branch ID를 입력합니다. 누락 값은 `missing`으로 남습니다.
3. **원본 snapshot에 조건표 저장** 후 **저장된 조건 실제 실행**을 누릅니다. 저장과 실행은 분리되어 있습니다. 입력 초안이 저장된 조건과 다르거나 원본 revision이 오래되면 시작할 수 없습니다.
4. 각 조건의 실행·분석 상태, 실제 metric, min/max, constraint 최악 조건과 원본 revision을 확인합니다. 실패·취소·누락 조건은 전체 통과로 표시하지 않습니다. 실제 Run과 로그를 읽고 조건 CSV 또는 원본 JSON을 저장할 수 있습니다. CSV는 실제 숫자의 부호를 보존하고 수식처럼 시작하는 문자 metadata에만 작은따옴표를 추가합니다. 원본 metadata는 JSON에 그대로 남습니다.
5. 조건표 목록을 다시 읽어 기존 작업을 엽니다. 읽기 전용 사용자는 목록·상태·결과를 읽을 수 있고 저장·시작·취소는 비활성화됩니다.

## PDK 배선 보조

**실제 PDK 배선 규칙 읽기**는 실제 설치 resource hash와 지원 레이어의 최소 폭·간격·면적·grid를 표시합니다. 단일 레이어 Manhattan 경로만 지원합니다. 정수 DBU 끝점과 폭, 선택적 net metadata를 입력한 뒤 실제 도형으로 미리보기합니다.

충돌은 worker가 반환한 실제 shape ID로 표시합니다. 현재 로드된 scene에 해당 도형이 없거나 revision이 다르면 선택할 수 없습니다. 경로 SVG는 반환된 정수 좌표와 실제 충돌 도형을 사용합니다. 부분 scene 범위를 표시하며, 기하 미리보기는 원본 Magic deck DRC 통과를 의미하지 않습니다.

유효한 미리보기의 입력·revision·규칙 hash가 일치하고 확인란을 선택했을 때만 **명시적 배선 적용**을 누를 수 있습니다. 적용 후 새 revision과 실제 scene을 가져옵니다. 메인 화면에서 새 revision의 DRC를 별도로 실행하세요.

## 회로 template · 연결 탐색

지원 목록은 실제 `design.catalog` 응답입니다. 실제 parameters와 optional physical core 제한을 읽고 새 프로젝트 생성 확인란을 선택합니다. 회로만 지원하는 template의 빈 layout을 가짜 geometry로 채우지 않습니다. 공유 설계에서는 별도 로컬 template 생성이 비활성화됩니다.

**실제 연결 graph 읽기** / **회로 issue 검사**는 실제 회로의 net·pin을 해결합니다. net을 선택해 실제 device kind/model/pin/ID를 확인하고 현재 root 회로의 정확한 ID만 선택합니다. child cell ID를 root device로 추정하지 않습니다.

현재 layout에서 같은 net metadata를 가진 로드된 도형을 따로 표시합니다. 같은 이름은 전기적 추출이나 device 대응의 증명이 아닙니다. backend의 `layout_binding` 상태·이유, 부분 scene 범위와 실제 issue를 유지합니다.

## 검증

집중 테스트는 `tests/ui/integrated-tools.spec.ts`입니다. 실제 main worker checkpoint 이후 실행하며, JSON reporter로 전체 UI 결과를 덮어쓰지 않도록 `--reporter=line`을 사용합니다.

2026-10-01 실제 집중 테스트 3/3이 최종 43.8초에 통과했습니다. MOS TT/FF 실제 DC 전류와 CSV, 원본 변경 후 STALE gate, 실제 collision shape와 정수 배선 적용 r2 및 Magic DRC PASS, 빈 layout의 실제 RC 회로 생성·연결 선택·ngspice transient, VIN 1.2/1.8 V 두 조건의 실제 시정수 측정을 검증했습니다. 실제 UI의 시정수는 각각 약 10.000527 ns입니다. 이는 해당 조건·model·현재 구현 범위의 결과이며 상용 vendor/signoff 검증을 의미하지 않습니다.

1600×1000에서 1180×940 modal과 원본 결과를 시각 확인했습니다. 800×600에서도 modal 740×564와 고정 footer가 viewport 안에 있고 세 탭을 사용할 수 있음을 확인했습니다. TypeScript가 통과했고 browser 오류는 없었습니다. 최종 증거는 `docs/evidence/integrated-tools-ui.json`과 `register-integrated-*.png`, 원본 PVT/Run JSON 및 CSV입니다. 최초 기능 검증 3/3의 좁은 modal 화면은 별도 `packages/ui/qa/integrated-first-layout/`에 보존했습니다.
