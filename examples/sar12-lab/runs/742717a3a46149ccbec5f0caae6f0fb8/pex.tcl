crashbackups stop
gds read {/mnt/d/Coldbrew/Resistor/.runtime/sar12/lab/.runtime/eda/runs/742717a3a46149ccbec5f0caae6f0fb8/sar12_analog.gds}
load sar12_analog
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
ext2spice -o {/mnt/d/Coldbrew/Resistor/.runtime/sar12/lab/.runtime/eda/runs/742717a3a46149ccbec5f0caae6f0fb8/pex.spice}
quit -noprompt
