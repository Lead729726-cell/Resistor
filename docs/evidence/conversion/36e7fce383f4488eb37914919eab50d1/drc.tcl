crashbackups stop
gds read {/workspace/.runtime/eda/runs/36e7fce383f4488eb37914919eab50d1/schematic.gds}
load schematic
select top cell
drc euclidean on
if {[catch {drc style {drc(full)}} style_error]} {puts stderr $style_error; exit 77}

drc check
drc catchup
set result [drc listall why]
set f [open markers.tsv w]
set oscale [cif scale out]
set count 0
foreach {rule boxes} $result {
    foreach b $boxes {
        set coords {}
        foreach n $b {lappend coords [expr {$n*$oscale}]}
        puts $f "[string map {	 { } 
 { }} $rule]	[join $coords 	]"
        incr count
    }
}
close $f
set f [open drc-status.json w]
puts $f "{\"marker_count\":$count}"
close $f
quit -noprompt
