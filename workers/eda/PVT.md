# Actual native PVT batch analysis

`pvt.py` evaluates a bounded Cartesian corner/temperature/supply grid through the existing ngspice job pool. Every point owns a private project revision and an actual Run ID. The source project, schematic, geometry and existing runs remain intact. No commercial execution, statistical yield or foundry signoff is claimed.

## API

All requests use the source `project_id`. A study belonging to another project is rejected before reads, start or cancel. Shared transport additionally checks room membership and authorizes only the point projects belonging to the source study.

| Method | Input | Output |
|---|---|---|
| `pvt.sources` | `{project_id}` | Actual source bindings, supported analyses/corners and limits |
| `pvt.create` | `{project_id,expected_revision,command_id?,config}` | Saved Study with `execution_status:"created"` |
| `pvt.start` | `{project_id,study_id,expected_revision?,command_id?}` | Study; evaluation continues asynchronously |
| `pvt.status` | `{project_id,study_id}` | Study with current/stale freshness |
| `pvt.list` | `{project_id}` | Only this source project's studies |
| `pvt.cancel` | `{project_id,study_id,expected_revision?,command_id?}` | Canceled Study and cancellation of its actual queued/running jobs |

Create/start/cancel use the existing transactional command receipts. Bounded UUIDs and shared `room:UUID` identifiers are accepted. A completed command replay returns its prior result; changing that command's payload is rejected. Create requires the current source revision; shared start/cancel callers also pass their revision precondition.

Example with the actual built-in MOS drain source:

```json
{
  "analysis":"dc",
  "corners":["tt","ff"],
  "temperatures_C":[27,125],
  "supplies_V":[1.2,1.8],
  "supply":{"kind":"testbench","source_names":["VD"]},
  "metrics":[{"name":"Id","source":"measurement","key":"Id_max"}],
  "constraints":[{"metric":"Id","op":">=","value":1e-9}],
  "max_parallel":2,
  "wall_time_s":300,
  "point_timeout_s":120
}
```

Axes contain distinct finite values and produce at most 32 runs. Metrics select actual numeric `measurement`, `waveform` or signed `branch` vectors. Optional waveform/branch reduction is `min`, `max`, `mean` or `last`; `absolute` is explicit. Missing/nonfinite metrics fail that point without a substituted score. At most 16 metrics and 32 `<=`/`>=` constraints are accepted.

Each point records its condition, applied `supply_binding`, private `project_id`, `run_id`, execution/analysis result, numeric metrics and manifest path. The Study summary reports each metric's min/max with point IDs and complete conditions. `worst_constraints` reports the appropriate min/max condition and comparison. A completed scheduler may contain failed points; `counts` and per-point status preserve that distinction.

## Applied supply bindings

Use `pvt.sources` and choose its exact binding. A source name is never inferred from a net called VDD.

| Mode | Supply | Actual analysis scope |
|---|---|---|
| Built-in MOS | `testbench` / `VD` | OP, gate DC, AC magnitude/phase, constant-bias transient; drain-swept DC rejected |
| Built-in inverter | `testbench` / `VVDD` | Existing native testbench |
| Built-in wire | `testbench` / `VIN` | Actual post-layout extraction required |
| Configured imported layout | `port` / saved voltage-biased port name | OP/DC/transient; fixed supply cannot also be the DC sweep port |
| Generic native schematic | `device` / actual top-level voltage-source ID | OP/DC/AC/transient with explicit node 0 and supported native IR devices |
| RC template | `testbench` / `VIN` | Transient pulse amplitude only; OP and AC do not vary this supply and are rejected |
| Common-source / biased common-source template | `testbench` / `VDD` | OP/DC/AC/transient from owned template stimuli |
| Current-mirror template | `testbench` / `VDOUT` | OP/transient; DC sweeps this source and is rejected |
| Differential-pair template | `testbench` / `VOP`, `VON` together | OP/DC/transient; input DC sweep is separate |

