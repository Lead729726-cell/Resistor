# 3D MOSFET EDA 개발 Codex 프롬프트

아래 내용을 Codex의 새 프로젝트 작업에 그대로 전달한다. 목표는 PDK 기반 MOSFET·아날로그 회로 설계, schematic, layout, simulation, DRC, LVS, PEX와 3D 탐색을 연결하는 실제 데스크톱 프로그램이다. AI 에이전트 최적화는 이 설계·검증 기반 위에 확장한다. 기술 스택과 개발 순서는 이 프로젝트를 위한 권장 설계이며, 상용 툴과 같은 성능이나 파운드리 인증을 이미 갖췄다는 뜻이 아니다.

공식 자료 확인 기준일: 2026년 9월 30일. 구현할 때 각 도구의 현재 문서·라이선스·배포 상태를 다시 확인하고, 실제 검증에 사용한 버전과 PDK commit을 고정한다.

## Codex 실행 지시

너는 아날로그 IC 설계, full custom layout, EDA 자동화, 계산기하와 데스크톱 3D 그래픽을 담당하는 개발자다. 다음 요구사항으로 실제 실행 가능한 프로그램을 구현하라. 프로젝트 가칭은 `MOS Studio 3D`로 사용하되 이름에 의존하는 구조는 피하라.

설계 제안이나 화면 목업에서 멈추지 말고 저장소 생성, 코드 구현, 실제 오픈소스 엔진 연결, 실행 스크립트, 검증용 예제, 테스트와 사용법까지 진행하라. 기존 프로젝트가 있으면 지침과 코드를 먼저 읽고 보존하며 확장하라. 아직 아무것도 없다면 아래 기본값으로 시작하라.

1. 전체 목표는 유지하되, 첫 완료 단위는 한 공개 PDK의 MOSFET과 CMOS 인버터가 회로 작성 → 시뮬레이션 → 레이아웃 → DRC → LVS → PEX → 추출 후 시뮬레이션 → 3D 탐색까지 실제로 연결되는 것이다.
2. 모든 엔진을 처음부터 다시 구현하려고 하지 말라. 검증된 도구는 어댑터로 연결하고, 우리가 만드는 부분은 통합 UI, 프로젝트 모델, 편집 명령, 3D 작업 환경과 최적화 인터페이스다.
3. 여러 작업자가 가능하면 PDK·EDA worker, 편집 UI, 3D renderer, 검증 예제를 병렬로 맡기되 공통 스키마와 파일 소유권을 먼저 정한다. 같은 파일을 동시에 수정하지 않는다.
4. 공개 PDK·기본 예제·로컬 실행은 아래 기본값으로 진행한다. 필요한 비공개 PDK나 상용 라이선스가 없으면 해당 어댑터만 사용 불가로 표시하고 공개 스택 구현을 계속한다.
5. 실제 엔진이 실행되지 않았는데 성공 화면·가짜 파형·가짜 DRC/LVS/PEX 결과를 만들지 않는다. 교육용 데이터와 실제 분석 데이터를 구분한다.
6. 실행 환경 제약으로 완료하지 못한 부분은 정확한 이유, 실패 로그, 재현 명령, 다음 작업을 남긴다. 실행하지 않은 검사를 통과로 보고하지 않는다.

## 1. 제품 범위와 완료 의미

첫 버전의 MOSFET 설계는 **PDK가 제공하는 소자를 선택하고 W/L, finger, multiplicity, 접점과 배치를 설계하는 것**이다. 회로 구조·바이어스·레이아웃과 기생성분을 평가한다.

도핑 농도, 공정 단계, 산화막 성장, 새로운 채널 구조나 FinFET/GAA 물리를 직접 최적화하는 기능은 별도 TCAD backend가 필요한 후속 범위다. 현재 SPICE·레이아웃·3D 뷰를 TCAD라고 부르지 않는다. 지원하지 않는 소자·공정의 형상이나 모델을 임의로 생성하지 않는다.

최종 목표 기능은 다음과 같다.

| 영역 | 구현 목표 |
| --- | --- |
| PDK | 설치·등록·버전 고정, 소자·모델·레이어·PCell·rule deck·추출 설정 관리 |
| Schematic | 계층 회로도, MOSFET·R·C·전원·포트 배치와 연결, SPICE netlist 생성 |
| Simulation | ngspice OP/DC/AC/transient, MOSFET 특성 곡선, 파형과 측정값 |
| Layout | 정수 DBU 기반 2D 편집, 계층·PCell·배선·via·핀·label·측정 |
| Verification | 선택한 PDK deck의 실제 DRC·LVS, 결과 탐색과 오류 위치 연결 |
| PEX | 지원되는 tech의 실제 기생 R/C 추출, 추출 후 시뮬레이션 비교 |
| 3D | 레이어 색상·투명도·분해 보기·단면·net 강조·2D/3D 선택 동기화 |
| AI 확장 | 제한된 설계 명령 API, 후보 생성·시뮬레이션·검증·평가·회귀 비교 |

DRC 통과, LVS 일치, PEX 생성, 시뮬레이션 완료, 목표 성능 만족은 각각 별도 상태다. 하나의 녹색 배지로 합치지 않는다. 공개 rule deck 통과를 foundry signoff 또는 tapeout 승인으로 표시하지 않는다.

## 2. 기본 기술 스택

아래는 권장 시작점이다. 변경은 실제 호환성·성능 근거와 ADR을 남긴 경우에 한다. 모든 의존성은 호환성 확인 후 lockfile·image digest·commit으로 고정한다.

