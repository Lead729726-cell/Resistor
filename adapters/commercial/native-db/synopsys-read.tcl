# Register ICC2/Fusion direct native DB query. Attribute names require site/version
# validation. An unsupported API produces diagnostics, never guessed geometry.
# Original native_db is an immutable copied operator resource. No save/write_*
# command is used. This is a DB API query, not streamout.
proc rdb_q {s} {
  set out "\""
  foreach char [split $s ""] {
    scan $char %c code
    if {$char eq "\\"} {append out "\\\\"} elseif {$char eq "\""} {append out "\\\""} elseif {$code<32} {append out [format {\u%04x} $code]} else {append out $char}
  }
  append out "\""
  return $out
}
proc rdb_attr {o key} {
  if {[catch {get_attribute $o $key} value]} {error "REGISTER_UNSUPPORTED_NATIVE_ATTRIBUTE:$key"}
  return $value
}
proc rdb_coord {x} {
  if {![string is double -strict $x]} {error REGISTER_UNKNOWN_NATIVE_COORDINATE}
  return [rdb_q [format %.0f [expr {$x*$::RDB_DBU}]]]
}
proc rdb_point {p} {return "\[[rdb_coord [lindex $p 0]],[rdb_coord [lindex $p 1]]\]"}
proc rdb_points {ps} {set out {};foreach p $ps {lappend out [rdb_point $p]};return "\[[join $out ,]\]"}
foreach command {open_lib get_blocks open_block current_block get_shapes get_cells get_pins get_nets get_attribute get_object_name foreach_in_collection} {
  if {![llength [info commands $command]]} {error "REGISTER_UNSUPPORTED_NATIVE_API:$command"}
}
open_lib $REGISTER_resource_native_db
set rows {}
foreach_in_collection block [get_blocks -all] {
  lappend rows "{\"library\":[rdb_q $REGISTER_parameter_library],\"cell\":[rdb_q [get_object_name $block]],\"view\":[rdb_q $REGISTER_parameter_view]}"
}
set f [open native-database.json w]
if {$REGISTER_parameter_mode ne "read"} {
  puts $f "{\"schema_version\":1,\"mode\":[rdb_q $REGISTER_parameter_mode],\"version\":[rdb_q [get_app_var sh_product_version]],\"cells\":\[[join $rows ,]\],\"diagnostics\":\[\]}"
  close $f
  return
}
open_block $REGISTER_top_cell
set block [current_block]
set RDB_DBU [rdb_attr $block dbu_per_micron]
if {![string is double -strict $RDB_DBU] || $RDB_DBU<=0} {error REGISTER_UNKNOWN_NATIVE_DBU}
set diagnostics {};set shapes {};set instances {};set pins {};set nets {};set count 0
foreach_in_collection shape [get_shapes -of_objects $block] {
  incr count;if {$count>100000} {error REGISTER_NATIVE_DB_LIMIT}
  set type [rdb_attr $shape shape_type]
  set name [get_object_name $shape];set layer [rdb_attr $shape layer_name]
  if {$type in {rect rectangle}} {
    set b [rdb_attr $shape bbox]
    set body "\"kind\":\"box\",\"box\":\[[rdb_coord [lindex $b 0 0]],[rdb_coord [lindex $b 0 1]],[rdb_coord [lindex $b 1 0]],[rdb_coord [lindex $b 1 1]]\]"
  } elseif {$type eq "polygon"} {
    set body "\"kind\":\"polygon\",\"points\":[rdb_points [rdb_attr $shape boundary]]"
  } else {lappend diagnostics "Unsupported native shape:$type";continue}
  set net [get_object_name [get_nets -of_objects $shape]]
  set suffix {};if {$net ne ""} {set suffix ",\"net\":[rdb_q $net]"}
  lappend shapes "{\"id\":[rdb_q $name],$body,\"layer\":{\"name\":[rdb_q $layer],\"purpose\":\"drawing\"}$suffix}"
}
foreach_in_collection cell [get_cells -hierarchical] {
  incr count;if {$count>100000} {error REGISTER_NATIVE_DB_LIMIT}
  # Bounds are never substituted for master primitives or a transform. Without
  # queried master geometry/placement semantics this graph is intentionally not
  # importable. Site-specific hierarchical adapters must be implemented/tested.
  lappend diagnostics "Unresolved native master geometry:[get_object_name $cell]:[rdb_attr $cell ref_name]"
}
foreach_in_collection pin [get_pins -hierarchical] {
  set n [get_object_name $pin];set net [get_object_name [get_nets -of_objects $pin]]
  lappend pins "{\"name\":[rdb_q $n],\"net\":[rdb_q $net],\"shape_ids\":\[\]}"
}
foreach_in_collection net [get_nets -hierarchical] {lappend nets [rdb_q [get_object_name $net]]}
set ds {};foreach d $diagnostics {lappend ds [rdb_q $d]}
set complete [expr {[llength $diagnostics] ? "false" : "true"}]
puts $f "{\"schema_version\":1,\"dbu_um\":[expr {1.0/$RDB_DBU}],\"top_cell\":[rdb_q $REGISTER_top_cell],\"reader\":{\"adapter\":\"synopsys-ndm\",\"tool\":\"icc2\",\"api\":\"open_lib/open_block/get_shapes\",\"version\":[rdb_q [get_app_var sh_product_version]]},\"cells\":\[{\"name\":[rdb_q $REGISTER_top_cell],\"shapes\":\[[join $shapes ,]\],\"instances\":\[\],\"pins\":\[[join $pins ,]\],\"nets\":\[[join $nets ,]\]}\],\"complete\":$complete,\"diagnostics\":\[[join $ds ,]\]}"
close $f
