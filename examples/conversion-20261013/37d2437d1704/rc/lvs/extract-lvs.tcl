crashbackups stop
gds read {/workspace/.runtime/eda/runs/7265357f678a4a438451c9b9432d1a79/rc_lowpass.gds}
load rc_lowpass
select top cell
extract all
ext2spice scale off
ext2spice format ngspice
ext2spice subcircuit on
ext2spice subcircuit top on
ext2spice hierarchy on
ext2spice lvs
ext2spice -o {/workspace/.runtime/eda/runs/7265357f678a4a438451c9b9432d1a79/layout.spice}
quit -noprompt
