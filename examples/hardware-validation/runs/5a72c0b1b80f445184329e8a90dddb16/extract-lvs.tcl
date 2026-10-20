crashbackups stop
gds read {/mnt/d/Coldbrew/Resistor/.runtime/hardware/lab/.runtime/eda/runs/5a72c0b1b80f445184329e8a90dddb16/logic_inv.gds}
load logic_inv
select top cell
extract all
ext2spice scale off
ext2spice format ngspice
ext2spice subcircuit on
ext2spice subcircuit top on
ext2spice hierarchy on
ext2spice lvs
ext2spice -o {/mnt/d/Coldbrew/Resistor/.runtime/hardware/lab/.runtime/eda/runs/5a72c0b1b80f445184329e8a90dddb16/layout.spice}
quit -noprompt
