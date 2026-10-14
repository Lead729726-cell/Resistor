# Resistor v0.27.0 전체 실습 안내

[튜토리얼 라이브러리](https://resistor-downloads.vercel.app/tutorial/library/)

112개 실습. 학습 완료 표시는 엔진 PASS가 아닙니다. 과거 실행은 source/run/조건별로 보존하며 가져온 프로젝트에서 다시 실행합니다. 기존 실제 영상 3편을 보존한 문서 갱신입니다. 새 연속 영상은 제작하지 않았습니다.

## 내 반도체 · 공정·역할·운전 조건으로 시작

준비된 시작 설계와 실제 지원 PDK·운전 조건을 골라 새 프로젝트를 만듭니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/semiconductor-starters/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/semiconductor-starters.md)

시작 조건:

- 설치·기본 엔진·공개 SKY130 자료

1. 내 반도체 → 공정 특징 살펴보기에서 실제 설치 상태와 시작 설계 연결을 읽습니다.
2. 원하는 회로 역할을 선택합니다. CMOS/MOS·MUX·RC 등 준비된 8개 시작 설계와 확장 칩 라이브러리를 확인합니다.
3. 기본·저전압 고온·빠른 코너 저온 중 지원 운전 조건을 선택합니다. 해석·VDD·corner·온도·부하를 실제 값으로 읽습니다.
4. 설계 이름을 지정하고 이 설정으로 설계 시작을 누릅니다. 새 회로·지원 물리 도형·testbench가 별도 프로젝트에 저장됩니다.
5. 생성 후 실제 해석도 실행하기를 선택했다면 실제 run을 엽니다. 생성만 했으면 해석을 따로 실행합니다.

확인 결과와 한계:

- 공정 목록의 참고/예측 자료와 설치·검증된 profile을 구분합니다.
- 기존 프로젝트는 보존합니다. 초기 물리 도형 없음은 DRC/LVS/PEX PASS가 아닙니다.

막혔을 때:

- 선택 조건이 해당 설계에 없으면 지원 운전 조건을 다시 고릅니다.
- 같은 생성 요청의 receipt를 확인합니다. 연결 오류를 이유로 기존 사용자 설계를 덮어쓰지 않습니다.

## MOS 최적화 실험 · Grid/Random/TPE

실제 PCell·DRC·LVS·DC를 통과한 후보만 비교합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/mos-experiments/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/native-extensions.md)

시작 조건:

- 원본 SKY130 단일 MOS PCell·mn1·nf=m=1
- Magic·Netgen·ngspice와 실제 모델

1. MOSFET 프로젝트를 열고 실험 패널에서 W/L 변수와 grid 범위를 정합니다.
2. Grid·seeded random·seeded TPE, trial budget 1–16과 시간 한도를 선택합니다. objective·면적/전류 제약을 지정합니다.
3. 실행하면 후보별 별도 프로젝트에서 PCell → DRC → LVS → ngspice DC가 수행됩니다.
4. 실제 gate 결과·metric·score를 확인합니다. 실패/제약 위반 후보의 점수는 null입니다.
5. 순위를 읽고 후보 프로젝트를 별도로 엽니다. 원본 revision과 다르면 원본을 그대로 보존하며 비교합니다. 취소/중단 기록도 확인합니다.

확인 결과와 한계:

- area_um2는 실제 bbox footprint입니다. power_W는 Vds×최대 표본 Id이며 전체 동적 시스템 전력이 아닙니다.
- 검색한 유한 후보의 최선 값은 전역 최적이나 제조 승인을 뜻하지 않습니다.

막혔을 때:

- 임의 수정 layout·다른 cell·nf/m은 지원 범위 오류를 확인합니다.
- 취소·timeout·worker 중단은 feasible 점수로 바꾸지 않습니다.

## 개발자 실습 · MCP와 Xschem 교환

제한된 엔진 API로 자동화하고 생성한 flat 회로만 netlist bridge로 확인합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/agent-automation/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/agent-integration.md)

시작 조건:

- 소스 체크아웃·Node 24·인증된 로컬 worker
- Xschem bridge 사용 시 설치된 실제 Xschem·공개 symbols

1. 소스에서 npm run agent:mcp로 MCP 서버를 시작하고 제공 schema의 doctor·projects·snapshot을 먼저 읽습니다.
2. 자동화 명령은 정수 DBU·현재 revision·고유 command ID를 사용합니다. 임의 shell·secret·rule deck 실행은 제공하지 않습니다.
3. 지원 project에서 실제 simulation/verification job을 요청하고 status/log/cancel로 추적합니다. 결과를 source·run·revision과 함께 보존합니다.
4. Xschem 교환은 생성된 flat native cell의 public symbols·전기 label을 내보내 headless netlister로 실제 SPICE를 확인합니다.
5. GDS ⇄ 회로도 변환은 preview hash를 조회하고 명시적 apply로 새 revision을 만듭니다.

확인 결과와 한계:

- MCP/numerical optimizer는 외부 LLM API를 호출하지 않습니다. 사용자에게 미승인 유료 요청을 하지 않습니다.
- 임의 가져온 Xschem .sch/Tcl 실행이나 general hierarchy bridge는 지원되지 않습니다.

막혔을 때:

- typed 오류가 나면 schema와 실제 지원 subset을 확인합니다.
- job budget·도형 상한·revision 오류를 우회해 일부 성공으로 표시하지 않습니다.

## 설치 · Docker 없이 첫 실행

운영체제에 맞는 앱을 설치하고 실제 엔진 준비 상태를 확인합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/install-native/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/native-runtime.md)

시작 조건:

- Windows x64, macOS 13 이상 arm64/x64 또는 Linux x64
- 공식 다운로드와 SHA-256 확인

1. 다운로드 홈에서 Windows EXE, M1 이후 Mac arm64 ZIP, Intel Mac x64 ZIP, Linux tar.gz를 선택합니다.
2. ZIP/tar.gz 전체를 풉니다. Mac은 Install Resistor.command, Linux는 ./install.sh를 실행합니다. Windows는 설치 안내를 따릅니다.
3. 앱을 열어 설계 엔진 다시 연결을 누릅니다. 환경 진단에서 로컬 · Docker 없이를 확인합니다.
4. Python·KLayout·ngspice·SKY130 기본 리소스 상태를 확인합니다. 도구별 누락 원인을 먼저 읽고 빈 회로 실습으로 이동합니다.

확인 결과와 한계:

- 기본 편집·GDS/OASIS·ngspice는 포함된 엔진에서 실행합니다.
- Magic/Netgen/Yosys/Icarus는 기본 도구와 별도로 준비합니다. 준비 가능과 실행 PASS는 다릅니다.

막혔을 때:

- Mac 경고는 출처·해시를 확인한 뒤 터미널의 /bin/zsh 뒤에 설치 도우미 파일을 끌어 넣어 실행합니다. Apple 공증은 완료되지 않았습니다.
- 연결 실패 시 환경 진단의 실제 실행 방식·작업 폴더·로그를 확인합니다. Docker 전용 경로를 로컬 엔진 경로로 입력하지 않습니다.

## DRC/LVS/PEX 도구 준비와 연결 복구

추가 도구가 필요한 작업과 설치 위치를 구분합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/physical-tools/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/native-runtime.md)

시작 조건:

- 기본 앱 설치
- 도구를 설치할 Mac/Linux 호스트 또는 Windows 독립 Ubuntu WSL

1. 환경 진단에서 Magic, Netgen, Yosys, Icarus의 실제 상태를 확인합니다.
2. Mac/Linux 호스트 또는 독립 Ubuntu WSL 터미널에서 소스의 scripts/native-tools-setup.sh를 실행합니다. Mac은 Homebrew와 Xcode 개발 도구를 준비합니다.
3. Windows는 앱 실행 방식에서 설치한 Ubuntu를 선택합니다. docker-desktop 내부 배포판을 선택하지 않습니다.
4. 설계 엔진 다시 연결 후 도구 버전·PDK·모델을 확인합니다. 물리 예제를 새 프로젝트로 가져와 작은 DRC부터 실행합니다.

확인 결과와 한계:

- 설치 진단과 실제 DRC/LVS/PEX job 결과는 별도입니다.
- v0.27 Linux/macOS CI의 실행 기록은 사용자 PC에서 도구가 준비됐다는 의미가 아닙니다.

막혔을 때:

- 기존 Docker 엔진에서 전환은 진행 중 해석을 완료/취소한 뒤 실행합니다. 원본 컨테이너·볼륨·설계 데이터는 보존됩니다.
- /workspace/workers/eda/server.py 없음 오류가 나면 예전 Docker 경로를 재사용하지 말고 실행 방식을 로컬로 확인합니다.

## v0.27 작업대 · 프로젝트 찾기와 다음 실행

프로젝트 검색, 실행 준비와 결과 위치를 한 흐름으로 사용합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/workbench/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/workbench-usability.md)

시작 조건:

- v0.27 이상
- 저장된 프로젝트 또는 새 빈 회로

1. 열기 또는 Ctrl/⌘+O를 눌러 이름·cell·PDK·ID를 검색합니다. 공정 필터와 이름 순 정렬로 범위를 줄입니다.
2. 50개씩 페이지를 이동하고 원하는 프로젝트를 엽니다. 파일 가져오기·복제도 같은 탐색 화면에서 시작합니다.
3. 툴바의 다음 실행을 누릅니다. 회로·레이아웃·해석 입력·도구 준비 중 부족한 항목을 확인합니다.
4. 안내에서 해당 편집 화면이나 환경 진단으로 이동하고 원인을 해결합니다. 실행 요청 가능이라는 문구를 물리 검증 PASS로 해석하지 않습니다.
5. 결과를 선택한 뒤 이 결과의 파형을 엽니다. 하단 로그의 실행 ID가 선택한 결과와 일치하는지 확인합니다.

확인 결과와 한계:

- 새 프로젝트는 빈 회로도이며 소자가 없을 때 해석을 차단합니다.
- 대화창의 Tab/Shift+Tab은 창 안을 이동하고 Escape는 시작 버튼으로 초점을 돌립니다.

막혔을 때:

- 수치가 이전 값처럼 보이면 선택한 run과 현재 revision을 먼저 비교합니다.
- 현재 설계가 같아도 모델·PDK·엔진 입력이 바뀌면 이전 결과입니다.

## 첫 회로 · 1.8V 전압 분배기 직접 그리기

빈 회로에서 핀을 연결하고 실제 0.9V·90µA를 확인합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/blank-divider/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/schematic-quickstart.md)

시작 조건:

- 기본 KLayout/ngspice 엔진
- SKY130 빈 회로도

1. 새 프로젝트에서 빈 회로도 또는 Schematic → 빈 회로 시작을 선택합니다. 기존 프로젝트는 남습니다.
2. 저항 / R에서 10kΩ를 입력하고 두 개를 배치합니다. Esc로 반복 배치를 끝냅니다. 전압원 / V에 1.8V를 입력하고 GND를 배치합니다.
3. V1 + → R1 +, R1 − → R2 +, V1 − → GND, R2 − → GND를 핀 클릭으로 연결합니다.
4. 연결 검사에서 미연결 핀 0개를 확인합니다. Simulate로 기본 OP를 실행합니다.
5. 중간 노드 0.9V와 저항 전류 90µA를 읽습니다. R2를 5kΩ로 바꾸고 다시 실행하면 0.6V·120µA입니다. 두 run을 번갈아 선택해 로그·결과가 함께 바뀌는지 확인합니다.

확인 결과와 한계:

- Vout=Vin×R2/(R1+R2), I=Vin/(R1+R2). 10k/10k에서 각각 0.9V·90µA입니다.
- 이 실습은 수치 OP입니다. 기능 합격 기준이 없으므로 미판정이 정상이며 레이아웃 검증은 미실행입니다.

막혔을 때:

- 주황 핀은 미연결입니다. 단순 선 교차는 접점이 아닙니다.
- 다른 핀을 지나가는 꺾임이면 Space로 방향을 바꾸거나 중간점을 추가합니다. 다른 이름의 노드를 무단 합치지 않습니다.

## 소자·단위·배선 · 회로도 편집하기

반복 배치, 핀 연결, 값 수정과 되돌리기를 익힙니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/schematic-edit/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/drawing-tools.md)

시작 조건:

- 편집 가능한 회로 프로젝트

1. Schematic에서 저항·용량·전압원·전류원·MOS 중 소자를 선택하고 값·단위를 지정해 배치합니다.
2. 핀과 핀을 클릭해 배선합니다. 꺾임 방향은 Space, 중간점은 캔버스 클릭, 취소는 Esc입니다.
3. 선택한 소자의 값을 속성에서 수정합니다. 4.7nF, -2mA, 650nm 또는 0.65um처럼 저장된 값의 단위를 확인합니다.
4. 회전 R, 반전 M, 복제 Ctrl/⌘+D, 전체 맞춤 F를 사용합니다. Ctrl/⌘+Z로 이전 revision을 복원합니다.
5. 연결 검사와 SPICE 내보내기로 핀 순서·net·model·W/L을 확인한 뒤 다시 해석합니다.

확인 결과와 한계:

- 배치 모드의 R과 선택 소자 회전 R은 화면/선택 상태에 따라 동작이 다릅니다. 단축키 안내의 현재 화면 분류를 확인합니다.
- 새 소자에 접지·전원을 임의 연결하지 않습니다. 잘못된 단위와 0 이하 R/C/W/L은 저장하지 않습니다.

막혔을 때:

- 편집 중 변경 충돌이 나면 현재 값 불러오기에서 최신 값을 확인합니다.
- pulse·AC 자극이 필요한 계층 회로는 해석 설정을 사용합니다. 간편 flat 회로 OP에 임의 자극을 추가하지 않습니다.

## 계층 복사 · 상위/하위 블록 적용 전 영향 보기

원본을 보존하며 셀·포트·물리 도형의 적용 전후를 검토합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/hierarchy-preview/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/digital-hierarchy.md)

시작 조건:

- 같은 PDK·DBU의 편집 가능한 원본/대상 프로젝트
- 현재 대상 revision

1. 회로도에서 루트나 하위 셀을 선택해 계층 복사를 누릅니다.
2. 계층 가져오기·미리보기에서 clipboard 또는 저장된 프로젝트를 선택합니다. 새 namespace·대상 셀·위치·회전·미러를 정합니다.
3. 포트별 대상 net을 지정합니다. 물리 대응이 없는 하위 셀은 회로도만 가져오기 범위를 직접 선택합니다.
4. 현재/적용 후 전체 도형과 레이어별 추가·삭제 면적, 경계, 겹침을 확인합니다. 상위 셀로 감싸기는 실제 도형 합집합 유지 여부를 확인합니다.
5. 명시적 확인 후 승인·적용합니다. 새 revision에서 블록 간 실제 물리 배선을 연결하고 DRC/LVS/PEX를 다시 실행합니다.

확인 결과와 한계:

- 미리보기는 원본을 바꾸지 않습니다. 도형 겹침은 곧바로 전기적 단락이나 DRC 위반을 뜻하지 않습니다.
- 핀 net 연결과 블록 간 물리 배선은 별도입니다. Undo/Redo로 적용을 되돌릴 수 있습니다.

막혔을 때:

- 원본·대상·입력이 바뀐 preview는 다시 만듭니다. 기존 셀 정의를 덮어쓰지 않습니다.
- 100,000개 도형 상한을 넘으면 부분 결과를 승인하지 않습니다. 범위를 줄이거나 명시된 지원 범위를 확인합니다.

## Layout 2D · 사각형·다각형·배선 직접 그리기

정수 DBU와 작업 레이어를 유지하며 실제 mask 도형을 편집합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/layout-drawing/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/drawing-tools.md)

시작 조건:

- 빈 SKY130 레이아웃
- PDK layer/purpose와 DBU 확인

