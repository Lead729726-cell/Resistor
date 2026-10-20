crashbackups stop
gds read {/mnt/d/Coldbrew/Resistor/.runtime/sar12/lab/.runtime/eda/runs/ffebf48e94944fc0bf02fd465fc95470/sar12_analog.gds}
load sar12_analog
select top cell
extract all
ext2spice scale off
ext2spice format ngspice
ext2spice subcircuit on
ext2spice subcircuit top on
ext2spice hierarchy on
ext2spice lvs
ext2spice -o {/mnt/d/Coldbrew/Resistor/.runtime/sar12/lab/.runtime/eda/runs/ffebf48e94944fc0bf02fd465fc95470/layout.spice}
quit -noprompt
