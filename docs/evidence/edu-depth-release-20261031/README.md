# Resistor Edu progressive-dialog verification — 2026-10-31

Edition: `edu` / `resistor.edu`. This changes learning presentation and uses the
existing shared calculations, lesson records, project revisions and engines.

## Delivered behavior

- Home offers one current activity. Learning selection uses goal, activity and
  launch-confirmation pages; settings open separately.
- Quiz setup uses topic, difficulty, review scope and confirmation. History,
  generation consent, budget and coach tools open on demand. Hidden modes close
  their top-layer dialogs without deleting drafts.
- The first-circuit workbook uses prediction, one input per page, baseline,
  one-variable change, recalculation, comparison, explanation and finish pages.
  Reopening restores the last page for the matching Edu project and mission.
- CMOS learning retains seven actual stages. Layer sources, device candidates,
  questions and run records are inspected one at a time. Escape and Previous
  return to the parent/depth; closing preserves learner data.
- Native dialog focus takes priority over the editor's global shortcuts.

## Verification actually performed

- `npm run test:core`: **442 passed**, 0 failed, 0 skipped (227 service tests +
  215 TypeScript/formula/geometry/navigation tests).
- Edu and Industry production builds passed; workbook typecheck passed. Existing
  user-edited theme files were restored byte-for-byte after build generation.
- Portable workbook package audit passed: bundled assets, CSP hash, ZIP inventory,
  source/file digests, licenses, no engine/serial authority or student data.
- Browser source rehearsal: start a separate backed-up QA workbook; predict;
  reject R1=0; set one input; calculate 1.8 V / 10 kΩ / 10 kΩ → 0.9 V, 90 µA;
  change R2 to 20 kΩ; show prior revision until recalculation; calculate
  1.2 V, 60 µA; compare; write explanation; close, reload and resume at the saved
  depth. Escape returns one page and preserves the explanation.
- Record recovery returns to its actual parent import page. The original
  rehearsal workbook was restored from backup; the QA workbook is retained as a
  separate backup, not as a student submission.
- Browser widths 390, 768 and desktop: no horizontal overflow; footer controls
  remain available. Light and dark theme entry points remain functional.
- Real local quiz bank: four setup pages, numeric answer `1000 ohm`, deterministic
  100/100 feedback, QA history saved, **0 external API calls**.
- CMOS QA lesson: existing revision-bound engine records remain visible; stage
  4 Escape returns to stage 3, layer details return to their parent, opening a
  3D observation closes the modal. The observation endpoint stores view history
  only and preserves project data and engine verdicts.
- Plain web build without a worker shows `Worker HTTP 404` and a retry action;
  it does not claim simulation availability.

## Scope and release boundaries

The standalone HTML/ZIP is a **formula workbook preview**, not the complete EDA
installer. It has no ngspice, PDK, DRC/LVS/PEX, AI service or serial activation.
The browser automation policy blocks `file:` navigation, so direct file opening
was not browser-tested; packaging integrity and the shared UI were tested.
Native Windows/macOS/Linux installation is not established by these tests.

Vercel production publication requires a refreshed authorized session; at this
verification point its device authorization screen has a disabled Allow Access
button. The production overlay helper preserves live files and all existing
Industry/native/update manifests. Source tests/builds alone do not mean the
production website has been updated.

Official serial-required native installers remain gated by a production HTTPS
license authority. No license bypass or new native installer is included.
No new physical signoff or educational-effectiveness claim is made.

Run locally: `npm run course:rehearse`, then open `http://127.0.0.1:18955/`.
This is an isolated source/QA rehearsal with paid AI disabled, not official
activation. Build the portable workbook with `node scripts/edu-workbook-release.mjs`.
See `../../public-workbook-release.md` for release commands and download scope.
