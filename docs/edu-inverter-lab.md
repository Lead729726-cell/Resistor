# Resistor Edu CMOS 인버터 연결 실습

## 실행 가능한 첫 과정

`codex/resistor-edu`에서 **CMOS 연결 실습**을 엽니다. 공통 KLayout·ngspice와 실제 공개 SKY130 인버터를 사용합니다. 독립 EDA 엔진, P&R, 전체 아날로그 레이아웃 생성이나 표준 셀 자동 생성은 추가하지 않았습니다.

1. **새 인버터 실습 시작**으로 별도 프로젝트를 만듭니다. 기존 인버터를 사용할 때도 **현재 인버터의 사본으로 시작**을 선택합니다.
2. MN1/MP1의 A·Y·VPWR·VGND·body 연결을 회로도에서 봅니다. 레이아웃의 같은 net/pin 주석 후보를 선택해 위치를 관찰합니다. 공개 셀에는 직접 MOS `device_id` 대응이 없으므로 이를 LVS 통과나 정확한 MOS 영역으로 확정하지 않습니다.
3. **표시 적층 3D / 표시 적층 절단**에서 같은 도형을 봅니다. layer의 GDS 번호·입력 출처·표시 높이·실제 공정 높이 입력 여부를 확인합니다. 이 예제는 illustrative Z이며 실제 두께는 미입력입니다. Z 추가 배율은 1×, 분해 간격은 작업대에 별도 표시됩니다.
4. **변경 전 실제 해석**으로 5fF의 transient를 실행합니다. 완료된 실제 파형에서만 측정합니다.
5. **출력 부하 50fF → 부하 변경 적용 → 변경 후 실제 해석**을 실행합니다.
6. 두 run의 조건·revision과 10–90% 전이, VDD/2 지연을 비교합니다. 같은 KLayout 정규화 형상 지문·회로 지문·모델/엔진 식별 정보와 부하 외 조건이 일치해야 한 변수 비교를 제공합니다. 실제 native run의 `input_signature`로 모델 파일·룰·도구 바이너리·엔진 코드 변경도 확인합니다. 지문이 없거나 바뀌면 비교를 보류합니다. 현재 설계가 다시 바뀌면 이전 조건의 비교라고 표시합니다.
7. 사전·사후 개념 문항과 학생 설명을 작성해 **학생 설명·조건·결과 저장**을 누릅니다. 다시 실행하거나 **기록 다시 열기**로 조건·실제 run ID·입력 설명을 복원합니다. 저장은 교수자에게 제출하거나 정확성을 자동 평가하는 기능이 아닙니다.

## 실행 방법과 기존 데이터

Node.js 24, 해당 OS용 공개 native runtime을 사용합니다.

```sh
npm ci
npm run native:prepare
npm run dev:edu
```

기본 주소는 `http://127.0.0.1:5177/eda`입니다. 이미 다른 개발 화면이 그 포트를 사용하면 PowerShell에서 아래처럼 명시적으로 다른 포트를 선택합니다.

```powershell
$env:REGISTER_DEV_PORT='5187'
npm run dev:edu
```

검증에 사용한 화면은 `http://127.0.0.1:5187/eda`입니다. 기존 Codex Edu registry의 checkout이 현재 폴더와 일치하고 연결 대상의 product marker가 `resistor.edu`일 때 기존 Edu workspace를 재사용합니다. 일반 checkout에서는 `.runtime/editions/edu/workspace`에 새 workspace를 만듭니다. 다른 제품의 marker·엔진 포트는 거절합니다. Industry 프로젝트·설정·키를 복사하거나 덮어쓰지 않습니다.

이 PC의 개발 의존성은 공유 junction을 해제하고 Edu checkout에 따로 설치했습니다. 공개 native SDK는 동일한 검증된 runtime을 참조하며, 회로/실행 엔진의 소스를 따로 복제해 수정하지 않습니다. 공유된 `node_modules`가 있을 때는 설치 전에 연결 대상을 확인하세요.

## 실제 입력과 측정 정의

모델은 `sky130_fd_pr__nfet_01v8` / `sky130_fd_pr__pfet_01v8_hvt`, 공개 `inv_1`과 인접 tap 레이아웃입니다. TT·27°C·VDD 1.8V, VIN 0↔1.8V, 1ns 지연·100ps 전이·10ns 주기, 30ns transient·20ps 최대 step에서 ideal CLOAD를 5fF→50fF로 바꿉니다. CLOAD는 외부 testbench 소자이며 배선 PEX 값이 아닙니다.

