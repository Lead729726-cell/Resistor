# Register worker/cloud contract v1

Current types are in packages/contracts/src/index.ts; worker validation is authoritative. Native POST /rpc accepts {method,params}, returning {ok:true,result} or {ok:false,error:{code,message,details?}}. Native requests require private X-MOS-Token. /health reports service/protocol only. No arbitrary shell API exists.

## Project and geometry

project.create supports inverter, mosfet, wire, fixture, current_mirror and differential_pair. project.list/open/snapshot/save/rename/clone/export_bundle/import_bundle/command_receipt manage real snapshots and receipts. Bundles contain checksummed project/layout/PDK-lock metadata, never installed models, decks or tokens.

layout.apply_command accepts typed box/polygon-with-holes/path/route/label/pin/cell/instance commands, transform/copy/delete, bounded MOS regeneration and undo/redo. Instances support 0/90/180/270 degrees, mirror and columns/rows/dx/dy arrays. Per-cell targets identify editable user cells. Mutations can include expected_revision/command_id; stale revisions or reused payload IDs return typed errors. Coordinates are signed decimal strings, with native int32/grid checks.

layout.export returns real GDS/OAS, roundtrip and sidecar results. Local import accepts a trusted workspace path. Shared import instead uploads bytes (16MiB GDS/OAS, optional 2MiB sidecar) and rejects server paths. view.get_scene accepts project_id, optional integer bounds and max_shapes; returns bounds/bounds_filter, total/returned counts, truncated, exact polygons/holes, labels/pins and cells/instances. Stable IDs include hierarchy occurrences. Heights stay illustrative unless independently sourced.

## Schematics and jobs

Cells contain devices, wires, junctions, ports and connectivity mode. Devices include MOS, R/C, sources, ground, port and hierarchical block. Commands add/update/move/copy/delete devices/wires, connect pins, add/move/delete junctions, add cells, change connectivity mode and save testbench settings. schematic.validate/export_spice/netlist_xschem use actual connectivity. The Xschem bridge invokes public installed symbols and the real headless netlister for the flat subset; hierarchical native SPICE is separate.

simulation.run supports op/dc/ac/tran, public TT/FF/SS, temperature/supply, bounded duration/step, MOS Vgs/Id or Vds/Id curves, and native or Xschem netlister. verification.run_drc/run_lvs, extraction.run_pex/get_net_mapping and simulation.measure/compare use native outputs. Jobs return immediately; job.status/logs/cancel inspect by run ID.

Execution is queued/running/completed/failed/canceled; analysis is pass/fail/unsupported/unknown; freshness is current/stale. Measurements are actual values or null. DRC markers contain native rules/bboxes. RC tables report real nodes/values, with no invented spatial correspondence. Artifacts and dependency hashes are retained.

## Experiments and agents

experiment.create/evaluate/list/status/cancel/compare are implemented. Supported MOS W/L proposals use grid/random/TPE, seed, 1..16 trials, 60..1800 seconds and at most two running experiments. Actual geometry, DRC, LVS and simulation must pass before a feasible score. Failed constraints/gates have no score. Cancellation/expiry stops further gates and retains evidence. MCP exposes a smaller typed subset with session job limits; see agent-integration.md.

## Shared transport

The hub POST /rpc serves cloud.* and auth.* methods; authenticated calls use session bearer. cloud.native includes room ID, native method/params, UUID and base revision. Sessions, roles, quotas and allowlists are checked server-side. Cross-room run/artifact access and remote filesystem paths are rejected.

cloud.auth.signUp/signIn/status/signOut; cloud.info/projects/create/open/members/setRole/invite/join/native/promoteCandidate support accounts, projects and membership. Authenticated /artifact and /export return actual authorized binary files. WebSocket authentication arrives in the first frame, then presence/snapshot/job messages. Role changes force reauthentication.

EDIT_CONFLICT, REVISION_CONFLICT, IDEMPOTENCY_CONFLICT, UNCERTAIN_COMMIT and COLLABORATIVE_UNDO distinguish conflict/reconciliation cases. Pending input is preserved for review. contracts rpc uses a shared override when active; localRpc retains the explicit local path for cloning/publishing. The UI never receives the worker token.

toolchain.doctor and pdk.capabilities/list_devices/validate expose installed versions and scope. Unknown commands, engines, models or process features return typed unsupported errors.

## Registered PDK and imported-layout setup

`pdk.list_profiles` lists installed/registered versioned profiles. Local
`pdk.register` accepts a bounded manifest and optional ZIP resource package;
`pdk.validate` verifies regular resources, dependency confinement and hashes.
Shared clients validate installed profile IDs; server PDK installation remains
an operator operation.

`analysis.inspect` reads the actual layout and extracted top `.subckt` ports.
`analysis.configure` persists `AnalysisSetup` and a profile dependency lock in
a new project revision. Port roles are explicit ground/voltage/floating;
settings include corner, temperature, OP/DC/transient, sweep/time and PEX.
`analysis.run` executes the configured extraction/model/testbench workflow.
`analysis.verify` executes DRC/PEX/LVS with the registered compatible resources;
LVS requires a confined reference SPICE netlist.

These jobs retain native logs, raw netlists, settings, input revisions and file
hashes. Changed resource inputs invalidate results at the same geometry
revision. Spatial current paths are user declarations unless independently
verified. No setup operation invents a schematic, supplies missing model data
or guesses electrical bias from the GDS geometry.

Cloud setup/run/verify use existing editor-role checks, command receipts,
whole-project configure conflict scope and member-only run/artifact access.

## Operator native backend

`backend.catalog/list_profiles/validate` expose safe tool/profile metadata and
dependency fingerprints. Private `backend.register` installs an immutable local
recipe or authenticated agent reference; cloud clients cannot register recipes,
submit arbitrary paths or validate inline manifests.

`backend.configure` persists typed `BackendSetup` in a new project revision and
selects `active_backend=commercial`. `analysis.configure` selects `open-source`
while preserving the separately saved native setup. `backend.run` freezes the
project GDS/OAS, settings and operator resources and starts an actual native job.
`job.status/logs/cancel` retain the common lifecycle and freshness checks.

`backend.read_artifact` returns bounded declared output bytes.
`backend.import_layout` explicitly imports current completed GDS/OAS outputs
into the same project; proprietary databases require a vendor exporter first.
Configure/run/import have shared editor-role, expected revision and command
receipt gates. Artifacts and runs are checked against room membership.
Native current provenance records unverified physical linkage where a site
recipe consumes external libraries. See `docs/commercial-backends.md`.
