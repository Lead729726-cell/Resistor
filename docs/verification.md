# 레지스터 검증 기록

2026-10-01, Windows 11 + Docker Linux. 실제 엔진·입력 경계·합성 형상 검증을
구분하며 각 JSON의 날짜와 source SHA가 실행 범위를 기록합니다.

v0.11은 실행 가능한 속도 기반 3D 증착·식각·CMP, 공정 순서/조건, GDS mask,
초기 tetra 반입, 전 단계 검사, 모든 시작 표면의 피복 진단, 실제 h·2h 비교,
평면 속도 fit 및 Node backend를 추가합니다. 공정 수치28 + 기존 체적19 = 47개,
전체 UI32, unit3/38/41과 packaged MCP33개 tool을 현재 소스로 검증했습니다.
Cold Windows/Linux 뷰어와 두 실제 CLI의 모든 단계 점유/요약이 일치하며 출력
21개의 hash를 확인했습니다. 장비·화학·소자 물리 보정/signoff는 미검증입니다.
사용법과 계산 경계는 [공정 시퀀스](process-simulation.md)에 있습니다.

v0.10의 합성 체적 검사 및 v0.9의 로고·8개 화면 팔레트·설정 복원·Windows 재시작도
v0.11 실제 패키지와 로컬 Linux에서 다시 확인했습니다. 기존 worker/공동 작업
backend는 변경하지 않았고, source hash가 일치하는 v0.8 native/Linux 물리 검증을
이어받습니다. 이전 넓은 성능·sign 회귀 baseline은 별도로 보존합니다.
실제 상용 실행은 도구·OA SDK 미설치로 미검증이며, parser grammar/bridge harness는
vendor 실행과 구별합니다. 의도적인 DRC/LVS 오류는 FAIL과 수정 뒤 PASS가 모두
확인된 경우만 검증 성공입니다. 공개 덱의 PASS는 foundry signoff가 아닙니다.

