path sys +{/home/resistor/.local/share/resistor/pdks/sky130A/libs.tech/magic}
if {[catch {tech load {/home/resistor/.local/share/resistor/pdks/sky130A/libs.tech/magic/sky130A.tech}} tech_error]} {puts stderr $tech_error; exit 77}
if {[tech name] != {sky130A}} {puts stderr REGISTER_TECH_LOAD_FAILED; exit 77}
crashbackups stop
gds read {/mnt/d/Coldbrew/Resistor/.runtime/hardware/lab/.runtime/eda/runs/7cd482c77cd44aef94754ef16a55d642/SOC_TOP.gds}
load SOC_TOP
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
ext2spice -o {/mnt/d/Coldbrew/Resistor/.runtime/hardware/lab/.runtime/eda/runs/7cd482c77cd44aef94754ef16a55d642/pex.spice}
quit -noprompt
