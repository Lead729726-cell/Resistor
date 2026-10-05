# Read-only native database bridge

The module uses a fixed native API query, not streamout or a guessed OA/NDM
binary decoder. Cadence and Synopsys reader scripts are install-later candidates.
No commercial binary, commercial license or OA SDK is installed in the verified
environment. The real KLayout calibration is explicitly an open-source read.

## Operator setup

Local `database.register` accepts a data-only manifest. Quick setup generates an
immutable backend profile with the shipped script and fixed argv; clients cannot
supply code, argv, scripts or environment values. Select a new source ID when
changing registration or sharing. The operator must install and validate the
correct tool version and license on the execution host.

```json
{
  "schema_version": 1,
  "id": "my_cadence_library_v1",
  "name": "My read-only Cadence library",
  "adapter": "cadence-skill",
  "tool_id": "virtuoso",
  "version": "operator-version-unverified",
  "executable": "/tools/cadence/bin/virtuoso",
  "native_db": "/workspace/operator-libraries/MYLIB",
  "env_names": ["CDS_LIC_FILE"],
  "library": "MYLIB",
  "view": "layout",
  "layer_map": [
    {"name": "M1", "purpose": "drawing", "layer": 68, "datatype": 20},
    {"name": "M1", "purpose": "pin", "layer": 68, "datatype": 16}
  ],
  "shared_project_ids": []
}
```

These paths are examples, not installed tools. For ICC2 use `synopsys-ndm`,
`icc2`, and the installed `icc2_shell`; for Fusion use `synopsys-ndm`,
`fusion_compiler`, and `fc_shell`. `native_db` is an opaque operator resource.
It is copied and hashed by the existing runner before query execution. The
original DB is never the tool's query target. Local query timeout is60s, at most
two requests run concurrently. Remote query polling stops/cancels at65s.

An already operator-installed agent profile can be referenced with
`backend_profile_id` instead of the quick setup fields. Its executed resource
hashes must demonstrate the identical shipped query and a native DB resource;
arbitrary exporters are rejected. The companion token remains in a private
token file. Local roots are the existing backend approved roots; KLayout file
calibration is confined to `/workspace` and `/foss/pdks`. Symlinks, unsafe literal
paths and bounded snapshot violations are rejected by the runner.

Simple real local calibration:

```json
{"schema_version":1,"id":"public_wire","name":"Public SKY130 wire file",
 "adapter":"klayout-file","layout_file":"/workspace/examples/sky130/wire.gds",
 "library":"SKY130","view":"layout","layer_map":[],"shared_project_ids":[]}
```

## API

| Method | Inputs | Result |
|---|---|---|
| `database.catalog` | `{}` | `{adapters:[...]}` with declared formats and limits |
| `database.list_sources` | `{}` | cached public registered sources |
| `database.register` | `{manifest}` | immutable public source; local operator only |
| `database.probe` | `{source_id}` | `{source,status,available,fingerprint,checks,cells,version?,vendor_execution_verified}` |
| `database.list_cells` | `{source_id}` | actual rows `{library,cell,view}` and query evidence |
| `database.read` | `{source_id,cell,view?,command_id?}` | immutable read receipt, `graph?`, `can_import`, diagnostics |
| `database.read_artifact` | `{read_id}` | bounded graph JSON base64, MIME and SHA256 |
| `database.import` | `{project_id,read_id,expected_revision?,command_id?}` | `{project,report}` on a new authoritative revision |

Cell selection is explicit. A source has one declared library and view; unknown
view, different returned top, malformed version/API identity or incomplete native
diagnostics cannot produce an importable read. `command_id` accepts normal UUIDs;
same payload replays its exact receipt without a second native operation.
Busy requests create no pending receipt. Interrupted pending receipts stay
unverified after restart and never cause automatic licensed replay.

The hub injects `access_project_id` independently of normal local `project_id`.
The operator's immutable `shared_project_ids` list defaults to empty. Shared
source listing, queries, artifacts and imports require that exact binding;
receipts also bind the access scope. Local import remains available without any
sharing registration. A shared import must target its bound room project.

## Neutral graph and import