| 검증 | 확인된 결과 | 증거 |
| --- | --- | --- |
| 증착·선택적 식각·ray shadowing/국부 재방출·Preston/plane CMP·GDS hole mask·초기 tetra·수렴 비교·속도 fit | 수치/형상 경계28개 통과; 속도 기반 형상 계산, 3D 장비 보정 미검증 | evidence/process-recipe.json |
| 공정 단계13,824 cells·전 시작 표면 피복 CSV·미해결 박막·단계 보존·VTU 재반입·실제 h/2h·취소/오류 | 새 UI3개 및 전체32개 통과; native RPC/browser errors 0 | evidence/process-flow-ui.json, evidence/ui-tests.json |
| 실제 공정 Worker와 Windows Electron Node/Linux Node backend | 초기 포함 5단계 점유/요약 일치; Windows 출력21개 hash 검증 | evidence/process-flow-release.json |
| 공정 XYZ 체적·국부 두께/기준막·재료별 기준·단면·명시된 폐쇄 공극·입력 경계 | 합성 기하19개, 공정 예측 미실행 | evidence/process-geometry.json |
| 공정 전체1296 cells·숨김/단면과 독립 검사·VTU nm 반입/경계·저장/reopen·revision | UI3개 통과; 원본 GDS/체적 보존; native RPC 0 | evidence/process-ui.json |
| 공정 Worker·XYZ mesh/caps·closed hole·전량 보고서 | Windows cold 실행 및 로컬 Linux 통과; 입력 SHA 일치; 공정 물리 예측 아님 | evidence/process-release.json |
| 회로형 R 로고·SVG/favicon·Windows 7크기 ICO·실행 파일 리소스 | 실제 아이콘 원본/해시 및 256px 임베딩 일치 | evidence/brand-assets.json, evidence/appearance-release.json |
| 4개 스킨 × 다크/라이트·시스템·저장/복원·탭 동기화·키보드·작은 창·6개 설정 패널 | 8개 실제 캔버스 픽셀, 주요 텍스트/버튼 대비 4.5 이상, 원본 GDS·PDK 색·카메라·revision 유지 | evidence/appearance-ui.json |
| Windows 독립 프로필/앱 재시작·로컬 Linux 스타일·GDS 52개 | 실제 패키지 재시작 복원과 Linux 8개 조합 통과; native/auth/events 요청 0 | evidence/appearance-release.json |
| 실제 MOS/RC/회로·GDS 조건별 PVT, 공급원·분석·모델 해시, worst metric, 원본 불변, 시간/취소/재시작 경계 | 33개 통과; 실제 엔진과 boundary harness를 각 case에 표시 | evidence/pvt.json |
| 실제 연결된 5개 회로, OP/DC/AC/tran 측정, 설치 PDK met1 경로·충돌·receipt·Undo, 별도 Magic DRC, import setup 초기화 | 25개 통과 | evidence/design-tools.json |
| 공유 조건표·실제 ngspice 2조건·child run 격리·Viewer 권한·exactly-once 배선·stale·회로 bundle 공유 | 5개 검사 통과 | evidence/integrated-cloud.json |
| 실제 PVT·route preview/apply/DRC·RC 생성/연결/해석/PVT·CSV·작은 창 | 새 화면 3개 및 전체 UI32개 통과 | evidence/integrated-tools-ui.json, evidence/ui-tests.json |
| Session/allowlist/token 경계 | 3개 통과 | npm test |
| Exact coordinate, holes, caps, picking, distant ROI precision/cache·signed current/stale/AC guard·설계 검토 | 38개 통과 | evidence/unit-tests-0.11.json |
| GDS·PDK/XML·tech/DRF/stream map·CDL·명시적 CSV 및 전류 provenance | 41개 통과 | evidence/unit-tests-0.11.json |
| 원본 DB 고정 query·public KLayout graph/geometry·원본/receipt/리소스 hash·공유 scope | 41개 native 및 경계 검사 통과, 상용 실행 미검증 | evidence/native-database.json |
| 원본 DB shared source/receipt/역할·revision·중복 명령 경계 | 4개 actual reader 검사 통과 | evidence/native-database-cloud.json |
| 로드한 도형 검색·정수 치수·bookmark·부분 scene 비교·signed CSV | 20개 helper 검사 및 실제 UI 확인 | evidence/viewer-review.json, evidence/native-database-ui.json |
| 실제 KLayout GDS/OAS·LEF/DEF·macro geometry·CDL 및 입력/receipt/해시 경계 | 45개 통과, 상용 실행 미검증 | evidence/interchange.json |
| 공개 작성자의 Cadence/Synopsys 원본 기술 파일 | 2개 실제 파일 검사, 원본 SHA 및 parser SHA 기록 | evidence/interchange-primary.json |
| 통합 설계·파일 호환·원본 DB·설계 검토·실제 해석·Windows executable UI | 전체 UI32개, skip/flaky 없음 | evidence/interchange-ui.json, evidence/native-database-ui.json, evidence/ui-tests.json |
| 파일 교환의 공유 역할·revision·receipt·외부 결과 및 프로젝트 경계 | 4개 검사 통과 | evidence/interchange-cloud.json |
| Local/인증 agent 실제 ngspice·unavailable·로그/리소스/취소/재시작·GDS 반입 | 34개 native/경계 검사 통과, vendor 미검증 | evidence/commercial-backend.json |
| 제한된 ASCII/PSF/LIS/Calibre site-export/RC/exchange parser | 21개 synthetic grammar 검사 통과, vendor 출력 시험 아님 | evidence/commercial-results.json |
| recipe/ZIP/redirect/receipt·stdout confidentiality 및 cap | 독립 bridge9개 통과 | evidence/commercial-audit.json |
| 설치 대기 profile·실제 교정·입력 보존·artifact/재개방 | UI3개 통과, 실제1V/−1mA/+1mA | evidence/commercial-backend-ui.json |
| Native backend 공동 설계 role·revision·receipt·actual output isolation | 4개 검사 통과 | evidence/commercial-cloud.json |
| PDK model/technology/ZIP 경계·포함 파일 해시·실제 일반 MOS 부호 교정 | 독립 검사 39개 통과 | evidence/pdk-setup-audit.json |
| Naked GDS 포트·OP/DC/tran·pre/post PEX·DRC/LVS·업로드 모델/technology·코너·취소·receipt·셀 선택 | 실제 엔진 및 입력 회귀 32개 통과 | evidence/pdk-setup.json |
| PDK 설정 화면·실제 OP/DC/DRC/PEX 버튼·저장/재개방·다른 최상위 셀·작은 화면 | 3개 실제 브라우저 시나리오 통과 | evidence/pdk-setup-ui.json |
| 공유 PDK 설정 역할·revision 충돌·한 번 처리·실제 전류/artifact 경계 | 4개 검사 통과 | evidence/pdk-cloud.json |
| 기존 signed-current 파형·pre/post 호환성 | v0.4 실제 엔진 16개 통과 | evidence/current-flow-0.4-compatibility.json |
| PDK registry 백업 및 명시적 업로드 리소스 SHA 복구 자료 | registry/DB 무결성·기본 제외·명시적 포함 통과 | evidence/pdk-backup.json |
| 실제 OP/DC/tran signed branch·pre/post PEX·원본 파형 비교·authority·import guard | 20개 통과 | evidence/current-flow.json |
| ngspice 작업별1 thread·실제 동시 W=1.3 transient·결과 동일성 | 3개 통과, 기존96.157초 run/log 보존 | evidence/current-concurrency.json |
| Docker/인증 없는 로컬 GDS/LYP·2D/3D·명시 경로·bundle 재개방 | RPC/auth/events 요청 및 browser errors 0 | evidence/standalone-viewer.json |
| 실제 native 전류 2D/3D·portable bundle·STALE arrows | 통과, 실제36.24µA OP·browser errors 0 | evidence/native-current-viewer.json |
| Docker 없는 PATH·빈 workspace의 Windows 독립 뷰어 | 52개 실제 GDS 도형·native session 미생성 | evidence/windows-viewer-only.json |
| 기본 저장·DBU·오버플로·undo·GDS/OAS | 7개 통과 | evidence/transport-and-save.json |
| Inverter/MOS/wire simulation·DRC·LVS·PEX·수정 회귀 | 17개 기대 결과 일치 | evidence/physical-summary.json |
| DC/AC/OP·PCell 재생성·실행/대기 취소·model freshness | 8개 통과 | evidence/advanced-native.json |
| Polygon/holes/path/label/pin/계층/배열/회전/미러·영구 receipt·bundle | 4개 묶음 통과 | evidence/extensions.json |
| Geometric wire/junction·hierarchical block·TT/FF/SS·testbench | 12개 통과 | evidence/native-extended.json |
| 실제 아날로그 core·via1/via2·MOS 출력/OP | 20개 통과 | evidence/analog.json |
| Short/open/bulk LVS 오류 및 복구·fixture 물리 미지원 | 7개 기대 결과 일치 | evidence/faults.json |
| Grid/random/TPE·constraints·feasible-only·취소·Xschem·RC | 7개 묶음 통과 | evidence/optimizer.json |
| Wall budget bounds·exactly-once create/evaluate·동시 실행 2개 | 2개 묶음 통과 | evidence/budgets.json |
| 실제 queue 대기 포함60초 aggregate expiry·queued engine 미실행 | 60.512초 취소/NULL score 확인 | evidence/deadline.json |
| 실제 engine 중단·재시작·job/experiment/trial recovery | failed/unknown·NULL score·active ID 정리 확인 | evidence/interruption.json |
| 실제 packaged MCP handshake·33 typed tools·native edit/receipt·revision/schema·원본 DB·PVT·배선·회로·실제 backend calibration | 21개 검증 항목 통과 | evidence/mcp-integration.json |
| 두 계정 cloud auth/role/invite·실제 동시 native edits·충돌·한 번 실행·run/artifact 경계·restart receipt | 12개 검증 항목 통과 | evidence/cloud-integration.json |
| 실제 SKY130 viewer·2D/3D 같은 ID·hidden/locked/clipped·off-grid·정확 이동·PNG/GLB | 13개 통과 | evidence/viewer-browser.json |
| 실제 geometry UI·배열·주석·협업 cursor·읽기 전용 | 12개 통과 | evidence/advanced-layout-ui.json |
| 계층 bbox·정수 ROI·source count·occurrence scope | 4개 통과 | evidence/hierarchy-focus.json |
| Native schematic UI·crossing/junction/Undo·child block·SPICE/save | 통과, browser error 0 | evidence/editor-ui.json |
| 두 브라우저 실시간 편집·dirty draft·충돌 보존/no replay·권한 전환·파일 upload/download | 통과, browser error 0 | evidence/collaboration-ui.json |
| FF/125°C/1.2V·실제 Xschem OP·2개 DRC/LVS/DC 후보·history | 통과, browser error 0 | evidence/optimization-ui.json |
| Windows sandbox executable·독립 GDS·실제 current·PDK/native 설정·native file picker·inverter 전체 UI·stale·파형 단위·origin/session 차단 | 전체 UI32개 통과 (이전 실패 로그 보존) | evidence/ui-tests.json |
| 별도 Linux Compose hub+worker·remote web·실제 물리 및 통합 설계 실행 | 실제 DC/DRC/LVS/PEX/post DC·설정 OP·PDK·원본 DB·교환 파일·PVT 2조건·배선 적용·연결·stale·독립 GDS 통과, local native RPC/browser errors 0 | evidence/cloud-container.json |
| SQLite online backup·hash·DB integrity | 두 DB SHA/무결성·project files·재시작 보존 통과 | evidence/cloud-backup.json |
| 별도 data workspace·packaged web assets·localhost HTTP/WS·untrusted origin | 6개 통과 | evidence/portable-cloud-web.json |
| 별도 Node 허브 없이 packaged desktop 자동 서버 시작 | 통과 | evidence/standalone-desktop.json |
| 전체 dependency audit | 0 advisories | npm audit --omit=optional |

