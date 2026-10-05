# 공정 3D 검토: 소자·홀·단차·다층 금속/절연막

v0.11에서 [증착·식각·CMP 시퀀스 계산](process-simulation.md)을 추가했습니다.
속도 기반 형상 계산과 입력된 실제 해석/실측 결과 검토를 구분해 사용합니다.

레지스터 v0.10의 **공정 3D**는 위치에 따라 높이와 막 두께가 달라지는
공정 체적 데이터를 검토합니다. 같은 재료가 낮은 곳과 높은 곳을 연결하는 형상,
깊은 홀, 계단 측벽, 오버행 및 내부 공극을 XYZ 사면체 mesh로 표현합니다.
이 구조는 XY마다 높이가 하나뿐인 height map을 가정하지 않습니다.

최근 공정의 최상단이 평탄해도 내부 재료의 높이와 두께는 다를 수 있습니다.
핵심 소자와 금속·절연막의 관심 영역을 단면과 재료별 표시로 확인하고,
검토 기준에 못 미치는 위치를 선택하면 해당 사면체를 지나가는 Z 단면을 엽니다.
화면에서 숨긴 재료와 잘린 단면 밖 cell도 데이터 검사 대상입니다.

## 사용

1. 설계 작업 화면 또는 독립 뷰어의 **공정 3D** 버튼을 누릅니다. GDS 없이도 열립니다.
2. **공정 JSON 열기**, 또는 **VTU 설정**에서 mesh와 설정 JSON을 입력합니다.
3. 재료별 표시를 선택하고 금속막과 절연막의 최소 두께/피복률 기준을 각각 설정합니다.
4. XYZ 단면 좌표, 위험 색상과 관심 영역 목록을 사용해 형상을 살펴봅니다.
5. 위험 cell 또는 폐쇄 공극을 선택해 실제 XYZ 위치와 입력 두께를 확인합니다.
6. **전량 검토 JSON/CSV**, **체적·기준 저장**과 PNG를 저장합니다.

기본 30nm/50%는 사용자가 바꿀 수 있는 검토값이며 PDK/foundry 규칙이 아닙니다.
피복률은 **입력한 국부 두께 / 재료별 명시한 기준막 두께**입니다. 사면체 크기나
Z 높이를 실제 막 두께로 바꾸어 계산하지 않습니다. 입력 두께의 측정 방향과
field 정의는 원래 측정/해석 결과 및 출처 설명과 함께 확인해야 합니다.
필요한 두께 또는 기준막 값이 없으면 미평가로 남깁니다.

## 입력 형식

`register-process-volume` JSON은 µm 단위 XYZ 점, 사면체 연결, cell별 재료와
국부 두께, 재료 이름/역할/기준막, 출처 및 직육면체 검토 domain을 갖습니다.
재료 family를 semiconductor/metal/dielectric/other로 명시할 수 있고,
cell의 `region`으로 소자·홀·단차 등 관심 영역 이름을 보존합니다.
출처는 measurement/simulation/user/demo를 구별합니다.

실행 가능한 예시는 `examples/process/step-keyhole.process.json`입니다.
VTU 예시와 sidecar는 같은 폴더의 `step-keyhole.vtu` 및
`step-keyhole.vtu-setup.json`입니다. 이 예시는 좌표와 국부 두께를 nm로
기록하여 µm 변환도 검증합니다.

VTU는 **단일 Piece, inline ASCII, linear tetra type=10**을 지원합니다.
좌표 단위, 재료 CellData array, 선택한 두께 CellData array와 그 단위,
재료 이름/film·bulk·void 역할, 출처, 검토 domain을 sidecar에 명시합니다.
binary/appended/compressed, 고차 요소, mixed cell 및 여러 partition을
일부만 읽지 않고 거부합니다. TDR/STR 등 전용 원본은 해당 도구가 제공하는
표준 export가 필요합니다. 범용 원본 직접 읽기를 구현한 것으로 표시하지 않습니다.