1. 새 프로젝트 → 빈 SKY130 레이아웃 · 직접 그리기로 시작합니다. Layout 2D의 작업 레이어와 Net을 정합니다.
2. 사각형 / R을 선택해 대각선 드래그 또는 두 모서리 클릭으로 도형을 저장합니다.
3. 다각형 / P는 꼭짓점을 클릭하고 Enter/시작점으로 완료합니다. 배선 / W는 conductor 레이어·폭을 지정하고 경유점을 찍어 Enter로 저장합니다.
4. Space로 배선 꺾임을 바꿉니다. 이동 M·복사 C와 오른쪽 좌표·ΔX/ΔY·폭 속성을 사용합니다.
5. Undo/Redo 후 GDS/OASIS를 내보내 다시 열어 좌표·레이어·계층을 확인합니다. 실제 DRC를 실행해 marker를 검토합니다.

확인 결과와 한계:

- 좌표 원본은 KLayout 정수 DBU입니다. µm 환산과 grid를 확인합니다.
- Net 속성을 붙인 도형 자체는 추출 연결이나 LVS PASS 증거가 아닙니다.

막혔을 때:

- 최소 폭·grid·면적 오류는 저장 전에 수정합니다.
- 도형이 보이지 않으면 작업 layer 숨김, ROI, 현재 cell과 F 맞춤을 확인합니다.

## 배선 후보 · PDK 규칙으로 경로 미리보기

단일 metal1 경로 후보를 검토하고 한 번의 수정으로 적용합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/routing-preview/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/design-assistant.md)

시작 조건:

- 실제 설치·해시 확인된 SKY130 metal1 규칙
- 시작/끝 DBU·폭·net과 대상 revision

1. 통합 설계의 PDK 배선 보조에서 실제 규칙을 읽고 시작/끝 좌표·폭·꺾임 순서를 입력합니다.
2. 우회 후보 검색으로 bbox-track 경로를 확인합니다. 각 후보의 grid·spacing·충돌 원인을 비교합니다.
3. 선택한 경로의 전체 hierarchy 영향과 입력·PDK·revision fingerprint를 확인합니다.
4. 적용하면 한 revision이 생성됩니다. 레이아웃에서 실제 도형을 검토하고 DRC를 독립 실행합니다.

확인 결과와 한계:

- 유한 후보 검색 실패는 가능한 경로가 전혀 없다는 증명이 아닙니다.
- 단일 레이어·최대 두 꺾임 범위입니다. via·global routing·추출 net·LVS를 자동으로 만들지 않습니다.

막혔을 때:

- revision이나 PDK가 바뀌면 재검색합니다.
- via/다중 레이어가 필요하면 직접 편집하고 실제 연결·검증을 별도로 진행합니다.

## 칩 면적 제한 · 1mm² 안에 배치하기

원본을 축소하거나 자르지 않고 실제 경계에 제한을 적용합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/chip-envelope/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/sar-adc.md)

시작 조건:

- 레이아웃 프로젝트
- 가로·세로·최대 면적·여백 단위 µm/µm²

1. 통합 설계에서 칩 크기 · 현재 배치 경계 검사를 엽니다.
2. 새 템플릿의 기본 1,000×1,000µm, 최대 1,000,000µm², 여백 10µm와 5nm grid를 확인합니다.
3. 실제 hierarchy·배선 포함 bbox와 최소 필요 영역을 확인합니다. 기존 좌표를 그대로 두고 제한 적용 가능 여부를 봅니다.
4. 기존 긴 행 배치를 다시 묶으려면 새 bounded physical 템플릿을 생성합니다. 매칭 그룹과 M3/M4 배선을 포함해 영역 안에 들어오는지 확인합니다.
5. 제한 적용 후 사각형·path·instance·import·계층 변경을 수행합니다. 범위를 벗어나는 수정은 commit 전에 차단됩니다.

확인 결과와 한계:

- width×height는 최대 면적 이하이어야 합니다. 실제 배선 bbox까지 포함합니다.
- 기하 clipping·scale로 면적을 맞추지 않습니다. ABBA 중심 일치는 통계적 matching 인증이 아닙니다.

막혔을 때:

- 현재 도형이 이미 영역 밖이면 제한 크기를 수정하거나 별도 bounded 예제를 생성합니다.
- 변경된 revision에는 오래된 경계 preview를 적용하지 않습니다.

## 회로도 → 원하는 규격의 레이아웃

소자 치환과 외부 테스트벤치를 확인한 뒤 실제 PCell 배치를 적용합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/forward-layout/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/gds-schematic-conversion.md)

시작 조건:

- 지원 flat primitive 1–512개
- Magic·KLayout·공개 SKY130 모델
- 검증된 회로 연결

1. 설계 도구 → 통합 설계 → GDS ⇄ 회로도 · 규격 배치를 엽니다.
2. 회로도 → 레이아웃에서 가로·세로·최대 면적·여백, 핀 채널 방향과 배치 순서를 정합니다.
3. 실제 MOS/poly/MIM PCell·M3/M4 배선 preview를 생성합니다. 매칭 그룹·원본 W/L·치환 R/C·저항 body net을 확인합니다.
4. 전압원·전류원은 외부 바이어스로 기록됩니다. 해당 외부 테스트벤치 목록을 검토하고 적용합니다.
5. DRC/LVS/PEX를 독립 실행한 뒤 실제 추출 단자 이름으로 post-layout 해석합니다.

확인 결과와 한계:

- 미리보기 성공은 물리 검증 PASS가 아닙니다. 영역이 부족하면 원본은 유지됩니다.
- 편집 회로 R/C와 PDK 소자의 공칭 기하 추정은 구분합니다. 실제 공정 모델이 해석 기준입니다.

막혔을 때:

- 미지원 모델·계층·소자 수·규격 오류의 원문을 읽습니다. 임의 치환으로 우회하지 않습니다.
- 분산 배선의 여러 추출 단자를 원래 노드의 한 전압으로 합치지 않습니다.

## GDS/OASIS → 회로도 역추출

마스크에서 소자·연결을 추출하고 지원 graph만 편집 회로로 적용합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/reverse-schematic/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/gds-schematic-conversion.md)

시작 조건:

- 원본 GDS/OASIS·top cell
- Magic 추출 deck·Netgen·등록 PDK

1. 파일·PDK에서 GDS/OASIS를 가져옵니다. 변환 탭에서 GDS → 회로도와 실제 top cell·PDK를 선택합니다.
2. 실제 Magic 도형 추출을 실행합니다. 추출 SPICE의 model·port·W/L과 로그를 확인합니다.
3. Netgen의 추출 graph ↔ 편집 graph 비교 결과를 확인합니다. parser equivalence와 원래 설계 LVS를 구분합니다.
4. flat 편집 심볼과 도형 preview를 검토합니다. 지원 밖 모델·파라미터·포트가 있으면 적용이 차단됩니다.
5. 적용 후 해석 설정에서 공급·입력·접지·바이어스를 지정합니다. 원래 설계에 대한 물리 검증은 별도입니다.

확인 결과와 한계:

- 검증된 SKY130 nfet_01v8, pfet_01v8_hvt, res_xhigh_po_1p41, cap_mim_m3_1 범위입니다.
- 원래 심볼 위치·설계 의도·전기 계층·정확한 terminal-to-polygon mapping은 GDS에 없습니다.

막혔을 때:

- 버스 포트, nf/m≠1, 지원 밖 model은 원문에 보존합니다. 실패 적용을 강제로 진행하지 않습니다.
- 다른 PDK의 원문 추출 가능과 편집 graph 검증 완료를 혼동하지 않습니다.

## PDK·모델·포트 · 해석 설정하기

표시 레이어와 실제 모델/검증 deck를 각각 확인합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/pdk-setup/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/pdk-setup.md)

시작 조건:

- 기본 엔진
- 실제 설치된 PDK 또는 허가된 manifest/ZIP

1. PDK·해석 설정에서 sky130A를 선택하고 실제 PDK 리소스 검증을 실행합니다.
2. 외부 GDS는 top cell을 선택해 가져오고 실제 GDS 추출 포트 검사를 실행합니다.
3. 각 포트를 접지·DC 전압·떠 있는 포트 등 실제 역할로 지정합니다. 모델에 맞는 값과 범위를 확인합니다.
4. 코너·온도·OP/DC/transient·sweep 포트·시간 조건·기생 포함 여부를 저장합니다. LVS용 reference SPICE도 지정합니다.
5. 다른 PDK는 manifest의 모델 파일, lib/include, corner, scale, Magic technology, Netgen setup을 실제 파일에 연결해 등록합니다.

확인 결과와 한계:

- LYP/JSON 표시 레이어 적용은 공정 모델·PCell·검증 deck 설치가 아닙니다.
- PDK·모델 hash가 바뀌면 이전 결과는 stale입니다. 포트 자극은 GDS만 보고 추측하지 않습니다.

막혔을 때:

- Windows 경로를 Linux worker 경로로 입력하지 않습니다. 엔진이 접근할 실제 경로를 사용합니다.
- 공유 방에서는 서버 operator가 등록한 profile만 선택합니다. 사설 모델·license를 공개 ZIP에 넣지 않습니다.

## OP·DC·AC·Transient · 해석을 고르기

회로와 자극이 지원하는 분석을 실제 조건으로 실행합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/analysis-setup/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/integrated-design.md)

시작 조건:

- 유효한 회로와 모델
- 분석별 자극·전원·부하

1. 회로 template 카탈로그 또는 PDK·해석 설정에서 지원 분석을 읽습니다.
2. OP는 DC 바이어스의 동작점, DC는 전압원 sweep, AC는 명시적 소신호 자극, Transient는 실제 시간 입력으로 설정합니다.
3. 코너·온도·VDD·부하·시간 범위·step 또는 주파수 축을 확인합니다. 간편 빈 회로는 OP/정적 전원 transient 범위입니다.
4. 다음 실행에서 입력과 실제 도구 준비를 확인한 뒤 Simulate를 실행합니다.
5. 실행 결과의 축·단위·조건·run ID와 실제 로그를 확인합니다. 정의된 기준이 없으면 미판정으로 유지합니다.

확인 결과와 한계:

- AC complex 결과는 시간 전류 방향 재생과 다릅니다.
- 실행 completed, 기준 pass/fail/unknown, freshness는 서로 다른 상태입니다.

막혔을 때:

- floating node·모델 누락·시간 초과는 stdout와 입력 deck에서 확인합니다.
- 누락한 신호/표본이나 판정 불명확 전압을 이상 파형으로 채우지 않습니다.

## 전류 방향·전압강하 · 수치와 벡터 읽기

실제 해석의 signed branch와 물리 경로 확인을 구분합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/current-voltage/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/signal-flow.md)

시작 조건:

- 완료된 실제 OP/DC/transient 또는 명시적으로 가져온 결과

1. 시뮬레이션 목록에서 원하는 run을 선택하고 전압·전류 흐름 화면을 엽니다.
2. 표본/시간을 선택해 node 전압과 branch의 from/to·source vector·A 단위를 확인합니다.
3. 양수는 지정 기준 방향, 음수는 반대 방향입니다. 전자 흐름 보기는 표시 방향을 반전합니다.
4. 단자 사이 전압차를 읽고 branch 전류와 함께 저항의 전압강하·전력 관계를 확인합니다.
5. 레이아웃의 자동 확인된 접점 또는 사용자가 지정한 DBU 경로에만 벡터를 표시합니다. 미매핑 branch는 수치로 검토합니다.

확인 결과와 한계:

- GDS 자체는 전류를 계산하지 않습니다. current 데이터와 도형 mapping 근거가 필요합니다.
- 화살표는 branch/terminal 전류 표시이며 금속의 공간 전류밀도·보정된 TCAD가 아닙니다.

막혔을 때:

- 전류가 unavailable이면 해당 run이 실제 branch를 반환했는지 확인합니다. 0A로 대신 표시하지 않습니다.
- stale면 새 해석을 실행합니다. 기능 기준 unknown/fail과 최신 numeric 데이터는 별도로 읽습니다.

## 파형 Lab · 커서·지연·전력·CSV

원본 표본으로 측정하고 조건·출처가 포함된 결과를 저장합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/waveform-lab/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/waveform-lab.md)

시작 조건:

- 동일 run의 실제 파형과 축/단위

1. 선택한 실행에서 이 결과의 파형 → Waveform lab을 엽니다. 신호와 A/B X좌표를 지정합니다.
2. 차트에서 A/B를 찍고 구간을 확대합니다. ΔX/ΔY, Min/Max, P-P, Mean, RMS, Integral을 읽습니다.
3. 시간 파형의 Low/High, 입력·출력 기준과 edge를 지정해 rise/fall·주기·지연을 측정합니다.
4. 동일 축 신호의 덧셈·뺄셈, V×A 전력 또는 V/A 저항을 선택합니다. 소자 단자 전압과 해당 전류 기준을 맞춥니다.
5. 측정 JSON 또는 구간 CSV를 내보내 run·revision·freshness·단위를 확인합니다.

확인 결과와 한계:

- 비균일 시간 간격을 반영합니다. 화면 축소와 원본 측정 해상도는 구분합니다.
- 교차가 없으면 unavailable/null입니다. 공급원 전류의 부호를 확인하며 VDD 전력과 전체 시스템 전력을 구분합니다.

막혔을 때:

- 단위/축이 다르거나 두 신호의 공통 구간이 없으면 연산하지 않습니다.
- V/A에서 분모 0 또는 표본 사이 0 통과는 차단됩니다. 다른 소자의 V와 I를 곱한 W를 소자 전력으로 해석하지 않습니다.

## 실행 이력 · 이전 결과와 오류 확인

선택한 run의 수치·파형·로그와 최신성을 일치시킵니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/result-history/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/workbench-usability.md)

시작 조건:

- 하나 이상의 실행 결과

1. 실행 목록에서 run을 선택합니다. 결과 드롭다운과 하단 로그가 같은 실행을 가리키는지 확인합니다.
2. 이 결과의 파형으로 직접 이동해 결과 revision과 현재 revision을 비교합니다.
3. 이전 결과 표시는 설계 번호 차이인지, 동일 설계에서 모델·PDK·엔진 입력이 달라진 것인지 설명을 읽습니다.
4. 실패 run의 원본 로그·조건·파일 위치를 열고 원인을 고칩니다. 원본 실패 기록을 지우지 않고 재실행합니다.

확인 결과와 한계:

- 과거 결과는 원본 수치와 provenance를 보존합니다.
- completed+unknown은 수치 반환 후 기능 기준 미정일 수 있습니다. completed+fail은 실행 실패와 다릅니다.

막혔을 때:

- 새 run을 실행했다는 이유만으로 과거 파형을 최신으로 해석하지 않습니다.
- 취소·시간 초과·누락 파일은 실제 실행 상태와 오류 원인으로 읽습니다.

## DRC → LVS → PEX · 실제 물리 검사

각 단계의 의미·결과 파일·위반 위치를 따로 검토합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/physical-verification/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/validation-workflow.md)

시작 조건:

- 실제 도형·reference 회로·PDK deck
- Magic·Netgen 등 필요한 실제 도구

1. 작은 CMOS 셀의 편집 프로젝트를 새로 가져옵니다. 현재 revision과 실제 layout·reference SPICE를 확인합니다.
2. DRC를 실행합니다. 완료 상태·deck·marker 수와 좌표를 읽고 실제 레이어에서 위반을 수정합니다.
3. LVS를 실행합니다. layout 추출과 reference의 device·W/L·ports를 비교하고 불일치 원문을 확인합니다.
4. PEX를 실행합니다. 실제 추출 R/C 수·netlist·quality/reduction 보고서를 확인합니다.
5. post-layout을 실행하고 같은 조건의 pre-layout과 비교합니다. 하나의 PASS를 다른 단계에 전파하지 않습니다.

확인 결과와 한계:

- 빈 레이아웃은 물리 검증 대상이 아닙니다. deck·run·revision별 결과를 확인합니다.
- 공개 deck의 DRC/LVS/PEX는 foundry signoff, density/antenna/ESD/EMIR/timing closure를 보장하지 않습니다.

