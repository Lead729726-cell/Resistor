# Resistor 단축키

앱의 **단축키** 버튼, **F1**, **?**, **Ctrl/⌘+/**로 검색 가능한 안내창을 엽니다.
편집 키는 해당 캔버스를 클릭한 뒤 사용합니다. 입력 칸에서는 텍스트 입력·Undo를 유지하고,
F1과 저장을 제외한 설계 키를 실행하지 않습니다. 설정창·안내창은 배경 편집을 차단합니다.

## 공통

| Windows / Linux | Mac | 작업 |
| --- | --- | --- |
| Ctrl+Shift+F9 | ⌘+⇧+F9 | 강의 스튜디오 열기 — 강의 진행안·강사 메모·녹화 준비 |
| F8 | F8 | 강의 작업 화면 집중 전환 — 탐색·속성·하단 결과를 잠시 접습니다. 해제하면 원래 설정으로 돌아갑니다. |
| F1 / ? / Ctrl+/ | F1 / ? / ⌘+/ | 단축키 안내 — F1은 입력 칸에서도 안내를 엽니다. |
| Ctrl+N | ⌘+N | 새 프로젝트 |
| Ctrl+O | ⌘+O | 프로젝트 열기 |
| Ctrl+S / F2 | ⌘+S / F2 | 프로젝트 저장 — 적용된 프로젝트를 저장합니다. 속성 입력은 변경 적용 후 저장하세요. |
| Ctrl+Z / U | ⌘+Z / U | 실행 취소 — 초안의 이전 점을 먼저 취소합니다. 초안이 없으면 실제 엔진 이력을 취소합니다. |
| Ctrl+Shift+Z / Ctrl+Y / Shift+U | ⌘+⇧+Z / ⇧+U | 다시 실행 — 초안 되살리기가 우선합니다. Ctrl+Y는 Windows/Linux에서 사용합니다. |
| Alt+1 | ⌥+1 | 회로도 화면 |
| Alt+2 | ⌥+2 | Layout 2D 화면 |
| Alt+3 | ⌥+3 | Layout 3D 화면 |
| Alt+4 | ⌥+4 | 시뮬레이션 화면 — 화면만 전환합니다. 엔진을 실행하지 않습니다. |
| Ctrl+Shift+L | ⌘+⇧+L | 결과·로그 패널 표시 전환 |

## 레이아웃

| Windows / Linux | Mac | 작업 |
| --- | --- | --- |
| Esc | Esc | 초안·선택 취소 |
| A | A | 2D 영역 선택 — 왼→오 완전 포함, 오→왼 걸침. Shift 추가, Alt 제외. |
| Ctrl+A | ⌘+A | 로드된 선택 가능 도형 전체 선택 |
| V | V | 선택 도구 |
| R | R | 사각형 — Layout 2D · 드래그 또는 두 모서리 클릭 |
| Shift+P | ⇧+P | 다각형 — Layout 2D · 꼭짓점 클릭 후 Enter |
| P / W | P / W | Manhattan 배선 — Layout 2D · P는 Path, W는 Resistor 추가 키. 경유점 클릭 후 Enter |
| M / Shift+M | M / ⇧+M | XY 이동 도구 |
| C | C | 원본·새 위치 클릭으로 도형 복사 — Layout 2D · 회로 연결은 별도로 확인하세요. |
| Ctrl+D | ⌘+D | 선택 해제 |
| Ctrl+Shift+D | ⌘+⇧+D | 선택 도형 즉시 복제 — Resistor 추가 키. X/Y 각각 1 µm 이동한 마스크 복사. 격자·하위 셀 보호를 적용합니다. |
| I | I | 셀 인스턴스·배열 배치 — 실제 DBU 입력 도구를 엽니다. PCell 자동 생성과 다릅니다. |
| Q | Q | 선택 도형 속성 |
| F3 | F3 | 현재 그리기 옵션 |
| E | E | 레이어·표시 설정 |
| F6 / Ctrl+R | F6 / Ctrl+R | 화면 다시 그리기 |
| ↑ ↓ ← → / Shift+↑ ↓ ← → | ↑ ↓ ← → / ⇧+↑ ↓ ← → | 선택 도형 미세 이동 — 방향키 1 grid, Shift+방향키 10 grid. Layout 2D 선택 모드에서 사용합니다. |
| F | F | 전체 맞춤 |
| + / = | + / = | 확대 |
| - | - | 축소 |
| L | L | 레이어 패널 표시 전환 |
| Enter | Enter | 그리기·복사 완료 |
| Ctrl+Z / U | ⌘+Z / U | 초안의 이전 클릭 취소 |
| Ctrl+Shift+Z / Ctrl+Y / Shift+U | ⌘+⇧+Z / ⇧+U | 초안의 클릭 다시 실행 |
| Space | Space | 배선 꺾임 방향 변경 |

## 회로도

| Windows / Linux | Mac | 작업 |
| --- | --- | --- |
| Esc | Esc | 초안·선택 취소 |
| A | A | 영역 선택 — 왼→오 완전 포함, 오→왼 걸침. Shift 추가, Alt 제외. |
| Ctrl+A | ⌘+A | 현재 셀 전체 선택 |
| V | V | 선택·이동 도구 |
| W | W | 배선 도구 |
| J | J | 접점 도구 |
| H | H | 화면 이동 도구 |
| I | I | 소자·계층 블록 선택 |
| B | B | 계층 블록 목록·배치 — 사용 중인 화면의 셀 목록에서 블록을 선택합니다. R 회전 · Shift+R 반전 · Esc 취소. 핀은 미연결 상태로 시작합니다. |
| M / Shift+M | M / ⇧+M | 이동 도구 — 드래그로 이동. 현재 엔진은 배선 끝을 늘리는 Stretch를 지원하지 않습니다. 이동 후 연결을 검사하세요. |
| R | R | 90° 회전 — 배치 중 소자 또는 선택 소자를 회전합니다. |
| Shift+R | ⇧+R | 좌우 반전 |
| C / Ctrl+Shift+D | C / ⌘+⇧+D | 선택 소자·배선 즉시 복제 — X/Y 각각 20 회로도 unit의 사본을 만듭니다. Virtuoso의 클릭 배치 Copy와 동작 차이가 있습니다. |
| Ctrl+D | ⌘+D | 선택 해제 |
| Q | Q | 선택 소자 속성·값 |
| F3 | F3 | 현재 도구 옵션 |
| L | L | 새 배선의 Net label 입력 — 현재 또는 다음 배선의 라벨입니다. 기존 net의 일괄 이름 변경은 아닙니다. |
| Shift+T | ⇧+T | 셀 계층 목록 |
| E / Shift+E | E / ⇧+E | 선택 블록의 하위 셀 열기 |
| Ctrl+E | Ctrl+E | 이전 상위 셀로 돌아가기 |
| X | X | 실제 회로 연결 검사 — DRC/LVS/PEX·시뮬레이션과 별개입니다. |
| F6 | F6 | 화면 다시 그리기 |
| Alt+R | ⌥+R | 저항 배치 — Resistor 추가 키. Shift+R은 반전입니다. |
| Shift+C | ⇧+C | 커패시터 배치 |
| Shift+V | ⇧+V | 전압원 배치 |
| Shift+I | ⇧+I | 전류원 배치 |
| Shift+N | ⇧+N | NMOS 배치 |
| Shift+P | ⇧+P | PMOS 배치 |
| Shift+G | ⇧+G | GND 배치 |
| P / Shift+O | P / ⇧+O | Port 배치 |
| ↑ ↓ ← → / Shift+↑ ↓ ← → | ↑ ↓ ← → / ⇧+↑ ↓ ← → | 선택 소자·배선·접점 미세 이동 — 방향키 10 unit, Shift+방향키 100 unit. 선택 모드에서 사용합니다. |
| F | F | 전체 맞춤 |
| + / = | + / = | 확대 |
| - | - | 축소 |
| Enter | Enter | 배선 완료 |
| Ctrl+Z / U | ⌘+Z / U | 초안의 이전 클릭 취소 |
| Ctrl+Shift+Z / Ctrl+Y / Shift+U | ⌘+⇧+Z / ⇧+U | 초안의 클릭 다시 실행 |
| Space | Space | 배선 꺾임 방향 변경 |

Delete는 선택 항목을 삭제하며 Mac의 ⌫도 지원합니다. 초안의 이전 클릭은 Ctrl/⌘+Z 또는 U로 취소하고 Ctrl/⌘+Shift+Z 또는 Shift+U로 되살립니다. 초안이 없으면 엔진 이력을 사용합니다. Backspace는 점 취소 키가 아닙니다.
레이아웃 그리기와 방향키 미세 이동은 **Layout 2D**에서 사용합니다. R은 레이아웃 사각형 / 회로도 회전,
P는 레이아웃 Path, Shift+P는 다각형, Shift+R은 회로도 반전, Alt+R은 저항 배치입니다. 복사 뒤 연결·DRC는 별도로 검사합니다.
읽기 전용·저장 진행·IME 조합·길게 누르는 반복 입력은 편집을 실행하지 않습니다.

Virtuoso의 앱·버전별 bindkey는 다를 수 있습니다. 이 설정은 지원 작업을 기준으로 하며, 요청에 따라 Ctrl/⌘+Z를 줌 대신 실행 취소로 사용합니다. 회로도 M은 순수 이동이고 배선 Stretch·DRD·자동 Via는 미지원입니다.

참고: [Cadence bindkey 안내](https://community.cadence.com/cadence_blogs_8/b/cic/posts/binkeys_5f00_in_5f00_vls), [UC Berkeley EE140/240A 2025 키맵](https://people.eecs.berkeley.edu/~pister/140sp25/labs/Cadence_Editing_Shortcuts_Sp25.pdf), [Virginia Tech 기본 bindkeys](https://www.mics.ece.vt.edu/ICDesign/Tutorials/AnalogIC/bindkeys.html).

이 표는 `packages/shortcuts/src/index.ts`의 실제 바인딩에서 생성합니다.
