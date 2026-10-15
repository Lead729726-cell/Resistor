# 로직을 연결하는 회로도

Resistor Edu의 조합 실습은 기존 공개 CMOS 회로를 읽고 연결하는 기능입니다. 같은 `SchematicEditor`, 회로 IR, ngspice 실행 엔진을 Industry에서도 사용합니다. 계산·엔진을 교육용으로 복제하지 않습니다.

## 바로 사용하기

1. **회로도 / Schematic → 기본 로직 → 새 조합 실습**을 누릅니다. AND→INV, 반가산기(XOR+AND), AND→MUX 중에서 선택합니다. 현재 프로젝트를 덮어쓰지 않고 새 프로젝트를 만듭니다.
2. `A`, `B`, 필요한 경우 `SEL`의 **0 / 1** 버튼을 누릅니다. 버튼의 숫자는 실제 입력 전압원의 DC 값입니다. 기본 전원은 1.8 V, 부하는 출력마다 ideal 5 fF입니다.
3. **실제 OP 해석**을 누르면 설치된 ngspice와 지원 공개 SKY130 모델로 정적 동작점을 계산합니다. Simulation 화면의 실제 노드 전압·가지 전류와 로그를 확인합니다. 조건을 바꾼 뒤 이전 결과는 이전 revision의 결과로 남습니다.
4. **저장**, **열기**로 프로젝트와 기존 결과를 다시 엽니다. `SPICE`로 계층 회로를 내보낼 수 있습니다.

| 예제 | 관찰할 관계 | 질문 |
| --- | --- | --- |
| AND→INV | `MID=A AND B`, `Y=NOT MID` | AND 출력과 마지막 출력이 어떻게 다릅니까? |
| 반가산기 | `SUM=A XOR B`, `COUT=A AND B` | 1+1에서 합과 캐리가 분리되는 이유는 무엇입니까? |
| AND→MUX | `MID=A AND B`, `Y=SEL ? MID : A` | SEL을 바꾸면 어느 입력 경로가 선택됩니까? |

위 식은 입력이 논리 0/1로 안정된 경우의 기대 관계입니다. 실제 전압과 비교하는 테스트에서는 이 조건의 0.54 V 이하/1.26 V 이상을 사용했습니다. 이 수치를 전체 PDK의 타이밍·노이즈 보증으로 해석하지 않습니다.

## 직접 조합하기

- `INV`, `NAND2`, `NOR2`, `AND2`, `OR2`, `XOR2`, `XNOR2`, `MUX2`를 선택하고 캔버스를 클릭하면 반복 배치됩니다. **Esc**로 종료, **R**로 회전, **M**으로 반전, **Ctrl/Cmd+D**로 복제합니다.
- 입력 핀은 왼쪽, 출력 `Y`는 오른쪽, 전원은 위·아래에 표시됩니다. **출력 핀 클릭 → 입력 핀 클릭**으로 연결하거나 **출력 → 입력 연결** 안내에서 두 핀을 선택해 연결합니다.
- 전원 넷 기본값은 `VPWR`와 `0`입니다. 새 게이트를 배치하기 전에 이름을 바꿀 수 있습니다. 넷 이름은 실제 소스를 만들지 않습니다. 빈 회로에서는 전압원·GND·입력 소스·필요한 출력 Port를 직접 추가하고 연결해야 합니다. NAND2의 기존 포트 이름 `A0`, `A1`을 보존합니다.
- 서로 다른 이름의 기존 넷을 묶으면 엔진이 `NET_NAME_CONFLICT`를 반환합니다. 의도한 회로 노드를 먼저 명시적으로 수정하세요. 미연결 핀을 자동으로 0에 묶지 않습니다.
- 블록을 두 번 클릭하면 하위 CMOS 회로가 열립니다. 하위 셀 수정은 그 셀을 참조하는 인스턴스에 적용됩니다. 수정된 예약 이름의 셀에 새 원본 게이트를 덮어넣으려 하면 `LOGIC_CELL_CONFLICT`로 중단합니다. 원본을 보존하고 새 프로젝트나 사용자 이름의 셀을 사용하세요.

전원 넷의 명시적 연결은 핀 라벨로 표시합니다. 예제 화면은 전원 배선의 반복 선을 생략하지만 원본 IR의 모든 연결은 보존합니다. 선 교차만으로 접점을 만들지 않습니다. 기존 역할 주석이 없는 계층 블록의 핀 좌표와 연결은 변경하지 않습니다.

## 엔진과 정확성 범위

기존 `physical_library.py`/`digital_units.py` CMOS 정의에서 필요한 하위 셀만 가져옵니다. 출력에 정답 전압원을 넣지 않습니다. `custom_circuit.prepare`가 검증된 계층을 **해석 사본에서만** 펼치며 원본 계층·ID·배선·revision은 그대로 저장됩니다. 계층 내부의 SPICE `0`은 전역 기준점으로 유지합니다.

이 흐름은 **OP / DC·PULSE·PWL transient**를 지원합니다. [동적 신호·지연 실습](logic-transient.md)에서 단일 입력 펄스·비반복 PWL과 실제 주기별 지연 기준을 설정할 수 있습니다. 정적 입력 버튼은 해당 소스를 DC로 바꿉니다. 전체 진리표·setup/hold·STA는 이 기능의 범위가 아닙니다. 기존 디지털 전용 실험은 별도 흐름입니다. 수치 해석이 완료되어도 기능 명세의 합격 조건이 없으면 `analysis_result=unknown`입니다. DRC/LVS/PEX는 각각 실제 실행이 필요하며 이 조합 실습은 마스크를 생성하지 않습니다.

ngspice 또는 모델이 없으면 실행 불가 이유를 표시합니다. Source의 공개 SKY130 지원 모델만 사용하며 다른 공정이나 임의의 셀을 검증했다고 표시하지 않습니다. 상한은 셀당 256 소자, 해석 사본 4,096 primitives, 수치 trace 256 넷입니다. 더 큰 회로는 지원 한도 오류로 중단합니다.

## 검증과 공통 전달

`npm run test:core`, `npm run typecheck`, `npm run test:editions`, `npm run build`와 Python `test_drawing`, `test_logic_composition`이 좌표·연결·변경 원자성·계층 보존·전역 ground를 검사합니다. `npm run test:logic:native`는 별도 QA workspace(기본 loopback 18985)에서 3개 조합의 총 16개 입력을 실제 ngspice로 실행하고 저장·재열기·복제·revision 충돌·이전 결과의 stale 상태를 확인합니다. [실행 증거](evidence/logic-composition/native.json)는 학생 제출물이나 제조 signoff가 아닙니다.

공통 변경은 `main`에서 두 edition 브랜치로 전달합니다. 다른 checkout의 진행 중 편집을 덮어쓰지 말고 공통 커밋을 merge/cherry-pick한 뒤 각 edition의 typecheck/build와 native 검증을 수행합니다. 데이터 폴더와 `product-edition.json`은 edition 고유 설정으로 유지합니다.

설치된 Windows WSL 도구를 선택하려면 `npm run test:logic:native -- --wsl=ResistorEDA`처럼 실제 배포판 이름을 지정합니다. Mac/Linux는 네이티브 도구를 준비한 뒤 `npm run test:logic:native`를 실행합니다. 엔진·모델 미설치는 통과로 대체하지 않고 중단합니다.
