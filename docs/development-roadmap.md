# 추가 개발 목록 · 레지스터 v0.13

## 전압·전류 흐름 / 신호 시험 (2026-10-05)

- 같은 native 실행의 branch 양 끝 및 MOS gate/body 전압 저장, 계층·global 노드 처리.
- 시간 슬라이더/재생, signed 단자 전류 방향, ΔV, 넷 필터와 소자 교차 선택.
- NOT/Buffer/수동 기대 논리 및 아날로그 범위의 입력→출력 시험, 전체 출력 구간 min/max 판정.
- 구간 밖·불명확 논리·STALE 차단, 흐름/시험 JSON과 출처 기록.
- 파일 I/O 실패가 작업을 running/PASS로 남기지 않도록 완료 처리와 atomic manifest 저장 보강.
- 실행 상태 인덱스와 미완료 작업만 조회하는 worker 재시작 복구로 대형 실행 이력의 초기 로딩 부담 감소.

[사용법·공식·데이터 범위](signal-flow.md). 검증 기록과 직접 사용 녹화는
`docs/evidence/eda-signal-flow-*`에서 확인합니다.

## EDA 해석 검토 확장 (2026-10-04)

- A/B 보간 커서, 구간 확대, 비균일 축을 반영한 Min/Max·Mean·RMS·적분.
- 10–90% 상승/하강, 주기·주파수, 지정 edge 기반 입력→출력 지연.
- 단위 검사를 포함한 파형 연산, 차동 전압·전력·에너지 검토.
- 실행·revision·원본 조건을 포함한 측정 JSON / 구간 CSV.
- 짧은 펄스 극값을 보존하는 차트 표본 축소와 pre/post 비교 조건 강화.
- 도구 버전 검사 timeout을 영구 실패로 저장하던 진단 캐시 수정 및 명시적 다시 진단.

[공식·사용법·검증 범위](waveform-lab.md). 실제 검사 기록은
`docs/evidence/eda-waveform-lab.json`과 해당 브라우저 캡처에서 확인합니다.

## 이번에 구현하고 실제 검사한 항목

- 가산기·작은 CPU와 편집 가능한 회로 계층, 입력별 실제 native 파형 검사.
- 계층 clipboard·모든 사용 위치의 물리 영향 미리보기·승인 무효화·Undo/Redo.
- 현재 revision의 회로 → DRC → LVS → PEX → RC 포함 해석 5단계와 실패 시 중단.
- 전체 CPU 물리 검사와 constant gate/body 단락 수정, 내부 rail 범위·track 재사용.
- 추출 회로의 KLU/CPU transient operating point와 선택 trace 저장, 원본 RC 유지.
- CPU pre-layout에 맞는 solver 복원과 수렴 실패 증거 보존.
- Docker·workspace·인증 진단, 재연결, Docker가 없어도 사용하는 GDS 뷰어.
- Windows 설치/해제·설계 데이터 보존 QA, 실제 앱 작업·전체 3D·전류 뷰어 녹화.
- 워크스페이스 ZIP 가져오기/저장, 새 프로젝트 복원·원본 보존·native hash 검사.
- Mac native arch 패키징 → 실제 뷰어/시작 진단 smoke → DMG 생성 workflow 준비.

[현재 조건과 검증 기록](../examples/cpu4/README.md) · [검증 화면 사용법](validation-workflow.md).

## 상용 사용을 위한 다음 개발

1. compact placement·clock buffering·배선 최적화와 slew/load/PVT·STA timing closure.
2. 공급망 EM/IR와 coupling 영향 및 측정/공정 데이터로 보정한 3D 공정 모델.
3. 대량 waveform history의 저장 분리와 startup recovery 상태 index, 장시간 stress 검사.
4. 실제 Mac 설치·업그레이드·서명·공증; 현재 workflow는 Windows 검증을 대체하지 않습니다.
5. 실제 licensed vendor 도구/SDK와 대표 OA/NDM/PDK DB로 release별 직접 읽기·실행 검증.

인터넷 배포는 사용자 요청대로 보류합니다. 기능 설정·실행 결과와 외부 도구의 미검증
상태를 계속 구분합니다. 기존 편집 설계와 실패 기록을 자동으로 덮어쓰지 않습니다.

## 내 반도체 시작 설정 (2026-10-02)

역할별 8개 시작 설계, 서버가 관리하는 3개 운전 조건, 회로·지원 물리 레이아웃·
testbench의 단일 revision 저장, 실제 해석 선택과 공개 PDK 특징·준비 상태 표시를
구현했습니다. 지원되는 22개 조건별 실제 ngspice 해석과 저장·복원 검사가 통과했습니다.
[사용법·실제 검증 범위](semiconductor-starters.md).

