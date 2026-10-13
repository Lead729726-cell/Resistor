crashbackups stop
gds read {/workspace/.runtime/eda/runs/74a5b7fc89c94147ba5e2068d570f252/schematic.gds}
load schematic
select top cell
extract all
ext2spice scale off
ext2spice format ngspice
ext2spice subcircuit on
ext2spice subcircuit top on
ext2spice hierarchy off
ext2sim labels on
ext2sim
extresist tolerance 0.001
extresist all
ext2spice extresist on
ext2spice cthresh 0
ext2spice rthresh 0
ext2spice merge none
ext2spice -o {/workspace/.runtime/eda/runs/74a5b7fc89c94147ba5e2068d570f252/pex.spice}
quit -noprompt