실제 run IDs, 입력 revision, 결과/상태와 artifact 경로는 JSON 증거 및 .runtime/eda/runs에 있습니다. 첫 버전의 실패 원인과 원래 로그도 보존했습니다. 모델·PDK·덱은 바꾸지 않았습니다.

v0.3에서 실제 전류 20건과 동시 해석 3건, Docker 없는 Windows 뷰어를
검증했습니다. v0.4에서는 PDK/GDS 설정·업로드 모델 및 추출 technology의
실제 해석, 설정 화면, 공동 작업 권한/receipt/충돌과 Linux 서버를 검증합니다.
그 밖의 확장 native/성능 기록은 v0.2에서 실행한 검증 기록입니다.
현재 배포 파일의 해시와 검증 범위는 `evidence/release.json`, 이전 배포는
`evidence/release-0.2.0.json`과 `evidence/release-0.3.0.json`에 보존합니다.

## 실제 측정 예

기본 inverter는 공개 tap cell을 포함하고 full Magic DRC 0, Netgen unique match, PEX 45R/6C를 확인했습니다. pre/post transient 1,544 samples, delay 약39.99→45.77ps입니다. MOS는 181 DC samples, DRC 0, LVS match, PEX 57R/6C이며 peak drain current 약334.642→313.435µA입니다. 200µm metal1 wire의 실제 extraction은24.8755Ω/21.4651fF입니다.

