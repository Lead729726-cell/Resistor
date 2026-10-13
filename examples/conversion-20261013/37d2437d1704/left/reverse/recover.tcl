path sys +{/foss/pdks/ciel/sky130/versions/d400e26845538beaeb7cc5fdb9bfc06c30ea27cb/sky130A/libs.tech/magic}
if {[catch {tech load {/foss/pdks/ciel/sky130/versions/d400e26845538beaeb7cc5fdb9bfc06c30ea27cb/sky130A/libs.tech/magic/sky130A.tech}} tech_error]} {puts stderr $tech_error; exit 77}
if {[tech name] != {sky130A}} {puts stderr REGISTER_TECH_LOAD_FAILED; exit 77}
crashbackups stop
gds read {/workspace/.runtime/eda/runs/93ee91ba75b64ee2b7b7005c32148b60/cell_inv.gds}
load cell_inv
select top cell
extract all
ext2spice lvs
ext2spice scale off
ext2spice format ngspice
ext2spice subcircuit on
ext2spice subcircuit top on
ext2spice hierarchy off
ext2spice merge none
ext2spice -o {/workspace/.runtime/eda/runs/93ee91ba75b64ee2b7b7005c32148b60/extracted.spice}
quit -noprompt