| 구성 | 기본 선택 | 역할 |
| --- | --- | --- |
| Desktop shell | Tauri 2 + Rust | 파일 접근, 프로세스·job 관리, 프로젝트 저장, IPC |
| UI | React + TypeScript + Vite | 회로·레이아웃·3D 탭, inspector, 파형, 검증 결과 |
| 3D/2D viewport | Three.js | 정사영 2D와 3D 렌더링, 선택·단면·레이어 표현 |
| Rendering backend | WebGL2 기본, WebGPURenderer 선택 기능 | OS webview별 capability 확인, WebGPU 실패 시 복구 |
| Layout worker | Python + KLayout | GDSII/OASIS, 레이아웃 기하, 계층, PCell, 지원 deck 실행 |
| Schematic 연동 | Xschem + 자체 schematic IR | 초기 외부 회로도 연동과 내부 편집기 확장 |
| Circuit simulation | ngspice CLI | 실제 회로 해석과 raw/log 생성 |
| LVS | Netgen 또는 PDK가 제공하는 KLayout LVS | 해당 PDK와 소자의 검증된 setup 사용 |
| Extraction | Magic + PDK extraction tech | LVS용 연결 추출과 PEX용 R/C 추출을 분리 |
| Project metadata | SQLite + 파일 기반 snapshots | 실행 이력·해시·상태·migration |
| Optimization | Optuna 우선, BoTorch/Ax 선택 | 미래 수치 최적화와 다목적 탐색 |

Three.js 공식 문서는 WebGPURenderer에 WebGL2 fallback이 있다고 설명하지만, renderer 자체에는 아직 experimental 항목과 API 차이가 있다. 따라서 처음부터 WebGPU만 강제하지 않는다. material·clipping·picking 테스트를 통과한 backend만 활성화한다. WebGLRenderer와 WebGPURenderer의 shader/postprocessing API를 섞지 말고 renderer adapter로 분리한다.

Unity·Unreal 같은 게임 엔진을 기본으로 선택하지 않는다. 이 제품에 필요한 것은 EDA 문서 편집, 정수 기하와 계층 처리, 작업자 프로세스, 3D 탐색이다. 별도 엔진으로 변경하려면 메모리·배포·편집 UI·라이선스·실측 성능의 이점을 증명하라. OpenCascade·VTK·wgpu는 요구가 생긴 후 별도 backend로 검토한다.

Windows 사용을 우선 고려한다. UI는 Windows에서 실행하고 EDA worker는 Linux 환경을 기준으로 검증한다. WSL2 또는 container runner 중 실제 환경에서 재현 가능한 경로 하나를 먼저 완성한다. runner가 없으면 설치 안내와 진단을 표시한다. Linux 직접 실행도 지원하고 macOS는 별도 smoke test 후 지원 상태를 표시한다.

브라우저 개발 모드는 허용하되, 프로젝트 파일 접근과 외부 엔진 실행은 로컬 worker를 통한다. 로컬 서비스가 필요하면 loopback만 사용하고 인증된 IPC·session token을 적용한다.

## 3. 참고할 EDA 기능과 사용 원칙

공개 공식 자료에서 기능과 작업 흐름을 참고한다. UI·코드·비공개 알고리즘·rule deck을 복제하는 작업이 아니다. 설치된 상용 도구가 없어도 공개 스택으로 동작해야 한다.

| 제품군 | 공개 기능에서 참고할 점 | 우리 제품에 반영할 구조 |
| --- | --- | --- |
| Cadence Virtuoso·ADE·Spectre | 회로·레이아웃 연결, testbench·corner·설계 평가 | cell view, simulation session, 측정 spec과 결과 탐색 |
| Cadence Pegasus·Quantus | 물리 검증·기생 추출과 설계 피드백 | DRC/LVS/PEX adapter, marker와 revision 연결 |
| Synopsys Custom Compiler·PrimeSim | custom IC design entry·layout·simulation 흐름 | 편집기와 시뮬레이션 backend를 분리한 통합 작업 환경 |
| Synopsys IC Validator·StarRC | 물리 검증과 parasitic extraction | 동일 입력 revision을 검증하는 독립 job와 결과 provenance |
| Siemens Calibre nmDRC·nmLVS·xACT | DRC/LVS와 추출, 오류 탐색 | 오류 분류·net/device 연결, 추출 결과 비교 |
| KLayout·Xschem·Magic·Netgen·ngspice | 실제 공개 도구와 file/CLI interface | 첫 버전의 실행 가능한 기본 backend |

상용 backend는 사용자가 적법하게 설치한 도구·라이선스·deck을 지정한 경우에만 후속 adapter로 연결한다. 정확한 CLI와 결과 parser는 해당 버전의 공식 interface로 검증한다. 라이선스 우회·암호화 모델 해독을 구현하지 않는다.

GDSII/OASIS/SPICE 교환을 우선한다. OpenAccess, SKILL, Spectre/HSPICE netlist, SVRF·TVF 등 특정 형식에 대한 범용 호환을 선언하지 않는다. 확인한 subset만 지원하고 unsupported syntax를 명시적으로 보고한다.

## 4. PDK 등록과 첫 지원 공정

첫 후보는 `SKY130A`의 open_pdks 계열 설치다. 먼저 도구·모델·PCell·deck의 실제 smoke test를 수행한다. 더 잘 작동하는 공개 profile을 선택해야 한다면 이유를 기록하고 `IHP SG13G2` 같은 후보 중 하나로 변경할 수 있다. 첫 release에서는 여러 공정을 동시에 완성하려고 하지 않는다.

추가 PDK는 plugin 구조로 확장한다.

- SKY130: 첫 검증 후보. 모델·deck·소자별 지원 범위를 명시한다.
- GF180MCU: 후속 후보. 기존 Google 저장소의 archive 상태와 현재 upstream을 확인하고 설치 provenance를 고정한다.
- IHP SG13G2: KLayout tech·PyCell·XSection·2.5D 설정을 참고할 후속 후보. BiCMOS 전체 지원을 초기 목표로 확대하지 않는다.
- 비공개 PDK: 사용자가 지정한 로컬 경로와 manifest를 읽는 adapter. PDK 이름·모델·규칙을 임의로 만들어 채우지 않는다.

open_pdks는 공개 공정 데이터를 도구용으로 준비하는 builder다. PDK 자체를 발명하는 기능이 아니다. Ciel 같은 package manager를 이용할 수 있으나 upstream, commit, profile variant와 파일 해시를 보존한다.