측정은 기존 공통 waveform 분석 함수를 재사용합니다. 실제 비균일 시간 표본을 선형 보간하여 첫 완전 전이의 10–90%/90–10% 시간과 입력/출력 VDD/2 교차 지연을 계산합니다. 정의가 다른 원본 엔진의 평균 지연과 구분합니다. Q=C·ΔV에서 C는 F, ΔV는 V, Q는 C입니다. 이 수식은 이상 부하의 전하 관계이며 실제 MOS 전이 시간은 엔진 결과에서 확인합니다.

실제 검증 기록: [native.json](evidence/edu-inverter/native.json). 5fF/50fF에서 Y 상승은 약 **0.08129ns / 0.6818ns**, 하강은 **0.04289ns / 0.2629ns**였습니다. 두 조건 모두 1544개 실제 시간 표본을 사용했습니다. 값은 이 모델·조건·측정 정의에 한정합니다. 공통 공식·단위·기하 변환 검사는 기존 core 검사와 함께 수행합니다.

2026-10-14 초기 native.json 검증 시점에는 KLayout·ngspice만 있었습니다. 이후 Magic·Netgen을 독립 WSL에 설치하고 Edu·Indust에 공통 연결했습니다. [현재 설치·실행 결과](physical-tools.md)를 확인하세요. 아래 unavailable 상태는 초기 기록이며 원본은 보존합니다. DRC/LVS/PEX는 각각 `unavailable / unknown`, 시뮬레이션은 실제 개별 run 상태로 표시합니다. 시뮬레이션의 독립 기준이 통과해도 나머지 검증이나 제조 signoff를 뜻하지 않습니다. 공정 단면 생성·실측 두께/coverage·매칭 평가·전체 PVT와 배선 기생 변화는 이 최소 실습에서 실행하지 않습니다.

## 저장 형식과 호환성

기록은 Edu workspace의 `.runtime/education/<lesson UUID>.json`에 원자적으로 저장합니다. Git과 공개 사이트에 학생 데이터를 올리지 않습니다. schema 1, edition, project ID, 데이터 revision, 엔진 코드 지문·도구 버전, 공정 ID·버전, 입력 조건, 정규화 형상/회로 지문, run ID·상태·측정, 학생 입력, 열어 본 화면과 생성·저장 시간을 보관합니다. `purpose: qa` 기록은 검증 fixture이며 학생 제출물이 아닙니다.

동시 저장은 기록 version으로 충돌을 거절합니다. UI 체크나 화면 열기 이력이 엔진 PASS로 바뀌지 않습니다. 기존 schema 1 엔진에서 `Waveform.x_unit`이 없으면 실제 `Run.measurements.x_unit`을 읽습니다. 단위가 없거나 다르면 측정을 보류합니다. 초기 실습 기록의 형상·회로 지문은 현재 revision과 정확히 일치할 때만 보완하며, 과거 상태를 현재 형상으로 추정하지 않습니다. 실행 입력 지문은 해당 run ID·프로젝트·revision이 일치하는 원본 job에서만 복원합니다.

`learning.*`는 Edu 제품 경계의 Node 서비스입니다. 기존 native RPC·GDS/OASIS·프로젝트 bundle schema는 그대로입니다. Edu의 프로젝트 응답에 `edition`과 `product_context`를 덧붙이며, MCP 응답에는 기존 `result`와 함께 schema·edition·project ID·data revision·engine/process 식별 정보를 제공합니다. 확인할 수 없는 정보는 null입니다. 기존 48개 MCP 도구는 유지하고 Edu에서만 10개 실습 도구를 추가합니다. Industry에서는 실습 쓰기를 거절합니다.

## 판단과 평가 준비

설명은 **관찰 사실 → 적용한 규칙/모델 → 판단 근거 → 다음 실험** 순서를 따릅니다. 수치가 없으면 현재 알 수 없다고 표시하고 필요한 실제 run/PEX/모델 정보를 안내합니다. 이 안내는 결정적인 수학과 엔진 관찰입니다. 유료 AI를 호출하거나 AI가 숫자·PASS를 만들지 않습니다. 저장된 학생 입력과 자동 안내는 다른 필드이며, 학생 설명 정확성은 교수자 검토 대기입니다.

