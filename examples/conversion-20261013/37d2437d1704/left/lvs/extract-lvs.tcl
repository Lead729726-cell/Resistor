crashbackups stop
gds read {/workspace/.runtime/eda/runs/8ca74e95c35940ddb6d8cad511bef074/cell_inv.gds}
load cell_inv
select top cell
extract all
ext2spice scale off
ext2spice format ngspice
ext2spice subcircuit on
ext2spice subcircuit top on
ext2spice hierarchy on
ext2spice lvs
ext2spice -o {/workspace/.runtime/eda/runs/8ca74e95c35940ddb6d8cad511bef074/layout.spice}
quit -noprompt
