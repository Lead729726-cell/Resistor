# Changelog

This records the source snapshot being opened, rather than reconstructing Git
history that did not previously exist. Existing detailed verification remains in
`docs/evidence/` and the example READMEs. Package version: 0.26.0.

## 0.26.0 — Docker-free native execution (2026-10-13)

- Default authenticated local Python/KLayout worker; Docker remains explicit optional mode.
- Bundle pinned CPython, KLayout, ngspice and public SKY130 models/decks in each native OS/CPU package.
- Same circuit/layout, SQLite history, units, formats and RPC; virtual artifact paths resolve inside the user workspace.
- Model-free ideal circuits run without a PDK. Actual voltages and signed currents remain numerical results; missing functional criteria stay UNKNOWN.
- Native process ownership, bounded startup, safe idle shutdown, busy-job refusal, persisted execution settings and explicit legacy Docker migration.
- Windows independent WSL transport for Unix physical tools; native Mac/Linux setup for Magic/Netgen/Yosys/Icarus/Xschem. Missing tools block real runs.
- Host and packaged-desktop QA plus platform-specific CI; retain original results as stale when engine resources change.

## 0.25.0 — Direct schematic creation and native GDS conversion (2026-10-13)

- Empty schematic projects, engineering-unit value entry, repeated placement,
  keyboard-accessible pin-to-pin connections and exact revision-bound undo.
- No invented power/ground connections; reject ambiguous named nets and
  unintended terminal contacts before changing pins or geometry.
- Actual ngspice flat DC-source OP/static transient, signed terminal currents
  and voltage drops. Missing functional criteria remain UNKNOWN.
- Actual Magic GDS/OASIS mask extraction, conservative editable flat graph,
  native Netgen parser comparison and explicit unsupported/loss reports.
- SKY130 PCell placement and bounded M3/M4 routing within rectangular chip
  limits, four pin-channel sides and three placement orders. Exact preview
  hashes and source/PDK revisions gate application; physical checks are separate.
- Original circuits, hierarchy history, models, file formats and user themes
  remain preserved. Foundry signoff and Apple notarization are not certified.

## 0.23.0 — Online version checking and verified installation (2026-10-13)

- Check public GitHub releases at startup, reconnect and six-hour intervals;
  opt out or restrict to stable releases. Never downgrade or use draft assets.
- Show release notes, platform, byte progress and SHA-256; cancel and retry,
  and reuse a fully verified cache after restart.
- Restrict release/download addresses and asset architectures in the main
  process. Arbitrary renderer paths, URLs and executable commands are rejected.
- Windows opens the verified NSIS installation wizard. Mac and Linux validate
  archives, preserve a backup, replace the user application and request relaunch,
  restoring the prior target on replacement/launch-request failure.
- Preserve the historic user-data directory, designs and running Docker jobs.
  Previous versions need one manual install to acquire the updater.
- Code signing/notarization and native GUI update qualification remain separate
  from HTTP, file integrity and atomic-install tests. See the actual evidence.

## 0.18.1 — Keyboard workbench and searchable guide (2026-10-12)

- Shared shortcut definitions drive the handlers, searchable in-app guide and
  published cheat sheet. F1, ?, or Ctrl/Command+/ opens the guide.
- Project creation/open/save, Undo/Redo, Alt/Option+1–4 view switching and
  Ctrl/Command+Shift+L result-panel toggling preserve existing workflows.
- Layout V selection, grid/10-grid arrow nudges, Ctrl/Command+D mask duplication,
  +/- zoom and L layer palette join existing R/P/W/M/C/F drawing controls.
- Schematic V/W/J/H, eight shifted placement keys, R/M transformation, arrow
  nudging of selected devices/wires/junctions, duplication, fit and zoom.
- Text fields, IME composition, held keys, read-only roles, pending edits and
  dialogs protect design data. Schematic child keys cannot duplicate an edit.
