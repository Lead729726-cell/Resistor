# Changelog

This records the source snapshot being opened, rather than reconstructing Git
history that did not previously exist. Existing detailed verification remains in
`docs/evidence/` and the example READMEs. Package version: 0.14.0.

## Unreleased — open-source baseline (2026-10-05)

- Deterministic electronics calculator hub with shared formula, unit, example,
  validation, FAQ and related-calculator structure.
- Integrated schematic and integer-DBU layout editing, GDS/OASIS import, 2D/3D
  viewing, hierarchy preview/approval, public SKY130 design starters and examples.
- Native simulation and validation jobs, waveform cursors and statistics,
  signed current and voltage-drop inspection, logic/analog signal response tests.
- Shared design server with role, revision, conflict and command receipt checks.
- Process topography inspection and bounded geometry simulation; authored or
  measured Z input remains separate from GDS and device/chemistry TCAD.
- Windows packaging and macOS arm64/x64 preparation, installer diagnostics,
  dark/light modes and skins.
- MIT source publication, preserved external notices, contribution guide,
  source audit and push/PR core validation workflow.

### Latest simulation verification

The RC native fixture measured 1.13781519891 V at the selected sample versus
1.13781700589 V expected, with a 0.66218480109 V resistor drop and
66.21847978 µA current. Logic and analog UI checks, signal-flow mathematics and
job failure/cancellation handling have recorded evidence in
`docs/evidence/eda-signal-flow-verification.json`.

### Remaining release gates

Commercial vendor execution requires the actual tools and licensed environment.
macOS package structure is not evidence of native M1 execution, signing or
notarization. Public service hosting, a permanent live demo and a signed binary
release remain separate tasks. Refer to `docs/implementation-status.md` and
`docs/development-roadmap.md` for feature-level limits.
