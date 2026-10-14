# Resistor product context

Read `product-edition.json` and `apps/desktop/product-editions.json` before identifying this product.
An explicitly selected `RESISTOR_EDITION` overrides the branch default.

- `edu` / **Resistor Edu** / `codex/resistor-edu`: guided engineering practice, explanations,
  new learning projects, and learner records. Learning checkboxes are not engine verification.
- `indust` / **Resistor Indust** / `codex/resistor-indust`: professional circuit/layout workflow,
  actual simulation, tool provenance, revision freshness, DRC/LVS/PEX and review.
- `main`: shared core. Keep fixes to mathematical logic, geometry, file formats, API and engine
  shared between editions. Do not fork formulas or invent educational waveforms/PASS verdicts.

Identify the edition in summaries, artifacts and agent contexts. Preserve the historical Indust
data directory. Edu uses a separate engine/workspace and never copies keys or user projects.
Do not claim foundry signoff or new edition installer publication based on an edition name.
User-authored tutorial helper files may be untracked; do not stage unrelated files.
