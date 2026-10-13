crashbackups stop
gds read {/workspace/.runtime/eda/runs/8ac921c0f0aa4908a87f5c0eeb0a03e9/rc_lowpass.gds}
load rc_lowpass
select top cell
extract all
ext2spice scale off
ext2spice format ngspice
ext2spice subcircuit on
ext2spice subcircuit top on
ext2spice hierarchy on
ext2spice lvs
ext2spice -o {/workspace/.runtime/eda/runs/8ac921c0f0aa4908a87f5c0eeb0a03e9/layout.spice}
quit -noprompt
