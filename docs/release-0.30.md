# Resistor Edu / Industry 0.30.0 Preview

[Edu installers](https://resistor.kr/download/edu/) · [Industry installers](https://resistor.kr/download/industry/) · [Exact files and paired receipts](https://github.com/Lead729726-cell/Resistor/releases/tag/editions-v0.30.0)

## Changes

Both editions use the shared terminal targeting and net-name conflict helper. The schematic editor names the source and target, previews the route, and provides waypoint undo and cancellation. Explicit connections begin and end at actual pins. The engine still checks the full route and unintended contact; previews are not verification results. See [wiring instructions](wiring-030.md).

Edu also includes the project learning dashboard, read reconnection, lesson-specific continuation and conflict-safe learner drafts. Initial native validation found a click ignored during the lesson connection; editor view buttons now wait until the connection is ready. Industry preserves its existing instructor filming-kit and oscillator lecture changes. Its shared wiring patch was cherry-picked on top of its current branch, without replacing that branch or touching its local data.

## Exact sources and execution

- Edu: `0dec2659756165476e5ccb8eb1d92bf4889308f1`.
- Industry: `154e2246106d464cd14615c676fe991a90b34e81`.
- Shared build and native QA helpers: `3005d2ec09527d02982bf4b44cf6beda2d3f899d`.
- [Source CI, ten native builds and ten actual installer executions](evidence/edition-installers/0.30.0/native-ci.json) passed on the matching OS/CPU runners. Each execution checks actual pin wiring/cancellation, ngspice, KLayout GDS export, edition identity and persisted results. The divider returns 0.9 V while its functional verdict stays `unknown`.
- [Browser wiring checks](evidence/wiring-030/browser.json) cover pin clicks, conflicting names, waypoint undo, cancel, engine Undo/Redo and a 390 px viewport. The QA lesson is a separate project with no simulation runs or paid calls.
- [Connection readiness](evidence/wiring-030/readiness.json) distinguishes the initial native failure from the corrected source and confirms offline protection and explicit read recovery.
- [Published byte sizes, SHA-256 digests and receipts](evidence/edition-installers/0.30.0/public-verification.json) identify the files. [Deployment](evidence/edition-installers/0.30.0/deployment.json) and [public delivery checks](evidence/edition-installers/0.30.0/portal-verification.json) cover the portal and preserved tutorials/media.

## Platforms and limits

Each edition offers Windows x64, Windows 11 ARM64, macOS 15+ Apple Silicon, macOS 15+ Intel and Linux x64. Windows ARM64 runs a native Electron shell with emulated x64 engines. Apple Developer ID notarization and Windows Authenticode signing are not supplied; OS security warnings can remain. The receipts establish the stated installation and execution paths, not foundry signoff or educational efficacy.

Apps at 0.29+ can use their edition-specific updater. Earlier apps need one manual installation of the matching dedicated installer. Existing Industry data, Edu learner records and updater caches remain separate. The static website describes the source and links to installers; it does not run simulations or grade learner work.
