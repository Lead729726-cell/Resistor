crashbackups stop
gds read {/workspace/.runtime/eda/runs/112b0754195f4c0eb6fcbf0f076e0541/cell_mux2.gds}
load cell_mux2
select top cell
extract all
ext2spice scale off
ext2spice format ngspice
ext2spice subcircuit on
ext2spice subcircuit top on
ext2spice hierarchy on
ext2spice lvs
ext2spice -o {/workspace/.runtime/eda/runs/112b0754195f4c0eb6fcbf0f076e0541/layout.spice}
quit -noprompt