## 전 영역 검사의 의미

모든 제출 cell에 대해 국부 두께/피복률, 명시된 void의 face 연결 및 체적을 검사합니다.
중복·퇴화·겹치는 사면체와 non-manifold를 거부합니다. 폐쇄 공극 판정에는
면을 공유하는 conforming/welded mesh가 필요하며 좌표 중복 node를 거부합니다.
잘못된 입력을 자동으로 메우거나 vertex를 합쳐 물리 형상을 바꾸지 않습니다.

**전체 검사**는 제출된 mesh 전량을 의미합니다. ROI, 선언 domain에서 빠진
체적, film 두께/기준막 미평가는 별도로 표시합니다. domain은 직육면체이며
mesh가 그 체적을 충족하는지는 실제 사면체 부피와 중첩 검사로 확인합니다.
입력에서 void를 생략한 빈 부분은 미제출로 남기며 폐쇄 공극으로 추정하지 않습니다.
30,000 cells / 100,000 points / 32MiB 및 중첩 후보 1,500,000개가 상한입니다.
초과 시 일부만 검사해 성공으로 표시하지 않습니다. 해상도보다 작은 결함과
cell 내부의 미기록 두께 변화는 검사할 수 없으므로 mesh 수렴 확인이 필요합니다.

공정 자료의 설계/revision 표시는 입력 metadata 또는 사용자의 수동 연결입니다.
GDS와의 물리 대응 검증을 대신하지 않으며 revision이 다르면 STALE로 표시합니다.
설계 화면에서는 공정 자료를 별도 JSON으로 저장합니다. 독립 뷰어 bundle에는
공정 체적·기준도 함께 포함하며 재개방 시 다시 검사합니다.

## 교육 예제와 실제 예측의 구분

예제는 350 points / 1,296 tetra cells의 **합성 기하 자료**입니다. 같은 금속이
Z=0.5~1.28µm에 걸쳐 있고, 80nm 기준막의 측벽에는 20nm를 기록합니다.
소자 terrace 위의 절연막은 300nm, 낮은 field 위에서는 1µm이며 상단은 평탄합니다.
명시한 내부 홀 0.16µm³와 외부 공간을 구별합니다. 이것은 공정 simulator가
막 성장·수송·식각·CMP를 계산한 결과나 실제 웨이퍼 측정이 아닙니다.

이번 구현은 공정 결과를 읽고 검토하는 기반입니다. 물리적 증착/식각 예측에는
보정된 공정 모델과 실제 backend 실행이 필요합니다. 구조 검토 결과를 DRC/LVS,
전기적 특성·신뢰성·TCAD 예측·foundry signoff의 PASS로 표시하지 않습니다.

v0.11의 속도 기반 engine과 단계별 비교 이후 확장 범위는 보정된 장비 물리 backend,
홀의 aspect ratio 및 계면별 coverage 측정 정의, mesh 수렴 분석, 전기/응력/열
field와 국부 결함의 연결입니다. 실제 입력과 엔진 실행을 근거로 확장합니다.

공식 참고: [KLayout 2.5D view](https://www.klayout.de/doc/about/25d_view.html)는
레이어 돌출의 공정 topology 표현 한계를 설명합니다.
[Synopsys TCAD](https://www.synopsys.com/manufacturing/tcad.html)는 증착·식각·CMP
모델링과 공정 emulation/소자 해석의 역할을 구분합니다.
[VTK XML 형식](https://docs.vtk.org/en/v9.5.2/design_documents/VTKFileFormats.html)은
UnstructuredGrid 및 point/cell data 구조의 기준입니다.

검증은 `evidence/process-geometry.json`, `process-ui.json`, `process-release.json`에
기록합니다. `npm run test:process` 및 `npx playwright test tests/ui/process.spec.ts`로
재현할 수 있습니다. 교육 예제를 실제 공정 예측 검증으로 보고하지 않습니다.