GF180·IHP는 현재 특징 비교입니다. 다음 실제 실행 확장에는 공정별 MOS 모델
이름·범위, PCell·layer·tap·추출 어댑터와 실제 DRC/LVS/PEX 기준 회로 검증이 필요합니다.

## 직접 MUX4 설계에서 확인한 개선점 (2026-10-02)

20-MOS 물리 템플릿, 실제 64개 진리표, pre-layout MOS 단자 전류 경로,
PEX 품질 guard와 기본/느린 조건 pre/post 검증은 구현·실행했습니다.
[실제 설계와 5ns 실패 결과](../examples/mux4/README.md)를 다음 개선의 기준으로 사용합니다.

1. 넓은 기준 M3 rail을 compact 배선으로 바꾸고 PEX 지연/면적/부하별 drive sizing을 비교합니다.
2. Select 동시 전환·glitch/hazard·slew·load sweep과 STA 경로 검증을 추가합니다.
3. 반복 native MOS의 identity와 D/S 대응을 증명한 뒤 post-layout 물리 전류 경로를 표시합니다.
4. 현재 flat MUX에서 확인한 distributed RC recipe를 계층 설계까지 실제로 검증합니다.
5. 작은 창에서 EDA 교환 내보내기 버튼이 가려지는 패널 높이 문제를 개선합니다.


## 실행 가능한 공정 시퀀스 (v0.11)

증착/식각/CMP rate-driven 3D kernel, 공정 조건/순서/초기 구조, material 선택비,
ray 가림·국부 single-bounce 재방출, 현상론적 pad/density CMP, 실제 loaded GDS
polygon/hole mask, 초기 tetra volume resampling, 전 단계 체적/공극/검토, h·2h 비교,
평면 속도 fit 및 Node CLI/VTU 상호 교환을 구현했습니다.
[실제 수치 모델과 사용 범위](process-simulation.md).

다음 항목은 장비·재료 데이터와 물리 모델이 필요한 별도 정확도 확장입니다:
chemical kinetics/plasma/diffusion 및 다중 scattering, 교정된 3D 장비 model,
법선 두께의 sub-voxel reconstruction/adaptive remeshing, 측정/reference corpus의
공정별 오차 및 수렴 허용 기준, coupled device/전기/열/탄성 응력 및 foundry validation.
이번 버전의 기하·rate-law 검사를 predictive calibration으로 보고하지 않습니다.

## 공정 topology 방향 반영 (v0.10)

소자·홀·단차·다층 금속/절연막의 XYZ 체적·국부 두께 입력, 재료별 기준,
전량 검사·단면·명시된 폐쇄 공극·위험 위치·portable bundle은 구현했습니다.
기존 GDS 레이어 돌출과 공정 결과 검토를 구분합니다.
사용법과 실제 범위: [공정 3D 검토](process-topography.md).

v0.11의 rate-driven 단계 계산과 저장은 위에 반영했습니다. 남은 정확도/규모 확장은
다음과 같습니다.

- 실측/TCAD export의 법선/수직 두께 정의와 원본 mesh field의 교차 검증.
- 장비별 화학·재방출/반응 수송과 측벽·모서리 막의 3D 보정 reference.
- Sub-voxel 계면과 adaptive remeshing에서의 재료 보존 및 단계 대응.
- 실측 pad contact·dishing/erosion model과 국부 CMP 두께 오차 검증.
- 큰 체적의 병렬/분할 실행 및 여러 해상도의 허용 오차 기반 수렴 검사.
- 전기·응력·열·신뢰성 field와 공정 결함 위치의 실제 coupled 해석.

실측/reference로 교정하지 않은 모델을 제조 예측 검증 완료로 표시하지 않습니다.
인터넷 배포와 유료 인프라는 기존 사용자 결정대로 보류합니다.

2026-10-01. 인터넷 서버 배포는 사용자 요청으로 보류합니다.
기존 설계·뷰어·공동 작업을 유지하면서 다음 사용 흐름을 우선 개발합니다.

| 우선순위 | 기능 | 필요한 이유 | 구현 및 검증 목표 |
|---|---|---|---|
| 1 | 원본 DB 읽기 전용 연결 | OA/NDM 설계를 파일 변환 없이 조사하고 반입 | 고정된 native DB API 스크립트, 라이브러리/cell/view 선택, 실제 primitive/instance/pin 데이터, 명시적 layer map, 별도 revision 반입 |
| 1 | 호환 검증 기록 | 연결 설정과 실제 실행 성공을 구별 | 도구/리소스/스크립트/입출력 hash, 실행 로그, 실패 원인, 읽기 전후 원본 무변경 검사, 다운로드 가능한 receipt |
| 1 | 도형·넷·셀 검색 | 큰 레이아웃에서 원하는 설계 요소 찾기 | 실제 로드한 scene의 검색과 선택, 결과 범위·표시 제한 명시 |
| 1 | 좌표·치수 측정 | 배선과 소자 크기를 직접 확인 | 정수 DBU 점/꼭짓점 간 dx/dy 및 거리, µm 환산; 임의 bbox 거리를 DRC clearance로 표시하지 않음 |
| 2 | 관심 영역 저장 | 검토 위치를 반복해서 찾아가기 | 프로젝트/revision/scene 범위에 연결된 bookmark, JSON 저장/다시 읽기, 다른 설계·오래된 revision 거부 |
| 2 | 설계 변경 비교 | 반입/편집으로 어떤 도형이 바뀌었는지 확인 | 실제 scene 기준점과 현재 scene의 추가/삭제/변경; 부분 ROI 비교를 전체 설계 비교로 표시하지 않음 |
| 2 | 전류·파형 CSV | 실제 결과를 재사용하고 검토하기 | signed 수치·축·단위·출처·revision·freshness 보존, 명시적 전류 경로와 수치 결과 구별 |

