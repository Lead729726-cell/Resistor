# Public source and development records

The initial public snapshot contains application source, deterministic calculator
formulas, native engine adapters, tests, documentation, small verification
records, screenshots, walkthroughs and reusable design bundles. MIT applies to
application source. See `THIRD-PARTY-NOTICES.md` and adjacent example/PDK notices
for the external license boundaries.

The repository does not include commercial tools, vendor SDKs, licensed decks or
the external EDA Docker image. The image and public PDK retain their upstream
licenses and pinned provenance. The adapters do not establish actual vendor
execution without an installed and licensed toolchain.

## Files kept locally

`.gitignore` excludes local databases, credentials, build/installer output, tool
caches, raw waveforms, browser traces, duplicated historical examples and
generated QA working folders. These files are preserved locally rather than
deleted. In particular, full `examples/history/`, MUX native raw `.dat`/`.raw`
tables, `mux4.project.json`, `mux4-evidence.zip` and duplicate CPU preview-session
recordings are not part of a fresh clone. Historical documentation may describe
these local files; use the checked-in portable design bundles and summary
records when browsing the public repository.

Checks in `scripts/source-audit.mjs` inspect Git candidates and small ZIP
contents for common credential patterns, private paths and files over 50 MiB.
The audit outputs locations and rule names only. Review generated records and
third-party rights as well; pattern matching is not proof of absence of all
sensitive data.

## Development history

The public repository [Lead729726-cell/Resistor](https://github.com/Lead729726-cell/Resistor)
was created on 2026-10-05 and is the configured origin. Source publication is
verified by comparing the remote `main` commit with the local commit after a
successful push. Repository creation, source publication and macOS CI execution
are separate states. Codex-local checkpoint refs, raw traces and machine-local
working files are not sent by the explicit `main` push.

There were no existing Git commits or remote at publication preparation time.
The initial commit is a snapshot of the current implementation. `CHANGELOG.md`
and pre-existing evidence retain the earlier development milestones without
creating fabricated historical commits.

Push and pull-request CI runs Node 24 core tests, type checking, web/process
build and source audit on Linux. Native EDA and browser suites require additional
environments. The manual macOS workflow prepares arm64/x64 previews; a successful
archive/build does not replace native execution, signing or notarization.
