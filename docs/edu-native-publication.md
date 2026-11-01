# Resistor Edu native release publication

This procedure publishes the complete licensed **Resistor Edu** desktop app.
It does not substitute the standalone formula workbook. Industry installers,
data, release history and common update manifests remain unchanged.

## Required evidence

Use the dedicated `edu-v0.32.0` tag on the exact final committed Edu source.
Build each target on its matching native OS/CPU with
`node scripts/edu-native-release.mjs all`. The production licensing authority
must already pass `assertLicenseReleaseReady`, including its durable database.
Desktop QA needs the operator's short-lived `RESISTOR_EDU_QA_SERIAL` environment
variable; never put a serial in release notes, command arguments or source.

Each installer must have its paired JSON receipt in `release/edu-installers/`.
The receipt binds the final source, packaged runtime SHA-256, actual engine runs,
actual licensed desktop opening, authority fingerprint and explicit signing
status. Missing evidence is a release blocker, not an invitation to set flags.
Magic/Netgen execution is a separate scope from bundled ngspice/KLayout/SKY130.
None of these checks establishes manufacturing signoff.

Publish only the verified OS targets. Other targets retain their existing files,
versions, source links and receipts. Windows ARM64 must not be relabeled as a
new native ARM64 build; the historical x64-emulation package stays unchanged.

## GitHub release ordering

Create a dedicated **draft** release at the final source SHA; upload only the
verified installer files and their paired receipts, without `--clobber`.
Use an explicit file list, not an output-directory wildcard (the directory also
contains build state and desktop QA files). Review source/runtime/authority and
actual QA receipts before publishing the draft. Keep the shared Latest pointer
unchanged with `--latest=false`. A dedicated stable Edu tag is discovered by the
Edu updater, while the Industry updater ignores that tag.

```powershell
# Replace FINAL_SOURCE_SHA and the explicit files with reviewed build evidence.
gh release create edu-v0.32.0 --draft --latest=false --target FINAL_SOURCE_SHA --title "Resistor Edu 0.32.0" --notes-file release-notes.md
gh release upload edu-v0.32.0 release/edu-installers/Resistor-Edu-0.32.0-windows-x64.exe release/edu-installers/Resistor-Edu-0.32.0-windows-x64.json
# Execute only after final receipt and native-app review.
gh release edit edu-v0.32.0 --draft=false --latest=false
```

## Preserve the actual production website

The checked-out download-site files can be older than `resistor.kr`. Do not
deploy that entire directory for an Edu-only update. The native deployment tool
reads the existing authorized Vercel CLI session in memory. It retrieves the
current production source inventory and verifies original file SHA-1 values
from Vercel's file-content API.

`node scripts/edu-native-deploy.mjs baseline edu-v0.32.0` verifies read-only
access and saves the current source/Industry/common-feed baseline before the
native artifacts are ready. It neither prepares nor publishes an update.

```powershell
node scripts/edu-native-deploy.mjs prepare edu-v0.32.0
```

Preparation changes no remote state. It verifies public installer bytes against
both GitHub digests and receipts, resolves the release tag to the exact commit,
compares engine source hashes to public Git blobs, and checks the committed
license key against the currently healthy authority. It refuses drafts,
prereleases, changed source, unavailable files or incomplete desktop/engine QA.

Review `.runtime/edu-native-publication/edu-v0.32.0/review.json`. The overlay is
limited to `edition-downloads.json`, `vercel.json`, `index.html`,
`download-edu.html`, and `edu-updates.json`. Only verified Edu OS download routes
and cards are replaced. Industry metadata and all unrelated production files
are retained. `edu-updates.json` describes website guidance; it is not the
desktop updater's GitHub release feed.

```powershell
node scripts/edu-native-deploy.mjs publish edu-v0.32.0
node scripts/edu-native-deploy.mjs status edu-v0.32.0
```

Publication rechecks the authority, release, source and current production ID.
If production advanced, prepare again rather than overwriting its newer files.
An intent without a returned deployment receipt must be reconciled in Vercel
by its saved release fingerprint before retrying; the tool never blindly
creates a second deployment after an uncertain network result.

## Final public verification

Verify the new OS redirect, exact downloaded byte count/SHA-256, paired receipt,
the visible Edu version and signing limitations at `/download/edu/`. Recheck
the Industry page, Industry manifest object, untouched target records, common
`updates.json`/`downloads.json`, and GitHub Latest against the preparation
baseline. Check the real application updater separately from the website.
Save these actual observations as a production receipt; a READY deployment
alone does not complete public smoke verification or native app QA.

```powershell
node --test tests/edu-native-publication.test.mjs tests/download-editions.test.mjs tests/edition-updates.test.mjs
```