막혔을 때:

- DRC 위반 수정 뒤 revision이 바뀌면 LVS/PEX/post를 다시 실행합니다.
- PEX 음수/비정상 R/C를 삭제해 통과시키지 않습니다. 원문과 실패를 보존합니다.

## Pre/Post 비교 · 기생 배선 영향 확인

같은 회로 조건에서 추출 RC가 파형과 판정에 미친 영향을 봅니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/pre-post/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/waveform-lab.md)

시작 조건:

- 동일 project/revision·profile·analysis의 완료된 pre/post
- 해당 revision의 실제 PEX

1. pre-layout을 실행한 조건의 VDD·corner·온도·부하·시간/자극을 기록합니다.
2. 실제 PEX 완료 후 post-layout 옵션을 켜 동일 조건으로 해석합니다.
3. 파형 Lab의 pre/post 비교에서 동일 project/revision·도구·profile·조건인지 확인합니다.
4. 출력 rail·settling·지연·supply current와 각 기준의 pass/fail을 읽습니다.
5. CSV/JSON과 PEX 원문·축약 감사를 저장합니다. 더 빠른 클럭의 실패도 보존합니다.

확인 결과와 한계:

- MUX 5ns post, CPU4 50ns/200ns RC 실패 이력과 느린 조건 통과는 별개입니다.
- 외부 파일의 출처가 불명확하면 native pre/post 비교로 자동 선택하지 않습니다.

막혔을 때:

- 비교가 차단되면 revision/모델/자극/단위가 같은지 확인합니다.
- PEX 분산 단자의 여러 전압은 추출 이름으로 구분합니다.

## PVT 일괄 해석 · 최악 조건 읽기

코너·온도·전압별 실제 측정과 실패를 비교합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/pvt-corners/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/integrated-design.md)

시작 조건:

- 모델이 선언한 corner와 공급원
- 실제 측정 metric·제약

1. 통합 설계 → 조건별 해석에서 실제 공급원 목록을 읽고 바꿀 전원을 선택합니다.
2. 지원 corner·온도·전압·metric과 허용 범위를 입력합니다. 최대 32개 조건 범위를 확인합니다.
3. 조건표를 저장한 뒤 명시적으로 실행합니다. 원본 snapshot의 별도 프로젝트에서 실제 job을 수행합니다.
4. 조건별 run·수치·로그와 최악 조건을 확인합니다. 실패·누락 metric은 값이 없는 상태로 남습니다.
5. JSON/CSV를 저장하고 원본 revision·모델 fingerprint와 비교합니다.

확인 결과와 한계:

- 정의한 조건표 통과는 전체 PVT나 Monte Carlo 수율 인증이 아닙니다.
- 이상 R/C만 있는 회로는 corner가 바뀌어도 동일할 수 있습니다.

막혔을 때:

- timeout·cancel·worker 재시작은 성공으로 바꾸지 않습니다.
- 전원 식별과 자극 범위가 실제 지원되는지 확인합니다.

## 독립 GDS 뷰어 · PDK와 저장 결과 보기

로그인 없이 기기에서 GDS를 열고 필요한 해석만 별도로 연결합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/standalone-viewer/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/viewer-current.md)

시작 조건:

- GDS 파일 또는 .register-view.json
- 선택적으로 표시 LYP/JSON

1. 작업대의 GDS 뷰어 또는 앱 --viewer 모드를 엽니다. GDS 열기에서 파일을 고릅니다.
2. SKY130 레이어 적용 또는 PDK 레이어 열기로 layer/datatype·색·표시 높이를 적용합니다.
3. top cell·계층·2D/3D·분해·단면·정확한 DBU 영역을 탐색합니다.
4. 저장된 실제 current-viewer.register-view.json 예제를 열어 branch 수치를 봅니다. 새 해석을 실행한 것과 구분합니다.
5. 뷰어 파일 저장에서 원본 GDS 포함 옵션을 선택해 재개방합니다. 실제 해석은 PDK·해석 설정에서 별도 프로젝트/엔진으로 연결합니다.

확인 결과와 한계:

- GDS의 XY와 LYP 표시 높이는 실측 공정 Z가 아닙니다.
- 로컬 GDS reader와 native KLayout OASIS 지원 범위는 다릅니다.

막혔을 때:

- 지원 밖 PATH/변환/순환 계층 오류는 일부 도형만 읽어 성공 처리하지 않습니다.
- 전류가 없으면 실제 해석 결과를 가져오거나 해석합니다. GDS만으로 화살표를 만들지 않습니다.

## 비평탄 공정 3D · step·hole·coverage 검사

층마다 위치별 높이·국부 두께·제출 체적을 검토합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/process-inspection/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/process-topography.md)

시작 조건:

- 명시적 단위·재료·출처를 가진 process JSON 또는 지원 VTU+sidecar

1. 공정 3D에서 examples/process/step-keyhole.process.json 또는 대응 VTU·setup을 가져옵니다.
2. 좌표 nm/µm·재료 film/bulk/void·국부 두께·기준막·domain·measurement/simulation/demo 출처를 확인합니다.
3. XYZ 단면을 이동해 step 모서리·hole 벽·바닥의 얇아진 film과 명시된 void를 봅니다.
4. 전체 검사를 실행해 제출 cell 전량의 두께/피복률과 face-connected void 체적을 검토합니다. ROI·미제출 체적·unknown은 따로 읽습니다.
5. 위험 위치·CSV·PNG·체적 JSON/뷰어 bundle을 저장하고 재개방해 같은 설정으로 다시 검사합니다.

확인 결과와 한계:

- GDS 단층 extrusion과 실제 위치별 Z 체적은 다릅니다.
- 지원 VTU는 single Piece inline ASCII linear tetra type=10입니다. 해상도보다 작은 결함은 검사할 수 없습니다.

막혔을 때:

- 겹침·퇴화·non-manifold·중복 node 오류는 실제 mesh를 수정합니다. 자동으로 형상을 메우지 않습니다.
- 제출되지 않은 빈 부분을 폐쇄 공극으로 추정하지 않습니다. mesh 수렴과 실측 calibration은 별도입니다.

## 증착·식각·CMP · 공정 순서 계산

초기 구조와 조건을 바꿔 단계별 형상 변화를 비교합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/process-recipe/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/process-simulation.md)

시작 조건:

- 공정 3D 초기 구조·재료·격자·경계 조건

1. 공정 3D → 공정 시퀀스 계산에서 초기 구조와 voxel 크기를 정합니다.
2. conformal/방향성 증착, 선택적 isotropic/방향성 식각, CMP 순서를 추가하고 속도·시간·재료·입사각/평면 조건을 입력합니다.
3. 실행 후 단계별 체적·얇은 film·void·위험 위치를 봅니다. 같은 layer가 높이에 따라 어떻게 덮이는지 단면으로 비교합니다.
4. h·2h 격자 비교를 실행해 해상도 민감도를 읽습니다. 얇은 sub-grid film은 unresolved 상태를 확인합니다.
5. 선택 체적·모든 단계·VTU·recipe JSON을 저장하고 재개방합니다. 평면 속도 fit은 입력 자료의 범위에 한정합니다.

확인 결과와 한계:

- 형상 예측 계산은 장비·화학·plasma·전기 coupled PDE나 calibration된 TCAD가 아닙니다.
- 기본 ray shadowing과 국부 단일 재방출 등 사용 모델·경계를 확인합니다.

막혔을 때:

- 작은 구조가 사라지면 grid를 낮추고 h·2h를 비교합니다. 단순 고해상도가 실측 정확도를 보장하지 않습니다.
- 결과의 user/demo/simulation/measurement 출처를 유지합니다.

## 도형 검색·거리·북마크·revision 비교

정수 도형과 실제 결과를 검색하고 검토 기록을 저장합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-review/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/design-review.md)

시작 조건:

- 로드된 scene·선택적으로 실제 해석 결과

1. 설계 검토에서 shape ID·net·cell·layer를 검색하고 선택 도형으로 이동합니다. 로드된 전체/ROI/부분 범위를 확인합니다.
2. 거리 탭의 두 정수 DBU 좌표 또는 실제 꼭짓점으로 dx/dy·Manhattan·µm와 Euclidean 근삿값 표시를 읽습니다.
3. 선택 도형/점에 북마크를 저장하고 JSON으로 내보냅니다.
4. 현재 scene을 기준 파일로 저장하고 다른 검토 시점과 비교해 추가·삭제·metadata 변경을 봅니다.
5. CSV 탭에서 실제 signed 전류·축·단위·run/revision/freshness를 함께 내보냅니다.

확인 결과와 한계:

- 거리 측정은 파운드리 spacing rule 판정이 아닙니다.
- 부분 scene 비교는 로드된 영역에 한정됩니다.

막혔을 때:

- fingerprint·revision·로드 범위가 다른 북마크는 새로 지정합니다.
- 누락 sample·비유한 값·행 상한 오류는 실제 범위를 명시해 줄입니다.

## EDA 파일 호환 · LEF/DEF·CDL·결과 가져오기

지원 교환 형식의 실제 파일과 원본 metadata를 보존합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/interchange/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/eda-interchange.md)

시작 조건:

- 도구에서 내보낸 공개 교환 파일
- 필요한 tech/macro LEF·stream map·GDS/OAS

1. EDA 파일 호환에서 원본 도구를 고르고 파일들을 선택합니다.
2. 파일별 layer/datatype·cell·subckt ports·library 참조와 미지원 구문을 읽습니다.
3. LEF/DEF는 명시적 layer map과 실제 cell GDS/OAS를 연결합니다. macro LEF abstract를 제조 mask로 취급하지 않습니다.
4. Native 반입을 검사하고 현재 revision에 적용합니다. 원본 CDL/SPICE와 AST를 보존합니다.
5. 외부 파형은 축·단위·from/to terminal·source를 지정해 가져오고 결과를 imported로 읽습니다.

확인 결과와 한계:

- Binary PSF·FSDB·TR0와 임의 vendor DB는 해당 도구의 지원 export가 필요합니다.
- source 도구 이름만으로 그 도구 실행이 검증됐다고 표시하지 않습니다.

막혔을 때:

- 내부 layerNumber를 GDS 번호로 추정하지 말고 stream map을 제공합니다.
- 모델을 SKY130으로 자동 치환하지 않습니다. 미지원 dialect는 원문과 오류를 확인합니다.

## 상용 Backend · 설치 후 연결 절차

17개 도구 계열의 recipe·에이전트·로그를 실제 설치 환경에 연결합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/commercial-backend/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/commercial-backends.md)

시작 조건:

- 해당 vendor 실행 파일·license·PDK·site runset
- operator 권한과 허가된 리소스 경로

1. 상용 Backend에서 Virtuoso, Custom Compiler, Spectre, HSPICE, Calibre 등 작업에 맞는 profile을 선택합니다.
2. operator가 local 또는 별도 agent manifest와 실제 실행 파일·환경 변수 이름·리소스 hash를 등록합니다. secret 값은 manifest/UI에 넣지 않습니다.
3. 검증에서 실제 설치 버전·deck·resource를 확인합니다. needs-site-validation 후보는 설치된 release 매뉴얼과 site flow에 맞춥니다.
4. 실제 작업·top cell·허용 scalar 조건을 저장하고 실행합니다. 상태·로그·취소·결과 파일을 확인합니다.
5. 완료된 GDS/OAS를 새 revision으로 반입하거나 명시적 export 파형을 가져옵니다.

확인 결과와 한계:

- 이 저장소의 공개 ngspice local/agent 전달 검사는 실제 vendor 실행 증거가 아닙니다. 상용 실행 환경 검증은 미완료입니다.
- OA/NDM 내부 binary를 추측해 범용 직접 읽기를 제공하는 기능은 아닙니다.

막혔을 때:

- 상용 실패를 ngspice로 바꿔 성공 처리하지 않습니다. 설치·license·site deck 원인을 해결합니다.
- 공유 프로젝트에서는 operator가 등록한 profile만 사용합니다.

## 원본 DB 읽기 · OA/NDM API와 검사

원본 무변경 query와 neutral graph를 검토한 뒤 반입합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/native-database/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/native-database.md)

시작 조건:

- 허가된 원본 library/cell/view
- 지원 reader의 native API·설치 도구·실제 stream map

1. 원본 DB 읽기 → 설치 도구 / 등록 소스 확인을 누릅니다.
2. operator가 reader·library·view·DB 경로·실행 파일과 고정 query profile을 등록합니다.
3. source 진단 후 실제 reader가 반환한 library/cell/view를 선택합니다.
4. 지원 primitive·instance·pin/net·단위·미지원 object·unresolved master와 원본 무변경 receipt를 확인합니다.
5. 유효 graph만 확인 후 현재 revision에 적용하고 hash·execution evidence를 저장합니다.

확인 결과와 한계:

- KLayout file calibration은 실제 OA/NDM vendor 실행 증거가 아닙니다. 해당 상용 reader 환경 검증은 미완료입니다.
- standalone OA C++ SDK와 Custom Compiler 전용 DB API reader는 제공되지 않습니다.

막혔을 때:

- 지원 밖 object를 bbox로 대체하거나 누락해 완전한 설계로 표시하지 않습니다.
- 변경된 source/fingerprint/view 또는 오래된 revision은 다시 검사합니다.

## 공동 설계 · Editor/Viewer와 충돌 복구

로컬/준비된 서버에서 실제 revision·권한을 공유합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/collaboration/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/cloud.md)

시작 조건:

- 실행 중인 Node hub와 EDA worker
- 공유 서버 운영자가 제공한 주소

1. 소스 환경은 npm run cloud:start로 로컬 허브를 시작합니다. 앱의 공동 작업에서 가입/로그인합니다.
2. 로컬 원본을 보존한 새 공유 프로젝트를 만듭니다. Owner가 Editor/Viewer 초대를 생성합니다.
3. 다른 브라우저/데스크톱에서 참여하고 Editor 편집과 Viewer 열람 범위를 확인합니다.
4. 동시에 같은 부분을 수정하면 revision 충돌을 읽습니다. 저장된 충돌 입력 JSON을 확인한 후 최신 설계에서 다시 적용합니다.
5. 동일 run·artifact·조건을 공유하되 다른 room 자료는 접근하지 않습니다. 원격 PDK는 operator 등록 profile만 사용합니다.

확인 결과와 한계:

- 다운로드 Vercel 사이트는 EDA 공동 작업 서버가 아닙니다. 외부 VM·도메인·TLS 운영 배포는 별도입니다.
- 공유 room에서 다른 사람의 최신 수정 undo와 로컬 AI 키 사용은 제한됩니다.

막혔을 때:

- 연결 단절 시 같은 command의 receipt를 확인합니다. 미확인 작업을 무조건 재실행하지 않습니다.
- 인터넷 접속은 운영자 HTTPS/허용 origin·인증 설정이 필요합니다.

## 선택적 AI 검토 · 근거·예산·수정 분리

현재 설계 근거를 확인하고 조언을 검증 작업으로 연결합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/assistant-review/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/design-assistant.md)

시작 조건:

- 로컬 Ollama 모델 또는 사용자가 설정한 OpenAI 키/예산
- 현재 revision의 근거 preview

1. 설계 검토의 AI 화면에서 현재 cell 연결과 실제 실행 상태의 evidence preview를 읽습니다.
2. 로컬 Ollama는 설치된 loopback 모델을 고릅니다. OpenAI는 main/server 환경의 키와 사용자가 정한 예산을 사용합니다.
3. 외부 요청은 전송 근거와 한 번의 호출 확인을 읽고 명시적으로 승인합니다. 새 설치의 paid cap은 US$0입니다.
4. 응답의 evidence ID와 unknown/stale/제약을 확인합니다. 제안 버튼으로 관련 검사 화면을 엽니다.
5. 제안에 따른 편집은 직접 수행하고 실제 시뮬레이션·DRC/LVS로 다시 검증합니다.

