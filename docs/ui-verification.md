# Register UI verification

## v0.11 executable process sequence

2026-10-01: the final full UI suite passes all 32 scenarios with no skips,
failures or flaky results. Three new scenarios run real conformal/directional
coating, first-hit shadowing and local reemission, masked selective etch and
Preston CMP. They inspect all 13,824 tetra cells, the neck closure and enclosed
void, stage histories, stage selection and original GDS bytes after portable reopen.

The coverage test evaluates every gas-accessible starting surface face, exports
all of them to CSV and distinguishes sub-grid unresolved coating from measured
zero thickness. The other scenarios execute a planar least-squares rate fit,
two actual h/2h calculations, complete tetra VTU export/reimport, continuation
from an imported 3D tetra volume and actual loaded GDS polygon/hole masks.
Invalid recipes, malformed expert JSON and cancellation preserve the completed
result. Importing VTU and its setup together no longer cancels the other file read.

The cold packaged Windows viewer and rebuilt local Linux web both execute the
compiled run Worker, full stage mesh and actual section cells without native RPC
or browser errors. The packaged Electron Node runtime and actual Linux Node
backend also execute the same recipe: all five stage occupancies and metrics
match, and 21 Windows output hashes/byte counts are verified. Existing imported
process inspection and all eight appearance combinations pass again on v0.11.
The packaged MCP entry completes its actual native integration and 33-tool listing.

Evidence: `evidence/process-recipe.json` (28 numerical cases),
`process-geometry.json` (19 imported-volume cases), `process-flow-ui.json`,
`process-flow-release.json`, `process-release.json`, `appearance-release.json`,
`ui-tests.json` and `mcp-integration.json`. The initial full-suite attempt had one
blank secondary viewer timeout and no calibration manifest; it is retained in
`ui-tests-0.11-first-attempt.json`. The final run supplies the actual calibration
manifest and has 32 passes without retry results.

This is verified rate-driven voxel geometry, not measured 3D equipment calibration,
chemical/plasma transport, coupled device TCAD or foundry signoff. Internet hosting
and commercial vendor execution remain outside the verified runtime scope.

## v0.10 volumetric process topography review

2026-10-01: the complete 29-scenario suite includes three added process scenarios.
These inspect all 1,296 cells of an explicitly synthetic
stepped semiconductor/metal/dielectric/void mesh. They verify 20 nm supplied sidewall
thickness, a closed internal keyhole, XYZ cuts and real WebGL PNG export, visibility
independent of inspection scope, all-cell JSON/CSV, original GDS bytes and process
volume preservation in a portable viewer bundle. No native/auth/events RPC starts.

The VTU scenario imports actual inline ASCII tetra arrays and converts explicitly
declared nm coordinates/fields to µm. Higher-order cells, binary arrays, external
entities and missing units are rejected while the previous valid volume remains.
The workspace scenario stores different metal/dielectric criteria, explicit user
revision association and a stale input revision, preserves the real project revision
and reopens the process document. These are imported-field and analytic geometry
checks; they do not establish process prediction or measured wafer accuracy.

The release smoke executes the compiled Worker and actual mesh/caps in both the
cold Windows executable and rebuilt local Linux public viewer. It verifies matching
volume SHA-256, all 1,296 cells, a selected closed keyhole, real section cells,
20 nm supplied field and report export, without native requests. Internet hosting
remains deferred. Evidence: `evidence/process-geometry.json`, `process-ui.json`,
`process-release.json` and the Windows/Linux process screenshots.

## v0.9 logo, appearance modes and skins

2026-10-01: the full 26-scenario UI suite passed without failures, skips or flaky
tests. The appearance scenarios load 52 actual GDS shapes and switch all four
skins between dark and light. The test reads real WebGL pixels, verifies primary
text tokens against both the panel and canvas at a minimum contrast of 4.5, and
preserves the renderer, original GDS bytes, scene and PDK layer colors. Opening
and changing appearance starts no native or cloud RPC.

The main workspace uses the same appearance in its six EDA settings panels.
Revision and geometry counts remain unchanged. Primary action buttons are checked
using their actual computed foreground/background. System mode responds to live
OS changes; saved choices survive reload, propagate to another same-origin tab,
and migrate the prior theme preference. Arrow/Home/End selection, Esc and focus
return pass. The footer remains reachable at an 800x600 viewport.

The custom vector logo is present in the UI and favicon. Seven PNG sizes from
16 to 256 px are embedded in the Windows ICO, and the executable contains the new
256 px image. The actual cold packaged viewer uses an isolated temporary profile,
loads the real GDS and restores its light Iris skin after app restart, with no
Docker on PATH or native worker session. Node isolation remains enabled.

The rebuilt local Linux web stack serves matching public asset hashes. Its actual
unauthenticated viewer passes all eight palettes, with matching WebGL pixels,
52 GDS shapes, restored preferences and no native/auth/events requests or page
errors. Internet deployment remains deferred. The earlier v0.8 remote physical
workflow evidence below is retained; the worker and collaboration backend are
unchanged in this appearance release.

Evidence: `evidence/appearance-ui.json`, `evidence/appearance-release.json`,
`evidence/brand-assets.json`, `evidence/appearance/`,
`evidence/windows-appearance-iris-light.png` and
`evidence/linux-appearance-jade-light.png`. The reproducible release test is
`node --test --test-isolation=none tests/appearance-release.test.mjs` after building
and packaging the app and rebuilding the local Linux stack.

## v0.8 integrated circuit, PVT and routing verification

