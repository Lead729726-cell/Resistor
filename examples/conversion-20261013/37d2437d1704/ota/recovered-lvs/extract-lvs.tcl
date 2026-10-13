crashbackups stop
gds read {/workspace/.runtime/eda/runs/93806dc3b12a43a4935bf8072a3a83e8/soc_miller_ota.gds}
load soc_miller_ota
select top cell
extract all
ext2spice scale off
ext2spice format ngspice
ext2spice subcircuit on
ext2spice subcircuit top on
ext2spice hierarchy on
ext2spice lvs
ext2spice -o {/workspace/.runtime/eda/runs/93806dc3b12a43a4935bf8072a3a83e8/layout.spice}
quit -noprompt