PDK manifest에는 적어도 다음이 있어야 한다.

```yaml
schema_version: 1
pdk_id: actual-installed-profile
pdk_version: actual-version-or-commit
upstream_url: actual-source
variant: actual-variant
license_files: []
dbu_um: null
manufacturing_grid_dbu: null
devices: []
layer_map: []
display_styles: []
physical_stack: []
model_files: []
simulation_corners: []
statistical_models: []
pcell_providers: []
drc_decks: []
lvs_profiles: []
extraction_profiles: []
capabilities: {}
```

위 null은 예시의 미확인 값이다. 실행 가능한 profile에는 실제 출처로 확인한 값이 필요하다. 확인할 수 없는 값은 unknown 상태로 남기고 의존 기능을 제한한다.

소자별로 model/subckt 이름, D/G/S/B pin 순서, 정격 범위, W/L의 유효 범위·단위, `nf`·`m` 의미, W가 전체 폭인지 finger당 폭인지, layout parameter mapping을 등록한다. `m`, `nf`, 병렬 instance 수를 동등하다고 가정하지 않는다. subcircuit 소자의 OP 결과는 내부 primitive와 매핑이 가능한 경우에만 제공한다.

PDK 제공 PCell이나 검증된 공개 generator를 우선한다. 없으면 지원할 MOSFET variant 하나에 대해 출처를 가진 rule로 generator를 구현하고 DRC/LVS 회귀를 수행한다. 임의 최소 폭·spacing을 하드코딩해 정상 PDK 소자라고 부르지 않는다.

## 5. 데이터 모델과 단일한 기하 원본

Layout geometry의 원본은 **KLayout 기반 worker가 소유하는 정수 DBU database와 revision snapshot**이다. Rust는 프로젝트·job·transaction을 관리하고 UI는 command와 render data를 주고받는다. 서로 독립적인 세 개의 layout 원본을 만들지 않는다.

- XY 좌표·box·polygon·path는 정수 DBU로 저장한다. KLayout의 기본 좌표 폭과 선택 build의 실제 범위를 capability로 확인한다. 64-bit 프로그램이라는 이유만으로 64-bit 좌표 지원을 가정하지 않는다.
- command/IPC 좌표 계약은 signed int64 envelope로 정의할 수 있지만, backend에 넣기 전에 해당 build의 유효 범위와 연산 overflow를 검사한다. 기본 worker의 32-bit 좌표 범위 밖 값은 명확히 거부한다. wide-coordinate build는 필요한 경우에만 별도 build·검증한다.
- IPC의 int64는 decimal string 또는 검증된 binary 형식으로 전달한다. JavaScript Number로 무조건 변환하지 않는다. 큰 값의 protocol 시험과 실제 backend가 지원하는 geometry 시험을 구분한다.
- GPU buffer는 viewport/tile의 local origin을 뺀 좌표로 만든다. 렌더링 float가 설계 좌표를 덮어쓰지 않는다.
- cell·instance·shape·device·pin·net·marker에는 stable ID와 hierarchy path가 있다.
- 회전·mirror·array instance를 지원하고 좌표 변환·winding·normal을 검증한다.
- 모든 편집은 typed command → validation → transaction → revision 생성으로 진행한다.
- undo/redo는 기하와 metadata 모두 복원한다. 과거 결과는 당시 revision을 참조한다.
- schematic instance와 layout instance의 대응, net mapping은 명시적 데이터다. 3D 색만 보고 같은 net이라고 판단하지 않는다.

GDSII/OASIS는 layout 교환물이다. schematic·PDK stack·전체 stable ID가 항상 저장된다고 가정하지 않는다. 앱 전용 mapping은 sidecar에 보존하며 import/export 이후 보존 범위를 보고한다. flatten은 명시적 export 선택이며 기본 저장에서 계층을 제거하지 않는다.

GDSII의 32-bit 좌표 범위는 export할 도형 좌표·instance translation·변환 record와 flatten 결과를 기준으로 검사한다. 계층으로 계산된 큰 global extent만으로 파일 전체를 거부하지 않는다. 범위 밖 record를 조용히 축소·clamp하거나 DBU 변경으로 설계를 바꾸지 않는다. 지원되는 OASIS 또는 명시적인 변환 경로를 제안하고, 변환은 사용자의 선택과 geometry 검증을 거친다.

프로젝트에는 native schematic IR, layout snapshots, PDK lock 정보, stack manifest, display style, constraints, testbench, run index가 포함된다. 원본 PDK는 로컬 참조를 기본으로 하고 프로젝트 export 시 포함 가능 여부를 검사한다.

## 6. Schematic 편집과 Xschem 연동

내부 schematic은 versioned JSON IR로 저장하고 다음을 구현한다.

- MOSFET, R, C, 전압·전류 source, ground, port와 hierarchical block 배치.
- wire, junction, net label, selection, 이동·삭제·복제, undo/redo와 zoom.
- 핀에 실제로 닿았는지와 선 교차가 junction인지 구분하는 연결 graph.
- PDK 소자 library, property inspector와 parameter validation.
- DC supply·bias·load, analysis와 measurement를 담은 testbench editor.
- 결정적인 순서로 SPICE export, include/corner 해석, 오류 위치를 원본 instance에 연결.
- floating pin, 중복 이름, 필수 ground 등 제한된 schematic 검사를 별도 제공.

Xschem은 즉시 사용할 수 있는 외부 회로도 backend로 연결한다. PDK symbols와 예제 testbench를 활용하고 launch·netlisting 결과를 가져온다. Xschem .sch의 전체 문법을 처음부터 완벽히 구현하려 하지 않는다. native IR와 지원 subset의 왕복 변환만 테스트하고 나머지는 원본 보존·외부 편집 경로를 제공한다.

Schematic의 원본이 native IR인지 외부 Xschem 파일인지 project setting으로 정한다. 양방향 자동 수정으로 서로 덮어쓰는 구조를 만들지 않는다.

## 7. 2D Layout 편집기

