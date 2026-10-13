crashbackups stop
gds read {/workspace/.runtime/eda/runs/cf33dd629e6c497584db12d61621e8f7/cell_inv.gds}
load cell_inv
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
ext2spice -o {/workspace/.runtime/eda/runs/cf33dd629e6c497584db12d61621e8f7/pex.spice}
quit -noprompt
