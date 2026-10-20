# Resistor Edu / Indust 0.29.0

This preview release connects the Edu daily league inside the application, starts Edu at a
quiz/design junction, and presents the existing inverter lesson as seven separate pages.
The shared desktop updater validates and installs only the current product edition.

## Published applications

- [Edu installers](https://resistor.kr/download/edu/)
- [Indust installers](https://resistor.kr/download/industry/)
- [Exact files, SHA-256 sums and paired build receipts](https://github.com/Lead729726-cell/Resistor/releases/tag/editions-v0.29.0)

Each edition has Windows x64, Windows 11 ARM64, macOS 15+ Apple Silicon, macOS 15+ Intel,
and Linux x64 packages. Windows ARM64 uses x64 emulation for the bundled engines.
Developer ID notarization and Windows Authenticode signing are not supplied by this release.

**Both editions at 0.28 or earlier need one manual installation of their 0.29 installer.**
After that, automatic checks and optional automatic downloads use edition-specific releases,
caches and settings. Installation/restart still requires confirmation in the application.
Independent future tags `edu-vX.Y.Z` and `indust-vX.Y.Z` are supported alongside combined tags.
Do not run an old common installer to update an edition-specific application.

## Evidence and limits

- Edu feature source: `75d996381cac84bf469d762ae45b26271bc25111`;
  [source checks](https://github.com/Lead729726-cell/Resistor/actions/runs/38880831059).
- Shared/Indust source and build helpers: `724e7c37c369b654650c2b038168d69a4d4ffad1`;
  [shared change checks](https://github.com/Lead729726-cell/Resistor/actions/runs/38879883070).
- [All ten native builds](https://github.com/Lead729726-cell/Resistor/actions/runs/38880914416)
  and [all ten installer executions](https://github.com/Lead729726-cell/Resistor/actions/runs/38882257906)
  completed successfully on the matching OS/CPU runners. Installation checks launched the
  installed app, checked edition identity, ran bundled ngspice and KLayout, and reopened
  persisted results. The divider produced 0.9 V; its analysis verdict remains `unknown`.
- Public asset hashes, receipt hashes and URLs are recorded in
  [installer verification](evidence/edition-installers/0.29.0/public-verification.json).
  [Updater feed verification](evidence/edition-installers/0.29.0/live-feed.json) selected the correct
  files for all ten edition/target combinations without installing them.
- [Production delivery checks](evidence/edition-installers/0.29.0/portal-verification.json)
  passed 124 assertions across resistor.kr and the existing Vercel alias, including native
  redirects, Edu assets, oscillator assets and preserved video range responses.
  [Deployment receipt](evidence/edition-installers/0.29.0/deployment.json) and
  [visible download page](evidence/edition-installers/0.29.0/portal.png) accompany that report.

Public league configuration is resolved inside Edu using the existing signed league client.
The free public server currently depends on the operator PC, Internet and tunnel remaining
online. This verification did not register a competitor or submit public league answers.
Page navigation, draft restoration and browser history were exercised against a separate
Edu QA project. Previously stored real simulation results were observed; navigation does
not create new DRC/LVS/PEX or simulation evidence.

These checks establish application installation and the stated execution paths, not foundry
signoff, educational efficacy, code signing, or complete online replacement of every older
installed application. The shared portal uses versioned Edu presentation facts rather than
copying its educational engine into Indust. Its generation process is described in the
[download site README](../platform/download-site/README.md).