2D 작업 화면은 실제 layout geometry를 그리는 정사영 viewport다. 다음 기능을 구현한다.

- hierarchy tree, cell view, instance·shape 선택, box/polygon/path/label/pin 편집.
- layer/purpose palette, 표시·숨김·선택 잠금, grid/snap과 실제 단위 ruler.
- PCell 배치와 W/L/nf 변경, guard ring·tap·dummy는 지원 profile에 한해 제공.
- Manhattan route와 검증된 via PCell 삽입, layer 전환, spacing 안내.
- 이동·회전·mirror·복사·array·속성 편집과 command 기반 undo/redo.
- GDSII/OASIS import/export, hierarchy 보존, roundtrip summary.
- 3D·schematic·DRC marker에서 해당 geometry로 jump 및 highlight.
- instance 내부의 자동 생성 PCell 도형을 직접 편집할 때 regeneration 정책을 명확히 한다.

처음부터 범용 analog auto-router를 완성할 필요는 없다. 수동 route와 deterministic 소규모 route helper를 먼저 동작시킨다. symmetry, matching, common centroid, guard ring 등은 constraint 구조로 준비하고 검증된 template에서 단계적으로 확장한다.

편집 중 빠른 rule hint와 전체 deck DRC는 서로 다른 상태다. 빠른 hint가 없는 상황을 전체 DRC 통과로 표시하지 않는다.

## 8. 3D Layer와 MOSFET 표현

3D는 이 제품의 핵심 작업 환경이다. 실제 design geometry, hierarchy와 net 데이터를 사용한다. 장식용 cube scene으로 완료하지 않는다.

두 가지 표시 모드를 제공한다.

1. **Mask stack mode**: 2D mask와 purpose를 높이별로 펼쳐 보는 모드. 이해를 돕는 표시용 높이가 실제 공정 두께가 아님을 범례에 표시한다.
2. **Process reconstruction mode**: 출처가 있는 stack 정의와 derived geometry로 substrate, well, gate, active, contact/via, metal 등을 재구성한다. 실제 제조 형상의 완전한 복원이나 TCAD라고 표시하지 않는다.

모든 mask polygon을 금속 고체로 extrusion하지 않는다. implant·marker·well·etch mask와 실제 도전층을 구분한다. gate나 diffusion의 derived shape는 PDK 의미를 아는 backend에서 계산한다. 소자의 D/G/S/B 식별은 검증된 extraction 또는 PCell metadata를 이용한다.

Display style과 physical stack을 분리한다.

- display: layer/purpose별 색, opacity, hatch, outline, visibility, pickability.
- physical stack: material, z_start, thickness, derivation, via의 연결층, source와 provenance.
- source classification: `pdk`, `published_reference`, `user`, `illustrative` 등 명시적인 enum.
- unknown thickness·depth는 null. 사용자가 예시값을 넣으면 illustrative로 표시한다.

필수 조작은 다음과 같다.

- orbit/pan/zoom, orthographic/perspective, top/front/side preset.
- 레이어 색상 수정·저장, 투명도, isolate, show all과 net별 강조.
- exploded layer view와 원래 stack으로 복귀.
- X/Y/Z clipping plane, 단면 위치 slider와 측정.
- clipping된 단면의 cap은 실제 교차 geometry로 구현한 경우에만 지원 표시.
- shape/device/net/instance picking, 2D/3D/inspector의 선택 동기화.
- 숨김·선택 잠금·clipping 상태를 picking에도 적용.
- 선택 MOSFET의 W/L/nf, model, D/G/S/B와 연결 net 표시.
- DRC marker를 대응 높이와 XY 위치에 표시하고 오류 목록에서 이동.
- PEX R/C를 node/net과 연결해 탐색. geometry mapping이 없으면 정확한 공간 heatmap이라고 부르지 않는다.
- scale bar, 실제 높이·표시 높이 구분, Z exaggeration 배율 표시.
- screenshot 및 지원 범위의 glTF export. 시각화 export가 제조 layout 원본을 대체하지 않는다.

3D에서도 **PDK 제약을 따르는 편집**을 제공한다. 첫 구현은 shape·instance의 XY 이동, parameter 변경, layer 지정 route와 via 생성이다. 결과는 2D DBU layout command로 저장한다. 자유로운 Z 드래그로 metal을 임의 높이에 배치하지 않는다. 3D route는 허용 metal layer와 via graph를 통해 2D layer별 path로 투영하고 저장한다.

triangulation은 concave polygon, hole, winding, 빈 도형과 self-intersection을 처리한다. 원본 validity 오류를 임의로 덮어쓰지 않는다. via 배열·반복 cell은 instancing하고 hierarchy를 무조건 flatten하지 않는다. tile·culling·incremental mesh cache와 progressive loading을 구현한다. renderer는 DBU 좌표와 scene 좌표의 역변환을 명시적으로 갖는다.

ExtrudeGeometry를 사용하면 장식용 bevel을 명시적으로 끈다. 레이어 색·투명도·explode·Z 배율 변경은 원본 geometry와 검증 입력 hash를 바꿀 수 없다.

## 9. MOSFET 특성 분석과 회로 시뮬레이션

모든 해석은 실제 ngspice와 해당 PDK model을 사용한다.

- OP: 확인 가능한 Id, gm, gds, operating region 및 model이 제공하는 항목.
- DC: Id–Vgs, Id–Vds, bias sweep, gm/Id curve.
- AC·transient: supported testbench에 대해 파형, gain, delay 등 측정.
- capacitance·noise 관련 항목은 simulator와 model이 제공하는 경우에만 노출.
- corner·온도·supply sweep은 PDK manifest의 실제 model section과 범위로 구성.
- statistical model이 있을 때만 공정·mismatch Monte Carlo를 지원한다. 임의 Gaussian perturbation을 실제 PDK mismatch로 표시하지 않는다.

