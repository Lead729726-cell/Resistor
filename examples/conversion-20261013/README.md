# Native schematic and layout conversion examples

Current qualified source: **37d2437d1704**, with the source hashes and
30 completed native job records in [summary.json](37d2437d1704/summary.json).

| Case | Circuit | Pin channel |
| --- | --- | --- |
| left | INV | left |
| right | NAND2 | right |
| top | MUX2 | top |
| bottom | INV | bottom |
| rc | RC low-pass | left |
| ota | Miller OTA | left |

Every case contains generated GDS/OASIS, an editable project, actual Magic
DRC, Netgen LVS and Magic PEX records. INV, RC and OTA also contain bare-GDS
recovery without a schematic sidecar, native parser comparison and recovered
graph LVS. These are public SKY130 primitive examples and selected-deck checks,
not foundry signoff or complete chip/PVT closure.

Conversion preview completion is UNKNOWN until physical checks are run.
Extraction parser comparison is separate from LVS against a design reference.
No original symbol placement, design intention, electrical hierarchy or exact
spatial current mapping is inferred from GDS.

[Guide and downloadable library](https://resistor-downloads.vercel.app/tutorial/schematic/)
and [supported conversion scope](../../docs/gds-schematic-conversion.md).