Graph schema1 includes actual `dbu_um`, `top_cell`, cells, native source object
IDs, numbered layers or explicit layer-purpose pairs, boxes, polygons with holes,
paths, labels, orthogonal instances and arrays, pins, net identities, reader
API/version and diagnostics. Coordinates are signed DBU integer strings.
Stream maps are explicit: drawing maps to the base name, pin to `.PIN`, label
to `.LABEL`, obstruction to `.OBS`, routing to `.NET`. Unknown purposes fail.

KLayout validates positive geometry, DBU bounds, source identity, resolved
non-recursive hierarchy, arrays and pin references. Geometry figures preserve
source IDs and actual pin/net/instance properties. There is no bounding-box
substitution for unsupported native primitives. Read resources are hash checked
before and after querying; artifacts and source eligibility are checked again
before import. Import preserves old snapshots/undo and clears unrelated
electrical/PDK/backend settings. A DB graph is geometry, not an invented circuit
or proof that a numeric current belongs to that geometry.

Current bounds:16MiB graph,100,000 objects,4096 cells,128 hierarchy depth; underlying
opaque resource snapshot uses the runner's256MiB/4096-entry bounds. Source files
for KLayout calibration are regular GDS/OAS up to16MiB. Non-default label
orientation is retained in the graph but not importable because authoritative
OASIS text snapshots cannot preserve that orientation. Unsupported path end
extensions and round ends likewise remain browse-only. These losses are blocked.

## Evidence and actual commercial verification gate

41 isolated cases pass in `docs/evidence/native-database.json`: actual public
SKY130 inverter geometry, KLayout reads/roundtrips/import/undo, explicitly
synthetic grammar graphs, SHA guards, typed command boundaries, real missing
Virtuoso/ICC2/Fusion executables, exact-once/busy/restart behavior, shared receipt
isolation and actual Tcl string escaping. Run `npm run test:database` with the
native Docker worker available. Raw artifacts live in each isolated evidence
folder; failed development attempts remain retained.

`execution_evidence` separates API output/process completion, actual output
version, executable/resource/stdout/graph hashes, source integrity, geometry
validation and vendor identity. KLayout successful reads are `verified` for that
open-source scope. Commercial reads remain `unverified` vendor identity even if
an installed process emits a valid graph; an operator-owned executable/shim and
version string alone cannot attest a licensed vendor binary. A future actual
licensed query and independent known-reference comparison are still required
before claiming vendor compatibility. No user-supplied flag overrides this.

Cadence candidate supports single-library maskLayout rect/polygon/truncated path/
label figures and resolved same-library orthogonal instances. Mixed libraries,
mosaics, PCell startup requirements, magnification and unsupported primitives are
diagnosed; they are not silently flattened or approximated. The query opens views
in read mode and closes them, with no save/create operation. It selects a copied
`cds.lib` binding and explicitly converts SKILL errors to a nonzero exit.

Synopsys candidate uses `open_lib/open_block/get_shapes` and actual units. Its
version-specific attribute names require installed help/API validation. Flat
supported rectangle/polygon routing primitives can form a complete graph;
hierarchical cell masters deliberately produce unresolved diagnostics and block
import. Native NDM full hierarchy, Milkyway, custom-tool variants and OA SDK
decoding are not verified or implemented as raw binary readers.

Primary references:

- [Cadence direct cell-view API and instance masters](https://community.cadence.com/cadence_technology_forums/f/custom-ic-skill/21531/get-all-other-cells-used-in-a-given-cell)
- [Cadence userUnits and DBUPerUU](https://community.cadence.com/cadence_technology_forums/f/custom-ic-skill/26549/using-dbtransformbbox)
- [Cadence isolated cds.lib binding](https://community.cadence.com/cadence_technology_forums/f/custom-ic-skill/24727/is-the-a-way-we-can-access-library-which-is-not-define-in-cds-lib)
- [Cadence errset and explicit process exit status](https://community.cadence.com/cadence_technology_forums/f/custom-ic-skill/59814/how-to-get-exit-code-0-when-there-is-a-skill-error-in-a-skill-script)
- [Synopsys IC Compiler II and licensed documentation access](https://www.synopsys.com/implementation-and-signoff/physical-implementation/ic-compiler.html) does not publicly establish every query attribute used by the candidate; site validation remains required.