곡선마다 model/version, W/L/nf/m 해석, Vds/Vbs, temperature와 corner를 표시한다. Id 부호·단위와 derivative 계산 방법을 기록한다. finite-difference gm와 simulator OP gm는 출처를 구분한다. Vth 등의 정의는 model OP 값인지 특정 constant-current 추정인지 표시한다. unavailable 항목은 0으로 채우지 않는다.

run은 netlist, model include 목록·해시, 설정, stdout/stderr, return code, raw waveform, measurement와 elapsed time을 보관한다. convergence failure·missing model·unsupported syntax·timeout을 구분한다. parser가 실패하면 raw/log를 보존하고 성공으로 처리하지 않는다.

## 10. DRC와 LVS

DRC는 PDK가 제공하거나 출처와 검증 범위를 명시한 deck을 선택한 엔진에서 실제 실행한다. KLayout 또는 Magic 중 profile별로 검증된 경로를 사용한다. deck 없는 PDK에 범용 spacing 검사만 수행하고 전체 DRC 통과라고 부르지 않는다.

DRC 결과는 rule ID, 설명, geometry/bbox, cell path, severity, deck hash와 input revision을 보관한다. marker를 2D/3D에서 선택하고 수정 후 재실행할 수 있어야 한다. GUI 성공 여부나 프로세스 exit code만으로 violation 수를 판단하지 않는다.

LVS는 layout에서 실제 추출한 연결 netlist와 schematic reference를 비교한다. 해당 PDK에 맞는 Netgen setup 또는 KLayout LVS deck을 사용한다. `Netgen`은 OpenCircuitDesign의 netlist 비교 도구를 뜻하며 동명의 mesh tool과 혼동하지 않는다.

LVS에 다음을 고려한다.

- model/class mapping, pin order, body connection과 소자 parameter 단위.
- 허용오차·series/parallel combination·finger merge는 deck/setup 정책대로 적용.
- short/open, pin mismatch, device count·model·parameter mismatch 표시.
- 결과 매핑이 있는 항목은 schematic/layout/3D에서 연결 탐색.
- unsupported device와 blackbox 사용은 보고서에 표시. 전체 회로 검증으로 확대 해석하지 않는다.

KLayout의 LVS 연결 추출 netlist를 기생성분을 포함한 PEX 결과로 간주하지 않는다. LVS reference와 추출 netlist의 불일치를 parser가 자동 수정해 숨기지 않는다.

## 11. PEX와 추출 후 분석

Magic의 해당 PDK extraction tech를 사용해 지원 범위의 R/C 추출을 실제 실행한다. 추출기는 교체 가능한 adapter다. 범용 3D field solver, 모든 coupling·substrate·RF 성분의 지원을 선언하지 않는다.

LVS용 extraction과 PEX용 extraction profile을 분리한다. `ext2spice lvs` 등 기생성분을 억제하는 설정으로 생성한 파일을 PEX라고 부르지 않는다. 설치된 Magic 버전의 공식 문서를 확인해 extract/extresist/ext2spice 순서를 정하고 오래된 명령 조합을 무조건 복사하지 않는다.

각 extraction profile은 실제 지원하는 항목을 표시한다.

- connectivity, ground capacitance, coupling capacitance, distributed resistance 등 개별 capability.
- tech/deck hash, extraction corner와 coefficient 출처.
- R/C threshold, pruning, reduction과 hierarchy 설정.
- C-only인지 RC인지, 실제 출력 소자 수와 node/net mapping.

threshold 때문에 R/C가 0개인 결과와 parser가 실패한 결과를 구분한다. 기생 요소를 UI에서 임의로 삽입해 추출 성공을 꾸미지 않는다. 테스트 fixture에는 충분한 길이의 연결 배선과 적절한 검증용 threshold를 사용해 추출이 관찰되도록 한다.

PEX netlist의 모델·pin·node 이름을 정규화할 때 원본과 변경 내역을 보존한다. 원래 MOS model에 이미 포함된 intrinsic parasitic과 추가 layout parasitic의 중복을 profile 정책으로 확인한다.

동일 testbench 조건으로 pre-layout와 post-layout simulation을 수행하고 파형·측정 spec·delta를 비교한다. DRC 통과와 LVS 일치는 PEX 정확도의 증명이 아니다. 추출 후 모든 지표가 무조건 나빠진다고 가정하지 않는다.

## 12. Job 모델과 결과 유효성

EDA 명령은 UI thread에서 실행하지 않는다. runner별 job adapter에서 argument 배열을 사용하고 shell 문자열에 사용자 입력을 연결하지 않는다. working directory·환경변수·timeout·cancel을 관리하고 process tree를 정리한다.

상태 모델은 실행 상태와 분석 결과를 분리한다.

```text
execution_status: queued | running | completed | failed | canceled
analysis_result: pass | fail | unsupported | unknown
freshness: current | stale
```

예를 들어 DRC job가 정상 종료했지만 violation이 있으면 `completed + fail`이다. 엔진 실행 실패는 `failed + unknown`이다. layout 변경 후 이전 통과 결과는 `stale`이다.

run manifest에는 run ID, project/cell/revision, schematic·layout hash, PDK/deck/model hash, tool version, 설정, 명령 인자, 시작·종료 시간, 결과물, parser version을 기록한다. secret은 포함하지 않는다.

cache key는 도구·모델·deck·모든 관련 설정과 입력 hash를 포함한다. 다른 revision의 통과 결과를 최신 결과로 재사용하지 않는다. 작업 도중 사용자가 편집해도 실행 중인 snapshot은 바뀌지 않는다.

## 13. 미래 AI 에이전트 최적화 구조

이번에는 도구·검증 기반을 먼저 완성하고, AI가 사용할 command API와 experiment schema를 지금부터 포함한다. 선택적인 로컬 수치 최적화 demo는 기반 검증 후 추가한다. LLM API key가 없어도 핵심 EDA 기능을 사용할 수 있어야 한다.

AI는 PDK rule이나 숫자 결과를 대신 판정하는 주체가 아니다. 허용된 설계 parameter·command를 제안하고 실제 엔진 결과를 이용해 후보를 비교한다.

