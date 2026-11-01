# Resistor Edu native release

The Edu release uses the existing shared circuit, geometry, file and engine implementation. It packages the full app and its native Python, KLayout, ngspice and public SKY130 resources. It does not relabel the free HTML workbook or any Industry installer.

## Required authority

`platform/licensing/public-config.json` must identify a production HTTPS authority and its Ed25519 public key. `/health` must confirm the same key fingerprint and a ready Cloudflare Durable Object SQLite database, authority `production-v1`, schema 1. Build commands fail before packaging if these checks do not pass. No private key or issuer credential belongs in an installer.

The desktop QA step requires `RESISTOR_EDU_QA_SERIAL`, provisioned through the operator-only QA route. Use a short-lived QA grant, not a buyer's serial and not a fabricated paid order. The test verifies that design RPC is denied before activation, activates through the real product form, checks the Edu window and native tool RPC, and deactivates its seat in cleanup. Revoke the QA grant after the build run, including failed runs.

## Native hosts and commands

Run each target on its actual OS and CPU, with Node.js 24. Commit the release source and public authority configuration first. Windows x64, macOS ARM64 (including M1), macOS Intel x64 and Linux x64 are supported build hosts. This flow does not claim a Windows ARM64 native runtime.

```text
npm ci
npm run package:edu:build
# Set RESISTOR_EDU_QA_SERIAL securely in the current process environment.
npm run package:edu:finish
```

The build phase checks the packaged native engine with an isolated workspace: an actual 0.9 V divider, current, GDS/OASIS round trips, restart preservation and a SKY130 inverter transient. It writes a candidate build-state file with `native_qa.completed=false`. The finish phase runs the packaged desktop and actual serial activation before producing a downloadable artifact and receipt. Failure leaves the candidate unverified; no release is published by these scripts.

For local native computer-use QA, operate the actual packaged app in an isolated profile, then record the observations in a local JSON file and run `node scripts/edu-native-release.mjs finish --desktop-evidence <file.json>`. This does not run browser automation. The file must copy the exact `edition`, `product_id`, `version`, `target`, `source_revision`, and `packaged_executable_sha256` from build-state, plus `runtime_manifest_sha256` from its runtime manifest hash. Set `verification_method` to `native-cua`, an actual `checked_at` ISO timestamp, and `edition_title` to the observed title. Each of `activation_checked`, `window_loaded`, `license_required_before_activation`, `engine_rpc_checked`, and `lease_released` must be true only after that check was actually observed; add one `observations` entry `{check, evidence}` for each, referencing the actual UI/diagnostic observation. Missing or different-build evidence is rejected. Do not record serial values in the evidence.

The manual GitHub workflow `.github/workflows/edu-native.yml` performs this flow on Windows, Apple Silicon, Intel Mac and Linux. Its four target-specific `RESISTOR_EDU_QA_SERIAL_*` secrets hold transient QA serials. It uploads build artifacts only and has no repository publication permission. Linux requires a graphical session and an OS keyring; the workflow provides a temporary D-Bus/keyring session without disabling Chromium's sandbox.

## Artifacts and provenance

Artifacts are in `release/edu-installers/`:

- `Resistor-Edu-<version>-windows-x64.exe`: per-user NSIS installer with Edu app ID and shortcuts.
- `Resistor-Edu-<version>-macos-arm64.zip` or `macos-x64.zip`: native `.app`, preserving symlinks and executable modes. Extract on macOS and drag the app into Applications.
- `Resistor-Edu-<version>-linux-x64.tar.gz`: portable app plus `install.sh`, installing under `~/.local/opt/resistor-edu/` with an Edu desktop entry.
- Matching JSON receipt: archive SHA-256/size, exact source revision, runtime inventory, authority health, actual packaged engine checks and actual desktop activation checks.

Mac bundles use ad-hoc signing. Apple Developer ID signing and notarization are not completed by this flow. Windows Authenticode is not configured. Keep these facts visible on the download page; no script disables Gatekeeper, removes quarantine or weakens the system sandbox.

Magic/Netgen and their physical checks remain separate capabilities. The bundled basic native runtime does not imply that DRC/LVS/PEX are available on every new machine, and successful app QA is not manufacturing signoff. Each installed app reports actual tool availability and revision-bound results.

Publication must validate the matching receipt, hashes and authority again, then update only the verified Edu target's link. Keep previous targets and all Industry records unchanged until their own verified replacements exist.