확인 결과와 한계:

- AI 조언은 계산·배선·제조 승인 결과가 아닙니다. 자동 도형 수정이나 검증 실행을 하지 않습니다.
- raw GDS·모델·deck·waveform arrays·credentials는 evidence payload에 포함하지 않습니다.

막혔을 때:

- 근거가 바뀌거나 model/예산/출력이 잘못되면 요청·적용이 거절됩니다.
- 실패/모호한 유료 요청의 예약은 최종 청구와 구분됩니다. 이 튜토리얼은 API 예산을 부여하지 않습니다.

## 테마·스킨·단축키 · 오래 쓰는 작업대

화면별 단축키와 숫자 가독성을 조절합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/appearance-shortcuts/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/appearance.md)

시작 조건:

- 앱 작업 화면

1. 스타일에서 라이트·다크·시스템과 그래파이트·제이드·코퍼·아이리스를 선택합니다.
2. PDK layer 색·도형·카메라·revision이 유지되는지 확인합니다.
3. F1, ?, Ctrl/⌘+/ 또는 단축키 버튼으로 현재 화면의 안내를 엽니다. 이름·동작을 검색합니다.
4. 선택/배치 상태별 R·M·C·W·P·F·Esc와 저장/열기/Undo를 사용합니다. 입력창 편집 중에는 문자 단축키로 도형을 만들지 않습니다.
5. 좁은 화면의 대화창은 내부 스크롤과 Tab/Shift+Tab·Escape로 조작합니다.

확인 결과와 한계:

- 앱의 스킨 4종과 다운로드 사이트의 테마 전환은 서로 다른 UI 범위입니다.
- 같은 주소의 브라우저 탭은 저장된 스타일을 공유합니다.

막혔을 때:

- 단축키가 예상과 다르면 현재 화면·선택·입력 focus와 안내를 확인합니다.
- OS의 ⌘와 Windows/Linux Ctrl 차이를 확인합니다.

## 인터넷 업데이트 · 확인·다운로드·복구

실제 받은 바이트와 파일 해시를 확인한 뒤 앱을 교체합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/online-update/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/online-updates.md)

시작 조건:

- v0.23 이상 설치 앱
- 공식 GitHub Releases에 접근 가능한 인터넷

1. 앱의 업데이트 → 지금 확인을 누르고 변경 내용·버전·아키텍처를 확인합니다.
2. 업데이트 다운로드를 선택하고 실제 바이트 진행률을 확인합니다. 취소/재시도가 가능합니다.
3. 크기·SHA-256 확인이 끝난 뒤 입력 설정과 뷰어 파일을 저장합니다.
4. 설치하고 다시 시작에서 운영체제별 설치 확인을 따릅니다. Mac/Linux는 이전 앱 백업과 교체 영수증을 확인합니다.
5. 다시 연 앱의 버전·환경 진단·기존 프로젝트를 확인합니다. 진행 중 worker 작업은 별도로 확인합니다.

확인 결과와 한계:

- 새 버전 확인·다운로드·설치는 서로 다른 단계입니다. 자동 확인은 자동 설치가 아닙니다.
- v0.22 이하는 한 번 직접 설치합니다. Apple 공증·Windows Authenticode는 완료되지 않았습니다.

막혔을 때:

- 오프라인·서버 오류·hash 불일치는 성공으로 바꾸지 않습니다.
- Mac/Linux 교체 실패는 이전 앱 복구 상태를 확인합니다. Windows 설치 취소는 기존 앱을 다시 엽니다.

## 논문 참고 업데이트 · 셀 특성표·실패 실험

참고 논문과 독립 구현의 실제 측정 범위를 비교합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/research-changes/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/literature-update-2026.md)

시작 조건:

- research 페이지의 문헌·catalog·generation 기록
- 선택 실험을 재실행할 실제 엔진

1. 논문·셀 업데이트 페이지에서 paper의 날짜·읽은 범위·공정 차이·adopted/not reproduced를 읽습니다.
2. 셀의 drive/slew/load 조건, LDO PSRR, OTA stability, SAR signed energy, CIC 응답 등 실제 생성된 실험을 선택합니다.
3. 각 generation의 source hash와 case key·입력 조건을 맞춰 raw deck/log·측정 JSON을 확인합니다.
4. 54개 template와 5개 digital unit의 default 결과와 실험 실패를 비교합니다. 시뮬레이션 숫자가 있어도 기준이 없는 측정은 unknown입니다.
5. 자신의 조건으로 별도 프로젝트에서 재실행하고 원본 연구 기록과 나란히 저장합니다.

확인 결과와 한계:

- 타 공정 논문의 PPA·ENOB·silicon 성능을 SKY130 구현이 재현했다고 주장하지 않습니다.
- 예전 generation 실패와 현재 generation 결과를 섞어 통과율을 만들지 않습니다.

막혔을 때:

- 논문 제목만으로 full text를 읽었다고 해석하지 않습니다. read_scope를 확인합니다.
- complete Liberty/STA/통계 수율/foundry closure는 별도입니다.

## 제조 인계 준비 · 검증 파일과 남은 범위

제조에 필요한 것과 공개 참조에서 미완료인 것을 구분합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/manufacturing-handoff/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/examples/physical-library/MANUFACTURING.md)

시작 조건:

- 현재 revision의 layout·회로·조건·실제 실행 artifacts

1. GDS/OASIS, 편집 프로젝트, reference SPICE와 모델/PDK/deck 해시를 같은 revision으로 묶습니다.
2. DRC/LVS/PEX·post·PVT의 run IDs·로그·marker·측정·실패 이력을 포함합니다.
3. foundry 최종 deck, density/antenna, guard ring/dummy/isolation, pad/ESD/seal ring/package를 체크합니다.
4. 전원 EM/IR, timing/Liberty/STA, noise/mismatch/yield, full-chip closure의 완료 근거와 미완료 항목을 적습니다.
5. 해당 제조/PDK 운영자와 검증 범위·인계 규격을 확인합니다. 공개 예제의 PASS를 제조 승인으로 표시하지 않습니다.

확인 결과와 한계:

- 이 튜토리얼/예제는 제조 승인이나 테이프아웃 인증을 제공하지 않습니다.
- 원본 모델·license·secret은 공개 인계 자료에 넣지 않습니다.

막혔을 때:

- 기준 없는 측정을 PASS로 바꾸지 않습니다.
- GDS만 남기지 말고 편집 계층·조건·검증 로그를 함께 보존합니다.

## 4:1 MUX · 20 MOS 전송 게이트 + 출력 버퍼

Y가 선택 입력과 일치하는지 실제 rail과 안정 구간으로 검사합니다. 5ns post 실패와 20ns 통과 조건을 구분합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-mux4/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/examples/mux4/README.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 회로 template의 4:1 MUX · 20 MOS 전송 게이트 + 출력 버퍼 (mux4)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. D0–D3와 S1/S0의 64개 입력 조합을 생성합니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. Y가 선택 입력과 일치하는지 실제 rail과 안정 구간으로 검사합니다. 5ns post 실패와 20ns 통과 조건을 구분합니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 공개 SKY130 참조 회로입니다. 기록된 조건·단계의 실행을 확인하고 새 프로젝트에서 다시 검증합니다. 제조 승인과 전체 PVT/timing closure는 별도입니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## RC 저역통과 필터

OUT이 최종 값의 63.212%에 도달한 시간을 RC와 비교합니다. 기본 10kΩ·1pF는 10ns입니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-rc-lowpass/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/integrated-design.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 회로 template의 RC 저역통과 필터 (rc_lowpass)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. IN step과 R·C를 정하고 IN/OUT을 겹쳐 봅니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. OUT이 최종 값의 63.212%에 도달한 시간을 RC와 비교합니다. 기본 10kΩ·1pF는 10ns입니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 공개 SKY130 참조 회로입니다. 기록된 조건·단계의 실행을 확인하고 새 프로젝트에서 다시 검증합니다. 제조 승인과 전체 PVT/timing closure는 별도입니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## MOS 공통 소스 · 명시적 게이트 바이어스

입력 증가에 대한 출력 반전과 DC operating point를 확인합니다. 소신호 이득은 지원 AC 조건에서 측정합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-common-source/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/integrated-design.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 회로 template의 MOS 공통 소스 · 명시적 게이트 바이어스 (common_source)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. 외부 gate bias와 drain 부하, IN/OUT·supply current를 확인합니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. 입력 증가에 대한 출력 반전과 DC operating point를 확인합니다. 소신호 이득은 지원 AC 조건에서 측정합니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 공개 SKY130 참조 회로입니다. 기록된 조건·단계의 실행을 확인하고 새 프로젝트에서 다시 검증합니다. 제조 승인과 전체 PVT/timing closure는 별도입니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## MOS 공통 소스 · 저항 분압 바이어스

명시적 bias 회로와 비교해 실제 gate/drain 바이어스·출력 rail·supply current를 봅니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-common-source-bias/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/integrated-design.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 회로 template의 MOS 공통 소스 · 저항 분압 바이어스 (common_source_bias)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. 저항 분압으로 형성되는 gate 전압과 MOS W/L을 확인합니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. 명시적 bias 회로와 비교해 실제 gate/drain 바이어스·출력 rail·supply current를 봅니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 공개 SKY130 참조 회로입니다. 기록된 조건·단계의 실행을 확인하고 새 프로젝트에서 다시 검증합니다. 제조 승인과 전체 PVT/timing closure는 별도입니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## NMOS 전류 미러

출력 branch 전류와 compliance 범위를 확인합니다. 두 W/L 비율만으로 전류 정확도를 보장하지 않습니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-current-mirror/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/integrated-design.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 회로 template의 NMOS 전류 미러 (current_mirror)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. IREF와 diode-connected 기준 MOS·출력 MOS의 실제 연결을 봅니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. 출력 branch 전류와 compliance 범위를 확인합니다. 두 W/L 비율만으로 전류 정확도를 보장하지 않습니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 공개 SKY130 참조 회로입니다. 기록된 조건·단계의 실행을 확인하고 새 프로젝트에서 다시 검증합니다. 제조 승인과 전체 PVT/timing closure는 별도입니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## NMOS 차동 쌍

차동 입력의 부호를 바꿔 branch 전류 분배와 output을 봅니다. common-mode와 headroom 조건을 같이 기록합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-differential-pair/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/integrated-design.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 회로 template의 NMOS 차동 쌍 (differential_pair)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. INP/INN·tail bias·양쪽 drain 출력을 확인합니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. 차동 입력의 부호를 바꿔 branch 전류 분배와 output을 봅니다. common-mode와 headroom 조건을 같이 기록합니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 공개 SKY130 참조 회로입니다. 기록된 조건·단계의 실행을 확인하고 새 프로젝트에서 다시 검증합니다. 제조 승인과 전체 PVT/timing closure는 별도입니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## LDO · 1.8V → 1.2V PMOS 레귤레이터

light/heavy/recovery 출력과 undershoot·ripple·signed 공급 전력을 비교합니다. PSRR 수치는 별도 AC 실험입니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-chip-ldo/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/examples/physical-library/README.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 칩 레퍼런스의 LDO · 1.8V → 1.2V PMOS 레귤레이터 (chip_ldo)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. 1.8V 공급·1.2V 목표, FB·GATE·OUT과 실제 load step을 봅니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. light/heavy/recovery 출력과 undershoot·ripple·signed 공급 전력을 비교합니다. PSRR 수치는 별도 AC 실험입니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 공개 SKY130 참조 회로입니다. 기록된 조건·단계의 실행을 확인하고 새 프로젝트에서 다시 검증합니다. 제조 승인과 전체 PVT/timing closure는 별도입니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## DC-DC · 2:1 스위치드 커패시터 코어

스위칭 주기별 OUT 평균·ripple·공급 전류를 측정합니다. 이상 클록/입력 driver 전력을 포함했는지 구분합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-chip-sc-dcdc/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/examples/physical-library/README.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 칩 레퍼런스의 DC-DC · 2:1 스위치드 커패시터 코어 (chip_sc_dcdc)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. 2:1 switched-capacitor의 phase·flying/output capacitor와 부하를 확인합니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. 스위칭 주기별 OUT 평균·ripple·공급 전류를 측정합니다. 이상 클록/입력 driver 전력을 포함했는지 구분합니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 공개 SKY130 참조 회로입니다. 기록된 조건·단계의 실행을 확인하고 새 프로젝트에서 다시 검증합니다. 제조 승인과 전체 PVT/timing closure는 별도입니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## VCO · 전류 제한 3단 링 발진기

실제 OUT rail crossing으로 주기/주파수를 측정하고 CTRL을 바꿔 tuning 범위를 비교합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-chip-vco/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/examples/physical-library/README.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 칩 레퍼런스의 VCO · 전류 제한 3단 링 발진기 (chip_vco)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. 제어 전압·전류 제한 MOS와 3단 ring 계층을 봅니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. 실제 OUT rail crossing으로 주기/주파수를 측정하고 CTRL을 바꿔 tuning 범위를 비교합니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 공개 SKY130 참조 회로입니다. 기록된 조건·단계의 실행을 확인하고 새 프로젝트에서 다시 검증합니다. 제조 승인과 전체 PVT/timing closure는 별도입니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## PLL · XOR 위상 검출 1:1 루프

REF/OUT 주파수 차이·phase span·CTRL을 함께 봅니다. v0.17 pre/post 잠금 실패와 연구 generation의 다른 조건을 구분합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-chip-pll/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/examples/physical-library/README.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 칩 레퍼런스의 PLL · XOR 위상 검출 1:1 루프 (chip_pll)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. REF → XOR phase detector → RC → VCO의 되먹임을 확인합니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. REF/OUT 주파수 차이·phase span·CTRL을 함께 봅니다. v0.17 pre/post 잠금 실패와 연구 generation의 다른 조건을 구분합니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 공개 SKY130 참조 회로입니다. 기록된 조건·단계의 실행을 확인하고 새 프로젝트에서 다시 검증합니다. 제조 승인과 전체 PVT/timing closure는 별도입니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## OTA · 5-MOS 전류 미러 부하 증폭기

입력 극성·output 범위·지원 AC 이득을 측정합니다. MOS 동작점과 외부 bias/부하를 원문 testbench와 맞춥니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-chip-ota/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/examples/physical-library/README.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 칩 레퍼런스의 OTA · 5-MOS 전류 미러 부하 증폭기 (chip_ota)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. 5-MOS current-mirror 부하와 차동 입력·출력 bias를 확인합니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. 입력 극성·output 범위·지원 AC 이득을 측정합니다. MOS 동작점과 외부 bias/부하를 원문 testbench와 맞춥니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 공개 SKY130 참조 회로입니다. 기록된 조건·단계의 실행을 확인하고 새 프로젝트에서 다시 검증합니다. 제조 승인과 전체 PVT/timing closure는 별도입니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## 비교기 · 차동 입력 + CMOS 출력

입력 부호에 따라 OUT이 확실한 CMOS rail에 도달하는지 봅니다. 중간 전압은 합격으로 처리하지 않습니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-chip-comparator/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/examples/physical-library/README.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 칩 레퍼런스의 비교기 · 차동 입력 + CMOS 출력 (chip_comparator)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. 차동 입력·출력 복원 단계와 VPWR/VGND를 확인합니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. 입력 부호에 따라 OUT이 확실한 CMOS rail에 도달하는지 봅니다. 중간 전압은 합격으로 처리하지 않습니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 공개 SKY130 참조 회로입니다. 기록된 조건·단계의 실행을 확인하고 새 프로젝트에서 다시 검증합니다. 제조 승인과 전체 PVT/timing closure는 별도입니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## INV · 직접 만든 CMOS 기본 셀

