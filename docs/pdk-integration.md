# Installed public PDK integration

## Locked baseline

| Setting | Actual installed value |
| --- | --- |
| Profile | SKY130A, open_pdks-derived public profile |
| open_pdks commit | d400e26845538beaeb7cc5fdb9bfc06c30ea27cb |
| Runtime image | hpretl/iic-osic-tools@sha256:92961478ad3c4f508efb42d9ccdba12ab262eb42a14926d2bd49862230ba8521 |
| PDK root in worker | /foss/pdks/sky130A |
| Geometry | KLayout0.30.5, integer32-bit, 1nm DBU for baseline, 5nm manufacturing grid |
| Simulation | ngspice45.2; installed SKY130 subset, TT/FF/SS, bounded -40..125°C and supply settings |
| DRC/extraction | Magic8.3.582, installed SKY130A tech / magicrc |
| LVS | OpenCircuitDesign Netgen1.5.313, installed sky130A_setup.tcl |
| Xschem binary | 3.4.8RC; actual flat public-symbol headless netlist → ngspice verified; external GUI/hierarchy import not validated |

Doctor reports paths, versions and capabilities from the container. Per-run manifests retain the PDK nodeinfo, model file hashes, deck/tech/setup hashes, exact engine commands, input revision and artifacts. The application does not copy a private PDK, invent missing rules or modify the installed public deck to achieve a pass.

## Circuit/layout mapping

Inverter: actual public `sky130_fd_sc_hd__inv_1` plus actual `sky130_fd_sc_hd__tapvpwrvgnd_1` cells. Baseline circuit has nfet_01v8 and pfet_01v8_hvt with explicit D/G/S/B pin ordering. Body ties and ports are preserved for extraction; full LVS uses the PDK setup rather than pin-count comparison. The layout template has fixed dimensions; a schematic parameter edit intentionally requires independent layout work or creates a real mismatch.

MOS example: public `sky130::sky130_fd_pr__nfet_01v8_draw` Magic generator. PCell regeneration supports the verified nf=1,m=1 mapping. App parameter bounds are a restricted supported subset, not a claim about every PDK-valid device or all model bins. nf, m and parallel instances are not silently substituted for each other.

The native IR library contains ideal R/C/source/port elements. An ideal resistor is not represented as a fabricated PDK resistor layout. Only nf=1,m=1 is enabled throughout the tested MOS subset. Unsupported model/geometry combinations return typed errors.

## Extraction and display

LVS extraction uses connectivity settings. PEX uses separate Magic resistance/capacitance settings and records actual R/C element counts and raw .ext/.res.ext/netlist artifacts. Thresholds, reduction and hierarchy settings live in the run manifest. Counts of zero are reported as zero; the UI never inserts parasitic elements. PEX spatial heatmaps are unsupported without verified geometry mapping.

Layer/purpose styles come from the installed KLayout layer palette where present. Display heights and thicknesses are illustrative and separately classified. Physical thickness/depth remains null. No field solver, physical process reconstruction or TCAD capability is implied by an extruded mask view.

The profile is installed inside the pinned image; `.runtime/eda/projects/*/snapshots/*/pdk-lock.json` locks project provenance. The PDK setup workflow registers versioned manifests and confines uploaded resources to managed directories. It supports compatible ngspice model libraries and supported Magic/Netgen technology resources; proprietary tool formats require separate licensed adapters. The existing verified native templates retain their fixed baseline. See [PDK setup](pdk-setup.md) for resource inputs, checks, GDS extraction and explicit port biasing.
