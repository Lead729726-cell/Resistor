crashbackups stop
gds read {/mnt/d/Coldbrew/Resistor/.runtime/hardware/lab/.runtime/eda/runs/0b5e031606114e9a9a624cb750d53b0c/SOC_TOP.gds}
load SOC_TOP
select top cell
extract all
ext2spice scale off
ext2spice format ngspice
ext2spice subcircuit on
ext2spice subcircuit top on
ext2spice hierarchy on
ext2spice lvs
ext2spice -o {/mnt/d/Coldbrew/Resistor/.runtime/hardware/lab/.runtime/eda/runs/0b5e031606114e9a9a624cb750d53b0c/layout.spice}
quit -noprompt
