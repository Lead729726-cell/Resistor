# 레지스터 구현 상태

2026-10-02 개발 추가: 20-MOS 4:1 MUX의 실제 물리 템플릿·ngspice 64개 입력 검사·
진리표 UI·pre-layout 20개 단자 전류 경로를 추가했습니다. 직접 UI 조작으로 기본
20ns pre/post 64/64, SS/125°C/1.62V/50fF post 64/64, 5ns pre-layout PVT 18점,
DRC 0/LVS 일치/R 1509·C 231 추출과 GDS/OAS roundtrip을 확인했습니다.
5ns post-layout은 56/64 실패를 보존했습니다. PEX 평탄 출력/ngspice 형식과
비유한·음수 RC 거부를 수정했으며 네이티브 회귀 27/27을 통과했습니다.
전체 UI suite와 배포 EXE는 이번 변경으로 재검증/재패키징하지 않았습니다.
[작업물·증거·재현·다음 개선](../examples/mux4/README.md).

2026-10-01. 이전 첫 통합 버전에서 M1/M2/M4/M5와 실시간 공동 작업을 확장했습니다. 완료 항목은 지원하는 공개 SKY130 profile 및 native adapter 범위입니다.

v0.11 추가: TypeScript 3D voxel kinetics 엔진과 공정 순서/재료/초기 구조/조건 설정을
구현했습니다. Conformal/방향성 증착, 선택적 isotropic/방향성 식각, ray shadowing과
국부 단일 재방출, Preston/plane CMP, loaded GDS polygon/hole mask, 초기 tetra
resampling, 단계별 체적·폐쇄 공극·두께/위험 검사, h·2h 실제 비교, 평면 속도 fit,
전 단계/선택 체적/VTU 저장·재개방 및 Node CLI를 제공합니다. 실제 형상 예측 계산이며
장비·화학·plasma·소자 coupled PDE/3D calibration/signoff는 별도입니다.
[모델·조건·수치 경계](process-simulation.md).

v0.10 추가: **공정 3D**의 사면체 체적 importer·geometry inspector·독립 Worker와
3D renderer를 구현했습니다. 같은 재료의 위치별 XYZ, 국부 두께/기준막 대비,
재료별 최소 기준, XYZ 단면/위험 위치와 명시된 폐쇄 공극을 검토합니다.
전량 검사·미제출 체적·unknown·ROI·revision 대응을 구분하고 체적/검토/CSV/PNG와
뷰어 bundle을 보존합니다. 단일 Piece ASCII tetra VTU의 명시적 nm/µm 변환도
실행합니다. 합성 기하 검증은 공정 simulator 실행이 아닙니다.
[지원 형식·한계·재현](process-topography.md).

v0.9 추가: 회로형 R 로고를 작업 화면·독립 뷰어·사이트 및 Windows 아이콘에
적용했습니다. 다크·라이트·시스템 모드와 4개 스킨을 공유 토큰으로 연결하고,
자동 저장/복원, 운영체제 변경 반영, 같은 주소의 탭 동기화와 키보드 선택을 제공합니다.
PDK 레이어 색, 원본 GDS, revision 및 카메라를 유지하면서 실제 WebGL 배경과
파형·경로 미리보기 및 모든 설정 패널을 변경합니다. [사용법](appearance.md).

v0.3 추가: Docker/로그인 없는 GDS 독립 뷰어, 공개 SKY130 및 사용자 LYP/JSON
PDK layer 적용, 원본 포함 뷰어 bundle 저장/재개방, native GDS/OAS 로컬 file picker,
실제 signed branch 전류·방향·벡터 표시를 구현했습니다. 실제 current 엔진20건과
독립/설계 브라우저 검증을 통과했습니다. 자동 공간 대응은 확인한 single-MOS
접점에 제한하며 arbitrary GDS 및 미매핑 branch는 수치만 표시합니다.
자세한 범위/사용법: [viewer-current.md](viewer-current.md).

v0.4 추가: JSON/ZIP 및 설치 경로를 통한 PDK 등록·실제 리소스 검사,
프로젝트별 기술 라이브러리/모델/코너/온도 설정, GDS 최상위 셀 선택과
Magic 포트 추출, 접지·전압·OP/DC/transient 조건 저장, 실제 DRC/LVS/PEX 및
ngspice 해석을 단계별 화면으로 연결했습니다. 사용자 호환 모델·static
Magic technology의 실제 실행도 확인합니다. 설정과 모델 해시가 달라지면
이전 결과는 STALE이 되며 벡터를 숨깁니다. 공동 작업은 서버의 등록된
profile과 설정 revision을 공유합니다. 절차: [pdk-setup.md](pdk-setup.md).

v0.5 추가: 17개 상용 도구 계열의 operator recipe·불변 리소스 snapshot과 별도 인증
실행 에이전트, 설정/검증/실행/취소/로그/출력/GDS·OAS 반입 UI를 연결했습니다.
공유 역할·revision·중복 실행 방지와 parser/전류 provenance도 유지합니다.
실제 공개 ngspice subprocess가 local/agent 전송 경로를 검증합니다. 상용 실행 파일과
라이선스는 설치되지 않았으므로 vendor 실행은 미검증입니다. 버전별 CLI 후보와
실제 설치 후 site flow 검증 절차: [commercial-backends.md](commercial-backends.md).

v0.6 추가: 실행기 등록과 별도로 EDA 파일 호환 기능을 제공합니다. Cadence의 ASCII
기술·표시·stream map, 라이브러리 정의와 CDL/SPICE metadata를 실제로 읽고,
KLayout native LEF/DEF와 GDS/OAS 설계를 명시적 레이어 매핑으로 반입합니다.
외부 파형·signed current는 수치 원본과 imported provenance를 보존합니다.
GDS/OAS 및 보존 netlist 내보내기, 공동 작업의 권한/revision/receipt를 연결합니다.
형식별 지원과 native database 범위: [eda-interchange.md](eda-interchange.md).

