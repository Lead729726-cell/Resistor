# Changelog

This records the source snapshot being opened, rather than reconstructing Git
history that did not previously exist. Existing detailed verification remains in
`docs/evidence/` and the example READMEs. Package version: 0.15.0.

## 0.15.0 — evidence-backed design assistant (2026-10-07)

- Optional local Ollama and OpenAI review with visible evidence preview, one-call
  approval, server-only credentials, atomic budget reservations, schema/citation
  checks, saved review history and stale-evidence handling. Shared rooms do not
  expose local provider credentials or calls. AI advice remains separate from
  actual engine verification.
- Bounded native-checked obstacle detours, exact on-grid custom Manhattan paths,
  reversible apply and the typed `register_route_search` tool (41 MCP tools).
- CPU execution for 16–64 cycles, ROM wrap/reset/ACC/PC/flag stable-window checks,
  sampled settling and actual signed VDD current, energy and power measurements.
- Directly operated custom 32-cycle CPU demonstration and live provider receipts;
  numerical fixtures, actual native execution and AI advice are labelled separately.
- Packaged Windows/macOS main-process assistant, with no shipped credentials or
  spending authorization. Apple hardware, Developer ID and notarization remain
  separate release gates.

## Unreleased — drawing workbench (2026-10-06)

- On-canvas layout rectangles, concave polygons and Manhattan routes with draft
  preview, exact absolute DBU snapping, grid/width validation, cancel/backtrack,
  layer locks and native Undo. Existing numeric editing and 3D controls remain.
- Repeated schematic placement with ghost previews and collision-free names,
  mirror/rotation commands, matching native pin geometry and wire bend switching.
  Preserve SI parameters, explicit nodes, hierarchy and existing engine APIs.
- Native connectivity, SPICE invariance, actual ngspice, isolated browser drawing,
  dark/light appearance and stale revision protection are covered by
  [drawing QA](docs/evidence/editor-drawing/native.json).
- macOS r5 previews include the new drawing workbench and previous worker-startup
  fixes. Archive/signature/installer checks are separate from native Mac execution,
  Developer ID signing and notarization.

## Unreleased — open-source baseline (2026-10-05)

- macOS r4 fixes missing `/workspace/workers/eda/server.py` on engine reconnect.
  Docker images contain engine/backend code; installed apps build from bundled
  resources and verify the actual workspace mount before launch. Stopped owned
  legacy containers are backed up, while saved designs and user adapters remain.
  Actual Linux Docker startup, KLayout, ngspice and restart checks are recorded in
  [worker startup evidence](docs/evidence/worker-startup-native.json). M1 and Intel
  ZIPs remain previews pending native Mac execution and Apple notarization.
- Precision Workbench presentation: neutral charcoal Graphite, compact tool
  navigation, persistent pane visibility and readable tabular numbers. Preserve
  light/system modes, other skins, formulas, native geometry and file/engine APIs.
- Selected job evidence exposes engine, revision, logs, artifact paths and actual
  failure causes. Pending, failed and canceled jobs cannot display a verification
  PASS; imported numerical results display import completion instead.
- Calculator styling/navigation shares appearance controls, supports internally
  scrolling mobile results and keeps engineering inputs/results ahead of QA details.
- Workspace metadata-only listing avoids full schematic payloads while preserving
  the legacy detailed response. File import/creation stays available while reading
  the index; file validation and hierarchy opening expose separate progress states.

- Deterministic electronics calculator hub with shared formula, unit, example,
  validation, FAQ and related-calculator structure.
- Integrated schematic and integer-DBU layout editing, GDS/OASIS import, 2D/3D
  viewing, hierarchy preview/approval, public SKY130 design starters and examples.
- Native simulation and validation jobs, waveform cursors and statistics,
  signed current and voltage-drop inspection, logic/analog signal response tests.
- Shared design server with role, revision, conflict and command receipt checks.
- Process topography inspection and bounded geometry simulation; authored or
  measured Z input remains separate from GDS and device/chemistry TCAD.
- Windows packaging and macOS arm64/x64 preparation, installer diagnostics,
  dark/light modes and skins.
- MIT source publication, preserved external notices, contribution guide,
  source audit and push/PR core validation workflow.

### Latest simulation verification

The RC native fixture measured 1.13781519891 V at the selected sample versus
1.13781700589 V expected, with a 0.66218480109 V resistor drop and
66.21847978 µA current. Logic and analog UI checks, signal-flow mathematics and
job failure/cancellation handling have recorded evidence in
`docs/evidence/eda-signal-flow-verification.json`.

### Remaining release gates

Commercial vendor execution requires the actual tools and licensed environment.
macOS package structure is not evidence of native M1 execution, signing or
notarization. Public service hosting, a permanent live demo and a signed binary
release remain separate tasks. Refer to `docs/implementation-status.md` and
`docs/development-roadmap.md` for feature-level limits.
