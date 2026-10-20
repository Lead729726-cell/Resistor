crashbackups stop
gds read {/mnt/d/Coldbrew/Resistor/.runtime/sar12/final-post-code-4031/.runtime/eda/runs/ca3f51dbaac34d999e7156cee495d2fd/sar12_analog.gds}
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
ext2spice -o {/mnt/d/Coldbrew/Resistor/.runtime/sar12/final-post-code-4031/.runtime/eda/runs/ca3f51dbaac34d999e7156cee495d2fd/pex.spice}
quit -noprompt
