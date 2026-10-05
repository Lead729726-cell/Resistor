# Verified public SKY130 examples

Open **Inverter**, **MOSFET**, **Wire**, **Current mirror** or **Differential pair** through the app's project picker, or use authenticated `project.create` with `example: inverter | mosfet | wire | current_mirror | differential_pair`. Generation uses the pinned public PDK installed in the Linux worker; no PDK models are copied into this repository. The checked-in GDS files have matching native `.mos.json` sidecars and can also be imported into the workspace.

`inverter` includes the real public standard-cell inverter and two adjacent public body-tap cells. Run transient simulation, full Magic DRC, Netgen LVS, Magic RC extraction and post-layout transient independently. Editing a schematic MOS width changes the actual SPICE input and is expected to fail LVS until the layout agrees. It is a fixed public layout template, not a generalized custom inverter PCell.

`mosfet` uses the installed Magic NMOS PCell. W/L edits through the layout command regenerate actual geometry and schematic parameters; nf/m other than 1 are unsupported. Its default gate contact stays on local interconnect so the installed PDK's tiny optional gate metal1 pads do not violate `met1.6`. Manual route/shape edits must be undone before a regeneration that would overwrite them.

`wire` contains a real 200um metal1 route. RC extraction is measured in the native output, and post-layout analysis grounds the extracted substrate, adds a 100fF/1Mohm load and drives a 1.8V pulse. It has no fabricated pre-layout MOS reference or LVS result.

`current_mirror` contains two identical public NFETs with physical REF/OUT/VGND rails. Its testbench sweeps the output voltage while injecting a 100uA reference current. `differential_pair` contains two input NFETs and a tail NFET with a BIAS terminal and physical internal tail route. Its testbench holds both drains at the supply and measures current steering across the input sweep. Both cores use actual public contacts/vias and metal3 rails and passed full Magic DRC, Netgen LVS, PEX and pre/post-layout DC. Their measured RC counts are 146R/3C and 212R/21C. They are transistor cores rather than complete op amps, and their physical routing is fixed.

The baseline supports public TT/FF/SS models, DC/AC/OP/transient analyses, persisted bounded testbenches, actual BSIM gm/gds and Id-Vds sweeps. Statistical Monte Carlo and arbitrary nf/m mappings remain unsupported. The Xschem bridge invokes the real installed netlister for generated flat native schematics; native hierarchical blocks are independently verified through native SPICE and Netgen.

`node tests/integration/physics.mjs` regenerates all examples and runs the positive and intentionally failing physical regressions. It stores tool versions, native run IDs, raw artifact paths and results in `.runtime/evidence/physics.json`. `verified-baseline.json` is the concise sanitized evidence snapshot from the completed regression. Logs and raw waveforms remain in `.runtime/eda/runs/`; these are distinct from the concise summary.

`node tests/integration/analog.mjs` verifies the two analog cores and public via1/via2 helpers. The other extension scripts exercise real optimizer gates, geometric connectivity, hierarchy, project receipts/bundles, three repaired LVS connectivity faults, cancellation and a 60-second deadline under genuine native load. `verified-extended.json` records exact run IDs, measurements and evidence hashes. Rebuild summaries and exports using `node tests/integration/summarize.mjs` and `node tests/integration/summarize-extended.mjs` after their referenced tests complete. The public Apache 2.0 license and upstream attribution remain in this folder.
# 실제 전류 뷰어 예제

`current-viewer.register-view.json`은 실제 SKY130 MOS OP 실행에서 나온 전류와
그 실행의 immutable input OAS를 함께 저장한 뷰어 파일입니다. GDS 독립 뷰어의
**뷰어 파일 열기**에서 선택합니다. MOS drain current 약36.24 µA, 전압원 branch
약−36.24 µA와 확인된 D/S 접점 표시를 볼 수 있습니다. 저장된 실제 결과이며
파일을 열 때 새 시뮬레이터를 실행하지 않습니다.

포함된 run ID, layout SHA와 source vector로 provenance를 확인할 수 있습니다.
재생성: 로컬 native worker와 current-flow 증거가 있는 workspace에서
`node scripts/current-view-example.mjs`를 실행합니다.

`mosfet.analysis-setup.json`은 실제 GDS 포트 검사로 만든 SKY130 TT/27°C,
S 접지·B=0V·D=1.2V·G sweep 조건입니다. PDK·해석 설정의 **설정 JSON 열기**로
입력하고, 사용할 GDS/최상위 셀의 리소스·포트를 검사한 뒤 저장·실행합니다.

`configured-mosfet.register-view.json`은 그 절차로 실제 실행한 DC 10개 샘플을
담은 독립 뷰어 파일입니다. 포함된 화살표 경로는 UI 검증에서 사용자가
명시한 `0,0 → 1000,0` DBU 표시 경로입니다. 소자·배선의 물리적 전류 경로나
TCAD 벡터장으로 해석하지 않습니다. 원본 전류 값과 실행 출처는 보존됩니다.
실제 Run IDs와 OP/DC/DRC/PEX 결과는 `docs/evidence/pdk-setup-ui-full.json`에
기록되어 있습니다.

