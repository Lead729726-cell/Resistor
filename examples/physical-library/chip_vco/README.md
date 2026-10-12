# Current-starved ring VCO — 실제 물리 설계 실습

전류 제한 3단 링과 CTRL 바이어스

공정: SKY130A / MOS TT / RC typical / 27°C / 1.8V. 다른 코너를 검증한 것으로 해석하지 마세요. 포트: `CTRL, OUT, VPWR, VGND`. 핀 순서는 [core.spice](core.spice)의 subckt 선언이 기준입니다.

## 시작과 제작

1. Resistor 0.17.0 이상에서 Docker 엔진을 연결합니다. 프로젝트 도구 → 내 반도체 → 물리 칩 레퍼런스 → Current-starved ring VCO을 선택합니다. 새 설계를 만들거나 다운로드 묶음의 `chip_vco.register.zip`을 프로젝트 탐색에서 가져옵니다.
2. 회로도에서 MOS D/G/S/B, 실제 공정 모델과 W/L을 확인합니다. 저항 바디는 VGND입니다. 공정 R/C의 목표 value는 크기 추정 기록이며 실제 해석은 W/L 모델로 수행합니다. 속성에서 W/L을 바꾼 뒤 마스크도 수정하고 LVS를 다시 실행하세요.
3. Layout 2D의 active/poly/LI/contact/M1–M4와 핀을 확인합니다. 참조 배치는 관찰하기 쉽게 떨어뜨린 공개 PCell 배치입니다. 회로 변경이 모든 마스크를 자동 재생성하는 기능은 아닙니다.
4. DRC를 실행해 violation 좌표와 deck을 확인합니다. LVS는 레이아웃 추출과 원본 회로의 소자·크기·포트를 비교합니다. PEX는 실제 배선 R/C를 추출합니다. 각 단계는 독립된 job입니다.
5. Testbench에서 아래 조건을 확인하고 pre-layout을 실행합니다. Post-layout을 켜 다시 실행하고 같은 revision의 결과를 비교합니다. 가져온 파일은 이전 PASS를 상속하지 않으므로 직접 실행해야 합니다.
6. 계층 셀을 재사용할 때 적용 전 추가 도형·경계·겹침과 포트 연결 미리보기를 확인합니다. 배치와 배선 후 모든 검증을 다시 실행하세요.
7. 편집 프로젝트·GDS/OASIS·sidecar·회로·보고서·파형을 같은 revision으로 저장합니다. GDS 단독에는 회로 조건이나 측정된 Z가 들어 있지 않습니다.

## 시험 조건

CTRL=0.9V, 명시된 초기 조건과 외부 부하

실제 문턱 교차에서 주파수와 duty 계산. 초기 조건 없는 자가 시동·전체 tuning range는 별도 시험입니다.


## 이번 실제 실행

| 단계 | 실행 | 결과 |
|---|---|---|
| drc | completed | PASS |
| lvs | completed | PASS |
| pex | completed | PASS |
| pre | completed | PASS |
| post | completed | PASS |

실제 PEX: **3309 저항 / 1241 커패시터**.

| 기생 후 검사 | 관측값 | 결과 |
|---|---|---|
| oscillation crosses both logic rails | 0.0010746318 → 1.7879865 | PASS |
| at least 3 complete output periods measured | 31 | PASS |

[실제 전후 파형](response.png) · [검사 원문](post-result.json) · [PEX 원본](pex/pex.spice) · [전기적 축약 감사](post/pex-reduction.json)

원본 PEX는 보존합니다. 해석용 회로만 관측되지 않은 순수 저항 노드를 Schur complement로 제거하며 커패시터·소자·포트·관측 노드는 유지합니다. 전기적 등가 축약이며 정확한 공간 전류 밀도를 복원하는 도구가 아닙니다. AC 복소 전류의 흐름 재생은 지원되지 않습니다.

## 제조 인계에서 추가할 것

이 파일은 공개 deck 물리 참조입니다. full-chip density/antenna, ESD/pad/seal ring/package, 아날로그 matching과 guard ring, 전원 EM/IR, timing/Liberty/STA, noise/Monte Carlo/PVT, 최종 foundry deck과 인계를 별도로 완료해야 합니다. 3D mask 높이는 표시용이며 측정된 공정 지형과 구분합니다. [전체 인계 체크리스트](../MANUFACTURING.md)를 사용하세요.
