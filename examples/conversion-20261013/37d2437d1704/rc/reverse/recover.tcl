path sys +{/foss/pdks/ciel/sky130/versions/d400e26845538beaeb7cc5fdb9bfc06c30ea27cb/sky130A/libs.tech/magic}
if {[catch {tech load {/foss/pdks/ciel/sky130/versions/d400e26845538beaeb7cc5fdb9bfc06c30ea27cb/sky130A/libs.tech/magic/sky130A.tech}} tech_error]} {puts stderr $tech_error; exit 77}
if {[tech name] != {sky130A}} {puts stderr REGISTER_TECH_LOAD_FAILED; exit 77}
crashbackups stop
gds read {/workspace/.runtime/eda/runs/a2b5b699f5934203ad9e5ae0ca7e835d/rc_lowpass.gds}
load rc_lowpass
select top cell
extract all
ext2spice lvs
ext2spice scale off
ext2spice format ngspice
ext2spice subcircuit on
ext2spice subcircuit top on
ext2spice hierarchy off
ext2spice merge none
ext2spice -o {/workspace/.runtime/eda/runs/a2b5b699f5934203ad9e5ae0ca7e835d/extracted.spice}
quit -noprompt
