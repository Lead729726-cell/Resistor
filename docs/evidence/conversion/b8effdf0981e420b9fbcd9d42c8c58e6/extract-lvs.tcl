crashbackups stop
gds read {/workspace/.runtime/eda/runs/b8effdf0981e420b9fbcd9d42c8c58e6/schematic.gds}
load schematic
select top cell
extract all
ext2spice scale off
ext2spice format ngspice
ext2spice subcircuit on
ext2spice subcircuit top on
ext2spice hierarchy on
ext2spice lvs
ext2spice -o {/workspace/.runtime/eda/runs/b8effdf0981e420b9fbcd9d42c8c58e6/layout.spice}
quit -noprompt
