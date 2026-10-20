crashbackups stop
gds read {/mnt/d/Coldbrew/Resistor/.runtime/hardware/lab/.runtime/eda/runs/2bf00be776b44f99b1c144967de39f10/logic_inv.gds}
load logic_inv
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
ext2spice -o {/mnt/d/Coldbrew/Resistor/.runtime/hardware/lab/.runtime/eda/runs/2bf00be776b44f99b1c144967de39f10/pex.spice}
quit -noprompt