사전·사후 개념 답변, run 완료/화면 열기/설명 저장 이력과 시작·저장 시각을 수집할 수 있게 준비했습니다. 과제 완료율과 소요 시간은 원본 기록으로 분석할 수 있으며, 경과 시간은 활동 시간과 다릅니다. 설명 정확성·학습 효과는 실제 학생 사용자 평가가 필요합니다. 현재 `education_effect_proven: false`, `auto_grade: null`입니다.

아날로그 매칭·대칭·방향·더미·기생·주변 환경은 별도 고려 사항입니다. common-centroid와 더미는 목적과 조건을 가진 기법이며 항상 최적이라고 판단하지 않습니다. 대칭·간격의 기하 관찰과 공정·추출·통계가 필요한 성능 평가는 구분합니다. [ALIGN 제약 문서](https://align-analoglayout.github.io/ALIGN-public/notes/const.html).

디지털 표준 셀 라이브러리와 P&R은 다르며 배치·배선·타이밍/기타 최적화가 실제 흐름에 연결됩니다. 이번 과정은 기존 셀의 전기/물리 관계를 읽는 실습입니다. [OpenROAD 원문](https://github.com/The-OpenROAD-Project/OpenROAD/blob/master/README.md).

레이어 돌출과 실제 공정 입력을 구분하는 근거는 [KLayout 2.5D](https://www.klayout.de/doc/about/25d_view.html)와 공정 단계 `.xs`가 필요한 [XSection](https://klayoutmatthias.github.io/xsection/)입니다. 이 프로젝트가 두 도구의 기능을 새로 구현했거나 교육 효과를 입증했다고 주장하지 않습니다.

공정 자원은 설치된 public adapter [manifest](../adapters/pdks/sky130/manifest.json)의 파일·버전·모델/룰 범위를 사용합니다. 실제 설치된 두 TT MOS 모델의 Apache-2.0 헤더를 확인했으며, 배포 시 [외부 구성요소 고지](THIRD-PARTY-NOTICES.md)를 유지합니다. 공정의 모든 모델·룰·통계 자료나 제조 사용 권한을 이 실습만으로 확인했다고 표시하지 않습니다.

## 공통 수정 전달과 다음 단계

이 기능은 Edu 브랜치의 공통 UI/Node 모듈과 edition 정책으로 구현했습니다. `product-edition.json`은 별도의 Edu 기본 설정 커밋입니다. 엔진/수학 수정은 main에서 검증한 뒤 양쪽 브랜치로 전달합니다. 이번 공통 기능 커밋은 main/Industry에 cherry-pick할 때 Edu 기본 설정 커밋을 포함하지 않아야 합니다. 공유 엔진을 두 벌 만들어 따로 고치지 않습니다.

```sh
npm run test:education
npm run test:editions
npm run test:core
npm run build:edu
npm run test:education:native
```

앱의 실제 시작·pin 후보 선택·회로/3D/절단 이동·부하 변경·실행·비교·설명/개념 답변 저장·페이지 재시작 복원은 [UI 검증 기록](evidence/edu-inverter/ui-verification.json)에 남겼습니다. 390×844 화면에서는 표만 내부 스크롤하고 저장 버튼까지 접근됨을 확인했습니다. 입력한 설명은 명시적인 UI QA 자료이며 실제 학생 제출물이나 교육 효과 평가 결과가 아닙니다. Edu/Industry 빌드와 Windows Edu 설치 자료의 staging 및 번들 MCP 연결도 검증했습니다. 새 Edu 설치 파일의 공개 배포나 macOS 실제 실행은 이번 결과에 포함되지 않습니다.

다음 우선순위는 교수자용 과제·예제 패키지/결과 내보내기, 학생 사용자 평가, 실제 LVS로 확인한 소자 대응과 PEX 비교입니다. MOSFET·작은 아날로그/디지털 과정은 실제 모델·생성 도구의 범위를 확인해 확장합니다. 기존 CPU·ADC는 후속 참고 과정으로 유지합니다. 전체 상용 EDA 대체나 자동 아날로그 레이아웃을 완료로 표시하지 않습니다.