권장 역할은 다음과 같다.

| 역할 | 책임 |
| --- | --- |
| Spec planner | 사용자의 spec을 objective·constraint·testbench로 변환 |
| Parameter proposer | PDK 범위 안의 W/L/nf·bias·layout template 후보 제안 |
| Execution coordinator | typed API로 sim·layout·DRC·LVS·PEX job 요청 |
| Evaluator | 실제 measurement와 spec, DRC/LVS 결과로 평가 |
| Regression reviewer | 기준 revision과 성능·면적·검증 변화 비교 |

최적화 문제에는 parameter의 type·bounds·grid·conditional constraints, objective 방향·단위·정규화, hard constraints, corner aggregation과 evaluation budget이 있다. 불가능하거나 실패한 후보를 최적값으로 선택하지 않는다. model이 다르면 동일 W/L 숫자를 동일 소자로 취급하지 않는다.

Optuna를 이용해 grid/random/TPE 같은 baseline부터 비교한다. BoTorch/Ax는 필요할 때 constrained Bayesian 또는 다목적 최적화 backend로 연결한다. integer/discrete 변수와 PDK grid를 반영한다. optimizer와 LLM은 분리된 plugin이다.

전체 반복은 spec → 후보 parameter → 실제 netlist·PCell 생성 → simulation → DRC/LVS → 지원 PEX → post-layout measurement → constraint 평가 → candidate 기록이다. 초기 탐색은 저렴한 pre-layout 평가로 하고, shortlist만 layout/PEX를 수행할 수 있다. 결과의 fidelity와 평가 완료 항목을 명시한다.

재현성을 위해 seed, candidate ID, parent revision, tool·PDK hash, 실행 비용과 실패를 저장한다. evaluator의 값은 raw 결과와 연결되며 LLM이 성능 숫자를 직접 생성할 수 없다. trial 수·wall time·동시성·token 비용의 상한과 stop 조건을 제공한다. 개선되지 않는 baseline·holdout corner 결과도 보고한다.

OpenAI·Anthropic·로컬 모델은 provider adapter로 연결할 수 있다. 존재가 확인되지 않은 model ID나 endpoint를 하드코딩하지 않는다. API key는 OS secret store 또는 안전한 사용자 설정에서 가져오고 project export·logs에 넣지 않는다. PDK/model/layout을 cloud provider로 보내는 경로는 사용자가 지정한 데이터 정책을 따르며 기본 분석은 로컬에서 처리한다.

GLayout/OpenFASOC·ALIGN의 공개 template·constraint·generator 구조를 검토할 수 있다. 해당 framework의 지원 PDK·회로 범위 밖에서 범용 자동 layout을 보장하지 않는다. AI가 raw GDS byte나 rule deck을 임의로 수정하게 하지 말고 typed transaction command를 사용한다.

## 14. 도구 API와 모듈 경계

아래는 우리 프로그램의 API 요구사항이며 기존 툴에 이미 존재하는 API 이름이라는 뜻이 아니다. command schema, validation, result reference와 오류 type을 정의하라.

```text
project.create / project.open / project.save / project.snapshot
pdk.register / pdk.validate / pdk.list_devices / pdk.capabilities
schematic.apply_command / schematic.validate / schematic.export_spice
layout.apply_command / layout.generate_pcell / layout.import / layout.export
simulation.run / simulation.measure / simulation.compare
verification.run_drc / verification.run_lvs
extraction.run_pex / extraction.get_net_mapping
view.get_scene / view.set_display / view.pick / view.cross_probe
experiment.create / experiment.evaluate / experiment.compare
job.status / job.logs / job.cancel
```

command 결과에는 revision 또는 run reference를 반환한다. 장시간 job는 비동기 request와 progress event를 사용한다. backend가 지원하지 않는 command는 명확한 typed error다.

권장 저장소 영역은 `apps/desktop`, `packages/contracts`, `packages/ui`, `packages/viewer`, `workers/eda`, `adapters/pdks`, `examples`, `tests/integration`, `docs`다. 모듈 이름·배치는 기존 저장소 상황에 맞춰 조정할 수 있다.

worker plugin은 versioned protocol과 capability handshake를 갖는다. PDK scripts와 generator는 실행 가능한 코드이므로 등록한 로컬 profile 또는 명시적으로 신뢰한 설치 경로에서만 실행한다. third-party 파일을 열었다고 자동 실행하지 않는다.

## 15. UI 구성

엔지니어가 설계와 오류를 바로 확인할 수 있는 밀도 있는 UI를 만든다. 기본 한글 UI와 영어 용어를 함께 사용하고 labels는 향후 다국어가 가능하게 분리한다.

- 좌측: project/library/cell hierarchy, PDK device palette.
- 중앙: Schematic, Layout 2D, Layout 3D, Simulation 탭과 split view.
- 우측: layer palette, selection properties, device/net inspector.
- 하단: Jobs, Logs, DRC, LVS, PEX, Measurements.
- 상단: 현재 PDK·cell·revision, save, simulation/verification 실행, 결과 freshness.

다크/라이트 테마와 keyboard navigation을 제공한다. layer 색은 실제 PDK layer style을 우선 가져오고 사용자 override를 저장한다. 색각 차이에 대응해 outline·hatch·label도 제공한다.

disabled 버튼에는 unsupported 또는 missing dependency 이유가 있다. 연결되지 않은 버튼이 성공 toast를 띄우는 UI를 만들지 않는다. tutorial demo는 명확히 표시하고, 설치된 공개 PDK의 실제 예제를 여는 별도 경로를 제공한다.

## 16. 구현 순서와 stage gate

### M0 도구와 PDK 준비

저장소·개발 환경·계약 스키마·runner abstraction을 만들고 toolchain doctor를 구현한다. ngspice, KLayout, Magic, Netgen/Xschem과 PDK의 실행 경로·버전·필수 파일을 검증한다. 하나의 MOS model simulation, PCell 생성, 최소 deck 실행을 CLI에서 먼저 확인한다.

