crashbackups stop
gds read {/workspace/.runtime/eda/runs/39b0b3318f714bc3b0edcfc40038e0d1/cell_mux2.gds}
load cell_mux2
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
ext2spice -o {/workspace/.runtime/eda/runs/39b0b3318f714bc3b0edcfc40038e0d1/pex.spice}
quit -noprompt
