crashbackups stop
gds read {/mnt/d/Coldbrew/Resistor/.runtime/hardware/lab/.runtime/eda/runs/f8184c1c9d574f30bea29d524de7293f/counter4.gds}
load counter4
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
ext2spice -o {/mnt/d/Coldbrew/Resistor/.runtime/hardware/lab/.runtime/eda/runs/f8184c1c9d574f30bea29d524de7293f/pex.spice}
quit -noprompt
