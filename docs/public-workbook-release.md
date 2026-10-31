# Resistor Edu public workbook release

This release provides the shared React `CoursePractice` interface as a public web
workbook and a self-contained HTML download. It contains deterministic ideal
resistor, divider and RC calculations, student notes, revision-bound comparison,
JSON transfer and printable reports. It is **not** the complete native EDA app.

No worker, ngspice, PDK, DRC/LVS/PEX, AI provider, user projects, keys or serial
authority are packaged. The decorative 3D board is not process simulation.
Learning completion is a self-check, not engine verification.

## Build and check

Run from the Resistor Edu checkout:

```powershell
node scripts/edu-workbook-release.mjs
node --test tests/edu-workbook-release.test.mjs
```

Outputs are under `.runtime/edu-workbook-release/artifacts/`:

- `Resistor-Edu-Workbook.html`: open directly in a modern desktop browser.
- `Resistor-Edu-Workbook.zip`: HTML, instructions, source/file hashes and licenses.
- `course-workbook.html`, `workbook.js`, `workbook.css`: hosted interface.
- `manifest.json`, `release-receipt.json`: source inputs and artifact digests.

The offline HTML has inline assets, no network fetches, and a CSP hash for its
script. It requires no Node/Docker installation. Browser policies for `file:`
storage differ, so students should export important records as JSON. The online
and offline workbook use the existing schema and backup-first import workflow;
moving a file or changing origins does not silently copy student records.

Builds generate appearance tokens in memory and do not rewrite user-edited theme
files. Supported browsers lacking `crypto.randomUUID` use secure random bytes
for project IDs. A missing secure randomness API reports an unsupported browser.

## Publish without reverting current production

Existing native installers and edition update feeds must remain unchanged. The
repository download-site metadata can be older than the live site. Use the live
deployment tree rather than publishing the entire local folder.

After the source changes are committed, rebuild and verify the artifacts. An
existing authorized Vercel CLI session is required; tokens stay in memory.

```powershell
node scripts/edu-workbook-deploy.mjs prepare
```

Inspect `.runtime/edu-workbook-release/deployment/review.json`. The default new
entry is `https://resistor.kr/edu-practice/`; the old `/course/` route is preserved.
Use `prepare --alias-course` only when deliberately promoting the shared React
workbook to the old route. This keeps the same online workbook storage key.

The prepared overlay adds the downloadable assets and a visible entry on the
home and Edu download pages. Native installer manifests, update feeds and the
Industry download page remain the exact previous Vercel files.

```powershell
node scripts/edu-workbook-deploy.mjs publish
node scripts/edu-workbook-deploy.mjs status
```

Publishing refuses a changed production baseline or edited prepared payload.
An existing receipt is reused instead of creating a duplicate deployment. A
`READY` deployment still needs browser checks, a downloaded ZIP hash check, and
comparison of the protected live manifests. Browser-check desktop/mobile,
begin/change/calculate/compare/save/reopen, input errors and unavailable engine
guidance. Do not claim native macOS/Windows/Linux execution from browser checks.

The official native packaging gate in `scripts/license-release-check.mjs` is
unchanged: a production HTTPS license authority and matching trusted Ed25519 key
must be configured and verified before new serial-required installers ship.
