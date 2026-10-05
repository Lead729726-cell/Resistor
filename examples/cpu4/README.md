# 직접 만든 가산기·작은 CPU · 0.13

`replay.html`에서 실제 앱 작업 녹화를 재생합니다. 전가산기 생성·계층 복사·전체
영향 미리보기·입력 변경 시 승인 무효화·승인 적용·Undo/Redo·하위 계층 붙여넣기·
4비트 가산기·CPU·전체 3D 준비·저장 후 재개방을 직접 실행했습니다.

앱의 `워크스페이스 → 설계 파일 가져오기`로 아래 ZIP을 선택합니다. 새 프로젝트로
열리며 기존 설계는 보존합니다. `설계 파일 저장`으로 내보내고 다시 읽는 과정과
잘못된 ZIP 거부를 실제 UI에서 검사했습니다. `recording/bundle-open-save.webm`과
`bundle-ui-verification.json`에 녹화·geometry hash·400ns 조건 보존을 기록합니다.

| 파일 | 실제 내용 |
| --- | --- |
| `full_adder.register-project.zip` | 최초 revision 전가산기, 9 NAND·36 MOS |
| `adder4.register-project.zip` | 전가산기 4개를 사용한 144 MOS 가산기 |
| `cpu4.register-project.zip` | 854 MOS, 4비트 ACC/PC·carry·zero·16×6 ROM CPU |
| `cpu4-rc-400ns.register-project.zip` | 400ns 조건에서 전체 RC 포함 16/16을 통과한 별도 CPU |
| `hierarchy-demo.register-project.zip` | 상위 감싸기와 추가 하위 셀이 반영된 현재 계층 예제 |
| `ui-workflow.json` | 실제 native run ID, 입력별 파형 판정, 11단계 작업 시각 |
| `preview-verification.json` | 73,005개 도형 전체 표시와 GPU 생성 완료 기록 |

회로 해석에서 전가산기 8/8, 4비트 가산기 512/512, CPU 16/16을 통과했습니다.
기본 CPU 프로그램은 LOAD/ADD/AND/XOR와 0..15 즉시값이며 PC 15→0 순환을 검사합니다.
범용 ISA, 분기, RAM, halt, 인터럽트는 포함하지 않습니다. 입력과 PC·ROM·ACC·flags 및
안정 구간을 실제 ngspice 샘플로 검사합니다. 계산된 출력 전압원을 넣지 않습니다.

원본 설계 파일은 회로와 조건·레이아웃을 보존합니다. 해석 작업은 bundle 밖의 실제
worker state와 별도 검증 JSON에 남습니다. 생성된 넓은 참조 레이아웃은 제조 승인이나
배치 배선 최적화가 끝난 CPU cell이 아닙니다. 추가 블록 사이의 물리 배선은 자동으로
연결되지 않으므로 계층 편집 예제에 DRC/LVS 통과를 부여하지 않습니다.

## CPU 전체 물리 검증

이전 reference generator에서 발견한 constant gate/body 배선 단락을 수정했습니다.
gate는 M1으로 우회하여 M2 body와 분리합니다. 내부 M3 rail의 사용하지 않는 구간을
제거하고, 물리 범위가 겹치지 않는 넷만 600nm 여유를 두고 배선 track을 재사용합니다.
전체 CPU의 Magic DRC 0개, Netgen의 854 MOS 회로 일치, Magic RC 추출을 확인했습니다.

50ns RC 포함 동작은 실패했습니다. 200ns에서는 14/16으로 개선되었지만 안정 구간 및
마지막 LOAD의 논리 전압을 통과하지 못했습니다. 실제 전원 단자 probe를 추가해
전압을 확인했고, 시험한 위치의 전원은 정상 범위였습니다. 실패를 단순한 전원 문제나
소프트웨어 PASS로 바꾸지 않았습니다. 조건별 기록은
`../../docs/evidence/cpu-physical-50ns-delay-failure.json`,
`../../docs/evidence/cpu-physical-packed-50ns-delay-failure.json`,
`../../docs/evidence/cpu-physical-200ns-timing-failure.json`에 있습니다.

현재 CPU는 **TT·27°C·1.8V·출력 부하 5fF·400ns 주기**에서 전체 RC 포함 16/16을
통과했습니다. 원본 저항 64,143개·커패시터 28,285개를 유지했고 KLU로 5,287개의 실제
샘플을 계산했습니다. 50ns 기본 회로 해석 예제와 400ns 물리 통과 예제를 구분합니다.
`cpu4-rc-400ns.truth.json`, `physical-verification.json` 및
`../../docs/evidence/cpu-physical-native.json`에서 조건과 원본 경로를 확인합니다.
전체 PVT, STA, timing closure, EM/IR, foundry signoff는 별도입니다.

## 녹화·이전 자료

`recording/design-workflow.webm`은 완료한 앱 작업, `recording/cpu-full-preview.webm`은
전체 3D 준비입니다. 개발 터미널 전체는 녹화하지 않았습니다. CPU 초기화 수렴 실패를
발견한 시도도 `recording/attempt-02-pre-cpu-convergence.webm`에 보존했습니다.
수렴 설정은 pre/post 회로를 분리하여 복원했고, 실제 회귀 검사를 다시 통과했습니다.

이전 파일은 `../history/cpu4-0.12/`에 보존했습니다. 이전 CPU 물리 generator의
constant gate/body 단락 수정은 기존 bundle을 자동으로 변경하지 않습니다. 기존 편집
설계는 보존하고, 새 0.13 reference를 별도 생성한 뒤 변경 내용을 비교하세요.

전가산기 5단계 검증 녹화는 `../validation/validation-flow.webm`, 새 MUX의 실제
전류/벡터·뷰어 반입 녹화는 `../mux4/current-viewer-workflow.webm`입니다.