2026-10-01: all 23 UI scenarios passed with zero failures, skips and flaky tests.
The Windows executable, the independent viewer without Docker or credentials,
and the actual legacy inverter DC/DRC/LVS/PEX/post-layout/save/reopen workflow
remain covered. The packaged MCP completed a real 33-tool handshake and actual
ngspice PVT, conservative PDK routing, connected circuit creation, original-file
database reading and signed calibration.

The three new integrated scenarios verify actual TT/FF MOS currents and CSV,
explicit supply binding, immutable source and stale protection; real route
collision IDs, draft/hash/revision checks, confirmed geometry apply and separate
Magic DRC; and an editable RC circuit with no invented physical geometry, actual
pin-net selection, 2,022 transient samples and VIN 1.2/1.8 V PVT with measured tau.
Four wide screenshots and an 800x600 viewport were reviewed. The modal size was
corrected after the first functional run showed clipped inputs.

Evidence: `evidence/ui-tests.json`, `evidence/integrated-tools-ui.json`,
`evidence/register-integrated-pvt.png`, `evidence/register-integrated-routing.png`,
`evidence/register-integrated-connectivity.png`,
`evidence/register-integrated-template-pvt.png`,
`evidence/register-integrated-narrow.png` and `evidence/mcp-integration.json`.

The first full suite passed 22 scenarios and exceeded a 15-second save-status wait.
Direct worker and web save requests returned the original project with five runs.
The test now checks the actual save response and its project/revision/run count,
the visible completion state and reopening. The complete rerun passed; its save
response and visible status took 904 ms (`evidence/inverter-save.json`). The first
failure report, trace and screenshot remain in `.runtime/test-failures/ui-0.8-first/`.
This does not establish licensed vendor execution or foundry signoff.

The rebuilt isolated Linux Compose stack passed the complete remote browser flow
in 300.8 seconds. It includes actual physical jobs, configured PDK analysis,
backend calibration, interchange and original public-file DB read/import, followed
by two TT/FF MOS PVT conditions, room-scoped child runs, confirmed native met1 route
application to revision 2, stale source detection and actual pin-net exploration.
The browser used no local native RPC and had no page errors. The unauthenticated
standalone GDS viewer also remained functional. Evidence:
`evidence/cloud-container.json` and `evidence/linux-cloud-integrated.png`.
Internet deployment remains deferred.

## v0.7 native database and design review verification

2026-10-01: the complete 20-scenario suite passed with zero failures, skips or flaky
tests, including the rebuilt Windows executable and a cold viewer with no Docker
or credentials. The packaged MCP also completed a real 21-tool handshake, native
KLayout graph read/import and signed ngspice calibration.

The new review scenario uses actual public GDS shapes for search/selection, exact
large-integer DBU measurement, bookmark export/import with revision rejection,
loaded-scope scene changes and signed current CSV. Opening either new panel makes
no RPC. The source setup scenario registers an absent Virtuoso executable and
shows unavailable status with no fabricated cells, then rejects an unsafe file
path. The public KLayout scenario reads a real graph, verifies its artifact SHA,
requires an explicit import checkbox, applies geometry to a new revision and
preserves the original local GDS bytes.

Evidence: `evidence/ui-tests.json`, `evidence/native-database-ui.json`,
`evidence/viewer-review.json`, `evidence/register-design-review.png` and
`evidence/register-native-database-graph.png`. These checks do not prove licensed
Virtuoso/ICC2 execution or standalone OpenAccess/Custom Compiler DB support.

The first concurrent UI/Linux run exceeded two waits; its failing UI
report remains under `.runtime/test-failures/ui-0.7-first.json`. The MOS
job itself completed with a stored PASS. The full UI suite passed when run alone;
physical end-to-end suites should run sequentially on this workstation.

The complete isolated Linux shared-browser suite then passed, including actual
DC/DRC/LVS/PEX/post-layout jobs, PDK analysis, signed ngspice calibration and file
interchange. Its new DB flow uses an operator-bound public GDS source, actual
library/cell/view retrieval, graph artifact SHA verification, explicit confirmation
and a new project revision. Shared clients cannot register paths. Loaded-scene
review and the public cold GDS viewer also passed with no local native RPC and no
browser errors. Evidence: `evidence/cloud-container.json`,
`evidence/linux-cloud-native-database.png` and `evidence/linux-cloud-design-review.png`.
A test-only selector incorrectly assumed an explicit option value attribute; it
was corrected to wait for the actual returned cell table before the passing run.
Internet deployment remains deferred.

## v0.6 file interchange verification

2026-10-01: the complete 17-scenario UI suite passed with no failed, skipped or flaky
tests. It includes the packaged Windows executable, the independent viewer, legacy
editing and collaboration, PDK setup, backend calibration and three file interchange
scenarios. Evidence: `evidence/ui-tests.json` and `evidence/interchange-ui.json`.

The interchange scenarios read Cadence technology/display/map metadata without RPC,
apply an explicit layer palette, edit a working copy of CDL while preserving its
original hash, import actual LEF/DEF geometry and pins, save and reread GDS/OAS,
and preserve signed CSV values including zero. Explicit mA/mV declarations normalize
to A/V. Local current preview and portable bundle reopening require no native RPC.
Imported history is restored; the source label is “외부 파일 · 엔진 실행 없음”.
Branches without a verified or explicitly supplied physical path remain numeric.
These tests do not establish commercial tool execution or raw native database decoding.

The rebuilt isolated Docker Linux stack also passed the complete remote browser flow:
actual physical jobs, configured PDK analysis, backend calibration, uploaded GDS/CDL
application, GDS download and native reread, and signed external CSV result import.
The browser made no local native RPC requests. Evidence: `evidence/cloud-container.json`
and `evidence/linux-cloud-interchange.png`. Internet hosting remains unprovisioned.

## Earlier editor and collaboration verification

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