완료 기준은 실제 도구 진단과 작동하는 공개 profile 하나다. network·설치 제한으로 PDK가 없으면 demo geometry UI 개발은 계속하되 physical verification은 blocked로 남긴다.

### M1 프로젝트와 2D·3D 기하

save/load, integer geometry, hierarchy, layer palette, 2D edit, actual layout 3D rendering을 구현한다. selection·undo/redo·단면·explode·layer visibility를 연결하고 실제 PDK PCell 또는 명시적 fixture로 검증한다.

완료 기준은 편집 → 저장 → 재실행 → 동일 DBU 도형·계층 복원, 2D/3D 선택 일치와 GDS/OASIS roundtrip이다.

### M2 회로와 시뮬레이션

native schematic editor의 필수 subset, Xschem launch/netlist 연동, ngspice job·waveform·measurement를 구현한다. MOSFET characterization과 CMOS inverter testbench를 제공한다.

완료 기준은 UI에서 parameter 변경 후 실제 파형·측정값과 로그가 갱신되는 것이다.

### M3 실제 검증과 PEX 통합

DRC marker, LVS mismatch·cross-probe, PEX output, post-layout simulation을 연결한다. 하나의 baseline PDK에서 인버터·배선 fixture의 전체 workflow를 완성한다.

완료 기준은 의도적으로 만든 DRC·LVS 오류를 실제 엔진이 검출하고 수정 후 통과하며, 실제 R/C extraction과 추출 후 파형 비교가 재현되는 것이다. 이 단계까지가 첫 통합 release의 목표다.

### M4 3D 편집과 아날로그 template 확장

3D XY 편집·layer 제약 routing, via route helper, differential pair·current mirror 같은 작은 template, matching constraint와 PEX 결과 탐색을 확장한다. 새 template마다 실제 DRC/LVS 회귀가 필요하다.

### M5 AI 최적화 확장

typed tool API를 이용하는 agent adapter, bounded numerical optimization, Pareto 결과·후보 비교를 구현한다. 첫 최적화는 작은 변수 집합을 가진 MOSFET bias 또는 inverter template로 제한하고 baseline 대비 실제 개선을 검증한다. 이후 OTA 등으로 확장한다.

각 단계에서 실행 가능한 상태를 유지한다. 복잡한 미래 기능을 위해 핵심 workflow 구현을 미루지 않는다. 장기 작업의 연속성을 위해 `docs/implementation-status.md`에 완료·미완료·blocked, 재현 명령과 다음 작업을 기록한다.

## 17. 필요한 검증

단순히 구현 코드와 같은 계산을 다시 쓰는 테스트는 피하고, 설계 데이터 손실·엔진 오판·연결 오류를 검출하는 테스트를 작성한다.

1. **좌표와 저장**: PDK grid, backend 범위 내의 큰 chip 좌표, mirror·rotation·array, nested hierarchy, holes가 있는 polygon을 저장·복원하고 DBU 단위 일치 확인. int64 IPC 정밀도, backend 범위 초과 거부와 GDSII export overflow도 별도 시험.
2. **교환 형식**: GDS/OASIS 왕복 후 bbox·layer/purpose·hierarchy·geometry를 KLayout으로 비교. sidecar metadata 보존·손실 범위 확인.
3. **선택과 단면**: 2D/3D 같은 stable ID 선택, hidden·locked·clipped 도형의 pick 제외, exploded view 역좌표 확인.
4. **Schematic 연결**: junction과 단순 crossing 구분, pin order, body connection, SPICE export와 실제 simulator 연결 확인.
5. **Simulation**: ngspice raw 결과와 UI 측정값 비교, corner별 provenance와 수렴 실패 처리 확인. 미확인 예상 숫자를 hardcode하지 않는다.
6. **DRC**: 선택한 실제 deck에서 알려진 규칙 하나를 의도적으로 위반하는 fixture와 수정된 fixture를 준비하고 검출·marker·수정 후 통과 확인.
7. **LVS**: 정상 회로, short/open, body 또는 소자 parameter mismatch fixture를 실제 engine으로 비교. 단순 pin 수 비교로 대체하지 않는다.
8. **PEX**: 지원 profile에서 충분히 긴 배선 fixture의 실제 parasitic 요소 확인. 단순 route의 길이 변경 비교는 동일 layer·연결·threshold 조건과 해당 추출 모델의 예상 관계로 검증한다.
9. **결과 유효성**: PDK/model/deck/layout 변경으로 결과가 stale이 되는지, canceled/failed job가 pass로 표시되지 않는지 확인.
10. **통합**: UI에서 새 프로젝트 → baseline device/circuit → simulation → layout → DRC/LVS → PEX → post-layout plot → 3D → save/reopen을 실제 실행.

fixture-based parser 테스트는 허용하지만 실제 engine 통합 테스트를 대체하지 않는다. EDA dependency 없는 CI에서는 해당 테스트를 skipped/blocked로 보고하고 실제 Linux worker 검증 경로를 별도로 제공한다.

## 18. 성능 목표와 측정

아래 수치는 개발 목표이며 확인된 성능 주장이 아니다. 실제 hardware·OS·renderer·driver, visible geometry와 hierarchy 구성, load time·frame time·memory를 기록한다.

- 16 GB RAM급 개발 PC에서 작은 MOSFET·inverter project의 인터랙션을 우선 매끄럽게 유지.
- hierarchy와 instancing을 포함하는 10만 polygon급 fixture에서 progressive loading과 layer culling 검증.
- 대표 viewport에서 30 FPS 이상을 목표로 하되 달성 여부와 p95 frame time을 보고.
- large import·mesh 생성·EDA 실행 중 UI 응답과 cancel 유지.
- 3D buffer를 만들기 위해 전체 hierarchical design을 매 프레임 flatten하지 않음.

부하가 크면 scope/region/cell을 줄이거나 LOD를 적용한다. 사용자가 exact geometry mode를 선택하면 근사 표시 여부를 명확히 한다. render LOD가 DRC/LVS/PEX 입력을 변경할 수 없다.

