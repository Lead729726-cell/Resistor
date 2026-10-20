crashbackups stop
gds read {/mnt/d/Coldbrew/Resistor/.runtime/hardware/lab/.runtime/eda/runs/8092d45602684deb82af7b07cf4e61ea/SOC_TOP.gds}
load SOC_TOP
select top cell
extract all
ext2spice scale off
ext2spice format ngspice
ext2spice subcircuit on
ext2spice subcircuit top on
ext2spice hierarchy on
ext2spice lvs
ext2spice -o {/mnt/d/Coldbrew/Resistor/.runtime/hardware/lab/.runtime/eda/runs/8092d45602684deb82af7b07cf4e61ea/layout.spice}
quit -noprompt