Y=¬A, rail/settling을 확인합니다. drive·slew·load 실험에서는 sensitized timing arc와 signed VDD energy를 비교합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-cell-inv/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/examples/physical-library/README.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 기본 CMOS 셀의 INV · 직접 만든 CMOS 기본 셀 (cell_inv)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. A를 0/1로 바꾸고 PMOS/NMOS gate·drain·body를 확인합니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. Y=¬A, rail/settling을 확인합니다. drive·slew·load 실험에서는 sensitized timing arc와 signed VDD energy를 비교합니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 기본 CMOS 참조 셀입니다. 선택 drive/slew/load의 실제 특성표는 완전한 HD standard-cell/Liberty/STA 라이브러리가 아닙니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## NAND2 · 직접 만든 CMOS 기본 셀

Y=¬(A∧B)이며 두 입력이 모두 HIGH일 때만 LOW인지 실제 rail로 확인합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-cell-nand2/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/examples/physical-library/README.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 기본 CMOS 셀의 NAND2 · 직접 만든 CMOS 기본 셀 (cell_nand2)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. A/B 네 조합과 직렬 NMOS·병렬 PMOS를 확인합니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. Y=¬(A∧B)이며 두 입력이 모두 HIGH일 때만 LOW인지 실제 rail로 확인합니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 기본 CMOS 참조 셀입니다. 선택 drive/slew/load의 실제 특성표는 완전한 HD standard-cell/Liberty/STA 라이브러리가 아닙니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## NOR2 · 직접 만든 CMOS 기본 셀

Y=¬(A∨B)이며 두 입력이 모두 LOW일 때만 HIGH인지 확인합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-cell-nor2/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/examples/physical-library/README.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 기본 CMOS 셀의 NOR2 · 직접 만든 CMOS 기본 셀 (cell_nor2)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. A/B 네 조합과 병렬 NMOS·직렬 PMOS를 확인합니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. Y=¬(A∨B)이며 두 입력이 모두 LOW일 때만 HIGH인지 확인합니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 기본 CMOS 참조 셀입니다. 선택 drive/slew/load의 실제 특성표는 완전한 HD standard-cell/Liberty/STA 라이브러리가 아닙니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## AND2 · 직접 만든 CMOS 기본 셀

Y=A∧B의 네 조합과 두 단계 지연을 봅니다. 부하 조건을 변경하면 같은 테스트를 다시 실행합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-cell-and2/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/examples/physical-library/README.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 기본 CMOS 셀의 AND2 · 직접 만든 CMOS 기본 셀 (cell_and2)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. NAND2와 출력 inverter 계층을 엽니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. Y=A∧B의 네 조합과 두 단계 지연을 봅니다. 부하 조건을 변경하면 같은 테스트를 다시 실행합니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 기본 CMOS 참조 셀입니다. 선택 drive/slew/load의 실제 특성표는 완전한 HD standard-cell/Liberty/STA 라이브러리가 아닙니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## OR2 · 직접 만든 CMOS 기본 셀

Y=A∨B의 네 조합을 확인하고 실제 경로와 supply current를 봅니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-cell-or2/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/examples/physical-library/README.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 기본 CMOS 셀의 OR2 · 직접 만든 CMOS 기본 셀 (cell_or2)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. NOR2와 출력 inverter 계층을 엽니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. Y=A∨B의 네 조합을 확인하고 실제 경로와 supply current를 봅니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 기본 CMOS 참조 셀입니다. 선택 drive/slew/load의 실제 특성표는 완전한 HD standard-cell/Liberty/STA 라이브러리가 아닙니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## XOR2 · 직접 만든 CMOS 기본 셀

A≠B에서만 Y=1인지 네 조합의 실제 출력 전압으로 검사합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-cell-xor2/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/examples/physical-library/README.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 기본 CMOS 셀의 XOR2 · 직접 만든 CMOS 기본 셀 (cell_xor2)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. NAND2 네 개의 N1/N2/N3/N4 계층과 출력 연결을 확인합니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. A≠B에서만 Y=1인지 네 조합의 실제 출력 전압으로 검사합니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 기본 CMOS 참조 셀입니다. 선택 drive/slew/load의 실제 특성표는 완전한 HD standard-cell/Liberty/STA 라이브러리가 아닙니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## XNOR2 · 직접 만든 CMOS 기본 셀

A=B에서 Y=1인지 네 조합을 확인합니다. 단순 inversion 표기와 실제 MOS graph를 대조합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-cell-xnor2/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/examples/physical-library/README.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 기본 CMOS 셀의 XNOR2 · 직접 만든 CMOS 기본 셀 (cell_xnor2)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. XOR의 보수 출력 연결을 확인합니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. A=B에서 Y=1인지 네 조합을 확인합니다. 단순 inversion 표기와 실제 MOS graph를 대조합니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 기본 CMOS 참조 셀입니다. 선택 drive/slew/load의 실제 특성표는 완전한 HD standard-cell/Liberty/STA 라이브러리가 아닙니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## MUX2 · 직접 만든 CMOS 기본 셀

Y=S?D1:D0를 실제 입력 조합으로 검사합니다. select 전환의 settling/전압 중간 구간을 봅니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-cell-mux2/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/examples/physical-library/README.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 기본 CMOS 셀의 MUX2 · 직접 만든 CMOS 기본 셀 (cell_mux2)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. D0/D1/S와 내부 전송 게이트를 확인합니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. Y=S?D1:D0를 실제 입력 조합으로 검사합니다. select 전환의 settling/전압 중간 구간을 봅니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 기본 CMOS 참조 셀입니다. 선택 drive/slew/load의 실제 특성표는 완전한 HD standard-cell/Liberty/STA 라이브러리가 아닙니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## ΣΔ · 입력 RC anti-alias 필터

모듈레이터 문맥에서 VIN/OUT 변화를 비교합니다. 단독 RC time constant와 전체 ADC 출력 해상도는 다른 측정입니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-sdm8-input-filter/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/examples/sigma-delta8/README.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 디지털 replay/생성에 Yosys·Icarus/VVP 등 실제 추가 도구
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 시그마델타 ADC 19개 블록의 ΣΔ · 입력 RC anti-alias 필터 (sdm8_input_filter)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. VIN → 10kΩ·100pF → OUT RC를 엽니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. 모듈레이터 문맥에서 VIN/OUT 변화를 비교합니다. 단독 RC time constant와 전체 ADC 출력 해상도는 다른 측정입니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 아날로그 ngspice와 디지털 RTL/gate/IR replay의 연결된 검사 문맥입니다. 전체 디지털 MOS timing·전체 ADC 마스크·모든 잡음/편차/PVT·제조 승인은 별도입니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## ΣΔ · VDD/2 기준전압 · 디커플링

VCM과 VDD 변화의 비율을 읽습니다. precision bandgap이 아니라 ratiometric 기준입니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-sdm8-reference/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/examples/sigma-delta8/README.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 디지털 replay/생성에 Yosys·Icarus/VVP 등 실제 추가 도구
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 시그마델타 ADC 19개 블록의 ΣΔ · VDD/2 기준전압 · 디커플링 (sdm8_reference)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. VDD/2 저항 분압·20pF decoupling을 확인합니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. VCM과 VDD 변화의 비율을 읽습니다. precision bandgap이 아니라 ratiometric 기준입니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 아날로그 ngspice와 디지털 RTL/gate/IR replay의 연결된 검사 문맥입니다. 전체 디지털 MOS timing·전체 ADC 마스크·모든 잡음/편차/PVT·제조 승인은 별도입니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## ΣΔ · 저항·다이오드 MOS 바이어스

BIAS·공급 전류와 전원/모델 조건을 비교합니다. 외부 reference 정확도를 보장하지 않습니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-sdm8-bias/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/examples/sigma-delta8/README.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 디지털 replay/생성에 Yosys·Icarus/VVP 등 실제 추가 도구
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 시그마델타 ADC 19개 블록의 ΣΔ · 저항·다이오드 MOS 바이어스 (sdm8_bias)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. 저항·diode NMOS와 bias net을 확인합니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. BIAS·공급 전류와 전원/모델 조건을 비교합니다. 외부 reference 정확도를 보장하지 않습니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 아날로그 ngspice와 디지털 RTL/gate/IR replay의 연결된 검사 문맥입니다. 전체 디지털 MOS timing·전체 ADC 마스크·모든 잡음/편차/PVT·제조 승인은 별도입니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## ΣΔ · 7-MOS 2단 Miller OTA

전체 모듈레이터 문맥의 입력/출력과 적분기 settling을 봅니다. 단독 안정도/잡음 인증은 별도입니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-sdm8-ota/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/examples/sigma-delta8/README.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 디지털 replay/생성에 Yosys·Icarus/VVP 등 실제 추가 도구
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 시그마델타 ADC 19개 블록의 ΣΔ · 7-MOS 2단 Miller OTA (sdm8_ota)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. 7-MOS 2단 Miller OTA·0.5pF 보상·입력단을 엽니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. 전체 모듈레이터 문맥의 입력/출력과 적분기 settling을 봅니다. 단독 안정도/잡음 인증은 별도입니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 아날로그 ngspice와 디지털 RTL/gate/IR replay의 연결된 검사 문맥입니다. 전체 디지털 MOS timing·전체 ADC 마스크·모든 잡음/편차/PVT·제조 승인은 별도입니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## ΣΔ · 합산 저항 · 피드백 적분기

VIN·DACB·integrator 파형을 함께 봅니다. reset 이후 복귀와 rail 포화 여부를 확인합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-sdm8-integrator/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/examples/sigma-delta8/README.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 디지털 replay/생성에 Yosys·Icarus/VVP 등 실제 추가 도구
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 시그마델타 ADC 19개 블록의 ΣΔ · 합산 저항 · 피드백 적분기 (sdm8_integrator)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. 입력/되먹임 500kΩ, 4pF 적분 capacitor와 reset path를 확인합니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. VIN·DACB·integrator 파형을 함께 봅니다. reset 이후 복귀와 rail 포화 여부를 확인합니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 아날로그 ngspice와 디지털 RTL/gate/IR replay의 연결된 검사 문맥입니다. 전체 디지털 MOS timing·전체 ADC 마스크·모든 잡음/편차/PVT·제조 승인은 별도입니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## ΣΔ · 7-MOS 1비트 비교기

모듈레이터 문맥에서 비교 입력과 BITSTREAM 결정을 대조합니다. clock edge의 모호 전압은 실패입니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-sdm8-comparator/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/examples/sigma-delta8/README.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 디지털 replay/생성에 Yosys·Icarus/VVP 등 실제 추가 도구
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 시그마델타 ADC 19개 블록의 ΣΔ · 7-MOS 1비트 비교기 (sdm8_comparator)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. 차동 7-MOS 비교기 입력과 출력 net을 엽니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. 모듈레이터 문맥에서 비교 입력과 BITSTREAM 결정을 대조합니다. clock edge의 모호 전압은 실패입니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 아날로그 ngspice와 디지털 RTL/gate/IR replay의 연결된 검사 문맥입니다. 전체 디지털 MOS timing·전체 ADC 마스크·모든 잡음/편차/PVT·제조 승인은 별도입니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## ΣΔ · 샘플 DFF · reset MUX

양의 clock edge에서 비교 결과가 저장되고 reset 시 알려진 상태로 복귀하는지 확인합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-sdm8-sample-latch/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/examples/sigma-delta8/README.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 디지털 replay/생성에 Yosys·Icarus/VVP 등 실제 추가 도구
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 시그마델타 ADC 19개 블록의 ΣΔ · 샘플 DFF · reset MUX (sdm8_sample_latch)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. sample DFF와 reset MUX 계층을 엽니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. 양의 clock edge에서 비교 결과가 저장되고 reset 시 알려진 상태로 복귀하는지 확인합니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 아날로그 ngspice와 디지털 RTL/gate/IR replay의 연결된 검사 문맥입니다. 전체 디지털 MOS timing·전체 ADC 마스크·모든 잡음/편차/PVT·제조 승인은 별도입니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## ΣΔ · 1비트 NRZ 피드백 DAC

DACB=VDD×(1−BITSTREAM)과 analog feedback의 실제 전압을 확인합니다. 전용 precision reference는 없습니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-sdm8-dac/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/examples/sigma-delta8/README.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 디지털 replay/생성에 Yosys·Icarus/VVP 등 실제 추가 도구
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 시그마델타 ADC 19개 블록의 ΣΔ · 1비트 NRZ 피드백 DAC (sdm8_dac)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. 1 PMOS·1 NMOS NRZ DAC의 BITSTREAM/DACB를 봅니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. DACB=VDD×(1−BITSTREAM)과 analog feedback의 실제 전압을 확인합니다. 전용 precision reference는 없습니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 아날로그 ngspice와 디지털 RTL/gate/IR replay의 연결된 검사 문맥입니다. 전체 디지털 MOS timing·전체 ADC 마스크·모든 잡음/편차/PVT·제조 승인은 별도입니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## ΣΔ · 2단 클록 버퍼

입출력 극성과 CLK rail을 모듈레이터 문맥에서 확인합니다. 전체 디지털 MOS timing은 별도입니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-sdm8-clock-buffer/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/examples/sigma-delta8/README.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 디지털 replay/생성에 Yosys·Icarus/VVP 등 실제 추가 도구
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 시그마델타 ADC 19개 블록의 ΣΔ · 2단 클록 버퍼 (sdm8_clock_buffer)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. 2단 inverter clock buffer의 내부 MOS와 CLK nets를 엽니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. 입출력 극성과 CLK rail을 모듈레이터 문맥에서 확인합니다. 전체 디지털 MOS timing은 별도입니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 아날로그 ngspice와 디지털 RTL/gate/IR replay의 연결된 검사 문맥입니다. 전체 디지털 MOS timing·전체 ADC 마스크·모든 잡음/편차/PVT·제조 승인은 별도입니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## ΣΔ · 적분기 초기화 전송 게이트

reset 구간의 integrator 초기화와 release 후 정상 BITSTREAM 복귀를 봅니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-sdm8-reset-switch/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/examples/sigma-delta8/README.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 디지털 replay/생성에 Yosys·Icarus/VVP 등 실제 추가 도구
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 시그마델타 ADC 19개 블록의 ΣΔ · 적분기 초기화 전송 게이트 (sdm8_reset_switch)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. 적분기 reset transmission gate와 제어 신호를 엽니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. reset 구간의 integrator 초기화와 release 후 정상 BITSTREAM 복귀를 봅니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 아날로그 ngspice와 디지털 RTL/gate/IR replay의 연결된 검사 문맥입니다. 전체 디지털 MOS timing·전체 ADC 마스크·모든 잡음/편차/PVT·제조 승인은 별도입니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## ΣΔ · 1차 아날로그 시그마델타 모듈레이터

VIN 0.9V에서 BITSTREAM 밀도와 integrator 범위를 봅니다. 디지털 decimator와 함께 읽기 전까지 8bit CODE가 아닙니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-sdm8-modulator/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/examples/sigma-delta8/README.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 디지털 replay/생성에 Yosys·Icarus/VVP 등 실제 추가 도구
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 시그마델타 ADC 19개 블록의 ΣΔ · 1차 아날로그 시그마델타 모듈레이터 (sdm8_modulator)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. 입력 filter·VCM·bias·OTA integrator·comparator·latch·DAC 계층을 엽니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. VIN 0.9V에서 BITSTREAM 밀도와 integrator 범위를 봅니다. 디지털 decimator와 함께 읽기 전까지 8bit CODE가 아닙니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 아날로그 ngspice와 디지털 RTL/gate/IR replay의 연결된 검사 문맥입니다. 전체 디지털 MOS timing·전체 ADC 마스크·모든 잡음/편차/PVT·제조 승인은 별도입니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## ΣΔ · 리셋 해제 2FF 동기화

