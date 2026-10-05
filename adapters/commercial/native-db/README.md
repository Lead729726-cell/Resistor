# Fixed direct native DB queries

`cadence-read.il` queries Cadence DB objects through read-only cell views.
`synopsys-read.tcl` queries ICC2/Fusion native blocks and shape attributes.
Neither file is a streamout command or an OA/NDM binary decoder.

The native module pins the byte-identical script, immutable native library copy,
fixed argv and data bindings. Shipped scripts are operator-installed candidates,
not evidence that a licensed tool has executed. The current environment has no
commercial executable or OA SDK. See
[native database API and verified limits](../../../workers/eda/NATIVE_DATABASE.md).

Cadence uses explicit `errset` and `exit(0/1)`; the common Tcl runner entry exits
after sourcing the fixed script. JSON serializers escape quote, slash and control
characters. Synopsys unresolved hierarchy deliberately blocks authoritative import.
Do not remove those diagnostics to claim full database compatibility.
