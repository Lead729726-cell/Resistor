# Literature-informed reference library — 2026-10-13

This is an independently implemented SKY130 reference library, not a reproduction of the cited chips. The [review](../../docs/literature-update-2026.md) identifies every source, reading scope, technology difference and excluded claim.

- `latest-catalog.json` and `latest-matrix.json` identify the current recorded generation. `versions.json` lists historical generations.
- Each source-version directory contains `summary.json`, the engine catalog, per-case configuration and schematic, actual native stage results, and solver decks/logs. `source/SHA256SUMS.json` pins the corresponding worker snapshot.
- Selected physical cases contain geometry-roundtrip-checked GDS/OASIS and `.register.zip` projects. Open the project bundle in Resistor to inspect or edit it. Layout files alone do not contain current or voltage results.
- Failures and measurement-only `unknown` results are retained. Older-source timeouts remain in their original generation; they are not current-source results.

Recreate the default and experimental cases with `node scripts/research-qualification.mjs`, and the 64 drive/slew/load cases with `node scripts/research-qualification.mjs --matrix`. These commands create new owned projects and use a running local EDA worker. Run `node scripts/research-summarize.mjs` after completion. The native decks retain the original engine paths and require the configured SKY130 models; they are not standalone foundry kits.

The reported power explicitly names the sources it includes. ADC code width is not measured ENOB. Nominal directed criteria, selected SS/FF points, typical-RC DRC/LVS/PEX, deterministic traces and literature coverage do not establish complete PVT/noise/yield/STA closure or manufacturing approval.
