# Resistor 단축키

앱의 **단축키** 버튼, **F1**, **?**, **Ctrl/⌘+/**로 검색 가능한 안내창을 엽니다.
편집 키는 해당 캔버스를 클릭한 뒤 사용합니다. 입력 칸에서는 텍스트 입력·Undo를 유지하고,
F1과 저장을 제외한 설계 키를 실행하지 않습니다. 설정창·안내창은 배경 편집을 차단합니다.

## 공통

| Windows / Linux | Mac | 작업 |
| --- | --- | --- |
| F1 / ? / Ctrl+/ | F1 / ? / ⌘+/ | 단축키 안내 — F1은 입력 칸에서도 안내를 엽니다. |
| Ctrl+N | ⌘+N | 새 프로젝트 |
| Ctrl+O | ⌘+O | 프로젝트 열기 |
| Ctrl+S | ⌘+S | 프로젝트 저장 — 적용된 프로젝트를 저장합니다. 속성 입력은 변경 적용 후 저장하세요. |
| Ctrl+Z | ⌘+Z | 실행 취소 |
| Ctrl+Shift+Z / Ctrl+Y | ⌘+⇧+Z | 다시 실행 — Ctrl+Y는 Windows/Linux에서 사용합니다. |
| Alt+1 | ⌥+1 | 회로도 화면 |
| Alt+2 | ⌥+2 | Layout 2D 화면 |
| Alt+3 | ⌥+3 | Layout 3D 화면 |
| Alt+4 | ⌥+4 | 시뮬레이션 화면 — 화면만 전환합니다. 엔진을 실행하지 않습니다. |
| Ctrl+Shift+L | ⌘+⇧+L | 결과·로그 패널 표시 전환 |

## 레이아웃

| Windows / Linux | Mac | 작업 |
| --- | --- | --- |
| Esc | Esc | 초안·선택 취소 |
| V | V | 선택 도구 |
| R | R | 사각형 — Layout 2D · 드래그 또는 두 모서리 클릭 |
| P | P | 다각형 — Layout 2D · 꼭짓점 클릭 후 Enter |
| W | W | Manhattan 배선 — Layout 2D · 경유점 클릭 후 Enter |
| M | M | XY 이동 도구 |
| C | C | 원본·새 위치 클릭으로 도형 복사 — Layout 2D · 회로 연결은 별도로 확인하세요. |
| Ctrl+D | ⌘+D | 선택 도형 복제 — X/Y 각각 1 µm 이동한 마스크 복사. 격자·하위 셀 보호를 적용합니다. |
| ↑ ↓ ← → / Shift+↑ ↓ ← → | ↑ ↓ ← → / ⇧+↑ ↓ ← → | 선택 도형 미세 이동 — 방향키 1 grid, Shift+방향키 10 grid. Layout 2D 선택 모드에서 사용합니다. |
| F | F | 전체 맞춤 |
| + / = | + / = | 확대 |
| - | - | 축소 |
| L | L | 레이어 패널 표시 전환 |
| Enter | Enter | 그리기·복사 완료 |
| Backspace | Backspace | 이전 클릭 취소 |
| Space | Space | 배선 꺾임 방향 변경 |

## 회로도

| Windows / Linux | Mac | 작업 |
| --- | --- | --- |
| Esc | Esc | 초안·선택 취소 |
| V | V | 선택·이동 도구 |
| W | W | 배선 도구 |
| J | J | 접점 도구 |
| H | H | 화면 이동 도구 |
| R | R | 90° 회전 — 배치 중 소자 또는 선택 소자를 회전합니다. |
| M | M | 좌우 반전 |
| Ctrl+D | ⌘+D | 선택 소자·배선 복제 |
| Shift+R | ⇧+R | 저항 배치 |
| Shift+C | ⇧+C | 커패시터 배치 |
| Shift+V | ⇧+V | 전압원 배치 |
| Shift+I | ⇧+I | 전류원 배치 |
| Shift+N | ⇧+N | NMOS 배치 |
| Shift+P | ⇧+P | PMOS 배치 |
| Shift+G | ⇧+G | GND 배치 |
| Shift+O | ⇧+O | Port 배치 |
| ↑ ↓ ← → / Shift+↑ ↓ ← → | ↑ ↓ ← → / ⇧+↑ ↓ ← → | 선택 소자·배선·접점 미세 이동 — 방향키 10 unit, Shift+방향키 100 unit. 선택 모드에서 사용합니다. |
| F | F | 전체 맞춤 |
| + / = | + / = | 확대 |
| - | - | 축소 |
| Enter | Enter | 배선 완료 |
| Backspace | Backspace | 이전 클릭 취소 |
| Space | Space | 배선 꺾임 방향 변경 |

Delete는 선택 항목을 삭제하며 Mac의 ⌫도 지원합니다. 그리기 중 Backspace는 이전 클릭을 취소합니다.
레이아웃 그리기와 방향키 미세 이동은 **Layout 2D**에서 사용합니다. R은 레이아웃 사각형 / 회로도 회전,
Shift+R은 회로도 저항 배치입니다. 복사 뒤 연결·DRC는 별도로 검사합니다.
읽기 전용·저장 진행·IME 조합·길게 누르는 반복 입력은 편집을 실행하지 않습니다.

이 표는 `packages/shortcuts/src/index.ts`의 실제 바인딩에서 생성합니다.
