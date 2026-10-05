# Result adapter evidence and supported text exports

`fixtures/` contains **synthetic grammar fixtures written for these parser tests**.
They are not output from Spectre, HSPICE, PrimeSim, Calibre, or another licensed
program. Passing them establishes parser behavior only. `test_bridge_audit.py`
uses synthetic operator manifests and an isolated HTTP redirect probe; it does
not execute its placeholder executable. Actual ngspice execution evidence is
recorded separately by the commercial integration suite and always has
`CurrentFlow.source = ngspice`.

Run the independent tests with Python 3.11 or newer:

```
python tests/commercial/test_results.py
python tests/commercial/test_bridge_audit.py
```

The stdlib adapter entry point is
`parse_results(operation, folder, outputs, context) -> dict` of Run fields.
`outputs` maps `summary`, `waves`, `currents`, `rc`, or `exchange` to a relative
POSIX filename inside the immutable output folder. Every file is at most 16 MiB;
the result set is at most 48 MiB. Input SHA-256, bytes, format and diagnostics are
recorded in `parser_provenance`. This metadata explicitly states that the parser
does not verify vendor execution. Execution status, executable/resource hashes,
elapsed time and native process exit status belong to the runner receipt.

`context.formats` selects each role's exact grammar:

| Format | Supported subset | Unknown or excluded |
| --- | --- | --- |
| `csv` | Unique header, finite real samples, explicit schema below | Guessing units or branch direction from column names |
| `table` | Consistent whitespace numeric columns; zero-based explicit indices | Guessing alternating wrdata scale/value columns |
| `psf-ascii` | Ordered TYPE/SWEEP/TRACE/VALUE/END, FLOAT DOUBLE, one sweep, named values or complete GROUP samples | Binary PSF/PSFXL, compressed/sparse, STRUCT/complex, multiple sweeps, undocumented variants |
| `hspice-lis` | Exactly one `approved_measurement = numeric_value` per selected name; finite SPICE suffixes; explicit units | Auto-discovered option numbers, repeated ALTER/Monte Carlo measurements, absent/ambiguous completion results |
| `calibre-drc-summary` | Explicit `TOTAL DRC RuleChecks Executed`, `TOTAL DRC Results Generated`, and `DRC RUN COMPLETED` lines | Per-check/cell counts, truncated databases, absent completion, unknown vendor report variants |
| `calibre-lvs-summary` | Explicit `OVERALL COMPARISON RESULT: CORRECT/INCORRECT/NOT COMPARED` and `LVS RUN COMPLETED` lines | A bare CORRECT token, unmatched headings, partial/recon results without whole-run completion |
| `spef` | IEEE header, explicit R/C units, complete detailed D_NET/CAP/RES/END; one literal corner | Reduced/physical net variants, expressions, multi-corner tuples, incomplete nets |
| `dspf`, `spice-rc` | Self-contained literal four-token R/C rows and terminated subcircuit/deck | Includes, models, encrypted blocks, expressions, parameterized elements |
| `register-exchange-v1` | Explicit normalized JSON described below | Proprietary vendor databases and inferred layout associations |

The Calibre summary grammar above is a **restricted site-export grammar**, not a
claim that every Calibre report uses those exact completion lines. A site wrapper
can produce that complete summary or the JSON exchange after reading its own
licensed reports. Unrecognized raw summaries remain unknown. RC counts count
parsed element records; coupling capacitance records duplicated across SPEF nets
are not deduplicated into an inferred physical network.

For waves/currents, use `context.wave_schema` / `context.current_schema`, or one
`context.column_schema`. CSV/PSF column selectors are strings; table selectors
are integer indices. For example:

```json
{
  "formats": {"waves": "csv"},
  "analysis": "tran",
  "wave_schema": {
    "x": {"column": "time_s", "unit": "s"},
    "signals": [{"column": "out_V", "name": "OUT", "unit": "V"}],
    "branches": [{"column": "branch_A", "id": "sense", "name": "VSENSE", "unit": "A", "from_net": "IN", "to_net": "OUT", "source_vector": "i(VSENSE)"}]
  }
}
```

The backend supplies immutable project/revision/run/tool/profile identifiers;
recipe values cannot override them. Current signs are preserved exactly. Branch
samples must declare `unit: A`, from/to reference nodes and source vector. All
parsed branches have `mapping: unmapped`; paths/device IDs in an exchange are
discarded. Complex AC is unsupported. External opaque library results do not
receive an unproved GDS/OAS hash when `geometry_binding: false` and visibly state
that spatial correspondence is unverified. Any later path is an explicit user
association, not a vendor extraction claim.

Normalized exchange schema: `schema_version: 1`,
`format: register-commercial-results`, matching `operation`, and
`completion: {finished: true, status: success|failed|unknown|unsupported}`.
Optional `measurements` contains bounded finite numbers, strings or null;
`waveforms` contains name/unit/x/x_unit/y; `parasitics` contains nonnegative
resistors/capacitors counts. DRC/LVS require
`verification: {completed: true, status: pass|fail|unknown}`; DRC also requires
`violations` consistent with pass/fail. Simulation success requires numeric
measurements or samples; PEX success requires RC counts. `current_flow` uses the
CurrentFlow v1 structure with an additional explicit `unit: A` on each exported
branch. It must match authoritative context; its source cannot contradict the
actual tool. Duplicate JSON fields, nonfinite values, failed/incomplete summaries,
binary or encrypted data, unsupported syntax, file changes and escaped paths
never produce a PASS result or partial active current flow.

The backend also supplies the actual redacted `context.execution_log`, not a
recipe assertion. Fatal/license errors and explicit discarded/truncated log
markers suppress PASS even when a process exits zero and partial CSV values
exist. The bridge audit covers redaction across stream boundaries, overlong
lines and the 4 MiB persisted log limit.

Primary references used to set limits and export expectations:

- [Cadence official PSF utility discussion](https://community.cadence.com/cadence_technology_forums/f/custom-ic-design/51376/psf-utility/1382580): PSF debug output is not a published general format; PSFXL needs a suitable export path. This supports limiting our ASCII subset rather than pretending to decode all proprietary databases.
- [Cadence official GROUP ASCII example](https://community.cadence.com/cadence_technology_forums/f/custom-ic-design/31155/no-waveform-data-when-using-psf-command/1339482): establishes named TRACE/GROUP/VALUE records; our fixture values/names are newly written.
- [Synopsys HSPICE quick reference](https://www.synopsys.com/content/dam/synopsys/verification/datasheets/hspice_quickref_Jun2015.pdf): documents HSPICE listing output and measurement/export commands; listing dialect support still requires a site-selected grammar.
- [Siemens on complete versus limited DRC results](https://blogs.sw.siemens.com/calibre/2026/08/05/calibre-vision-ai-turns-billions-of-drc-errors-into-actionable-insights/): an ASCII error database can be limited; displayed error absence is insufficient for whole-run success.
- [OpenROAD official SPEF implementation](https://github.com/The-OpenROAD-Project/OpenROAD/blob/master/src/rcx/src/extSpef.cpp) and [RCX documentation](https://openroad.readthedocs.io/en/latest/main/src/rcx/README.html): actual open source detailed SPEF read/write and unit handling.
- [Cadence vsource external PWL file discussion](https://community.cadence.com/cadence_technology_forums/f/custom-ic-design/65457/how-to-reference-multiple-pwl-waveforms-from-a-single-file-in-spectre-vsource-type-pwl): source-level file references must be rejected in client references and supplied through operator-approved resources instead.
