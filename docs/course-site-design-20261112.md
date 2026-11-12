# Resistor Edu course website — 2026-11-12

Edition: **edu**. Scope: public course website, not a new desktop installer or an EDA engine release.

## Design direction

- Product: learn to use Resistor Edu by connecting, changing, interpreting and saving a real circuit.
- Character: precise, calm and approachable to a first-time learner.
- Reference world: a paper experiment notebook, with graphite text and one restrained green accent.
- Product moment: an adjustable voltage divider using the shared deterministic calculator.
- Signature: numbered experiments, aligned numeric units, native expandable lesson sections.

The requested `unslop` skill was already installed. Its guidance was applied without replacing that installation. Spacing and typography guidance is credited to Damir Sokolovsky, [unslop](https://heydamir.design/unslop), CC BY 4.0. The user requested a comprehensive reorganization, so the homepage section order and course page structure were deliberately changed.

## Delivered source

- `scripts/course-site-design.mjs`: homepage, course page, shared navigation, bounded generation and learning asset hash updates.
- `scripts/site/course-site.css`: paper/graphite palette, existing light/dark preference, responsive layout and focus states.
- `scripts/site/course-site.ts`: shared voltage-divider calculation, reset, menu dismissal and current destination.
- `scripts/site/course-site-content.mjs`: planned 12 core lessons and 4 clinics, matched to existing course planning documents; planned duration is not recorded video duration.
- `scripts/site/course-offer.mjs`: existing sales policy with read-only catalog lookup and fail-closed purchase links.
- `tests/course-site-design.test.mjs`: six behavior and preservation tests, independent of personal/untracked recording documents.

Primary navigation is Course / Free practice / Downloads / Resources. Industry, PDK, research, shortcuts, licensing and GitHub remain reachable through More and the resource/footer links. Existing lesson bodies, downloads, license API and videos remain in place. The desktop app itself is not redesigned by this patch.

## Reproduction

```powershell
node scripts/course-site-design.mjs
npm run typecheck
node --test tests/course-site-design.test.mjs tests/commerce-site.test.mjs tests/download-editions.test.mjs tests/system-detection.test.mjs tests/license-mail-site.test.mjs tests/edu-site.test.mjs
```

To apply only the design to a verified site snapshot, set `RESISTOR_SITE_OUTPUT` to that directory before running the generator. `scripts/download-workbench.mjs` and `scripts/course-store-site.mjs` also apply this design at the end of their existing generation steps.

For a read-only local preview, set the same output variable and run `node scripts/course-site-preview.mjs` (localhost port 18956). The preview serves the public catalog locally; it does not proxy licensing or checkout secrets.

## Validation scope

- Shared formula: Vin=1.8 V, R1=10 kΩ, R2=10 kΩ gives 0.90 V and 90.0 µA; R2=20 kΩ gives 1.20 V and 60.0 µA. No-load ideal resistor model; no circuit simulator is run by the homepage.
- Actual browser: slider and reset, Escape dismissal, light theme persistence after reload, mobile menu, curriculum disclosure, existing OS download detection.
- Responsive checks: desktop, 768px, 390px and 320px. No horizontal overflow at the measured mobile/tablet widths. Screenshot evidence is under `docs/evidence/course-site-20261112/`.
- Home/course internal route and fragment checks: 23 and 24 destinations respectively, no broken route or fragment.
- Automated tests cover public sales behavior, shared formula/unit conversion, SVG connectivity, native/API byte preservation, repeatable generation and route contracts.

## Production preservation

Local generated download metadata predates the live release. Production publication therefore uses a separately reconstructed and freshly verified snapshot of `dpl_Bghf1dcDVdNmnbDxEfWniPZ2fm4B`, not a wholesale upload of the local output directory.

The verified baseline has 291 source files. The course design changes HTML and their learning manifest entries, adds three public assets, and keeps the source inventory, API code, release metadata, redirects and deployment configuration otherwise unchanged. Candidate and public verification receipts are recorded separately; upload or READY alone is not proof of the public site.

One pre-existing learning manifest entry for `edu-updates.json` has an outdated size/hash. Its metadata and the update file are preserved and identified in the deployment receipt; this design patch does not silently rewrite historical release evidence.

No new installer, course recording, payment transaction, license delivery or manufacturing verification is claimed. Inflearn remains planned until the existing catalog supplies a verified public course URL. The displayed planned price is KRW 250,000, Edu only, two personal devices.

## Published result

Published on 2026-11-12 to `https://resistor.kr/` and `https://resistor-downloads.vercel.app/`, deployment `dpl_5roH9MogfydVr58L4kUoJVuxi4ns`. Both aliases, all 294 source files, routes, API output and unchanged settings were verified. Public HTTP checks passed **64/64**; focused tests passed **40/40** and typecheck passed. Chrome confirmed the published divider at 20 kΩ gives 1.20 V / 60.0 µA. The in-app browser confirmed the corrected mobile nested-menu behavior on the public site.

The keyboard review found and fixed an Escape propagation issue: the first Escape now closes More and the second closes the mobile navigation. Regression coverage models the existing shared appearance handler being registered first. Evidence and final screenshots are saved in `docs/evidence/course-site-20261112/`.
