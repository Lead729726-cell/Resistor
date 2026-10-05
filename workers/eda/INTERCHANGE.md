# Native file interoperability

The native reader is KLayout 0.30.5 in the pinned IIC image. Import/export is file interoperability, not proof that a licensed Cadence, Synopsys or Siemens program executed. No OA, Milkyway, NDM, encrypted database, binary PSF or PSFXL decoder is claimed.

## APIs

`compat.inspect({files,options?}) -> CompatibilityReport`

`compat.import({project_id,files,options?,expected_revision?,command_id?}) -> {project,report}`

`compat.export({project_id,format:'gds'|'oas'|'cdl'|'spice',options?}) -> {files,report}`

`compat.import_results({project_id,files,options,expected_revision?,command_id?}) -> Run`

Files are `{name,base64}`: at most32 files,16 MiB each,32 MiB decoded total. Names are Unicode basenames with ordinary spaces; paths, controls, Windows reserved names, quotes and Tcl/shell metacharacters are rejected. Electrical source text is additionally bounded to2 MiB. Layer maps contain at most512 rows. A parsed layout contains at most1 million stored/expanded shapes,100,000 instances/pin metadata entries and128 hierarchy levels.

Options: `source_tool` (descriptive only), `top_cell`, `netlist_top`, `netlist_file`, `library_section`, `dbu_um`, ordered `lef_files`, `macro_files`, `layer_map`, `allow_unmapped_layers` (defaultfalse), `results`. Unknown options/server paths are rejected. Reports include per-file status/capabilities/warnings, actual native reader/version, top cells, DBU, hierarchy and geometry fingerprints, source hashes, ordered electrical pins and unresolved models.

## Physical exchange

GDSII/OASIS use the actual KLayout binary readers/writers. Hierarchy, DBU, shapes, text, native transforms/arrays and properties survive snapshots. Multiple tops require an explicit apply-time selection. Export writes the full saved hierarchy; it does not fabricate electrical references for bare layouts.

LEF/technology LEF (`.lef`, `.tlef`) and DEF use `LEFDEFReaderConfiguration`. Technology and macro LEFs are uploaded together in explicit order. Automatic neighboring LEF discovery is disabled. Macro GDS/OAS layouts are optional uploaded inputs only. Without macro files, resolution mode1 preserves real LEF abstracts even when their `FOREIGN` card is present. With explicit macro files, mode0 loads native macro geometry; unresolved/empty instantiated macros fail instead of becoming silent placeholders.

Layer map rows are `{name,layer,datatype,purpose?}`. Purposes: `drawing` (base), `pin` (`.PIN`), `label` (`.LABEL`), `obstruction` (`.OBS`), `routing` (`.NET`), `special-routing` (`.SNET`), `via` (`.GEO`), `outline` (base). Fully qualified names also work. Named unmapped layers fail by default; explicit automatic-number opt-in records the loss. Already numbered uploaded macro GDS layers remain their actual native numbers. The default reader DBU is0.001um; an explicit override performs KLayout physical-coordinate conversion and can quantize source coordinates.

Source net property2, pin property4 and instance name property5 are preserved. Component-pin bindings parsed from actual DEF declarations are property6. Scene instance names/pin bindings come from those source declarations, rather than labels or geometric proximity. Macro pin nets are bound per instance; shared child-cell shapes are not rewritten to one instance's nets. Layers use a generic exchange palette with unknown physical thickness, never guessed SKY130 process mapping. LEF abstracts and routed DEF are not transistor masks or a signoff PDK.

## Electrical exchange

The conservative static CDL/classic-SPICE parser preserves original UTF-8 files, uploaded include/library closure, capitalization of model/device names, subcircuit port order, globals, parameter text, `.PININFO`, hierarchical X cards and explicit library scopes. Continuations are joined for AST parsing while original source bytes remain available for export. Classic MOS/R/C/L/sources/diodes and other static cards are parsed; three/four-terminal Q cards require an explicitly declared NPN/PNP model to resolve the terminal count. Unknown dialect/device/control cards fail explicitly. Unknown external model names remain unresolved, rather than being renamed to SKY130.