## 검증 상태

위 7개 항목의 화면과 처리 경로를 v0.7에 구현했습니다. 검색·치수·북마크·비교·CSV는
실제 로드한 scene/결과를 사용하며, source 조회·읽기·반입은 공개 KLayout으로 확인합니다.
실제 완료 범위와 검사 수는 `docs/evidence/release.json`, `native-database*.json`,
`viewer-review*.json`에 기록합니다.
상용 실행 파일과 OpenAccess SDK는 현재 PC 및 Linux worker에서 발견되지 않았습니다.
상용 DB API 연결 코드를 구현해도 실제 vendor 실행 검증을 대신하지 않습니다.
공개 KLayout calibration과 synthetic native bridge 경계 검사는 별도로 표시합니다.

## 통합 EDA 개발 범위 · v0.8

상용성은 실제 설계 원본, 편집, 전기 연결, 모델 기반 해석, 물리 검증과
결과 재현을 한 작업 흐름으로 사용할 수 있는지를 기준으로 진행합니다.
이번 범위는 아래 기능의 실제 구현과 공개 엔진 검증입니다. 최종 검사 기록은
`evidence/pvt.json`, `design-tools.json`, `integrated-cloud.json`,
`integrated-tools-ui.json`, `mcp-integration.json`, `release.json`에서 확인합니다.

| 기능 | 구현 범위 | 사용자가 확인할 경계 |
|---|---|---|
| PVT 일괄 해석 | 실제 공급원 선택, pinned snapshot, 조건별 native Run, measured metric, worst-condition 제약, 시간/동시 실행 상한과 취소/중단 복구 | 통계적 yield와 vendor/foundry signoff는 별도 |
| PDK 배선 보조 | 실제 기술 규칙/resource hash, 정수 경로/장애물 검사, revision 및 preview hash 일치 시 원자적 적용 | SKY130 단일 met1 Manhattan 범위, via/다층 자동 배선/전체 DRC 별도 |
| 아날로그 회로 템플릿 | 실제 소자·핀·넷·전원/자극, 편집 가능한 회로, 실제 해석과 파형 기반 측정 | 회로 template와 미생성 physical layout을 구별 |
| 연결/오류 탐색 | 실제 schematic pin-net graph, circuit 검사, 명시적 device ID 기반 교차 선택 | net 문자열만으로 physical/electrical 매핑을 만들지 않음 |
| 공유 설계 통합 | room별 PVT/source/run 접근, Viewer 실행 금지, exactly-once 경로 적용, stale 설계/결과 거절 | 인터넷 배포 보류, 새 template는 로컬 생성 후 기존 공유 절차 |
| typed MCP | 조건표/회로/배선/연결 도구, 명시적 revision·영수증·예산 | 임의 shell/PDK/script/credential 입력 없음 |

## 다음 상용성 개발 후보

| 기능 | 다음 개발에 필요한 근거 |
|---|---|
| 설치된 vendor release별 OA/NDM 검증 | 실제 실행 파일·SDK·라이선스와 시험 DB, 검증할 primitive/array/PCell/계층 목록 |
| 계층/대형 설계 성능 | 실제 대형 디자인 corpus와 shape/instance/net 제한, 메모리/지연/취소 benchmark |
| 다층 연결과 배선 보조 확장 | 명시적인 via/contact 룰, extracted net의 실제 매핑, deck별 DRC/LVS 검사 |
| 아날로그 template의 physical 설계 확장 | 회로별 맞는 PCell, matching/common-centroid/guard-ring 규칙, 실제 pre/post 및 DRC/LVS |
| Monte Carlo와 yield | profile이 제공하는 실제 mismatch/statistical 모델, seed·분포·결측 처리 |
| 설치/운영 품질 | 지원 OS별 설치·업데이트·복구, 장시간 실설계 검증, 데이터 백업/복원 |
| 외부 서버 배포 | 사용자 요청 시 VM/domain/TLS/비공개 라이브러리 접근 정책을 적용 |
