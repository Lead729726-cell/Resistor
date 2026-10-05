# Register UI verification

Date: 2026-09-30. These checks use the live authenticated native worker and two independent browser contexts connected to the local collaboration hub. They do not establish an internet deployment or foundry signoff.

## Implemented surfaces

- Korean / English Register desktop workspace with local project inventory, open, save, rename, clone, actual toolchain diagnostics and source / fixture labels.
- Explicit pin/net or geometric schematic connectivity, orthogonal wires, exact pin snapping, distinct crossings and junctions, movement, copy, delete, Undo / Redo, child cells, hierarchical blocks, actual graph validation and SPICE / Xschem export.
- Persisted testbench parameters, declared model corners, DC / AC / OP / transient analyses, native or supported flat Xschem netlister, MOS Id–Vgs / Id–Vds, separate units, logarithmic AC frequency, actual OP vectors and condition-matched pre/post comparison.
- Bounded native geometry scenes, 2D / 3D viewer controls, remote cursor / selection presence and viewer read-only mode. Scene display limits and exact camera bounds fetch authoritative geometry through the worker.
- Independent revision-tagged DRC, LVS, PEX and simulation jobs with actual status, result, markers, logs and artifact paths. Real parsed PEX R/C tables; elements without exact polygon correspondence do not become a spatial heatmap.
- MOS-only native optimization controls for grid, random and TPE, parameter bounds, objective / constraints, trial and wall-time budgets, cancellation, actual gate results / scores / metrics, provenance logs, feasible ranking, saved experiment history and candidate opening. Shared candidates can become a new authorized shared project using their actual bundle.
- Actual collaboration connection / signup / login / invitation / join / presence / members / roles / sync / resync / conflict-draft controls. Pending and conflicting edits are visibly retained. The UI distinguishes a local hub from a self-hosted remote service.
- Shared GDS/OAS file picker import, generated GDS/OAS / project-bundle download and authenticated job-artifact download. Upload size and source limitations are explicit.

## Live browser checks

Run from the repository root after the worker, local hub and Vite server are ready:

```powershell
node packages/ui/tests/editor-smoke.mjs
node packages/ui/tests/collaboration-smoke.mjs
node packages/ui/tests/optimization-smoke.mjs
```

`editor-smoke.mjs` verifies crossing wires remain two nets even when one wire has an interior polyline vertex at the crossing, an explicit junction makes one net, Undo restores two nets, a child resistor cell and block produce a real hierarchical netlist, and geometry / child content persists. A validated model-backed MOS symbol is added to the fixture while physical analysis remains disabled. Recorded run: project `d219adbc3f454583b104e8256fd65fab`, revision 15, zero browser errors. Evidence: `qa/editor-evidence.json` and `qa/register-schematic.png`.

`collaboration-smoke.mjs` verifies two independent signed-in users, owner invitation and editor join, authenticated presence, a remote W edit from revision 1 to 2, and retention of a peer's unsaved W draft. A deliberately delayed real edit then receives `EDIT_CONFLICT` after the owner changes W to 1.3; resync preserves the peer's W=1.4 draft and downloaded command JSON without replay, and explicit reset restores the authoritative W=1.3 value. The owner changes the peer to Viewer: native edits and runs become disabled; restoring Editor enables editing. Leaving returns to a local project. It also verifies generated GDS download (8,364 bytes), project bundle download (5,851 bytes), and uploading that actual GDS through the shared file picker. All final assertions passed with zero browser errors. Evidence: `qa/collaboration-evidence.json` and `qa/register-collaboration.png`; actual outputs: `qa/shared-layout.gds`, `qa/shared-project.bundle`, and `qa/preserved-edits.json`. The screenshot masks the invitation link; passwords and session tokens are not recorded.

`optimization-smoke.mjs` verifies persisted FF corner / 125°C / 1.2 V conditions, a real Xschem bridge source and manifest followed by successful ngspice OP, native `gm=0.000125112686 S` and `gds=0.0000045967036 S`, two actual grid candidates passing DRC / LVS / simulation, displayed scores and metrics, actual feasible ranking, and reopening the saved experiment. Recorded experiment: `2c36b1a9a14644228661d528aa4a731d`, source revision 2, zero browser errors. Evidence: `qa/optimization-evidence.json` and `qa/register-optimization.png`.

Type checking: `node node_modules/typescript/bin/tsc --noEmit` passed after the connected UI changes.

## Verification limits

The collaboration evidence above uses the loopback hub. Deployment configuration, public HTTPS access, native physical regression coverage, packaged Electron checks, and viewer performance / geometry tests are recorded by their owning components. The UI reports the actual connected capability and worker error for unsupported devices, PCells, model corners, hierarchy / netlister combinations, or fixture physical analysis. Cloud model API credentials and paid services are not required by the numerical optimizer.