v0.7 추가: 원본 DB source 등록과 library/cell/view 선택, 고정 Cadence 읽기 전용
SKILL 및 ICC2/Fusion DB API query, 해시·원본 보존·실행 근거 receipt와 별도 revision
반입을 연결했습니다. 실제 공개 KLayout source 읽기로 graph/geometry/공유 권한을
검증합니다. 상용 실행 파일·OA SDK 미설치로 실제 vendor DB 실행은 미검증이며,
standalone OA C++ 및 Custom Compiler 전용 direct reader는 미구현입니다.
원본 API의 지원 primitive/transform 범위를 벗어나면 반입을 차단합니다.
절차: [native-database.md](native-database.md).

설계 검토에는 로드한 도형/넷/셀/레이어 검색, 정확한 정수 DBU 거리 측정,
project/revision/범위에 연결된 북마크, 실제 로드한 scene 변경 비교와 signed
전류/파형 CSV를 추가했습니다. 부분 ROI를 전체 설계 검사로 표시하지 않습니다.
사용법: [design-review.md](design-review.md), 개발 목록: [development-roadmap.md](development-roadmap.md).

v0.8 추가: **통합 설계**에 실제 조건별 PVT, 최악 측정 조건과 제약, 설치 PDK 규칙
기반 배선 미리보기/적용, 연결된 회로 템플릿과 실제 pin-net 탐색을 연결했습니다.
원본 snapshot, 모델/resource hash, revision 및 영수증을 유지합니다. 회로 해석과
레이아웃 생성/DRC/LVS/PEX 상태를 구분합니다. 범위와 실행 절차는
[integrated-design.md](integrated-design.md), 검증 결과는 최신 `evidence/release.json`입니다.

| 영역 | 구현 및 실제 검증 | 제한/외부 상태 |
| --- | --- | --- |
| M0 | pinned image, 실제 PDK/model/deck/tool provenance, doctor, public MOS PCell, PDK 등록/ZIP/리소스 해시 및 호환 모델·technology 실행; native backend 등록과 인증 실행 에이전트 | 상용 도구/라이선스 설치 및 해당 release의 site flow 검증 필요 |
| M1 | integer KLayout, polygon holes/path/label/pin, cell/instance/array, 회전/반사/복사/이동/삭제, monotonic undo/redo, GDS/OAS 왕복, immutable bundle/revision/receipt | 실제 KLayout 빌드의 좌표 범위 초과 거부 |
| Viewer | stable ID 2D/3D, layers/projection/explode, exact 절단면/holes, picking/hierarchy focus, PNG/GLB, 실제 RC 표, 협업 선택/커서 | 높이는 illustrative; 실제 process/TCAD 미제공. 미확인 shape별 RC 매핑을 만들어내지 않음 |
| 대형 설계 | 실제100,000 occurrence fixture, bounded scene API, exact cache/spatial instancing/progressive load/scope 이동 | 소프트웨어 GPU에서2,000 visible subset 측정. 전체100,000 visible30FPS는 미검증; 중단된 시도 보존 |
| M2 | geometric wires/junction crossing, hierarchy blocks, SPICE, 실제 Xschem→ngspice, DC/AC/OP/tran, TT/FF/SS/온도/전압/testbench, GDS 추출 포트·바이어스·해석 설정 | 호환 profile 필요; noise/statistical/TCAD 모델 미지원 |
| M3 | 실제 full Magic DRC/Netgen LVS/RC PEX/post-layout, marker/log/raw/measurements/전후 비교, 독립 상태/STALE, 의도적 오류 및 수정 | Deck 통과는 foundry signoff가 아님 |
| M4 | 공개 via1/via2 helper, current mirror/differential pair 실제 layout 및 DRC/LVS/PEX/pre/post | 작은 고정 공개 template subset; 범용 자동배선·전체 analog library·foundry matching/guard-ring signoff 미지원 |
| M5 | grid/random/TPE 실제 MOS 후보, feasible-only 점수, 원본 보존/비교, trial/시간/동시 실행 상한, 취소/재시작 실패, 실제 MCP tool adapter | MOS nf=m1 W/L subset. 자체 local univariate Parzen TPE. 외부 LLM 계정/API 미구성 |
| 공동 작업 | 서버 계정, owner/editor/viewer, 초대/회수, 실제 설계 복제/공동 편집, 분리 변경 rebase/겹침 충돌, exactly-once receipt, WS presence/revision/job, 파일/결과/후보 공유 | 인터넷 호스팅 미개설; 유료 Supabase 생성은 사용자 결정으로 보류 |
| 배포/데이터 | 레지스터 Windows sandbox IPC executable, Linux isolated Docker hub+EDA, SQLite WAL/영구 볼륨/온라인 DB 백업 | Windows unsigned 개발 배포. 외부 VM/TLS/domain 및 macOS GUI 미검증 |

기존 `.runtime/eda`의 project/snapshot/run을 보존했습니다. `.runtime/cloud`는 계정·권한·명령 ledger를 저장합니다. 모델/덱 및 worker 토큰은 project export에 넣지 않습니다. 관리되는 업로드 PDK는 명시적 비공개 백업 옵션으로 보존합니다. Linux worker는 외부 포트에 노출하지 않습니다. 실행 실패/취소/unsupported/stale은 PASS로 표시하지 않습니다.

증거/재현: verification.md, cloud.md, agent-integration.md, docs/evidence와 packages/viewer/tests/evidence. 대형 설계의 성공한 제한 영역 측정과 중단된 전체 표시 시도를 각각 보존합니다.