RTL·합성 gate·CMOS IR replay의 reset release/출력 상태를 독립 reference와 대조합니다. metastability silicon MTBF는 별도입니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-sdm8-reset-sync/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/examples/sigma-delta8/README.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 디지털 replay/생성에 Yosys·Icarus/VVP 등 실제 추가 도구
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 시그마델타 ADC 19개 블록의 ΣΔ · 리셋 해제 2FF 동기화 (sdm8_reset_sync)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. reset release 2FF와 음/양 edge 관계를 확인합니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. RTL·합성 gate·CMOS IR replay의 reset release/출력 상태를 독립 reference와 대조합니다. metastability silicon MTBF는 별도입니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 아날로그 ngspice와 디지털 RTL/gate/IR replay의 연결된 검사 문맥입니다. 전체 디지털 MOS timing·전체 ADC 마스크·모든 잡음/편차/PVT·제조 승인은 별도입니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## ΣΔ · 256 샘플 프레임 카운터

각 256 입력 뒤 frame strobe와 reset wrap을 검증합니다. 1MHz 입력이면 3.90625kHz frame rate입니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-sdm8-frame-counter/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/examples/sigma-delta8/README.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 디지털 replay/생성에 Yosys·Icarus/VVP 등 실제 추가 도구
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 시그마델타 ADC 19개 블록의 ΣΔ · 256 샘플 프레임 카운터 (sdm8_frame_counter)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. 256 sample frame counter의 carry·reset 경로를 엽니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. 각 256 입력 뒤 frame strobe와 reset wrap을 검증합니다. 1MHz 입력이면 3.90625kHz frame rate입니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 아날로그 ngspice와 디지털 RTL/gate/IR replay의 연결된 검사 문맥입니다. 전체 디지털 MOS timing·전체 ADC 마스크·모든 잡음/편차/PVT·제조 승인은 별도입니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## ΣΔ · 17비트 CIC 적분기 2단

modulo 2^17 정수 trace가 독립 reference와 매 clock 일치하는지 확인합니다. SPICE 전수 timing과 다릅니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-sdm8-cic-integrators/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/examples/sigma-delta8/README.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 디지털 replay/생성에 Yosys·Icarus/VVP 등 실제 추가 도구
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 시그마델타 ADC 19개 블록의 ΣΔ · 17비트 CIC 적분기 2단 (sdm8_cic_integrators)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. 17bit accumulator 두 단과 carry 계층을 엽니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. modulo 2^17 정수 trace가 독립 reference와 매 clock 일치하는지 확인합니다. SPICE 전수 timing과 다릅니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 아날로그 ngspice와 디지털 RTL/gate/IR replay의 연결된 검사 문맥입니다. 전체 디지털 MOS timing·전체 ADC 마스크·모든 잡음/편차/PVT·제조 승인은 별도입니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## ΣΔ · 17비트 CIC comb 2단

decimated strobe에서 현재/이전 frame 차분을 대조합니다. 실제 두 단의 값과 reset을 확인합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-sdm8-cic-combs/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/examples/sigma-delta8/README.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 디지털 replay/생성에 Yosys·Icarus/VVP 등 실제 추가 도구
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 시그마델타 ADC 19개 블록의 ΣΔ · 17비트 CIC comb 2단 (sdm8_cic_combs)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. 17bit comb 두 단과 지연 register를 엽니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. decimated strobe에서 현재/이전 frame 차분을 대조합니다. 실제 두 단의 값과 reset을 확인합니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 아날로그 ngspice와 디지털 RTL/gate/IR replay의 연결된 검사 문맥입니다. 전체 디지털 MOS timing·전체 ADC 마스크·모든 잡음/편차/PVT·제조 승인은 별도입니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## ΣΔ · 8비트 스케일 · 포화 처리

256을 255로 포화하고 음/범위 경계 처리를 reference와 대조합니다. code width와 ENOB를 구분합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-sdm8-scale-saturate/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/examples/sigma-delta8/README.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 디지털 replay/생성에 Yosys·Icarus/VVP 등 실제 추가 도구
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 시그마델타 ADC 19개 블록의 ΣΔ · 8비트 스케일 · 포화 처리 (sdm8_scale_saturate)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. CIC word → floor(CIC/256) → 8bit 포화 경로를 봅니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. 256을 255로 포화하고 음/범위 경계 처리를 reference와 대조합니다. code width와 ENOB를 구분합니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 아날로그 ngspice와 디지털 RTL/gate/IR replay의 연결된 검사 문맥입니다. 전체 디지털 MOS timing·전체 ADC 마스크·모든 잡음/편차/PVT·제조 승인은 별도입니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## ΣΔ · 8비트 출력 레지스터 · VALID

각 frame의 CODE/VALID·reset 동작을 RTL/gate/IR replay에서 비교합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-sdm8-output-register/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/examples/sigma-delta8/README.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 디지털 replay/생성에 Yosys·Icarus/VVP 등 실제 추가 도구
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 시그마델타 ADC 19개 블록의 ΣΔ · 8비트 출력 레지스터 · VALID (sdm8_output_register)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. 8bit register와 VALID 경로를 엽니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. 각 frame의 CODE/VALID·reset 동작을 RTL/gate/IR replay에서 비교합니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 아날로그 ngspice와 디지털 RTL/gate/IR replay의 연결된 검사 문맥입니다. 전체 디지털 MOS timing·전체 ADC 마스크·모든 잡음/편차/PVT·제조 승인은 별도입니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## ΣΔ · CIC2 ×256 디지털 필터 전체

DC gain=256², 첫 두 settling frame, code 변화를 봅니다. 연구 응답의 droop/group delay는 따로 읽습니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-sdm8-filter/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/examples/sigma-delta8/README.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 디지털 replay/생성에 Yosys·Icarus/VVP 등 실제 추가 도구
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 시그마델타 ADC 19개 블록의 ΣΔ · CIC2 ×256 디지털 필터 전체 (sdm8_filter)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. CIC2 integrator·256 counter·comb·scale·register를 순서대로 엽니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. DC gain=256², 첫 두 settling frame, code 변화를 봅니다. 연구 응답의 droop/group delay는 따로 읽습니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 아날로그 ngspice와 디지털 RTL/gate/IR replay의 연결된 검사 문맥입니다. 전체 디지털 MOS timing·전체 ADC 마스크·모든 잡음/편차/PVT·제조 승인은 별도입니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## ΣΔ · 8비트 시그마델타 ADC · 전체 하위 블록

DC CODE 128과 사인 조건 0.9V±0.6V·183.10546875Hz·66frame 중 64frame FFT를 비교합니다. 기록 ENOB≈7.34bit는 모든 잡음/PVT 인증이 아닙니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-sigma-delta8/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/examples/sigma-delta8/README.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 디지털 replay/생성에 Yosys·Icarus/VVP 등 실제 추가 도구
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 시그마델타 ADC 19개 블록의 ΣΔ · 8비트 시그마델타 ADC · 전체 하위 블록 (sigma_delta8)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. 1MHz clock·VIN 0.9V와 전체 analog/digital 계층을 엽니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. DC CODE 128과 사인 조건 0.9V±0.6V·183.10546875Hz·66frame 중 64frame FFT를 비교합니다. 기록 ENOB≈7.34bit는 모든 잡음/PVT 인증이 아닙니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 아날로그 ngspice와 디지털 RTL/gate/IR replay의 연결된 검사 문맥입니다. 전체 디지털 MOS timing·전체 ADC 마스크·모든 잡음/편차/PVT·제조 승인은 별도입니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## SoC · 바이어스·공통모드 기준

BIAS/VCM·부하·공급 전류를 실제 waveform에서 확인합니다. 다른 SoC 블록의 외부 bias와 구분합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-soc-bias/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/analog-soc.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 아날로그 SoC의 SoC · 바이어스·공통모드 기준 (soc_bias)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. 내부 VDD/2·MOS bias와 OTA 의존 셀을 엽니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. BIAS/VCM·부하·공급 전류를 실제 waveform에서 확인합니다. 다른 SoC 블록의 외부 bias와 구분합니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 공개 SKY130 매크로입니다. 외부 공급·입력·부하/BIAS/VCM 가정을 확인합니다. 18점 PVT와 선택 특성 검사는 full-chip closure/통계 수율/제조 승인이 아닙니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## SoC · 4-MOS 캐스코드 전류 미러

output current ratio와 headroom을 확인합니다. 외부 IREF 에너지와 VDD 전력을 구분합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-soc-cascode-mirror/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/analog-soc.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 아날로그 SoC의 SoC · 4-MOS 캐스코드 전류 미러 (soc_cascode_mirror)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. 4-MOS cascode와 외부 IREF·output compliance를 봅니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. output current ratio와 headroom을 확인합니다. 외부 IREF 에너지와 VDD 전력을 구분합니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 공개 SKY130 매크로입니다. 외부 공급·입력·부하/BIAS/VCM 가정을 확인합니다. 18점 PVT와 선택 특성 검사는 full-chip closure/통계 수율/제조 승인이 아닙니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## SoC · 2단 Miller 보상 OTA

gain·UGF·phase margin은 해당 연구 AC 조건에서 확인합니다. high-UGF/low-power 실패와 nominal 통과를 분리합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-soc-miller-ota/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/analog-soc.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 아날로그 SoC의 SoC · 2단 Miller 보상 OTA (soc_miller_ota)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. 입력쌍·2단 증폭·Miller capacitor·ABBA 매칭을 확인합니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. gain·UGF·phase margin은 해당 연구 AC 조건에서 확인합니다. high-UGF/low-power 실패와 nominal 통과를 분리합니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 공개 SKY130 매크로입니다. 외부 공급·입력·부하/BIAS/VCM 가정을 확인합니다. 18점 PVT와 선택 특성 검사는 full-chip closure/통계 수율/제조 승인이 아닙니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## SoC · ×2/×8 가변 이득 증폭기

gain 두 모드의 actual OUT·rail·settling을 비교합니다. 18점 PVT 기록과 원하는 새 조건을 구분합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-soc-pga/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/analog-soc.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 아날로그 SoC의 SoC · ×2/×8 가변 이득 증폭기 (soc_pga)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. gain-select와 ×2/×8 피드백 저항·OTA를 확인합니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. gain 두 모드의 actual OUT·rail·settling을 비교합니다. 18점 PVT 기록과 원하는 새 조건을 구분합니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 공개 SKY130 매크로입니다. 외부 공급·입력·부하/BIAS/VCM 가정을 확인합니다. 18점 PVT와 선택 특성 검사는 full-chip closure/통계 수율/제조 승인이 아닙니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## SoC · 버퍼형 2극 active RC 필터

입출력 주파수/settling을 확인하고 RC 값 변경 후 전달함수를 다시 측정합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-soc-filter2/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/analog-soc.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 아날로그 SoC의 SoC · 버퍼형 2극 active RC 필터 (soc_filter2)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. 두 pole RC·buffer와 실제 외부 VIN/BIAS/VCM을 봅니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. 입출력 주파수/settling을 확인하고 RC 값 변경 후 전달함수를 다시 측정합니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 공개 SKY130 매크로입니다. 외부 공급·입력·부하/BIAS/VCM 가정을 확인합니다. 18점 PVT와 선택 특성 검사는 full-chip closure/통계 수율/제조 승인이 아닙니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## SoC · 보상형 전류 입력 증폭기

입력 전류와 output ΔV 관계·ringing·settling을 봅니다. 공급 전력과 ideal current-source 에너지를 구분합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-soc-tia/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/analog-soc.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 아날로그 SoC의 SoC · 보상형 전류 입력 증폭기 (soc_tia)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. current input·feedback R/C·보상 OTA를 엽니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. 입력 전류와 output ΔV 관계·ringing·settling을 봅니다. 공급 전력과 ideal current-source 에너지를 구분합니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 공개 SKY130 매크로입니다. 외부 공급·입력·부하/BIAS/VCM 가정을 확인합니다. 18점 PVT와 선택 특성 검사는 full-chip closure/통계 수율/제조 승인이 아닙니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## SoC · 센서 AFE·클록 동기 판정

analog 입력부터 판정 출력까지 실제 node와 안정 구간을 확인합니다. 완성 CPU/ADC/pad SoC가 아닙니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-soc-sensor-afe/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/analog-soc.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 아날로그 SoC의 SoC · 센서 AFE·클록 동기 판정 (soc_sensor_afe)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. bias → PGA/filter → comparator·clock 판정 계층을 엽니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. analog 입력부터 판정 출력까지 실제 node와 안정 구간을 확인합니다. 완성 CPU/ADC/pad SoC가 아닙니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 공개 SKY130 매크로입니다. 외부 공급·입력·부하/BIAS/VCM 가정을 확인합니다. 18점 PVT와 선택 특성 검사는 full-chip closure/통계 수율/제조 승인이 아닙니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## SAR · CMOS 전송 스위치

샘플 구간 on/off·잔류 전압을 actual transient에서 봅니다. ideal switch로 치환하지 않습니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-sar8-switch/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/sar-adc.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 디지털 replay/생성에 Yosys·Icarus/VVP 등 실제 추가 도구
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 SAR ADC 8개 블록의 SAR · CMOS 전송 스위치 (sar8_switch)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. NMOS/PMOS transmission gate의 A/Y·EN/ENB와 body를 엽니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. 샘플 구간 on/off·잔류 전압을 actual transient에서 봅니다. ideal switch로 치환하지 않습니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 실제 capacitor charge-retaining ngspice 결정과 디지털 replay입니다. 전체 controller mask/timing·INL/DNL·ENOB·noise/yield는 미검증입니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## SAR · VIN / 기준 / GND bottom-plate 선택

acquisition에서 VIN 추종, trial에서 선택 bottom voltage를 확인합니다. 제어 driver RC는 명시적 가정입니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-sar8-bottom-switch/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/sar-adc.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 디지털 replay/생성에 Yosys·Icarus/VVP 등 실제 추가 도구
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 SAR ADC 8개 블록의 SAR · VIN / 기준 / GND bottom-plate 선택 (sar8_bottom_switch)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. VIN/VREF/GND 선택 경로와 상보 제어를 엽니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. acquisition에서 VIN 추종, trial에서 선택 bottom voltage를 확인합니다. 제어 driver RC는 명시적 가정입니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 실제 capacitor charge-retaining ngspice 결정과 디지털 replay입니다. 전체 controller mask/timing·INL/DNL·ENOB·noise/yield는 미검증입니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## SAR · 동일한 400fF 단위 커패시터

하나의 unit과 dummy를 포함한 CDAC 배열의 값·개수를 확인합니다. matching yield는 별도입니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-sar8-unit-cap/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/sar-adc.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 디지털 replay/생성에 Yosys·Icarus/VVP 등 실제 추가 도구
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 SAR ADC 8개 블록의 SAR · 동일한 400fF 단위 커패시터 (sar8_unit_cap)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. 400fF 동일 unit cap의 실제 hierarchy를 엽니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. 하나의 unit과 dummy를 포함한 CDAC 배열의 값·개수를 확인합니다. matching yield는 별도입니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 실제 capacitor charge-retaining ngspice 결정과 디지털 replay입니다. 전체 controller mask/timing·INL/DNL·ENOB·noise/yield는 미검증입니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## SAR · 128:64:32:16:8:4:2:1 + dummy CDAC

VTOP=VCM−VIN+VREF×trial/256 관계와 charge-retaining 실제 trial 파형을 대조합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-sar8-cdac/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/sar-adc.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 디지털 replay/생성에 Yosys·Icarus/VVP 등 실제 추가 도구
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 SAR ADC 8개 블록의 SAR · 128:64:32:16:8:4:2:1 + dummy CDAC (sar8_cdac)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. 128:64:32:16:8:4:2:1과 dummy, 총 256 unit을 봅니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. VTOP=VCM−VIN+VREF×trial/256 관계와 charge-retaining 실제 trial 파형을 대조합니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 실제 capacitor charge-retaining ngspice 결정과 디지털 replay입니다. 전체 controller mask/timing·INL/DNL·ENOB·noise/yield는 미검증입니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## SAR · 차동 비교기 · 실제 CMOS 출력

