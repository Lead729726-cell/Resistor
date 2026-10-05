# Precision Workbench

Resistor에는 결정적인 전자공학 계산기와 Register EDA 작업공간이 함께 있습니다.
계산기는 각 계산기 URL에서 입력·공식·결과를 바로 표시합니다. `/eda`는 기존
프로젝트 탐색, 회로/레이아웃/시뮬레이션, 속성, 작업 결과 영역을 사용합니다.
이번 변경은 화면 구성과 결과 상태 표현을 정제하며 엔진·파일 API는 유지합니다.

## 작업 도구

- **프로젝트 도구**: 워크스페이스, 반도체 시작 설계, 가산기·CPU.
- **설계 도구**: 통합 설계, 설계 검토, 공정 3D, 최적화.
- **파일·PDK**: PDK·해석 설정, EDA 파일 호환, 원본 DB, 상용 backend,
  표시 레이어 입력 및 뷰어 파일 저장.
- **Simulate / DRC / LVS / PEX**: 현재 프로젝트의 실제 실행 버튼.
  사용할 수 없는 조건은 버튼의 설명에 표시됩니다.

프로젝트 이름·cell·revision은 상단과 작업 영역에 표시합니다. 상단의 폴더·속성·
파형 아이콘으로 왼쪽 탐색, 오른쪽 속성, 아래 결과 영역을 접거나 펼칩니다.
선택은 패널을 접어도 유지됩니다. 패널 선택은 로컬에 저장되며, 새 실행을
요청하면 아래 결과 영역이 다시 열립니다. 메뉴는 키보드로 열고 Escape로 닫을 수 있습니다.
워크스페이스 목록을 읽는 동안에도 파일 가져오기와 새 프로젝트를 사용할 수 있습니다.
목록 요청의 오류와 실제 파일 작업의 오류를 별도로 표시합니다.
파일 검증·반입과 반입된 계층/레이아웃을 여는 과정을 실제 진행 단계로 구분합니다.
목록 카드는 `project.list`의 선택적 `metadata_only: true` 조회로 이름·셀·PDK·
revision·출처·ID만 읽습니다. 기존 기본 전체 응답, `project.open`/`snapshot`과
분석·파일 API는 그대로 유지합니다. SQLite에서 먼저 투영해 대규모 회로 배열을
Python/브라우저에 반복해서 디코딩하지 않습니다.
대용량 프로젝트 ZIP의 반입/저장 요청은 최대 180초까지 기다리며, 일반 상호작용의
65초 제한은 유지합니다. 진행/실패는 완료 응답에 따르고 기존 명령 receipt를 유지합니다.

## 결과 읽기

실행 상태와 분석 결과는 다른 정보입니다. 대기·실행 중·실행 실패·취소는
완료된 엔진 검증 PASS가 아닙니다. 완료된 native job은 실제 `analysis_result`를
표시합니다. 외부 결과 파일은 **반입 완료 / 외부 파일 수치 · 실행 없음**으로
구분합니다. 다른 revision이나 오래된 조건의 결과에는 STALE을 표시합니다.
worker가 `native_execution: false`로 반환한 기록은 **엔진 미실행**으로 표시합니다.

선택한 작업 위에 엔진·run ID·revision·상태를 표시합니다. **로그 보기**로 실제
stdout/stderr를 열고, **결과 파일 위치**로 worker가 반환한 manifest와 artifact
경로를 확인합니다. 실패/조건 위반은 엔진이 반환한 원인을 같은 위치에 표시합니다.
인터넷 공개나 로컬 경로의 파일 다운로드를 새로 제공하는 기능은 아닙니다.

## 스타일과 정밀도

기본 다크 Graphite를 중성 차콜 표면으로 정돈했습니다. 라이트·시스템 모드와
Jade/Copper/Iris 선택·저장은 유지합니다. 계산기에도 같은 스타일 선택을 제공합니다.
숫자·좌표·단위·코드는 고정폭/동일 폭 숫자로 표시하며, 수치나 반올림 로직을
바꾸지 않습니다. PDK 레이어 색, 정수 DBU, 회로 노드 및 계층은 유지합니다.

계산기는 큰 카드 대신 입력과 결과에 우선순위를 둡니다. 모바일에서는 계산기
목록을 접고 결과 영역까지 내부 스크롤로 접근할 수 있습니다. EDA는 좁은 화면에서
탐색·속성 영역을 필요할 때 열며, 노트북에서도 아래 레이아웃 편집 도구가 잘리지 않도록 합니다.
레이아웃 아래 전류 표는 작업 영역의 30%까지 사용하고 내부에서 스크롤합니다.
샘플·부호·방향·경로·출처 설명은 그대로 유지하며 3D 장면을 위한 공간을 확보합니다.

## 검증

`tests/run-status.test.ts`는 미실행, 진행 중/실패의 조기 PASS 차단, 실제 완료 결과,
외부 반입 표시를 검사합니다. `tests/ui/precision-workbench.spec.ts`는 계산기 입력,
8개 팔레트, 모바일, 메뉴/패널/키보드, 원본 기하·회로 보존을 검사합니다.
별도의 공개 SKY130 QA 프로젝트에서 실제 ngspice 성공과 의도적인 좁은 metal1
도형의 실제 DRC 위반을 실행하며 로그·결과 파일과 화면을 대조합니다.
엔진 미연결 화면은 명시된 격리 transport fixture로 검사하며 실제 엔진 실행으로 세지 않습니다.
`tests/test_project_index.py`는 기존 전체 응답의 계층·DBU·부호 수치 보존,
목록 순서·PVT 필터 일치, 메타데이터 응답 범위를 검사합니다.

기존 standalone GDS/테마, 전압·전류 흐름, Waveform lab UI 검사를 함께 수행합니다.
기록과 녹화는 `docs/evidence/precision-workbench/`에 저장합니다. Mac native 실행,
상용 vendor 실행, foundry signoff 및 인터넷 배포를 확인하는 검사는 아닙니다.

[검사 기록](evidence/precision-workbench/verification.json) ·
[다크 화면](evidence/precision-workbench/eda-dark.png) ·
[라이트 화면](evidence/precision-workbench/eda-light.png) ·
[작업 영역 조작 녹화](evidence/precision-workbench/eda-navigation.webm) ·
[실제 해석·DRC 결과 녹화](evidence/precision-workbench/eda-native-results.webm)