## 19. 배포와 라이선스

공개 code·PDK·각 plugin의 정확한 license와 redistribution 조건을 기록한다. KLayout·Xschem 등 GPL 계열 도구의 재배포·embedding 방식을 확인한다. subprocess를 쓴다고 모든 의무가 자동으로 없어지는 것으로 설명하지 않는다. 우선 자체 앱과 외부 도구 경계를 명확히 하고 third-party notices와 설치·번들 정책을 남긴다.

비공개 PDK·model·deck과 상용 tool은 repository에 복사하지 않는다. local configuration으로 연결한다. 공개 model의 이름만 바꿔 비공개 공정 모델로 제공하지 않는다. 공개 PDK의 preview status와 지원 범위는 해당 profile 설명에 기록한다.

배포물에는 개발 실행, Linux worker setup, Windows UI+runner setup, toolchain doctor와 한 개의 실제 예제가 포함된다. 개발 환경에서 UI만 켜진 것을 패키지 지원 완료로 보고하지 않는다.

## 20. 완료 후 제출할 것

- 실행 가능한 저장소와 desktop 개발·build·실행 명령.
- baseline PDK 등록·설치·버전 고정 방법과 검증 결과.
- 실제 MOSFET characterization·CMOS inverter·배선 추출 예제.
- schematic·2D layout·3D layer·DRC/LVS·PEX·파형이 연결된 화면.
- 실제 tool log·run manifest·테스트 결과와 성능 측정.
- `docs/architecture.md`, `docs/decisions.md`, `docs/pdk-integration.md`, `docs/verification.md`, `docs/implementation-status.md`.
- dependency/PDK license와 지원 capability matrix.
- M4/M5 확장 backlog와 AI command schema.

완료 보고는 실제 구현 기능, 실제 실행한 검증, 미완료·unsupported 항목, 실행 방법 순서로 작성한다. screenshot은 실행 증거를 보완하지만 DRC/LVS/PEX 로그를 대체하지 않는다.

**지금은 M0를 확인하고 M1 구현을 시작하라. 현재 환경에서 M2·M3까지 이어서 진행할 수 있으면 계속 진행하라. 설계 문서만 만들고 종료하지 말라.**

## 공식 참고 자료

아래 자료는 공개 기능 확인과 구현 출발점이다. 명령·API·모델 지원은 실제 설치 버전의 문서로 다시 확인한다. 상용 제품의 기능은 목표 작업 흐름을 참고하는 용도다.

- [KLayout documentation](https://www.klayout.de/doc.html)
- [KLayout LVS overview](https://www.klayout.de/doc/manual/lvs_overview.html)
- [KLayout 2.5D view](https://www.klayout.de/doc/about/25d_view.html) — 수직 extrusion에 기반한 뷰이며 공정 topology를 완전히 모델링하지 않는다.
- [KLayout source and license](https://github.com/KLayout/klayout)
- [Xschem manual](https://xschem.sourceforge.io/stefan/xschem_man/xschem_man.html)
- [ngspice documentation](https://ngspice.sourceforge.io/docs.html)
- [Magic ext2spice](https://opencircuitdesign.com/magic/commandref/ext2spice.html)
- [Magic extresist](https://opencircuitdesign.com/magic/commandref/extresist.html)
- [Netgen](https://opencircuitdesign.com/netgen/welcome.html)
- [open_pdks](https://github.com/fossi-foundation/open-pdks)
- [Ciel PDK manager](https://github.com/fossi-foundation/ciel)
- [SKY130 open PDK documentation](https://skywater-pdk.readthedocs.io/en/main/)
- [GF180MCU legacy source](https://github.com/google/gf180mcu-pdk) / [FOSSi community fork](https://github.com/fossi-foundation/gf180mcu-pdk) — upstream과 variant를 확인하고 고정한다.
- [IHP Open PDK](https://github.com/IHP-GmbH/IHP-Open-PDK)
- [Tauri 2](https://v2.tauri.app/)
- [Three.js WebGPURenderer guide](https://threejs.org/manual/pages/webgpurenderer)
- [Three.js documentation](https://threejs.org/docs/)
- [Optuna](https://optuna.readthedocs.io/en/stable/)
- [BoTorch](https://botorch.org/docs/introduction/)
- [OpenFASOC](https://github.com/idea-fasoc/OpenFASOC)
- [ALIGN](https://github.com/ALIGN-analoglayout/ALIGN-public)
- [Cadence Virtuoso Layout Suite](https://www.cadence.com/en_US/home/tools/custom-ic-analog-rf-design/layout-design/virtuoso-layout-suite.html)
- [Cadence Virtuoso ADE Suite](https://www.cadence.com/en_US/home/tools/custom-ic-analog-rf-design/circuit-design/virtuoso-ade-suite.html)
- [Cadence Quantus](https://www.cadence.com/en_US/home/tools/digital-design-and-signoff/silicon-signoff/quantus-extraction-solution.html)
- [Cadence Pegasus](https://www.cadence.com/en_US/home/tools/digital-design-and-signoff/silicon-signoff/pegasus-verification-system.html)
- [Synopsys Custom Compiler](https://www.synopsys.com/implementation-and-signoff/custom-design-platform/custom-compiler.html)
- [Synopsys PrimeSim HSPICE](https://www.synopsys.com/implementation-and-signoff/ams-simulation/primesim-hspice.html)
- [Synopsys StarRC](https://www.synopsys.com/implementation-and-signoff/signoff/starrc.html)
- [Synopsys IC Validator](https://www.synopsys.com/implementation-and-signoff/physical-verification.html)
- [Synopsys ASO.ai](https://www.synopsys.com/ai/ai-powered-eda/aso-ai.html)
- [Siemens Calibre circuit verification](https://www.siemens.com/en-us/products/ic/calibre-design/circuit-verification/)

상용 제품의 공개 기능 검토는 구현 문서에 기록하고 최신 product 명칭·지원 범위로 갱신하라.
