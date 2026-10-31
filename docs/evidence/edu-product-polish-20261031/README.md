# Resistor Edu product usability review - 2026-10-31

Edition: `edu` / `resistor.edu` / branch `codex/resistor-edu`.

This change improves the first-circuit workbook and navigation. It does not change equations, engine APIs, project schemas, PDKs, licensing, or Industry data. No new installer or production website deployment is represented by this evidence.

## Delivered

- Four learner steps and one contextual next action: predict, calculate, compare, explain. These indicate available notes/results, not correct answers or engine PASS.
- Field-specific Korean input errors, focus on the invalid field, and engineering-unit hints. Computations still use the shared calculators and store original SI inputs.
- Current, historical, unavailable, and not-run results remain distinct. Invalid calculations preserve prior records. A recommended change is enabled after a baseline exists.
- Workbook mission positions reopen per project (up to eight navigation pointers), without changing the record schema. Explicit mission changes focus the new heading.
- Header design navigation retains the last design page and lesson. The home's explicit start still opens step 1.
- Initial project-list connection failure no longer says there are no saved records. Retry remains read-only.
- Save errors expose immediate JSON backup and retry actions. Failed writes retain in-memory work and request browser unload protection.
- Multi-page report printing escapes the app's viewport-height scroll containers.

## Run

Run `npm run dev:edu` for the regular Edu environment. `npm run course:rehearse` opens the isolated source rehearsal at `http://127.0.0.1:18955/`; it is not an official installer/activation demonstration. A built UI preview was also checked at `http://127.0.0.1:18956/eda` using `vite preview --outDir dist-edu`. That static preview has no engine RPC and was intentionally used to inspect a real connection failure.

## Checks

- 92 targeted tests passed: course tests, Edu navigation, read-resource retry, preferences, and shared viewer tests.
- Full typecheck and workbook typecheck passed. Edu and Industry builds passed; see `build-checks.json` and logs. Existing large-bundle and classic appearance-script warnings remain.
- Source audit: 8,619 files, 207 archives, zero issues. Documentation: 283 links, zero missing. These counts were observed before adding the final evidence manifest.
- Actual browser journey: back up old note, create QA note, predict, calculate baseline, apply one change, display stale results, reject R1=0 with field focus, correct input, calculate with Ctrl+Enter, compare, explain, save, reload, restore original note.
- Formula results: R1=R2=10 kOhm, Vin=1.8 V gives 0.9 V / 90 uA; R2=20 kOhm gives 1.2 V / 60 uA. This is an ideal unloaded resistor calculation, not a simulation waveform.
- Mission 4 survives reload and shows `1 nF` for `1e-9 F`. Footer navigation focuses the next mission title.
- Mission 7 reports external-engine unavailability and creates no numeric MOS result.
- Built app: design 6 -> workbook -> reload -> design returns to `#design/6`; explicit home start returns to `#design/1`. Lesson-ID preservation is additionally covered by unit tests.
- Built app: project retry receives HTTP 404 from the static preview and displays records as unconfirmed, without implying deletion or zero records.
- Responsive checks at 390, 768, and 1440 CSS pixels: no document horizontal overflow; mobile action targets >=44 px high. Desktop input and result panels sit side by side, tablet/mobile stack. Light/system and dark appearances checked and restored to system/graphite.
- `report-print-qa.pdf`: real built-app print, 5 A4 pages, all eight mission headings present. First and last pages rendered and visually inspected. Its blank learner fields are a print fixture, not a completed submission.
- Source rehearsal console warning/error capture was empty. Static preview engine/network failures were expected and not counted as successful engine runs.

## Data preservation and limits

`workbook-qa.json` contains only agent-authored QA notes, with no self-completion flags. The original rehearsal workbook was backed up and restored through the normal UI. Existing student/Industry projects, keys, user themes, and unrelated tutorial files were not staged. Screenshot viewport overrides and temporary theme selection were cleared.

The browser download event did not arrive within 10 seconds, so completion of that download is not claimed. The QA record was instead read from the explicitly opened recovery preview and saved to this evidence folder, then validated through the normal workbook parser.

No new DRC, LVS, PEX, ngspice, paid AI, payment, or installer validation was performed for this UI change. Storage denial/conflict handling was covered by existing unit tests, not simulated against the user's live browser store. Before-unload behavior still depends on browser policy. Educational effectiveness and market readiness have not been established by this engineering QA.
