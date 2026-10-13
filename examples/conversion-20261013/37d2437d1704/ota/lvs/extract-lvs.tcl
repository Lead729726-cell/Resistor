crashbackups stop
gds read {/workspace/.runtime/eda/runs/4e0aa38fdf1e47ae95abdfc1b13c824d/soc_miller_ota.gds}
load soc_miller_ota
select top cell
extract all
ext2spice scale off
ext2spice format ngspice
ext2spice subcircuit on
ext2spice subcircuit top on
ext2spice hierarchy on
ext2spice lvs
ext2spice -o {/workspace/.runtime/eda/runs/4e0aa38fdf1e47ae95abdfc1b13c824d/layout.spice}
quit -noprompt
