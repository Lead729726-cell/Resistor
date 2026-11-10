# Resistor Precision Workbench — 2026-11-10

Edition under review: **Resistor Indust**, branch `codex/resistor-indust`. Shared UI changes also apply to Edu; product identities, historical Indust storage and isolated Edu storage are preserved.

## Direction and audit

- Product: a circuit, layout and simulation workbench, with a public installer and learning library.
- Character: quiet, exact, deliberate.
- World: an electrical measurement bench and a lab notebook.
- Moments: actual circuit/layout content, returned waveforms and existing product screenshots.
- Signature: aligned units, coordinates and revision metadata beside restrained neutral surfaces.

This is a refinement of the existing design. The audit found small metadata, uneven spacing, competing action colors, heavy modal treatment and inconsistent controls. The graphite/blue palette, type family, section order and existing progressive task navigation remain in place. All four app skins and dark/light/system preferences remain available.

## Nine passes

1. **Spacing:** related controls use a 4px rhythm, with consistent 16/24px group separation. The design canvas remains the main workspace.
2. **Color:** routine chrome uses existing neutral tokens. Accent marks primary actions and selected states. Electrical trace and layer colors retain their meaning. Primary text uses `--accent-ink` in both themes.
3. **Icons:** retain the existing product mark and functional icon language; avoid decorative badges or a second icon family.
4. **Copy:** simplify task headings and theme-setting instructions. Keep engine states, constraints, units, release versions and verification limitations intact.
5. **Type:** use 12px or larger guidance in updated flows, 20/28px dialog headings and tabular numeric data. Remove excessive tracking and unnecessary heavy weights.
6. **Layout:** retain one active popup page at a time, back/next navigation and mounted hidden inputs. Do not add permanent IDE panels.
7. **Details:** consistent control radii, explicit focus and selected states, readable primary-button contrast and larger touch targets.
8. **Visuals:** retain real app imagery and technical content. No generated circuit, waveform or verification evidence is introduced.
9. **Motion:** remove modal backdrop blur and unnecessary emphasis; preserve short interaction feedback and reduced-motion support.

## Source and scope

App styling lives in `packages/ui/src/precision-workbench.css`, `guided-workbench.css`, `appearance.css` and the scoped guided-flow styles, plus `packages/viewer/src/layout-guided.css`. Public styling is authored in `scripts/site/` and regenerated into `platform/download-site/` with `node scripts/download-appearance.mjs`. This appearance-only command updates two CSS files and their existing manifest entries without rebuilding historical engine evidence. Generated pages are not the design source of truth.

No mathematical formula, net/node identity, layout geometry, file format, engine API or verification verdict was changed. Appearance QA uses a separate local Indust fixture workspace. Its synthetic test license is not production licensing or foundry qualification. A new native installer is not implied by this source change.

## Evidence

Current validation and screenshots are in [the evidence folder](evidence/unslop-20261110/). The appearance regression is [the reproducible browser check](../tests/integration/unslop-appearance.mjs). Both edition builds and typecheck passed, along with 13 edition/API contract tests, 8 public-site unit tests, 20 app appearance checks, 48 public browser checks and 17 final responsive checks. The source audit found no issues; 591 documentation links resolved.

The public-site comparison preserved 133 page link sets, 56 media files and 9 protected manifests/scripts. Production Edu download metadata is newer than this Indust checkout; deployment must preserve the live inventory and replace only the two stylesheet bodies and corresponding existing manifest hashes. Never publish this checkout's complete static folder over newer production release data.

Published to [resistor.kr](https://resistor.kr/) and [the existing Vercel host](https://resistor-downloads.vercel.app/) from source `975b91f`. The production overlay changed exactly 3 of 291 source files, preserving the other 288. Both hosts passed 38 post-promotion checks, including unchanged native download redirects, page contents and public catalog response. The protected candidate's anonymous HTTP checks were blocked by authentication; its source inventory and effective configuration were checked before promotion, and public HTTP checks completed afterward. No protection settings were changed.

See [the deployment receipt](evidence/unslop-20261110/deployment.json) and [the final validation receipt](evidence/unslop-20261110/validation.json). The Indust app redesign is available in source and the local workbench preview; existing native installers were not replaced by this website deployment.

## Design workflow attribution

Applied [unslop](https://github.com/heydamir/unslop/tree/main/skills/unslop) by **Damir Sokolovsky ([@heydamir](https://x.com/heydamir))**, licensed **CC BY 4.0**. This report adapts its audit and nine-pass design workflow. Existing Resistor source licensing is unchanged.
