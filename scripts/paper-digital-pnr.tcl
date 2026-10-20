# Real OpenROAD flow for the complete SAR12 digital controller, not ADC signoff.
set root [file normalize [file join [file dirname [info script]] ..]]
set work $root/.runtime/paper-signoff
set out $work/pnr
file mkdir $out
cd $out
read_lef $work/lef/sky130_fd_sc_hd.tlef
read_lef $work/lef/sky130_fd_sc_hd_merged.lef
define_corners tt ss ff
read_liberty -corner tt $work/lib/sky130_fd_sc_hd__tt_required.lib
read_liberty -corner ss $work/lib/sky130_fd_sc_hd__ss_100C_1v60.lib
read_liberty -corner ff $work/lib/sky130_fd_sc_hd__ff_n40C_1v95.lib
read_verilog $work/timing/sar12_mapped.v
link_design sar12_controller
read_sdc $root/scripts/paper-controller.sdc
initialize_floorplan -site unithd -die_area {0 0 120 120} -core_area {10 10 110 110}
source $work/make_tracks.tcl
source $work/setRC.tcl
add_global_connection -net VPWR -inst_pattern .* -pin_pattern {VPWR|VPB} -power
add_global_connection -net VGND -inst_pattern .* -pin_pattern {VGND|VNB} -ground
global_connect
set_dont_use {sky130_fd_sc_hd__lpflow* sky130_fd_sc_hd__probe*}
place_pins -hor_layers met3 -ver_layers met2
tapcell -distance 14 -tapcell_master sky130_fd_sc_hd__tapvpwrvgnd_1
global_placement -density 0.35
detailed_placement
check_placement -verbose
estimate_parasitics -placement
repair_design
detailed_placement
clock_tree_synthesis -buf_list {sky130_fd_sc_hd__clkbuf_1 sky130_fd_sc_hd__clkbuf_2 sky130_fd_sc_hd__clkbuf_4} -root_buf sky130_fd_sc_hd__clkbuf_4
repair_clock_nets
detailed_placement
set_propagated_clock [all_clocks]
estimate_parasitics -placement
repair_timing -setup
repair_timing -hold -hold_margin 0.10
detailed_placement
check_placement -verbose
filler_placement {sky130_fd_sc_hd__fill_8 sky130_fd_sc_hd__fill_4 sky130_fd_sc_hd__fill_2 sky130_fd_sc_hd__fill_1}
# Tap, clock and filler instances are created after the first connection pass.
global_connect
set_voltage_domain -name CORE -power VPWR -ground VGND
define_pdn_grid -name core_grid -voltage_domains CORE -pins {met4 met5}
add_pdn_ring -grid core_grid -layers {met4 met5} -widths {1.6 1.6} -spacings {1.6 1.6} -core_offsets {3 3}
add_pdn_stripe -grid core_grid -layer met1 -width 0.48 -followpins -extend_to_core_ring
add_pdn_stripe -grid core_grid -layer met4 -width 1.6 -pitch 30 -offset 5 -extend_to_core_ring
add_pdn_stripe -grid core_grid -layer met5 -width 1.6 -pitch 30 -offset 5 -extend_to_core_ring
add_pdn_connect -grid core_grid -layers {met1 met4}
add_pdn_connect -grid core_grid -layers {met4 met5}
pdngen -failed_via_report pdn-failed-vias.rpt
check_power_grid -net VPWR
check_power_grid -net VGND
set_routing_layers -signal met1-met5 -clock met3-met5
set_global_routing_layer_adjustment met1-met5 0.3
global_route -guide_file routes.guide
estimate_parasitics -global_routing
detailed_route -output_drc route-drc.rpt -output_maze maze.log
write_db routed.odb
write_def routed.def
write_verilog -remove_cells {sky130_fd_sc_hd__tapvpwrvgnd_1 sky130_fd_sc_hd__fill_1 sky130_fd_sc_hd__fill_2 sky130_fd_sc_hd__fill_4 sky130_fd_sc_hd__fill_8} routed.v
extract_parasitics -ext_model_file $work/rcx_patterns.rules -coupling_threshold 0.1
write_spef routed.spef
report_checks -path_delay max -group_path_count 10 -format full_clock_expanded > setup.rpt
report_checks -path_delay min -group_path_count 10 -format full_clock_expanded > hold.rpt
report_worst_slack -max
report_worst_slack -min
check_antennas -report_file antenna.rpt
puts OPENROAD_PHYSICAL_COMPLETE
exit
