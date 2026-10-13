crashbackups stop
gds read {/workspace/.runtime/eda/runs/5632767b18b74c9292c073b53bbc213e/cell_inv.gds}
load cell_inv
select top cell
extract all
ext2spice scale off
ext2spice format ngspice
ext2spice subcircuit on
ext2spice subcircuit top on
ext2spice hierarchy on
ext2spice lvs
ext2spice -o {/workspace/.runtime/eda/runs/5632767b18b74c9292c073b53bbc213e/layout.spice}
quit -noprompt