- Mac native New/Open/Save/Undo/Redo/Help menu commands use the same guards.
  Local read-only viewer help omits unavailable project/schematic actions.

## 0.18.0 — Direct mask editing (2026-10-12)

- Start from an empty SKY130 layout with 19 available mask purposes; no
  fabricated device geometry or inherited verification results.
- Drag rectangles, click polygons and Manhattan routes, use R/P/W/M/C/F
  shortcuts, and keep the view steady across geometry revisions.
- Edit actual rectangle coordinates, layer and Net in µm or integer DBU.
  Exact decimal conversion rejects off-grid input instead of rounding it.
- Copy mask shapes with new IDs, preserving the original and holes while
  clearing device identity. Child/PCell geometry remains protected.
- Layer locks protect canvas and property edits. Delete/Undo/Redo and stable-ID
  GDS/OASIS round trips were checked against the native engine and actual UI.
- Empty layouts cannot claim DRC success. Manual layouts require explicit
  reference SPICE and analysis configuration for LVS, PEX and simulation.
- Keep the v0.17.0 physical-library media and reports at their original release
  URLs while publishing the new editor packages and direct-editing guide.

## 0.17.0 — Public-PDK physical library (2026-10-12)

- Eight reusable CMOS logic cells and six analog/power/clock physical cores,
  using actual SKY130 MOS, precision poly resistors and MIM capacitors.
- Native Magic DRC, Netgen unique LVS match, Magic RC extraction and ngspice
  pre/post simulation: 14/14 physical checks and 13/14 post-layout criteria pass.
  PLL frequency/phase lock fails; reports and waveforms retain the failure.
- Exact resistor-only Schur elimination accelerates extracted simulation while
  preserving the original PEX, all capacitors and protected ports/model nodes.
  Full adapter source hashes participate in result freshness.
- Bounded job-free GDS/OASIS metadata fixes exports exceeding the import limit.
  Modelled R/C values clarify that actual W/L drives their PDK model.
- Hierarchy search synchronizes the selected source and invalidates preview
  approval when its revision changes. Existing themes and design formats remain.
- Two actual-operation Korean 1080p lessons, cell-specific fabrication/design
  instructions, reference gallery, original reports and downloadable project files.
  Full human listening review and foundry/full-chip signoff remain pending.
- Windows/Linux and Apple Silicon/Intel Mac packages include the new backend;
  Mac archive/self-signature checks do not establish native execution or notarization.

## 0.16.1 — Resistor product name (2026-10-07)

- Product name, window title, installer, shortcuts and package names use Resistor.
- Preserve the historical user data directory, application ID and all existing
  project, simulation and file format identifiers across the rename.
- Rebuild Windows x64, Mac arm64/x64 preview and Linux x64 distributions.
  Previous Register assets and verification records remain available.

## 0.16.0 — 16-bit datapath and cross-platform downloads (2026-10-07)

- Native hierarchical 16-bit adder and CPU, unsigned 16-bit ROM immediates,
  decimal/hex trace display, balanced Zero reduction and accurate wide-symbol spacing.
  CPU16 retains a 4-bit PC and 16-word ROM; it has no RAM, branch or interrupt ISA.
- Directed 70-vector adder tests, actual wrapped CPU transistor runs, legacy CPU4
  regression and rejection of corrupt/missing high-bit traces. Reference layout
  loads the entire 201,207-shape CPU16 scene within a bounded 300,000-shape request.
- CPU16 Magic/Netgen stages allow 600 seconds per command; cancellation and failed
  engine results remain visible. Original 120-second failures are retained.
- Vercel download portal with published GitHub assets, byte size, SHA-256,
  dark/light themes and the existing PDK catalog. Static deploy excludes runtime data.
- Windows x64 NSIS, Mac arm64 r5 preview and Linux x64 tar.gz/user install helper.
  Linux ELF/permissions and isolated installer are checked; native Linux desktop,
  Apple native launch, Developer ID/notarization and Windows Authenticode are separate.

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
