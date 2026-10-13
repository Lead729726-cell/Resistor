crashbackups stop
gds read {/workspace/.runtime/eda/runs/eb5d14ac47984c818e4e1b3e7c495971/cell_nand2.gds}
load cell_nand2
select top cell
extract all
ext2spice scale off
ext2spice format ngspice
ext2spice subcircuit on
ext2spice subcircuit top on
ext2spice hierarchy on
ext2spice lvs
ext2spice -o {/workspace/.runtime/eda/runs/eb5d14ac47984c818e4e1b3e7c495971/layout.spice}
quit -noprompt