Template mode validates the actual `design_template` and preserves its parameters/circuit. Only the private point's testbench corner, temperature, supply and applicable transient timing change. `design_tools.pvt_sources` defines the binding from the owned stimulus implementation. The normal native template simulation computes metrics from its actual waveform samples. Template PVT post-layout is explicitly unsupported; empty template layouts acquire no physical verification claim.

Generic DC requires `settings.dc_source_id` of an actual voltage device different from the fixed supply, plus bounded `start_V`, `end_V`, `step_V`. Generic AC requires `settings.ac_source_id` plus optional `ac_start_Hz`, `ac_end_Hz`, `ac_points_dec`; the actual selected IR source receives AC 1. Generic transient uses the existing IR's constant DC biases with bounded `duration_s`/`step_s`; it does not invent a pulse stimulus. Its native model deck uses the public supported SKY130 model resources. Configured layout supports its saved port biases and bounded OP/DC/transient settings, with optional actual PEX. Configured AC and complex current direction arrows are unsupported. AC metrics use actual magnitude/phase waveforms.

Public schematic/template corners are `tt`, `ff`, `ss`, temperature −40..125°C and supply 0.1..1.8 V. Configured profile corners and its existing −100..300°C/−100..100 V port bounds are preserved. Ideal R/C primitives need not change across process corners. Values outside actual profile support are rejected.

## Budgets, snapshots and failures

At most two studies run simultaneously. Each has one or two active point jobs, sharing the existing two-worker native pool; a coordinator never occupies a native pool slot. Aggregate wall time is 60..1800 s and each submitted point's timeout is 5..300 s including queue wait. Transient/DC/AC sample counts are bounded to 200000 nominal samples. Cancellation and expiry cancel actual runs; no canceled point contributes metrics.

Study input files are immutable copies with SHA256 checks. Each point records the parent revision and study ID under `pvt_point`; private point projects are hidden from the ordinary project list. PDK/model/deck/tool fingerprints are pinned and checked during evaluation. Source edits mark a prior study stale; changed resources or snapshot bytes reject an unstarted study and prevent further evaluation. Interrupted running studies are recovered as failed/unknown with `WORKER_RESTARTED`; they are not automatically replayed. Existing logs and completed points remain available.

## Reproduction and evidence

Run `npm run test:pvt` with the existing Linux worker container available. The wrapper executes `workers/eda/test_pvt.py` in a separate SQLite/state tree, checks report/source hashes and copies the report to `docs/evidence/pvt.json`. It never restarts the main server or mutates existing projects. Run native physical suites sequentially to avoid host contention.

The suite includes actual public MOS OP/DC/AC/transient, an eight-point corner/temperature/drain-supply grid, actual configured naked GDS OP currents, generic hierarchical source DC/AC, RC template two-amplitude time constants, and common-source template two-VDD signed supply currents. Missing metrics and canceled actual jobs retain their failed/canceled state. Boundary, source, revision, receipt and scope checks are separate assertions.

The latest native regression passed 33/33 cases. At 1.2/1.8 V pulse amplitudes the RC template measured 10.0005273 ns against the declared R·C = 10 ns. The common-source template measured actual `-i(VDD)` currents of 2.82047807/3.91895910 µA at the corresponding VDD conditions. Mirror DC rejected the swept `VDOUT` binding before submitting any native job. These values are calibration evidence for the stated public-model circuits and conditions, not universal electrical specifications. The canonical report preserves the complete Run IDs and source hashes.

`node tests/integration/pvt.mjs --verify-evidence` only validates and copies already recorded, source-matching evidence; it does not launch another native suite. The default command always runs the isolated suite.

Queue-timeout/concurrency/deadline/restart tests deliberately use bounded scheduler barriers or persisted interrupted-state fixtures. The resource-change test injects a changed fingerprint without modifying the installed PDK. These are named harness checks in the evidence, not claims of additional native physical executions or a measured 60-second expiry. Every real native case retains its raw deck, waveform, process log, manifest and Run references in a unique `.runtime/evidence/pvt-*` folder. Failed attempts remain preserved.
