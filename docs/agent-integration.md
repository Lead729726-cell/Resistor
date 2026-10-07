# Typed AI/MCP 연동

Numerical evaluator와 외부 agent를 분리합니다. Numerical optimizer와 MCP는 외부 LLM/provider API를 호출하지 않습니다. 별도 로컬 설계 검토 화면의 Ollama/OpenAI 연결은 [명시적 호출·예산·근거 설정](design-assistant.md)을 따릅니다. 자체 seeded grid/random/univariate Parzen TPE가 실제 도구 결과만 평가합니다. 공개 MOS nf=m1 W/L, grid0.005µm, 최대16trial·동시2experiment·시간60..1800초 subset입니다.

Id_max/Id_min은 실제 DC sampled drain current, area_um2는 실제 layout bbox footprint, power_W는 Vds×최대 sampled drain current입니다. 마지막 값을 일반 회로의 total OP power로 표시하지 않습니다. feasible 후보는 실제 DRC/LVS/ngspice를 모두 통과해야 합니다. 실패한 점수는 null이며 actual run/manifest와 이유를 남깁니다. 원본 source revision은 유지합니다.

MCP stdio server는 `npm run agent:mcp` 또는 `node scripts/mcp.mjs`입니다. Node24/dependencies와 실행 중 native worker가 필요합니다. 클라이언트의 명령은 node, args는 D:/Coldbrew/Resistor/scripts/mcp.mjs, 환경변수는 MOS_WORKSPACE=D:/Coldbrew/Resistor로 설정합니다. 사용자의 Codex 설정은 자동 변경하지 않습니다.

Doctor/projects/snapshot/create, 제한 layout transaction, 실제 simulation/verification/job/cancel, optimizer/experiment 도구를 제공합니다. scene 최대2,000 shapes, typed integer 좌표, mandatory revision/command ID, 세션 native job budget32, optimizer tool 최대8trial을 사용합니다. arbitrary shell·룰 덱 수정·secret 읽기·raw GDS code 실행·임의 provider 호출은 없습니다. schema는 scripts/mcp.mjs에 있습니다.

v0.5는 설치된 operator backend의 catalogue/validate/configure/run 4개 도구를 추가해
총16개를 제공합니다. recipe 등록·설치 경로·credential 입력 API는 MCP에 노출하지
않습니다. native 실행도 같은32회 budget와 mandatory revision/receipt를 적용합니다.
상용 도구 미설치는 실제 unavailable이며 ngspice 교정은 상용 실행 증거로 취급하지 않습니다.

v0.7은 원본 DB source 목록·probe·cell/view 목록·읽기·검증된 receipt 반입 5개 도구를
추가해 총21개를 제공합니다. 읽기는 고정된 operator reader를 사용하며, 실행 경로·원본
DB 경로·임의 스크립트 등록은 MCP에 노출하지 않습니다. 실제 native query에는 세션
job budget가 적용됩니다. 공개 KLayout file calibration은 상용 OA/NDM 검증과 구별합니다.
원본 graph를 읽는 도구에는 이름·도형·핀 등 선택한 설계 데이터가 반환됩니다.

v0.8은 회로 catalog/새 template, 실제 rule 조회/route preview/원자적 적용,
pin-net 연결, PVT 공급원/조건표/실행/결과/목록/취소를 추가해 총33개 도구를
제공합니다. PVT 시작 시 전체 조건 수를 세션 native32회 budget에서 예약합니다.
원본 revision·규칙 fingerprint·preview hash를 무시하는 적용 경로는 없습니다.
새 template는 로컬 workspace에서 생성하며 미생성 physical layout을 구분합니다.
설치 resource나 command/script 경로의 임의 변경은 노출하지 않습니다.

[공식 TypeScript SDK v1](https://ts.sdk.modelcontextprotocol.io/server)의 stdio/tool API를 사용합니다. `npm run test:mcp`는 실제 MCP handshake/doctor/KLayout 수정/중복 receipt 및 잘못된 revision/schema 거부를 검증합니다. docs/evidence/mcp-integration.json에 기록했습니다.

독립 로컬 MCP의 직접 변경은 shared history 밖 변경으로 감지하고 stale rebase를 차단합니다. 외부 AI 클라이언트를 연결하면 반환된 tool data를 해당 클라이언트가 받습니다. 이 adapter는 PDK/model/deck 원문을 전송하지 않습니다.

## v0.15

MCP는 총 41개 도구를 제공합니다. register_route_search는 실제 도형과 PDK 규칙으로 검사한 제한된 우회 후보를 읽습니다. apply는 별도 승인·revision·preview hash 검사로 유지됩니다. CPU creation에는 16..64 사이클을 지정할 수 있습니다. provider key, AI 호출 및 예산 설정은 MCP와 cloud.native에 노출하지 않습니다.
