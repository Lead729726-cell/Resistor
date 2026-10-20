crashbackups stop
gds read {/mnt/d/Coldbrew/Resistor/.runtime/sar12/lab/.runtime/eda/runs/d47e0c9a0b9244bfa6277a960ee18bf0/sar12_analog.gds}
load sar12_analog
select top cell
extract all
ext2spice scale off
ext2spice format ngspice
ext2spice subcircuit on
ext2spice subcircuit top on
ext2spice hierarchy off
ext2spice extresist off
ext2spice cthresh 0
ext2spice merge none
ext2spice -o {/mnt/d/Coldbrew/Resistor/.runtime/sar12/coupling-audit/capacitance-only.spice}
quit -noprompt
