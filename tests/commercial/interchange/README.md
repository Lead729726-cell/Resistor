These files are original synthetic parser fixtures, not foundry decks or commercial tool outputs. The internal techLayers numbers 100/200 deliberately differ from explicit GDS stream mappings 17/8.

Supported browser data grammars are four-column Cadence stream maps, Cadence named Lisp data nodes techLayers/techPurposes/techDisplays and old CDB streamLayers, DRF RGB colors/packets, cds.lib and lib.defs references, bounded CDL/SPICE metadata, and explicit scalar CSV/table schemas. Unknown nodes/records remain in the compatibility bundle alongside the full originals. References and scripts are never executed or resolved.

The table fixture uses explicit V, mV and mA columns and a conventional from/to schema in interchange.test.ts. It proves parsing and SI normalization, not simulation or geometric current correspondence. Imported branches stay unmapped and geometry_linkage unverified. The existing Python commercial_results parser handles bounded PSF ASCII and supported DRC/LVS/RC exports through native result import; binary PSF/OA/Milkyway/NDM/encrypted files need their owning tool's approved export.

Syntax sources (primary tool authors):

- Cadence: https://community.cadence.com/cadence_technology_forums/f/custom-ic-skill/24530/adding-gds-number-to-lsw-display/1367902
- Cadence DRF/techfile distinction: https://community.cadence.com/cadence_technology_forums/f/custom-ic-design/63313/unbound-variable-red-in-ascii-technology-file
- Cadence lib.defs subset: https://community.cadence.com/cadence_technology_forums/f/custom-ic-design/13488/opening-a-6-1-schematic-in-ver-5-1-41
- Xic compatible data parser author: https://www.wrcad.com/manual/xicmanual/node141.html and https://www.wrcad.com/manual/xicmanual/node140.html
- ngspice SPICE grammar: https://ngspice.sourceforge.io/docs/ngspice-manual.pdf

The additional narrow Synopsys/ICC2 scalar Technology/Color/Layer grammar is confirmed by the public PDK author's actual source: https://github.com/YZU-EDALAB/asap7_bb_pdk/blob/main/tf/asap7_bb_fromAPR.tf (BSD-3-Clause repository). Rules/RC/thickness and other blocks remain preserved, unapplied data. Internal layerNumber is never inferred as GDS. Live pinned-source validation with hashes and exact counts is in primary-evidence.json and can be repeated with node --import tsx tests/commercial/interchange-primary.ts.

Run node --import tsx tests/commercial/interchange-example.ts to regenerate example-package/display-pdk.json, stream.layermap, compatibility-bundle.json and imported-current.json. The originals and unsupported parts are embedded in the normalized PDK and bundle; known mapping records roundtrip through the exported layermap. No full vendor compatibility or proprietary database reading is claimed.