`.include`/`.lib filename section` can reference uploaded basenames only. Cycles, outside paths, control/shell/code-model/OSDI/process and external `file=` sources are rejected. Includes inside a `.subckt` require a dialect translator and are currently unsupported. Library sections remain distinct; duplicate names across sections require explicit section selection for use. SPICE numeric expressions are stored as text, never evaluated by this importer.

`Project.interchange_netlist` is an electrical document AST, not a fabricated editable native schematic. Applying it clears the old typed schematic/testbench/configuration in the new immutable revision, retains the existing layout, and preserves the prior revision for undo. A combined layout/circuit document does not prove that its nets correspond physically; compatible extraction/LVS remains necessary. CDL/SPICE export preserves imported source syntax and dependency filenames; it does not rewrite vendor dialects. Native typed schematic export uses the common classic SPICE subset.

## Imported solver data

`options.results` is `{operation:'simulation'|'drc'|'lvs'|'pex',outputs:{role:uploadedName},context}`. Supported roles: summary,waves,currents,rc,exchange. Context allows formats,wave_schema,current_schema,column_schema,analysis,measurements,tool_id,convention. Existing result adapter supports complete scalar CSV/numeric table/PSF ASCII, explicit HSPICE measurement text, supported Calibre summaries, SPEF/DSPF/SPICE RC and normalized Register exchange. Unsupported/malformed input becomes unknown/unsupported; exit/native-success claims from clients are rejected.

Example current schema: `{x:{column:'bias',unit:'V'},branches:[{column:'Id',id:'drain',name:'drain',from_net:'D',to_net:'S',unit:'uA',source_vector:'Id'}]}` with `formats:{currents:'csv'}`, `analysis:'dc'`, `outputs:{currents:'flow.csv'}`. CSV column selectors are header strings; numeric-table selectors are zero-based indices. Explicit A/mA/uA/µA/nA/pA, V/mV/uV/µV, s/ms/us/µs/ns/ps and point/1 convert to SI with conversion metadata. No unit or sign is inferred. Complex AC current direction is unsupported.

Imported Run: workflow `imported-results`, `native_execution:false`, source `imported`, origin `imported-file`, geometry linkage `unverified`. No physical paths/current density or licensed source-solver execution are inferred. Raw files, source hashes, parser provenance and SI conversions remain with the run. Actual immutable result artifacts can be read through `backend.read_artifact`; modified bytes fail the stored hash guard. Result freshness follows the project revision. Parsing occurs outside the global transaction; short commit checks revision/receipt again.

## Reproduction and evidence

Run `node tests/integration/interchange.mjs`. It executes the actual KLayout reader and server RPC functions in isolated state, without restarting the live worker. The final report is `.runtime/evidence/interchange.json`; each attempt retains its own raw folder, including failed attempts. Tests cover installed public SKY130 nominal technology LEF + actual inv_1 macro abstract with upstream file hashes, all8 DEF orientations, native GDS macro substitution, GDS/OAS roundtrips, per-instance pins/nets, Unicode filenames/closures, CDL model/port ordering/library scope, forbidden paths/scripts, immutable receipts/stale revisions, signed external current parsing and explicit microamp/nanosecond conversions. These are native interoperability tests; the small custom fixture and CSV are explicitly synthetic grammar data, not commercial tool output. The public PDK test uses real installed source files.

Primary references: [KLayout LEF/DEF configuration](https://www.klayout.de/doc-qt5/code/class_LEFDEFReaderConfiguration.html), [KLayout LEF/DEF tutorial](https://www.klayout.org/svn-public/packages-migrated/refob/load_lefdef_tutorial/tags/1.0/doc/load_lefdef_tutorial.html), [ngspice official manual](https://ngspice.sourceforge.io/docs/ngspice-manual.pdf).