actual COMP rail과 각 bit 결정의 VIN/VDAC 부호를 확인합니다. 모호 output은 통과하지 않습니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-sar8-comparator/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/sar-adc.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 디지털 replay/생성에 Yosys·Icarus/VVP 등 실제 추가 도구
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 SAR ADC 8개 블록의 SAR · 차동 비교기 · 실제 CMOS 출력 (sar8_comparator)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. 차동 입력과 CMOS 출력 복원 단계·외부 BIAS를 엽니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. actual COMP rail과 각 bit 결정의 VIN/VDAC 부호를 확인합니다. 모호 output은 통과하지 않습니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 실제 capacitor charge-retaining ngspice 결정과 디지털 replay입니다. 전체 controller mask/timing·INL/DNL·ENOB·noise/yield는 미검증입니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## SAR · 샘플링 + CDAC + 비교기 코어

2µs acquisition·2µs bit settling 기본 조건에서 8개 bit trial과 charge retention을 확인합니다. core DRC/LVS/PEX와 controller 미생성 mask를 구분합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-sar8-analog/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/sar-adc.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 디지털 replay/생성에 Yosys·Icarus/VVP 등 실제 추가 도구
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 SAR ADC 8개 블록의 SAR · 샘플링 + CDAC + 비교기 코어 (sar8_analog)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. sampling·CDAC·comparator의 실제 masks와 top/bottom/control를 엽니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. 2µs acquisition·2µs bit settling 기본 조건에서 8개 bit trial과 charge retention을 확인합니다. core DRC/LVS/PEX와 controller 미생성 mask를 구분합니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 실제 capacitor charge-retaining ngspice 결정과 디지털 replay입니다. 전체 controller mask/timing·INL/DNL·ENOB·noise/yield는 미검증입니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## SAR · 합성 SAR 제어·code/valid 레지스터

MSB→LSB trial·CODE·VALID가 실제 simulated COMP 기록과 동일한지 replay합니다. full controller transistor timing은 미실행입니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-sar8-controller/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/sar-adc.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 디지털 replay/생성에 Yosys·Icarus/VVP 등 실제 추가 도구
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 SAR ADC 8개 블록의 SAR · 합성 SAR 제어·code/valid 레지스터 (sar8_controller)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. 실제 Yosys RTL/gates와 편집 CMOS graph를 엽니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. MSB→LSB trial·CODE·VALID가 실제 simulated COMP 기록과 동일한지 replay합니다. full controller transistor timing은 미실행입니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 실제 capacitor charge-retaining ngspice 결정과 디지털 replay입니다. 전체 controller mask/timing·INL/DNL·ENOB·noise/yield는 미검증입니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## SAR · 8비트 SAR · 전체 계층

8 comparisons 후 CODE/VALID를 확인합니다. LSB=1.2/256=4.6875mV이며 ENOB 미측정입니다. sweep_codes=1은 static center test이지 INL/DNL 인증이 아닙니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-sar-adc8/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/sar-adc.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 디지털 replay/생성에 Yosys·Icarus/VVP 등 실제 추가 도구
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 설계 도구 → 통합 설계 → 회로 · 연결 탐색에서 카탈로그를 읽고 SAR ADC 8개 블록의 SAR · 8비트 SAR · 전체 계층 (sar_adc8)를 선택합니다. 새 프로젝트를 생성하거나 아래 예제 ZIP을 가져옵니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. ANALOG/CONTROL 계층과 VREF 1.2V·VCM VDD/2·BIAS 0.9V를 봅니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. 8 comparisons 후 CODE/VALID를 확인합니다. LSB=1.2/256=4.6875mV이며 ENOB 미측정입니다. sweep_codes=1은 static center test이지 INL/DNL 인증이 아닙니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 실제 capacitor charge-retaining ngspice 결정과 디지털 replay입니다. 전체 controller mask/timing·INL/DNL·ENOB·noise/yield는 미검증입니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## 1비트 전가산기 · 9 NAND2

8개 조합의 SUM·COUT을 독립 expected와 비교합니다. 실제 physical core 조건의 RC test를 별도로 실행합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-full-adder/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/digital-hierarchy.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 가산기·CPU에서 이 회로를 선택해 새 프로젝트를 생성합니다. 아래 원본 ZIP이 있으면 열기 → 프로젝트 가져오기로 시작할 수 있습니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. A/B/CIN과 9 NAND2 계층을 엽니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. 8개 조합의 SUM·COUT을 독립 expected와 비교합니다. 실제 physical core 조건의 RC test를 별도로 실행합니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 공개 SKY130 참조 회로입니다. 기록된 조건·단계의 실행을 확인하고 새 프로젝트에서 다시 검증합니다. 제조 승인과 전체 PVT/timing closure는 별도입니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## 4비트 ripple-carry 가산기

512개 조합과 carry chain·overflow를 봅니다. 한 bit 지연만 전체 timing closure로 해석하지 않습니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-adder4/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/digital-hierarchy.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 가산기·CPU에서 이 회로를 선택해 새 프로젝트를 생성합니다. 아래 원본 ZIP이 있으면 열기 → 프로젝트 가져오기로 시작할 수 있습니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. FA 네 단 ripple-carry와 A[3:0]/B[3:0]/CIN을 엽니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. 512개 조합과 carry chain·overflow를 봅니다. 한 bit 지연만 전체 timing closure로 해석하지 않습니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 공개 SKY130 참조 회로입니다. 기록된 조건·단계의 실행을 확인하고 새 프로젝트에서 다시 검증합니다. 제조 승인과 전체 PVT/timing closure는 별도입니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## 4비트 참조 프로세서

reset·PC wrap·ROM 입력·ACC·flags를 실제 clock별로 비교합니다. 기본50ns와 RC400ns 16/16 통과 조건을 구분합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-cpu4/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/digital-hierarchy.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 가산기·CPU에서 이 회로를 선택해 새 프로젝트를 생성합니다. 아래 원본 ZIP이 있으면 열기 → 프로젝트 가져오기로 시작할 수 있습니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. ACC/PC 4bit, Carry/Zero·16×6bit ROM·LOAD/ADD/AND/XOR를 엽니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. reset·PC wrap·ROM 입력·ACC·flags를 실제 clock별로 비교합니다. 기본50ns와 RC400ns 16/16 통과 조건을 구분합니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 공개 SKY130 참조 회로입니다. 기록된 조건·단계의 실행을 확인하고 새 프로젝트에서 다시 검증합니다. 제조 승인과 전체 PVT/timing closure는 별도입니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## 16비트 ripple-carry 가산기

walking-bit·carry-chain·boundary 70개 지정 vector를 확인합니다. 2³³개 전수 조합 검증은 아닙니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-adder16/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/docs/digital-hierarchy.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 가산기·CPU에서 이 회로를 선택해 새 프로젝트를 생성합니다. 아래 원본 ZIP이 있으면 열기 → 프로젝트 가져오기로 시작할 수 있습니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. 16bit ripple carry 계층·상위 bit와 CIN을 엽니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. walking-bit·carry-chain·boundary 70개 지정 vector를 확인합니다. 2³³개 전수 조합 검증은 아닙니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 공개 SKY130 참조 회로입니다. 기록된 조건·단계의 실행을 확인하고 새 프로젝트에서 다시 검증합니다. 제조 승인과 전체 PVT/timing closure는 별도입니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## 16비트 참조 프로세서

100ns·32cycles actual pre trace와 65535+1 → ACC0/Carry1/Zero1을 확인합니다. 저장 예제 DRC/LVS와 미실행 PEX/post를 구분합니다.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/design-cpu16/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/examples/cpu16/README.md)

시작 조건:

- 실제 로컬 ngspice·공개 SKY130 모델
- 물리 core 생성/검증 시 Magic·Netgen 등 실제 추가 도구

1. 가산기·CPU에서 이 회로를 선택해 새 프로젝트를 생성합니다. 아래 원본 ZIP이 있으면 열기 → 프로젝트 가져오기로 시작할 수 있습니다.
2. 회로도에서 root ports와 하위 셀을 엽니다. 아래 기본값·외부 testbench 조건과 실제 연결을 확인합니다.
3. ACC/ALU16bit·PC4bit·16×18bit ROM을 엽니다.
4. 지원 해석을 선택하고 Simulate를 실행합니다. 결과의 축·단위·실제 run·revision을 읽습니다.
5. 100ns·32cycles actual pre trace와 65535+1 → ACC0/Carry1/Zero1을 확인합니다. 저장 예제 DRC/LVS와 미실행 PEX/post를 구분합니다.
6. 한 파라미터만 바꿔 새 해석과 비교합니다. 편집 프로젝트·조건·파형·로그를 같은 revision으로 저장합니다.

확인 결과와 한계:

- 공개 SKY130 참조 회로입니다. 기록된 조건·단계의 실행을 확인하고 새 프로젝트에서 다시 검증합니다. 제조 승인과 전체 PVT/timing closure는 별도입니다.
- 아래 기록은 과거 실행입니다. 가져온 새 프로젝트는 기존 PASS를 상속하지 않으며 직접 해석·검증해야 합니다.

막혔을 때:

- 미지원 분석·도구 누락·floating 포트는 다음 실행과 실제 로그에서 확인합니다.
- 레이아웃 없음은 DRC/LVS/PEX PASS가 아닙니다. 지원되는 physical core를 별도로 생성하고 각각 실행합니다.
- 디지털 회로 변경 후 이전 RTL를 조용히 재사용하지 않습니다. 지원 재합성 절차와 실제 graph 일치를 확인합니다.

## 저항 색띠 · Resistor color code

Decode a 4-band resistor into resistance and tolerance.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/calc-resistor-color-code/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/packages/calculators/src/index.ts)

시작 조건:

- 브라우저만 필요 · 로그인·EDA 엔진 불필요
- 입력 단위는 각 label에 표시된 단위를 사용

1. 아래 실습에서 각 입력 label과 단위를 확인합니다. 앱 계산기에서도 같은 수학 로직을 사용합니다.
2. 예제 Brown black red gold의 값을 넣습니다. 주요 결과 1000 ohm와 부가 결과를 확인합니다.
3. 값 하나를 바꾸고 공식에 따라 결과가 변하는지 봅니다. 숫자 입력이 비었거나 허용 범위를 벗어나면 오류를 먼저 읽습니다.
4. 예제 불러오기로 원래 조건을 복원합니다. 실제 부품·공정·부하와 이상 계산의 차이는 별도로 검토합니다.

확인 결과와 한계:

- R = (10 x first digit + second digit) x multiplier
- 공식 정의: IEC 60062 color band convention
- 이상 수식 결과이며 실제 시뮬레이션·부품 정격 인증·제조 판정이 아닙니다.

막혔을 때:

- Reject invalid digit band: Invalid color band selection.

## 표준 저항 E-series · Resistor series

Find the nearest preferred E-series resistor value.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/calc-resistor-series/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/packages/calculators/src/index.ts)

시작 조건:

- 브라우저만 필요 · 로그인·EDA 엔진 불필요
- 입력 단위는 각 label에 표시된 단위를 사용

1. 아래 실습에서 각 입력 label과 단위를 확인합니다. 앱 계산기에서도 같은 수학 로직을 사용합니다.
2. 예제 4.6 kohm in E24의 값을 넣습니다. 주요 결과 4700 ohm와 부가 결과를 확인합니다.
3. 값 하나를 바꾸고 공식에 따라 결과가 변하는지 봅니다. 숫자 입력이 비었거나 허용 범위를 벗어나면 오류를 먼저 읽습니다.
4. 예제 불러오기로 원래 조건을 복원합니다. 실제 부품·공정·부하와 이상 계산의 차이는 별도로 검토합니다.

확인 결과와 한계:

- nearest value in selected IEC E-series
- 공식 정의: IEC 60063 preferred number series
- 이상 수식 결과이며 실제 시뮬레이션·부품 정격 인증·제조 판정이 아닙니다.

막혔을 때:

- Reject zero target: target must be greater than zero.

## 병렬 저항 · Parallel resistor

Calculate equivalent resistance for up to four parallel resistors.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/calc-parallel-resistor/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/packages/calculators/src/index.ts)

시작 조건:

- 브라우저만 필요 · 로그인·EDA 엔진 불필요
- 입력 단위는 각 label에 표시된 단위를 사용

1. 아래 실습에서 각 입력 label과 단위를 확인합니다. 앱 계산기에서도 같은 수학 로직을 사용합니다.
2. 예제 Two 1 kohm resistors의 값을 넣습니다. 주요 결과 500 ohm와 부가 결과를 확인합니다.
3. 값 하나를 바꾸고 공식에 따라 결과가 변하는지 봅니다. 숫자 입력이 비었거나 허용 범위를 벗어나면 오류를 먼저 읽습니다.
4. 예제 불러오기로 원래 조건을 복원합니다. 실제 부품·공정·부하와 이상 계산의 차이는 별도로 검토합니다.

확인 결과와 한계:

- 1 / Req = 1/R1 + 1/R2 + ...
- 공식 정의: Ohm law network reduction
- 이상 수식 결과이며 실제 시뮬레이션·부품 정격 인증·제조 판정이 아닙니다.

막혔을 때:

- Reject empty network: At least one resistor must be greater than zero.

## 직렬 저항 · Series resistor

Add up to four series resistors.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/calc-series-resistor/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/packages/calculators/src/index.ts)

시작 조건:

- 브라우저만 필요 · 로그인·EDA 엔진 불필요
- 입력 단위는 각 label에 표시된 단위를 사용

1. 아래 실습에서 각 입력 label과 단위를 확인합니다. 앱 계산기에서도 같은 수학 로직을 사용합니다.
2. 예제 1 kohm + 2.2 kohm의 값을 넣습니다. 주요 결과 3200 ohm와 부가 결과를 확인합니다.
3. 값 하나를 바꾸고 공식에 따라 결과가 변하는지 봅니다. 숫자 입력이 비었거나 허용 범위를 벗어나면 오류를 먼저 읽습니다.
4. 예제 불러오기로 원래 조건을 복원합니다. 실제 부품·공정·부하와 이상 계산의 차이는 별도로 검토합니다.

확인 결과와 한계:

- Req = R1 + R2 + ...
- 공식 정의: Ohm law network reduction
- 이상 수식 결과이며 실제 시뮬레이션·부품 정격 인증·제조 판정이 아닙니다.

막혔을 때:

- Reject empty network: At least one resistor must be greater than zero.

## 전압 분배 · Voltage divider

Calculate output voltage and divider current.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/calc-voltage-divider/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/packages/calculators/src/index.ts)

시작 조건:

- 브라우저만 필요 · 로그인·EDA 엔진 불필요
- 입력 단위는 각 label에 표시된 단위를 사용

1. 아래 실습에서 각 입력 label과 단위를 확인합니다. 앱 계산기에서도 같은 수학 로직을 사용합니다.
2. 예제 5 V split in half의 값을 넣습니다. 주요 결과 2.5 V와 부가 결과를 확인합니다.
3. 값 하나를 바꾸고 공식에 따라 결과가 변하는지 봅니다. 숫자 입력이 비었거나 허용 범위를 벗어나면 오류를 먼저 읽습니다.
4. 예제 불러오기로 원래 조건을 복원합니다. 실제 부품·공정·부하와 이상 계산의 차이는 별도로 검토합니다.

확인 결과와 한계:

- Vout = Vin x R2 / (R1 + R2)
- 공식 정의: Two-resistor divider
- 이상 수식 결과이며 실제 시뮬레이션·부품 정격 인증·제조 판정이 아닙니다.

막혔을 때:

- Reject zero resistor: r1 must be greater than zero.

## LED 전류 제한 · LED resistor

Choose a current limiting resistor for a single LED.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/calc-led-resistor/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/packages/calculators/src/index.ts)

시작 조건:

- 브라우저만 필요 · 로그인·EDA 엔진 불필요
- 입력 단위는 각 label에 표시된 단위를 사용

