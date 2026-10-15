# Resistor

**Resistor Edu · CMOS inverter 연결 실습**: 실제 공개 회로·레이아웃에서 출력 부하 하나를 바꾸고 ngspice 전후 파형·지연을 비교합니다. 학생 설명·조건·run·revision을 저장하고 다시 엽니다. [실행·측정 결과·지원 범위](docs/edu-inverter-lab.md).

**Resistor Edu / Industry**: 교육용과 전문 작업용을 브랜치·저장 폴더·Codex 작업 공간으로 나눕니다. Edu에는 8개 단계별 실습과 학습 기록·보고서를 추가했습니다. [구성·실행·MCP 연동](docs/product-editions.md) · [버전 선택](https://resistor-downloads.vercel.app/editions/). 현재 v0.27.0 설치 파일과 새 소스 버전을 구분합니다.

[전체 튜토리얼](https://resistor-downloads.vercel.app/tutorial/library/): 최근 설치·업데이트·편집 개선 35개 작업 흐름, 모든 template/가산기/CPU 59종과 계산기 18종을 실습으로 제공합니다. 포트·실제 하위 셀·입력·결과·오류 복구·원본 기록을 연결하고 기존 한국어 영상 3편은 촬영 버전 그대로 보존합니다. [구성·검증·갱신](docs/tutorial-library.md).

**v0.27 작업 흐름 개선**: 빈 회로도 시작, 이름·공정으로 프로젝트 열기, 50개씩 목록 표시와 키보드 대화창 이동을 지원합니다. **다음 실행**에서 준비 사항을 확인하고, 실행 목록·파형·로그를 같은 결과에 맞춥니다. 이전 결과의 원인을 표시하며 수치의 최신성과 기능적 PASS/FAIL을 구분합니다. [사용 안내와 실제 검증](docs/workbench-usability.md).

**v0.26 Docker 없는 로컬 엔진**: 설치 파일에 Python·KLayout·ngspice와 공개 SKY130 자료를 포함합니다. 회로·레이아웃 편집, GDS/OASIS 입출력과 실제 전압·전류 해석을 로컬에서 실행합니다. 전체 물리 도구는 Mac/Linux에 직접 설치하거나 Windows의 독립 WSL을 연결하며 Docker는 선택 방식으로 남습니다. [설치·전환·검증 안내](docs/native-runtime.md).

**v0.25 회로 작성·GDS 변환**: [빈 회로에서 값 입력·핀 연결·실제 해석](docs/schematic-quickstart.md), [GDS/OASIS 회로 역추출과 영역·핀 채널 규격 레이아웃](docs/gds-schematic-conversion.md)을 제공합니다. 변환은 미리보기 확인 후 새 revision으로 적용하며 DRC/LVS/PEX는 실제 별도 실행 결과를 표시합니다. 지원 PDK·소자와 flat graph 범위는 가이드에 명시합니다.

[2026 문헌 검토·셀/블록 업데이트](docs/literature-update-2026.md): 54개 회로 템플릿과 가산기·CPU 5종의 출처·적용·미재현 범위를 연결했습니다. 기본 셀 구동 크기·sensitized timing arc, OTA 보상 저항, LDO PSRR, SAR 리셋/변환 에너지와 ΣΔ CIC 응답을 실제 엔진 기록과 구분해서 제공합니다. 참고 문헌은 2025–2026년 자료를 중심으로 하며, 논문의 공정·칩 성능을 SKY130에서 재현했다고 표시하지 않습니다.

**v0.23 인터넷 업데이트**: 앱의 **업데이트** 버튼에서 새 버전 확인, 실제 다운로드
진행률, SHA-256 검사와 설치를 연결합니다. Mac·Linux는 기존 앱 백업·실패 복원을
지원하고 Windows는 검증된 설치 안내를 엽니다. 기존 프로젝트와 실행 중인 해석은
보존합니다. v0.22 이하에서는 새 설치 파일을 한 번 설치해야 합니다.
[인터넷 업데이트 사용법과 검증 범위](docs/online-updates.md).

v0.21은 고정 ×2/×8 분기와 전압 선택기를 사용하는 PGA, ABBA 입력쌍,
실제 OTA 잡음·소자 편차 검사와 비정상 동작점 차단을 추가합니다.
원본과 실제 PEX 조건표·실패 이력·재현성 기록은
[아날로그 SoC 예제](examples/analog-soc/README.md)와 [검증 절차](docs/analog-soc.md)에서 확인합니다.
Mac 설치 ZIP은 두 CPU의 네이티브 뷰어·메뉴·재실행·데이터 보존 검사와
실제 파일 해시를 연결하여 공개합니다. Apple 공증·Mac Docker EDA·제조 승인은 별도 검증입니다.

제품 이름은 저항을 뜻하는 **Resistor**입니다. 0.16.1부터 앱·설치 파일·바로가기의 이름을 Resistor로 통일합니다. 이전 Register 배포본의 파일과 검증 기록은 그대로 보존합니다. 기존 설계·설정은 이전 앱의 저장 경로를 계속 사용하며, 프로젝트 ZIP과 해석 결과 형식도 유지합니다.

다운로드: https://resistor-downloads.vercel.app/

[0.20 아날로그 SoC 센서 입력부 · 7개 매크로](docs/analog-soc.md): 바이어스·캐스코드 미러·Miller OTA·PGA·2극 필터·TIA·클록 동기 AFE를 제공합니다. 실제 SKY130 레이아웃과 nominal DRC/LVS/PEX/pre/post 결과, 18조건 corner sweep의 통과와 실패를 함께 제공합니다. 완성 SoC와 제조 승인은 별도입니다.

[1080p 한국어 사용 가이드 · 7분 7초](https://resistor-downloads.vercel.app/tutorial/):
실제 앱 조작으로 CMOS 인버터, 전압·전류 파형, 신호 시험, DRC/LVS와 GDS 뷰어를
따라갑니다. 10개 챕터, 한국어 음성·자막과 실습 프로젝트를 제공합니다.
촬영 화면은 이름 변경 전 Register 0.16.0이며 현재 제품명은 Resistor입니다.

[0.17.0 물리 설계 라이브러리 · 14개 실습](examples/physical-library/README.md):
INV, NAND2, NOR2, AND2, OR2, XOR2, XNOR2, MUX2와 LDO, DC-DC, VCO, PLL, OTA, 비교기의
실제 SKY130 PCell·접촉·배선을 제공합니다. 14개 모두 Magic DRC·Netgen LVS·Magic PEX를
실행했고, 기생 후 이름 있는 동작 기준은 13개 통과했습니다. PLL의 잠금 FAIL과 원본
파형은 보존했습니다. TT/27°C/1.8V 및 typical RC 범위이며 제조 승인은 별도입니다.

[기본 셀 제작 영상](https://resistor-downloads.vercel.app/tutorial/physical-logic) ·
[6개 칩 물리 설계 영상](https://resistor-downloads.vercel.app/tutorial/physical-chips) ·
[설계·파형 모음](https://resistor-downloads.vercel.app/references/).
실제 앱 조작을 녹화한 1080p 한국어 음성·자막 영상과 셀별 제작 절차, 편집 프로젝트,
GDS/OASIS, 회로, 원본 검사·추출 보고서와 전후 파형을 제공합니다.
기존 회로 전용 레퍼런스는 아래와 같이 보존합니다.

[칩 설계 포트폴리오 레퍼런스 6종](examples/chip-portfolio/README.md): PLL, LDO,
2:1 switched-capacitor DC-DC, VCO, OTA와 비교기를 실제 SKY130 모델로 해석했습니다.
최신 소스 앱의 **프로젝트 도구 → 내 반도체**에서 생성할 수 있습니다.
계층 회로·프로젝트 ZIP·파형 CSV·그림·PVT 보고서를 제공하며 레이아웃과 제조 검증은
미실행입니다. 기본 TT는 6종 모두 해당 파형 기준을 충족했고 PLL의 SS/FF 잠금 실패도
함께 기록했습니다.

전자공학 계산기와 회로·레이아웃·시뮬레이션을 연결하는 오픈소스 작업공간입니다.
계산은 결정적인 수학 로직으로 수행하며, EDA 결과는 실제 해석 엔진의 수치와
설계 revision을 함께 표시합니다. A deterministic electronics calculator hub and
integrated schematic, layout, waveform and 3D inspection workspace.

[기여 방법](CONTRIBUTING.md) · [변경 기록](CHANGELOG.md) ·
[구조](docs/architecture.md) · [공개 소스 범위](docs/open-source.md) ·
[MIT 라이선스](LICENSE) · [외부 구성요소 고지](docs/THIRD-PARTY-NOTICES.md)

**Precision Workbench**: 차콜 기본 화면, 목적별 도구 메뉴, 접을 수 있는 기존 작업
영역, 실제 job의 상태·오류·로그·결과 파일 위치를 정돈했습니다.
[화면 사용법과 검증 범위](docs/precision-workbench.md).

**새 프로젝트 → 빈 SKY130 레이아웃 → Layout 2D**에서 사각형을 드래그해 만들 수 있습니다.
R/P/W로 사각형·다각형·Manhattan 배선, M/C로 이동·도형 복사,
오른쪽 속성에서 사각형 좌표·레이어·Net을 µm/DBU 단위로 수정합니다.
삭제·Undo/Redo와 격자·잠금 보호를 지원하며, 미저장 미리보기와 실제 검증 상태를 구분합니다.
회로도 소자의 미리보기·반복 배치·회전·반전도 유지합니다.
[그리기 도구 사용법](docs/drawing-tools.md) · [실제 편집 검증](docs/evidence/layout-editor/native.json).
**F1 / ? / Ctrl·⌘+/**로 화면별 단축키를 검색할 수 있습니다.
[전체 단축키 표](docs/shortcuts.md)에는 회로도 소자 배치, 격자 이동, 화면 전환과 입력 보호가 정리되어 있습니다.

v0.15는 로컬 Ollama / OpenAI 설계 검토, 근거·비용·승인 표시, 저장된 검토 재개방,
실제 도형에 따른 장애물 우회 후보, 16–64사이클 CPU 검증과 실제 VDD 전류·에너지
측정을 추가합니다. AI는 검사 제안이며 엔진 검증 결과와 구분합니다.
[설정과 검증 범위](docs/design-assistant.md) · [직접 만든 CPU 예제](examples/cpu4-assistant/README.md).

[운영체제별 다운로드](https://resistor-downloads.vercel.app)에서 Windows x64 EXE,
Mac Apple Silicon ZIP, Linux x64 tar.gz를 받을 수 있습니다. 설치 파일은 GitHub
Releases가 전달하며 SHA-256과 검증 범위를 표시합니다. Mac과 Linux는 **preview**이며
일반 데스크톱 실기기 실행은 미확인입니다. Apple Developer ID/notarization도 미완료입니다.

v0.16은 16비트 ACC/ALU, 4비트 PC, 16×18비트 ROM을 갖는 CPU와 16비트 가산기를
추가합니다. LOAD/ADD/AND/XOR, 상위 비트, 오버플로, Carry/Zero와 리셋을 실제
ngspice로 검사합니다. [직접 만든 CPU16과 검증 기록](examples/cpu16/README.md).
16비트 가산기는 70개 지정 입력을 검사하며 2³³ 조합의 전수 검사는 아닙니다.

## SAR ADC와 칩 영역 제한 · v0.22

8비트 SAR의 샘플링·256개 동일 단위 CDAC·비교기·합성 제어기를 편집 가능한 8개 블록으로 추가했습니다. 실제 ngspice 비교기 판단을 RTL·gate·CMOS graph로 대조합니다. 새 UI template는 기본 1 mm² 영역으로 여러 줄 배치하며, 영역을 넘는 도형·계층·파일 변경은 저장 전에 차단합니다. 기존 프로젝트는 보존됩니다.

[사용법·공식·지원 범위](docs/sar-adc.md) · [실행 기록](examples/bounded-sar/evidence.json). 전체 ADC의 물리 제어기 타이밍, ENOB와 제조 승인은 별도입니다. 8개 bounded 레퍼런스의 실제 DRC/LVS/PEX/pre/post 40/40과 259개 입력 검사가 통과했습니다. 배선 후 SAR은 최대 1 LSB 오차·모호한 판단 0개입니다. Windows/Linux 및 Apple Silicon/Intel Mac 설치 파일을 제공하며 Mac 두 아키텍처의 native CI가 각각 4/4 통과했습니다. v0.21 기록과 원본 프로젝트도 보존합니다.

## 소스에서 시작하기

Node.js 24와 Git이 필요합니다. 기본 앱과 EDA 엔진은 Docker 없이 실행합니다.

```sh
git clone https://github.com/Lead729726-cell/Resistor.git
cd Resistor
npm ci
npm run dev:calculators
```

브라우저에서 http://127.0.0.1:5173 을 여세요. EDA 설계·해석에는 Linux 컨테이너를
사용하는 네이티브 엔진을 준비합니다. `npm run native:prepare` 후 `npm run doctor`로 설치를 확인하고
`npm run dev:web`으로 웹 EDA, `npm run dev`로 Electron 앱을 실행합니다.
첫 엔진 이미지 다운로드에는 시간과 저장 공간이 필요합니다.
[설치 안내와 Mac 검증 범위](docs/desktop-installation.md)를 확인하세요.

다운로드 사이트는 [Vercel 고정 주소](https://resistor-downloads.vercel.app)입니다.
EDA 엔진과 사용자 설계 서버는 로컬에서 실행합니다.

![Precision Workbench · EDA](docs/evidence/precision-workbench/eda-dark.png)
![전압 분배 계산기](docs/evidence/precision-workbench/calculator-dark.png)
![EDA 전압·전류 및 신호 시험](docs/evidence/eda-signal-flow-digital.png)

## 구조와 검증

| 경로 | 역할 |
| --- | --- |
| `packages/calculators` | 공식, 단위 변환, 예제 및 입력 검증 |
| `packages/ui`, `apps/web`, `apps/desktop` | 공통 웹 화면과 Electron 앱 |
| `packages/analysis`, `packages/viewer` | 파형·전압/전류 검사와 2D/3D 표시 |
| `workers/eda`, `adapters` | 실제 EDA 엔진, PDK 및 파일 호환 |
| `platform/cloud` | 권한·revision을 검사하는 공동 작업 서버 |
| `tests`, `docs/evidence`, `examples` | 자동 검사, 조건별 기록 및 설계 예제 |

```sh
npm run test:core
npm run typecheck
npm run build
npm run audit:source
npm run check:docs
```

GitHub CI는 엔진 없이 실행하는 공통 검사를 수행합니다. 실제 ngspice·DRC·LVS·PEX,
브라우저 동작과 Mac 앱 검사는 별도의 환경이 필요합니다. 구현과 검증의 범위는
[현재 상태](docs/implementation-status.md), [시험 안내](CONTRIBUTING.md),
[전압·전류 흐름 시험](docs/signal-flow.md)에 기록합니다.

기존 EDA는 `/eda`에서 사용할 수 있습니다. 시뮬레이션 결과의 **Waveform lab**은
A/B 커서·구간 통계·RMS·적분, 전이 시간·지연, 전압/전류 연산과 전력·에너지,
출처를 포함한 CSV/JSON 저장을 제공합니다.
[공식과 사용법](docs/waveform-lab.md) · [수치 검사](tests/waveform-analysis.test.ts).

## Electronic Engineering Calculator Hub

Resistor는 전자공학에서 반복되는 계산을 빠르고 정확하게 수행하는 오픈소스
engineering utility hub로 확장 중입니다. 루트 웹 화면은 회원가입 없이 바로 쓰는
계산기 허브이며, 기존 EDA 작업공간은 `/eda`에서 유지합니다.

현재 계산기 허브는 다음 표준 구조를 공유합니다.

- Inputs: 명확한 label과 SI 단위 입력
- Formula: 사용 공식과 reference equation 표시
- Result: 주요 결과를 가장 크게 표시
- Explanation: 결과의 의미를 짧게 설명
- Validation: 0, 음수, 불가능한 전압 등 invalid input 차단
- Examples: 실제 engineering 예제와 QA fixture 공유

지원 계산기:

- resistor color code, resistor series, series/parallel resistance
- voltage divider, LED resistor, power dissipation, Ohm's law
- RC, RL, RLC, capacitor calculator
- ADC/DAC resolution, op-amp gain, dB conversion
- frequency/period, engineering unit converter

공식 코어는 `packages/calculators/src/index.ts`에 있고, QA는
`tests/formulas/`에서 reference equation, known values, edge cases, unit conversion
fixture를 검증합니다.

```powershell
npm run test:formulas
npm run build
```

## v0.14 · Apple Silicon과 Intel Mac 지원

최신 r3 ZIP에는 Precision Workbench, 두 CPU 공통 설치 도우미, Docker 없는
뷰어 설치, 설치 실패 시 기존 앱 복원 및 읽기 전용 오류 진단을 포함합니다.
`npm run package:mac:release`로 두 CPU용 ZIP을 생성합니다.
[r3 검증 기록](docs/evidence/mac-preview-release.json)은 구조·자체 서명·설치 절차
검증이며 실제 Mac 실행 인증은 별도입니다. main에 관련 소스를 푸시하면
macOS workflow가 두 CPU에서 실제 설치 위치 실행·데이터 보존까지 검사합니다.

두 Mac CPU용 앱/ZIP 생성 경로, Finder에서 Docker 탐색, Mac 메뉴와 ⌘ 단축키,
앱 외부 저장 폴더 및 기존 파일 보존을 추가했습니다. 실제 Mac의 offline viewer
검증과 선택 가능한 5단계 native EDA 검증을 준비했습니다.
Mac 바이너리/ZIP 구조 검증은 실제 Mac 실행·서명·공증을 대신하지 않습니다.
[설치 방법과 플랫폼별 검증 범위](docs/desktop-installation.md)를 확인하세요.

## v0.13 · 실제 검증 흐름과 설치 진단

`통합 설계 → 회로 → 물리 검증`에서 회로 해석·DRC·LVS·PEX·RC 포함 해석을
순서대로 실행합니다. 실패·취소·설계 변경이 있으면 다음 단계를 중단하고, 실제
run ID와 조건을 담은 검증 기록을 저장합니다. 전가산기의 5단계 native 실행과
pre/post 8개 입력을 앱 화면에서 확인했습니다.

Docker 누락·Linux engine·workspace 연결·인증 상태를 진단하고 재연결하거나
독립 GDS 뷰어를 열 수 있습니다. [검증·설치 진단·Mac 준비](docs/validation-workflow.md).
Windows 설치본은 `release/installers/Register-0.13.0-win-x64.exe`, 별도 실행본은
`release/0.13.0/Register-win32-x64/Register.exe`입니다. 서명되지 않은 개발 설치본입니다.
Mac의 `.app`·DMG 생성 및 실제 뷰어/시작 진단 검사는 Mac에서 실행하는 workflow를
준비했습니다. 실제 Mac 실행·서명·공증과 상용 vendor 도구 실행은 아직 미검증입니다.

가산기·작은 CPU·계층 복사/영향 미리보기/승인/Undo·Redo 및 녹화는
[직접 만든 설계와 작업 기록](examples/cpu4/README.md)에 있습니다.
배선 저항/용량을 포함한 CPU 결과는 회로 해석 결과와 조건을 구분해 공개합니다.
이전 0.12 대형 작업물은 로컬 `examples/history/`에 보존하며 소스 Git에서는 제외합니다.
소스 공개와 서비스 인터넷 배포는 별도로 진행합니다.

2026-10-02 개발 추가: **내 반도체 → 미리 만들어보는 내 반도체**에서 CMOS·MOS 특성·
MUX4·전류 기준·차동 센서·증폭기·신호 필터 8개 시작 설계와 운전 조건을 선택합니다.
회로·지원 물리 레이아웃·testbench를 함께 저장하고 실제 해석을 실행합니다.
SKY130은 시작 설계에 연결되어 있고 GF180·IHP는 공정 특징 비교용입니다.
[시작 설계 사용법과 실제 검증](docs/semiconductor-starters.md).

2026-10-02 개발 추가: 프로그램을 직접 사용해 공개 SKY130 **4:1 MUX**를 제작했습니다.
20개 MOS·물리 배선, 실제 64개 진리표, DRC/LVS/PEX, pre/post 해석과 전류 뷰어를
연결했습니다. 20ns 기본/느린 조건은 pre/post 64/64, 5ns post-layout은 56/64 실패를
보존했습니다. [설계 파일·직접 사용 검증·한계](examples/mux4/README.md).
현재 0.13 Windows 설치본에 포함되어 있습니다.

## v0.11 · 공정 시퀀스 실행

공정 3D에서 속도 기반 3D 증착·식각·CMP를 순서대로 계산합니다. Conformal/방향성
증착, ray 가림·국부 단일 재방출, 재료별 선택적 isotropic/방향성 식각, Preston/plane
CMP, GDS polygon/hole mask, 초기 tetra 결과 재사용, h·2h 비교와 평면 측정 속도 fit을
지원합니다. 단계별 공극/체적/표면 높이, 모든 시작 표면의 피복/미해결 박막과
전체 history·표준 VTU를 저장하고 다시 읽습니다.
Node 서버 엔진과 Windows 패키지를 포함합니다. 속도 기반 형상 계산이며 보정된 장비
화학·소자 coupled TCAD 및 foundry signoff와 구분합니다.
[설정·모델·한계·CLI 사용법](docs/process-simulation.md).

공개 SKY130 PDK를 실제 ngspice·KLayout·Magic·Netgen·Xschem에 연결하는 회로/레이아웃 설계 프로그램입니다. Windows 데스크톱, 브라우저, Linux 공동 작업 서버를 제공합니다. 정수 DBU 원본과 3D 표시 높이를 구분합니다.

v0.10: **공정 3D**에서 위치별 XYZ 체적·국부 두께를 읽고 소자·홀·단차 및 다층
금속/절연막을 검토합니다. 재료별 기준, XYZ 단면, 전량 두께/피복 검사, 명시된
공극 연결성, 위험 위치 선택과 JSON/CSV/PNG 및 portable bundle을 제공합니다.
교육 예제와 실측/해석 입력을 구별하며 공정 물리 예측을 실행한 것으로 표시하지
않습니다. [공정 3D 검토 사용법과 범위](docs/process-topography.md).

v0.9: 새로운 **회로형 R 로고**와 **스타일** 설정을 제공합니다. 다크·라이트·시스템
모드와 그래파이트·제이드·코퍼·아이리스 4개 스킨을 설계 화면, 독립 뷰어, 설정 패널,
파형 및 3D 배경에 적용하고 선택을 자동 저장합니다. [화면 스타일 사용법](docs/appearance.md).

v0.3: **Start-Viewer.cmd** 또는 `Register.exe --viewer`로 Docker와 로그인 없이
GDS만 열 수 있습니다. `.lyp` / JSON PDK layer와 공개 SKY130 표시 profile을 적용하고,
실제 OP/DC/transient의 전류 방향·벡터·수치를 뷰어에서 확인합니다.
[GDS / PDK / 전류 사용법](docs/viewer-current.md)에 파일 형식과 대응 범위가 있습니다.

v0.4: **PDK·해석 설정**에서 기술·모델 profile 입력, 실제 GDS 추출 포트 검사,
접지·전원·공정 코너·해석 조건 저장과 실행을 연결합니다. 설치 PDK 경로 또는
manifest/ZIP를 입력하고 각 리소스와 해시를 검사합니다.
[PDK 설정 절차](docs/pdk-setup.md)에 필요한 입력과 호환 범위가 있습니다.

v0.5: **상용 Backend**에서 Virtuoso·Custom Compiler·Assura·IC Compiler 계열 등
17개 상용 도구의 native recipe를 등록하고 로컬 또는 별도 인증 에이전트에서 실행합니다.
설정·로그·취소·출력 다운로드·GDS/OAS 반입과 전류 결과 표시를 연결했습니다.
현재 상용 도구는 설치되지 않았으며 실제 vendor 실행은 미검증입니다.
[설치 후 연결 절차](docs/commercial-backends.md)에 버전별 설정과 결과 형식이 있습니다.

v0.6: **EDA 파일 호환**에서 실제 GDS/OAS·LEF/DEF, Cadence ASCII 기술/표시·stream map,
라이브러리 정의, CDL/SPICE와 외부 해석 결과를 가져옵니다. 도구 연결 설정과 별도로
레이어·회로 metadata를 읽고 native 설계를 반입/내보내며 signed 전류를 표시합니다.
[파일 호환 절차와 범위](docs/eda-interchange.md)에 형식별 구현과 검증 범위가 있습니다.

v0.7: **원본 DB 읽기**에서 고정된 native API query와 실제 source/cell/view 진단,
불변 graph receipt, 원본 무변경/해시 검사 및 새 revision 반입을 제공합니다.
상용 실행 파일·SDK는 아직 없으므로 실제 vendor 실행은 미검증입니다.
**설계 검토**에는 도형/net/cell 검색, 정수 거리 측정, 북마크, 범위가 명시된 Scene
변경 비교, signed 전류/파형 CSV가 있습니다.
[원본 DB 절차](docs/native-database.md) · [설계 검토 사용법](docs/design-review.md) ·
[추가 개발 목록](docs/development-roadmap.md).

v0.8: **통합 설계**에서 실제 전원 연결을 선택해 PVT 조건표를 저장하고,
조건별 ngspice 결과·최악 조건·제약과 로그를 비교합니다. PDK 규칙과 원본 도형을
확인하는 Manhattan 배선 미리보기/적용, 연결된 아날로그 회로 템플릿과 실제
pin/net 연결 탐색을 제공합니다. 회로 템플릿의 미생성 레이아웃, 부분 연결 정보,
물리 검증 결과를 구분합니다. [통합 설계 절차](docs/integrated-design.md).

## 실행

현재 설치 파일은 Docker 없이 실행합니다. 소스에서는 `npm run native:prepare` 후 앱을 실행합니다. 전체 물리 도구와 기존 Docker 전환은 [네이티브 엔진 안내](docs/native-runtime.md)를 참조하세요. 기존 `.runtime/eda` 작업은 보존됩니다. 앱은 첫 설계 요청에서 전용 EDA worker와 공동 작업 허브를 시작합니다. 독립 뷰어는 해당 서비스를 시작하지 않습니다.

```powershell
cd Resistor
npm ci
npm run doctor
npm run dev
```

브라우저 개발은 `npm run dev:web` → http://127.0.0.1:5173, 협업 허브는 `npm run cloud:start` → http://127.0.0.1:18766 입니다. 빌드/패키지는 `npm run build`, `npm run package`입니다.

## 구현 기능

- 회로도: 소자·배선·접점·계층 블록·pin/net 편집, SPICE 및 실제 Xschem 생성 netlist, testbench.
- 레이아웃: box·polygon/holes·path·label·pin·cell·instance/array·회전/반사·복사·이동·삭제·undo/redo·공개 via helper, GDS/OASIS 및 immutable bundle.
- 2D/3D: 같은 stable ID, visibility/lock/projection/explode, holes를 유지하는 절단면, hierarchy focus, PNG/GLB 표시용 export, 정확한 영역 제한 표시.
- 실제 해석: DC/AC/OP/tran, TT/FF/SS·온도·전압 설정, 독립 DRC/LVS/PEX/post-layout, 로그·raw·파형·측정·전후 비교·STALE.
- [전압·전류 흐름 및 신호 시험](docs/signal-flow.md): 실제 넷 전압·signed 단자 전류·ΔV 재생, 입력→출력 논리/아날로그 구간 PASS/FAIL, 출처를 포함한 JSON.
- 공개 예제: MOSFET, CMOS 인버터, 배선, 전류 미러, 차동쌍. 각 physical template의 검증은 개별 기록됩니다.
- 최적화: seeded grid/random/TPE, 후보별 실제 PCell→DRC→LVS→ngspice, feasible-only 점수, trial/시간/동시 실행 상한, 취소 및 후보 비교.
- 공동 작업: 계정/권한/초대, 실제 설계 복제와 동시 편집, 충돌 보존 및 중복 명령의 1회 처리, 선택/커서/revision/job 공유, 실제 파일 업로드/다운로드, 후보 복사.

공동 작업 패널에서 가입/로그인하고 현재 프로젝트를 공유하거나 새 공유 설계를 만든 뒤 Editor/Viewer를 초대합니다. 원격 모드에서 편집은 서버 권한/revision 검사를 거칩니다. 로컬 원본은 유지합니다. 자세한 Linux/HTTPS/영구 볼륨/백업 구성은 [서버 안내](docs/cloud.md)에 있습니다. 유료 Supabase 생성은 사용자가 보류했으며 인터넷 호스팅은 아직 개설하지 않았습니다.

## 검증과 AI 연동

```powershell
npm test
npm run test:viewer
npm run test:importer
npm run test:pdk
npm run test:pdk-cloud
npm run test:pdk-backup
npm run test:backend
npm run test:backend-cloud
npm run test:interchange
npm run test:interchange-cloud
npm run test:database
npm run test:database-cloud
npm run test:pvt
npm run test:design-tools
npm run test:integrated-cloud
npm run test:cloud
npm run test:mcp
npm run test:integration
node tests/integration/physics.mjs
node tests/integration/native-extended.mjs
node tests/integration/extensions.mjs
node tests/integration/optimizer.mjs
npm run test:ui
```

실제 engine 테스트는 Docker worker가 필요합니다. UI 검증은 패키지 및 개발 서버를 사용합니다. 증거는 `docs/evidence`와 `packages/viewer/tests/evidence`에 있습니다. [AI/MCP 도구](docs/agent-integration.md)는 실제 typed transaction/job/experiment를 노출하고 외부 유료 AI API를 호출하지 않습니다.

[구현 상태 및 제약](docs/implementation-status.md) · [검증](docs/verification.md) · [구조](docs/architecture.md) · [PDK](docs/pdk-integration.md) · [라이선스](docs/THIRD-PARTY-NOTICES.md)

## 8-bit Sigma Delta ADC

[19개 전체 하위 블록과 편집 예제](examples/sigma-delta8/README.md): 실제 SKY130 모듈레이터와 CIC2 ×256 디지털 필터. 1MHz / 3.90625kS/s, 8-bit CODE + VALID, 실제 SPICE/RTL/gate 비교와 coherent SINAD/ENOB. TT·27°C·1.8V·0.6V 진폭에서 측정 ENOB 7.34bit이며 8 ENOB·마스크·제조 승인을 주장하지 않습니다. `npm run test:adc`는 수식·단위·reset·포화·계층·실제 RTL/gate API를 검사합니다. [공개 ADC 가이드](https://resistor-downloads.vercel.app/tutorial/sigma-delta8/) · [예제 ZIP](examples/Resistor-Sigma-Delta8-Library.zip).

## Resistor Edu 과제 자료

**AI 자율학습**: 저장된 64개 문제를 즉시 풀고, 수치·선택 문제는 공통 수식으로 무료 채점합니다. 새 AI 서술형 세트와 동일 답안 피드백을 재사용하며 비용 상한·개별 호출 승인을 적용합니다. [사용법·저장·연결·검증 범위](docs/edu-self-study.md).

교육용 브랜치에는 72개 과제, 40개 학생 레퍼런스, 10개 수업 경로와 교수자/학생 ZIP 38개가 있습니다. 앱의 교육 실습에서 검색·새 사본·실제 실행 증거·원본 설명 저장을 사용합니다. [교수자/학생 자료 가이드](docs/edu-assignment-packages.md)를 참고하세요. 자료 준비는 학습 효과나 제조 검증을 의미하지 않습니다.

기본 CMOS 블록을 회로도에서 배치·연결하고 실제 OP를 실행하는 [로직 조합 안내](docs/logic-composition.md)를 확인하세요. [동적 신호·지연 실습](docs/logic-transient.md)은 PULSE/PWL 입력, 실제 ngspice transient, 주기별 논리·지연 한도, revision과 저장된 기준을 연결합니다.