Current mirror/differential-pair transistor core는 실제 public PCell과 routing을 사용하고 DRC 0/LVS match, PEX 146R/3C 및212R/21C를 확인했습니다. 완성된 op-amp나 범용 analog router로 표시하지 않습니다. Xschem UI 검증의 FF/125°C/1.2V OP에서 실제 gm0.000125112686S와 gds0.0000045967036S를 표시했습니다.

## 대형 설계 성능

실제 KLayout cell array 원본100,000 occurrences에서 explicit ROI의 정확한2,000 shapes를 가져와 그렸습니다. 마지막 측정은 packages/viewer/tests/evidence/performance-100k.json에 있고 root evidence에 복사했습니다. Headless Chromium ANGLE SwiftShader,1600×850 viewport,75% raster resolution, exact cache1개/spatial batches4개 조건입니다. geometry를 단순화하지 않습니다.

측정은 해당 표시 영역의 orbit drag/damping 프레임이며 하드웨어 GPU benchmark가 아닙니다. 전체100,000 simultaneous visible30FPS는 미검증입니다. 중단된 전체 표시 시도와 실패/성공 측정을 별도로 보존합니다. P95와 drawing-buffer 크기는 증거 JSON에서 확인할 수 있습니다.

## 재현

```powershell
npm ci
npm run doctor
npm test
npm run test:viewer
npm run test:importer
npm run test:interchange
npm run test:interchange-cloud
npm run database:doctor
npm run test:database
npm run test:database-cloud
npm run test:pvt
npm run test:design-tools
npm run test:integrated-cloud
npm run test:pdk
npm run test:pdk-cloud
npm run test:pdk-backup
npm run test:integration
node tests/integration/physics.mjs
node tests/integration/advanced.mjs
node tests/integration/extensions.mjs
node tests/integration/native-extended.mjs
node tests/integration/analog.mjs
node tests/integration/faults.mjs
node tests/integration/optimizer.mjs
node tests/integration/budgets.mjs
node tests/integration/deadline.mjs
npm run test:mcp
npm run test:cloud
npm run package
npm run dev:web
# 다른 터미널에서
$env:REGISTER_UI_CALIBRATION_MANIFEST='D:\Coldbrew\Resistor\adapters\commercial\calibration-ngspice.manifest.json'
npm run test:ui
node packages/ui/tests/editor-smoke.mjs
node packages/ui/tests/collaboration-smoke.mjs
node packages/ui/tests/optimization-smoke.mjs
```