1. 아래 실습에서 각 입력 label과 단위를 확인합니다. 앱 계산기에서도 같은 수학 로직을 사용합니다.
2. 예제 5 V red LED at 10 mA의 값을 넣습니다. 주요 결과 300 ohm와 부가 결과를 확인합니다.
3. 값 하나를 바꾸고 공식에 따라 결과가 변하는지 봅니다. 숫자 입력이 비었거나 허용 범위를 벗어나면 오류를 먼저 읽습니다.
4. 예제 불러오기로 원래 조건을 복원합니다. 실제 부품·공정·부하와 이상 계산의 차이는 별도로 검토합니다.

확인 결과와 한계:

- R = (Vs - Vf) / If
- 공식 정의: Ohm law applied to LED current limit
- 이상 수식 결과이며 실제 시뮬레이션·부품 정격 인증·제조 판정이 아닙니다.

막혔을 때:

- Reject impossible voltage: Supply voltage must be greater than LED forward voltage.

## 소비 전력 · Power dissipation

Calculate resistor or load power from voltage and resistance.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/calc-power-dissipation/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/packages/calculators/src/index.ts)

시작 조건:

- 브라우저만 필요 · 로그인·EDA 엔진 불필요
- 입력 단위는 각 label에 표시된 단위를 사용

1. 아래 실습에서 각 입력 label과 단위를 확인합니다. 앱 계산기에서도 같은 수학 로직을 사용합니다.
2. 예제 5 V across 1 kohm의 값을 넣습니다. 주요 결과 0.025 W와 부가 결과를 확인합니다.
3. 값 하나를 바꾸고 공식에 따라 결과가 변하는지 봅니다. 숫자 입력이 비었거나 허용 범위를 벗어나면 오류를 먼저 읽습니다.
4. 예제 불러오기로 원래 조건을 복원합니다. 실제 부품·공정·부하와 이상 계산의 차이는 별도로 검토합니다.

확인 결과와 한계:

- P = V^2 / R = I^2R = VI
- 공식 정의: Ohm law power identities
- 이상 수식 결과이며 실제 시뮬레이션·부품 정격 인증·제조 판정이 아닙니다.

막혔을 때:

- Reject zero resistance: resistance must be greater than zero.

## 옴의 법칙 · Ohm's law

Solve voltage, current, resistance, and power.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/calc-ohms-law/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/packages/calculators/src/index.ts)

시작 조건:

- 브라우저만 필요 · 로그인·EDA 엔진 불필요
- 입력 단위는 각 label에 표시된 단위를 사용

1. 아래 실습에서 각 입력 label과 단위를 확인합니다. 앱 계산기에서도 같은 수학 로직을 사용합니다.
2. 예제 10 mA through 1 kohm의 값을 넣습니다. 주요 결과 10 V와 부가 결과를 확인합니다.
3. 값 하나를 바꾸고 공식에 따라 결과가 변하는지 봅니다. 숫자 입력이 비었거나 허용 범위를 벗어나면 오류를 먼저 읽습니다.
4. 예제 불러오기로 원래 조건을 복원합니다. 실제 부품·공정·부하와 이상 계산의 차이는 별도로 검토합니다.

확인 결과와 한계:

- V = I x R
- 공식 정의: Ohm's law
- 이상 수식 결과이며 실제 시뮬레이션·부품 정격 인증·제조 판정이 아닙니다.

막혔을 때:

- Reject zero resistance: resistance must be greater than zero.

## RC 시정수 · RC time constant

Calculate RC tau, cutoff frequency, and settling times.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/calc-rc-time-constant/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/packages/calculators/src/index.ts)

시작 조건:

- 브라우저만 필요 · 로그인·EDA 엔진 불필요
- 입력 단위는 각 label에 표시된 단위를 사용

1. 아래 실습에서 각 입력 label과 단위를 확인합니다. 앱 계산기에서도 같은 수학 로직을 사용합니다.
2. 예제 10 kohm and 1 uF의 값을 넣습니다. 주요 결과 0.01 s와 부가 결과를 확인합니다.
3. 값 하나를 바꾸고 공식에 따라 결과가 변하는지 봅니다. 숫자 입력이 비었거나 허용 범위를 벗어나면 오류를 먼저 읽습니다.
4. 예제 불러오기로 원래 조건을 복원합니다. 실제 부품·공정·부하와 이상 계산의 차이는 별도로 검토합니다.

확인 결과와 한계:

- tau = R x C, fc = 1 / (2πRC)
- 공식 정의: First-order RC response
- 이상 수식 결과이며 실제 시뮬레이션·부품 정격 인증·제조 판정이 아닙니다.

막혔을 때:

- Reject zero capacitance: capacitance must be greater than zero.

## RL 시정수 · RL time constant

Calculate RL tau and approximate cutoff frequency.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/calc-rl-time-constant/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/packages/calculators/src/index.ts)

시작 조건:

- 브라우저만 필요 · 로그인·EDA 엔진 불필요
- 입력 단위는 각 label에 표시된 단위를 사용

1. 아래 실습에서 각 입력 label과 단위를 확인합니다. 앱 계산기에서도 같은 수학 로직을 사용합니다.
2. 예제 10 mH and 100 ohm의 값을 넣습니다. 주요 결과 0.0001 s와 부가 결과를 확인합니다.
3. 값 하나를 바꾸고 공식에 따라 결과가 변하는지 봅니다. 숫자 입력이 비었거나 허용 범위를 벗어나면 오류를 먼저 읽습니다.
4. 예제 불러오기로 원래 조건을 복원합니다. 실제 부품·공정·부하와 이상 계산의 차이는 별도로 검토합니다.

확인 결과와 한계:

- tau = L / R, fc = R / (2πL)
- 공식 정의: First-order RL response
- 이상 수식 결과이며 실제 시뮬레이션·부품 정격 인증·제조 판정이 아닙니다.

막혔을 때:

- Reject zero inductance: inductance must be greater than zero.

## RLC 공진 · RLC resonance

Calculate resonant frequency and quality factor for a series RLC circuit.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/calc-rlc-resonance/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/packages/calculators/src/index.ts)

시작 조건:

- 브라우저만 필요 · 로그인·EDA 엔진 불필요
- 입력 단위는 각 label에 표시된 단위를 사용

1. 아래 실습에서 각 입력 label과 단위를 확인합니다. 앱 계산기에서도 같은 수학 로직을 사용합니다.
2. 예제 10 uH and 100 nF의 값을 넣습니다. 주요 결과 159154.943092 Hz와 부가 결과를 확인합니다.
3. 값 하나를 바꾸고 공식에 따라 결과가 변하는지 봅니다. 숫자 입력이 비었거나 허용 범위를 벗어나면 오류를 먼저 읽습니다.
4. 예제 불러오기로 원래 조건을 복원합니다. 실제 부품·공정·부하와 이상 계산의 차이는 별도로 검토합니다.

확인 결과와 한계:

- f0 = 1 / (2π√LC), Q = 1/R x √(L/C)
- 공식 정의: Series RLC resonance
- 이상 수식 결과이며 실제 시뮬레이션·부품 정격 인증·제조 판정이 아닙니다.

막혔을 때:

- Reject zero resistance: resistance must be greater than zero.

## 커패시터 전하·에너지 · Capacitor calculator

Calculate stored charge and energy from capacitance and voltage.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/calc-capacitor-calculator/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/packages/calculators/src/index.ts)

시작 조건:

- 브라우저만 필요 · 로그인·EDA 엔진 불필요
- 입력 단위는 각 label에 표시된 단위를 사용

1. 아래 실습에서 각 입력 label과 단위를 확인합니다. 앱 계산기에서도 같은 수학 로직을 사용합니다.
2. 예제 1 uF at 5 V의 값을 넣습니다. 주요 결과 0.000005 C와 부가 결과를 확인합니다.
3. 값 하나를 바꾸고 공식에 따라 결과가 변하는지 봅니다. 숫자 입력이 비었거나 허용 범위를 벗어나면 오류를 먼저 읽습니다.
4. 예제 불러오기로 원래 조건을 복원합니다. 실제 부품·공정·부하와 이상 계산의 차이는 별도로 검토합니다.

확인 결과와 한계:

- Q = C x V, E = 1/2 C V²
- 공식 정의: Capacitor charge and stored energy
- 이상 수식 결과이며 실제 시뮬레이션·부품 정격 인증·제조 판정이 아닙니다.

막혔을 때:

- Reject zero capacitance: capacitance must be greater than zero.

## ADC 분해능 · ADC resolution

Calculate quantization step size for an ADC.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/calc-adc-resolution/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/packages/calculators/src/index.ts)

시작 조건:

- 브라우저만 필요 · 로그인·EDA 엔진 불필요
- 입력 단위는 각 label에 표시된 단위를 사용

1. 아래 실습에서 각 입력 label과 단위를 확인합니다. 앱 계산기에서도 같은 수학 로직을 사용합니다.
2. 예제 12-bit, 3.3 V의 값을 넣습니다. 주요 결과 0.000805861 V/code와 부가 결과를 확인합니다.
3. 값 하나를 바꾸고 공식에 따라 결과가 변하는지 봅니다. 숫자 입력이 비었거나 허용 범위를 벗어나면 오류를 먼저 읽습니다.
4. 예제 불러오기로 원래 조건을 복원합니다. 실제 부품·공정·부하와 이상 계산의 차이는 별도로 검토합니다.

확인 결과와 한계:

- LSB = Vref / (2^N - 1)
- 공식 정의: Ideal unipolar ADC code width
- 이 계산기는 endpoint 간격 V/(2^N−1) 정의입니다. 이 라이브러리의 SAR/시그마델타 bin-width Vref/2^N과 분모·양자화 규약이 다릅니다. 각 회로의 정의를 따릅니다.

막혔을 때:

- Reject zero bits: bits must be greater than zero.

## DAC 분해능 · DAC resolution

Calculate ideal DAC step size.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/calc-dac-resolution/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/packages/calculators/src/index.ts)

시작 조건:

- 브라우저만 필요 · 로그인·EDA 엔진 불필요
- 입력 단위는 각 label에 표시된 단위를 사용

1. 아래 실습에서 각 입력 label과 단위를 확인합니다. 앱 계산기에서도 같은 수학 로직을 사용합니다.
2. 예제 10-bit, 5 V의 값을 넣습니다. 주요 결과 0.004888 V/code와 부가 결과를 확인합니다.
3. 값 하나를 바꾸고 공식에 따라 결과가 변하는지 봅니다. 숫자 입력이 비었거나 허용 범위를 벗어나면 오류를 먼저 읽습니다.
4. 예제 불러오기로 원래 조건을 복원합니다. 실제 부품·공정·부하와 이상 계산의 차이는 별도로 검토합니다.

확인 결과와 한계:

- LSB = Vfs / (2^N - 1)
- 공식 정의: Ideal unipolar DAC code width
- 이 계산기는 endpoint 간격 V/(2^N−1) 정의입니다. 이 라이브러리의 SAR/시그마델타 bin-width Vref/2^N과 분모·양자화 규약이 다릅니다. 각 회로의 정의를 따릅니다.

막혔을 때:

- Reject zero bits: bits must be greater than zero.

## Op-amp 이득 · Op-amp gain

Calculate non-inverting and inverting op-amp gain.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/calc-op-amp-gain/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/packages/calculators/src/index.ts)

시작 조건:

- 브라우저만 필요 · 로그인·EDA 엔진 불필요
- 입력 단위는 각 label에 표시된 단위를 사용

1. 아래 실습에서 각 입력 label과 단위를 확인합니다. 앱 계산기에서도 같은 수학 로직을 사용합니다.
2. 예제 10 kohm / 1 kohm의 값을 넣습니다. 주요 결과 11 V/V와 부가 결과를 확인합니다.
3. 값 하나를 바꾸고 공식에 따라 결과가 변하는지 봅니다. 숫자 입력이 비었거나 허용 범위를 벗어나면 오류를 먼저 읽습니다.
4. 예제 불러오기로 원래 조건을 복원합니다. 실제 부품·공정·부하와 이상 계산의 차이는 별도로 검토합니다.

확인 결과와 한계:

- Av(non-inverting)=1+Rf/Rg, Av(inverting)=-Rf/Rin
- 공식 정의: Ideal op-amp feedback gain
- 이상 수식 결과이며 실제 시뮬레이션·부품 정격 인증·제조 판정이 아닙니다.

막혔을 때:

- Reject zero input resistor: rg must be greater than zero.

## dB 변환 · dB conversion

Convert voltage ratio to dB.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/calc-db-conversion/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/packages/calculators/src/index.ts)

시작 조건:

- 브라우저만 필요 · 로그인·EDA 엔진 불필요
- 입력 단위는 각 label에 표시된 단위를 사용

1. 아래 실습에서 각 입력 label과 단위를 확인합니다. 앱 계산기에서도 같은 수학 로직을 사용합니다.
2. 예제 2x voltage gain의 값을 넣습니다. 주요 결과 6.0206 dB와 부가 결과를 확인합니다.
3. 값 하나를 바꾸고 공식에 따라 결과가 변하는지 봅니다. 숫자 입력이 비었거나 허용 범위를 벗어나면 오류를 먼저 읽습니다.
4. 예제 불러오기로 원래 조건을 복원합니다. 실제 부품·공정·부하와 이상 계산의 차이는 별도로 검토합니다.

확인 결과와 한계:

- dB = 20 log10(Vout/Vin)
- 공식 정의: Amplitude ratio in decibels
- 이상 수식 결과이며 실제 시뮬레이션·부품 정격 인증·제조 판정이 아닙니다.

막혔을 때:

- Reject zero ratio: ratio must be greater than zero.

## 주파수·주기 · Frequency / period

Convert frequency to period.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/calc-frequency-period/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/packages/calculators/src/index.ts)

시작 조건:

- 브라우저만 필요 · 로그인·EDA 엔진 불필요
- 입력 단위는 각 label에 표시된 단위를 사용

1. 아래 실습에서 각 입력 label과 단위를 확인합니다. 앱 계산기에서도 같은 수학 로직을 사용합니다.
2. 예제 1 kHz의 값을 넣습니다. 주요 결과 0.001 s와 부가 결과를 확인합니다.
3. 값 하나를 바꾸고 공식에 따라 결과가 변하는지 봅니다. 숫자 입력이 비었거나 허용 범위를 벗어나면 오류를 먼저 읽습니다.
4. 예제 불러오기로 원래 조건을 복원합니다. 실제 부품·공정·부하와 이상 계산의 차이는 별도로 검토합니다.

확인 결과와 한계:

- T = 1 / f
- 공식 정의: Frequency-period reciprocal
- 이상 수식 결과이며 실제 시뮬레이션·부품 정격 인증·제조 판정이 아닙니다.

막혔을 때:

- Reject zero frequency: frequency must be greater than zero.

## 공학 단위 변환 · Engineering unit converter

Convert common electrical engineering units.

[웹 실습](https://resistor-downloads.vercel.app/tutorial/learn/calc-unit-converter/) · [원문](https://github.com/Lead729726-cell/Resistor/blob/main/packages/calculators/src/index.ts)

시작 조건:

- 브라우저만 필요 · 로그인·EDA 엔진 불필요
- 입력 단위는 각 label에 표시된 단위를 사용

1. 아래 실습에서 각 입력 label과 단위를 확인합니다. 앱 계산기에서도 같은 수학 로직을 사용합니다.
2. 예제 4.7 kohm to ohm의 값을 넣습니다. 주요 결과 4700 ohm와 부가 결과를 확인합니다.
3. 값 하나를 바꾸고 공식에 따라 결과가 변하는지 봅니다. 숫자 입력이 비었거나 허용 범위를 벗어나면 오류를 먼저 읽습니다.
4. 예제 불러오기로 원래 조건을 복원합니다. 실제 부품·공정·부하와 이상 계산의 차이는 별도로 검토합니다.

확인 결과와 한계:

- valueout = valuein x scalein / scaleout
- 공식 정의: SI prefix conversion
- 이상 수식 결과이며 실제 시뮬레이션·부품 정격 인증·제조 판정이 아닙니다.

막혔을 때:

- Reject unsupported conversion: Unsupported conversion.
