# 레이아웃·회로도 영역 선택

Resistor Indust의 실제 편집 작업을 줄이기 위한 다중 선택 기능입니다. 같은 구현을 Edu 빌드에도 사용하며 좌표·DBU·노드·핀·계층·파일 형식과 해석 공식을 바꾸지 않습니다. 원본 설계/학생 기록을 복사하거나 초기화하지 않습니다.

## 사용법

레이아웃 **2D** 또는 회로도에서 빈 공간을 드래그하거나 **영역 선택 / A**를 누르고 드래그합니다.

| 조작 | 결과 |
|---|---|
| 왼쪽 → 오른쪽 | 영역에 완전히 들어온 도형/소자/배선 선택 |
| 오른쪽 → 왼쪽 | 영역에 걸친 항목까지 선택 |
| Shift + 드래그 | 기존 선택에 추가 |
| Alt/Option + 드래그 | 영역의 항목만 선택에서 제외 |
| Shift + 클릭 | 한 항목 추가/해제 |
| Alt/Option + 클릭 | 한 항목 제외 |
| Ctrl/Cmd + A | 레이아웃은 현재 로드된 선택 가능 도형, 회로도는 현재 셀의 전체 항목 |
| Esc | 드래그/초안 취소 및 선택 해제 |
| 가운데 버튼 / 회로도 H | 화면 이동. 선택으로 설계를 수정하지 않음 |
| 방향키 / Shift + 방향키 | 레이아웃 1/10 grid, 회로도 10/100 unit 만큼 선택 전체 이동 |
| Ctrl/Cmd + D | 선택 전체 복제 |
| Delete / Mac의 Backspace | 선택 전체 삭제 |
| Ctrl/Cmd + Z | 전체 묶음 작업 한 번에 실행 취소 |

레이아웃 **XY 이동 / M** 또는 이동 값 입력에서 선택 도형을 함께 이동합니다. 회로도는 선택 도구에서 선택된 소자/선/접점을 드래그하면 모두 같은 간격으로 이동합니다. 놓기 전 위치는 미리보기이며 실제 native command는 놓을 때만 제출합니다. 배선/그리기 중 Backspace는 이전 클릭 취소입니다. 텍스트 입력의 선택/삭제/실행 취소를 편집기 명령으로 가로채지 않습니다.

회로도 영역은 소자·명시적으로 그린 배선·접점을 포함합니다. 명시적 net의 점선 연결 표시는 배선 객체로 선택하지 않습니다. 레이아웃 숨김·선택 금지·잠금 레이어는 제외합니다. 선택 개수와 기준 항목을 표시합니다. 속성 패널의 형상/값은 기준 항목, 이동·복사·삭제는 선택 전체에 적용합니다. V로 선택 도구를 바꿔도 선택을 유지하며 Esc로 해제합니다. GPU가 없는 CPU 2D 뷰어에서도 읽기 전용 영역 선택을 지원합니다.

## 실제 설계와 연결

선택만으로 새 revision을 만들지 않습니다. 그룹 명령은 `selection`의 `move/copy/delete`와 명시적인 ID 목록이며, **1..1000개**를 한 native transaction과 한 undo 단계로 처리합니다. 없는 ID, 잘못된 좌표/격자, 반복 ID, 같은 공유 child 도형의 중복 occurrence, 보호된 PCell, 오래된 revision이 있으면 전체 저장을 거절합니다. 원래 단일 도형/소자 명령도 그대로 지원합니다.

GDS 마스크 선택은 정수 BigInt DBU로 polygon과 hole을 검사합니다. 빈 hole 안이나 다각형 bbox의 빈 부분을 실제 도형 교차로 오판하지 않으며 경계에 닿은 것은 crossing에 포함합니다. 회로도는 현재 화면 좌표를 사용하고 사선의 bbox만 겹치는 배선을 선택하지 않습니다. 같은 셀의 많은 도형을 편집할 때 native ID 검색을 한 번에 수행하고, 큰 GPU batch의 선택 색은 ID 집합으로 갱신합니다.

다중 선택은 계층을 flatten하지 않습니다. 보호된 하위 PCell 마스크는 검사/선택할 수 있어도 수정할 수 없습니다. 기존 계층 가져오기와 instance 편집 흐름을 이용하세요. 로드/렌더 한계가 있는 GDS의 전체 파일을 Ctrl/Cmd+A로 선택했다고 간주하지 않습니다. 대규모 batch의 드래그 이동 미리보기는 기존 렌더러 범위를 따르며 이동 값/방향키 명령은 정확한 DBU를 사용합니다.

마스크 복제는 회로를 자동 복제하지 않습니다. 회로도 복제는 기존 동작대로 명시적 **net 이름을 유지**하므로 원본과 같은 노드에 연결될 수 있습니다. 기하 연결에서는 선택하지 않은 외부 배선이 자동으로 늘어나지 않습니다. 실제 연결 검사와 필요할 때 LVS/시뮬레이션으로 확인하세요. 선택/이동 자체를 전기적 매칭이나 DRC/LVS/제조 PASS로 표시하지 않습니다.

## 확인한 결과

[실제 앱 검사](evidence/selection/ui-verification.json)는 로컬 native worker와 실제 pointer/keyboard 조작으로 영역 선택, Shift/Alt, 숨김/잠금, 묶음 이동·복제·삭제·undo, 회로도 혼합 선택, 저장 전 미리보기와 모바일 화면을 확인합니다. [레이아웃](evidence/selection/layout-desktop.png) · [회로도](evidence/selection/schematic-desktop.png) · [모바일](evidence/selection/schematic-mobile.png) · [실제 조작 녹화](evidence/selection/selection-workflow.webm). 녹화는 자동 QA 과정이며 별도 음성·편집한 YouTube 튜토리얼은 아닙니다.

[Native 검사](evidence/selection/native-tests.txt)는 실제 KLayout/IR로 단일 revision/undo, 원본 net 보존, GDS/OASIS 재열기, 오류 시 원자적 거절과 요청 재실행을 확인합니다. 5,000개 도형 셀에서 1,000개 묶음 편집도 실행합니다. 기록한 실행 시간은 이 호스트의 계산 시간이며 사용자 작업 시간이나 고객 가치 비교가 아닙니다. 순수 기하 테스트는 hole·경계·거대한 DBU·사선 배선·modifier 동작, batch 테스트는 6,000개 도형의 다중 강조와 원본 좌표 보존을 확인합니다.

[실제 MCP 명령 검사](evidence/selection/mcp-verification.json)는 새 회로도 묶음 명령과 동일 receipt 재실행을 확인합니다. [개발용 Indust 엔진 연결](evidence/selection/live-connection.json)에서는 새 API의 없는 ID 거절과 기존 설계 보존을 확인했습니다. 전역 단축키는 화면 갱신 시 최신 상태에 맞춰 연결하여 편집 직후 실행 취소를 빠르게 입력해도 이전 busy 상태를 참조하지 않습니다.

```sh
npm run test:editor-selection
npm run test:core
npm run typecheck
npm run build:indust
npm run build:edu
```

테스트는 새 격리 workspace와 공개 fixture를 사용하고 사용자 엔진을 재시작하지 않습니다. 이 소스 기능과 공개 v0.27.0 설치 파일의 발행 상태는 별개입니다. 상용 도구 실행·고객 가치·제조 signoff 상태는 [별도 검증 기록](industry-qualification.md)을 따릅니다.