deadline.mjs는 실제 long-running native jobs로 pool을 점유해60초 expiry/cancel을 검증합니다. 다른 native UI 검증과 동시에 실행하지 않습니다. 나머지 job tests도 CPU/worker 공유를 고려해 실행합니다. 도구 부재/불완전 실행을 PASS로 해석하지 않습니다.

Linux Compose 검증은 cloud.md대로18767 isolated stack을 실행한 뒤 node --test --test-isolation=none tests/cloud-deploy.test.mjs입니다. 외부 호스팅/DNS/TLS와 실제 공개 접근은 별도 미개설 상태입니다. 유료 Supabase 프로젝트는 사용자 결정으로 생성하지 않았습니다.

상용 backend adapter/agent는 v0.5에 구현했습니다. `npm run test:backend`는 실제 공개
ngspice local/remote subprocess 및 부재/오류/취소/리소스 경계를 검사합니다.
`npm run test:backend-cloud`는 역할·revision·receipt·artifact room 경계와 실제 calibration을
검사합니다. 상용 실행 자체는 도구 미설치로 미검증이며 parser fixtures는 해당 grammar에만
관한 검증입니다. 추가 PDK, arbitrary nf/m mapping, 범용 analog routing, exact RC spatial
correspondence, 물리 process reconstruction/TCAD 및 macOS GUI는 별도 미검증 또는 미지원입니다.

v0.8 첫 전체 UI 실행은22개 성공 뒤 inverter 저장 응답의15초 대기에서 실패했습니다.
해당 원본 project를 worker와 웹 경로로 직접 저장한 응답은 정상이고5개 Run을
보존했습니다. 테스트는 실제 저장 응답의 project/revision/Run 수와 UI 완료 표시,
재개방을 함께 검증하도록 보강했습니다. 두 번째 전체 실행23개가 통과했고,
실제 저장 응답/표시 측정은904 ms입니다(`evidence/inverter-save.json`). 첫 실패의
보고서·trace·화면은 `.runtime/test-failures/ui-0.8-first/`에 보존합니다.

실제 파일 교환은 GDS/OAS·LEF/DEF와 지원하는 ASCII 기술/표시·CDL 및
해석 결과를 대상으로 합니다. v0.7은 설치된 native DB API를 통한 직접 읽기
연결을 추가했지만, 실제 licensed vendor DB 실행 및 standalone OA C++/Custom
Compiler direct reader는 검증/구현 완료로 표시하지 않습니다.
형식별 범위: [eda-interchange.md](eda-interchange.md), [native-database.md](native-database.md).
