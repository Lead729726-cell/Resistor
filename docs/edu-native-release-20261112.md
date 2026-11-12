# Resistor Edu 0.33.0 release verification

Edition: **edu**. Verified 2026-11-12. The four native targets were built, exercised and published from one exact source. This report keeps candidate checks, actual public artifact verification and hosted/browser verification separate.

## Scope

The Edu workbench uses the same paper, graphite and green direction as the course site. Settings, quiz feedback, hints, puzzle results, coach and product/privacy guidance open as focused steps. Navigation preserves drafts. Light/dark themes and Edu-specific preferences remain available. Industry workflows and historical data remain separate.

The release keeps the shared mathematical, circuit, geometry and file engines. Actual packaged-engine and desktop activation checks are required independently for Windows x64, macOS Apple Silicon, macOS Intel and Linux x64. Historical Windows ARM64 and Industry downloads are retained.

## Exact source and checks

- Candidate source: `ad2682a71f9bf9c88d2e5f54ae1368b3120799d5`, branch `codex/edu-release-0-33-0`.
- Core tests: **555 passed**. Native preparation tests: **40 passed**. CI prerequisite tests: **61 passed**.
- Native build/execution run: [43183199132](https://github.com/Lead729726-cell/Resistor/actions/runs/43183199132), all four targets succeeded from the same source.
- The initial run, `43180116507`, passed three targets but failed Intel Mac runtime preparation. Its timeout output did not identify the exact subprocess. A slow compiler was a hypothesis, not an established cause.
- The new source records allowlisted preparation phases and elapsed times. Only Intel Mac ngspice compilation receives a bounded 1,200-second timeout. Other preparation and engine/desktop QA limits are unchanged. All four targets are rebuilt from the same new source; old and new receipts must not be mixed.
- The successful Intel run measured configure **133,742 ms**, compilation **450,172 ms** and install **19,104 ms**. These are measured preparation times from that run, not proof that `make` caused the first unlabelled timeout.
- QA activation used short-lived `purpose: qa` grants, without fabricated customer purchases or serial delivery. Cleanup records confirm **8 grants revoked and 8 GitHub secret deletion operations across the two runs**. The same four secret names were reused, so this is not eight simultaneous secret slots. Cleanup completed at 08:22:01 UTC for the first source and 08:46:14 UTC for the final source.

## Actual packaged candidate verification

| Target | Native engine cases | Desktop activation, settings and engine RPC | Lease release | Secure storage observed |
| --- | --- | --- | --- | --- |
| Windows x64 | 13/13 | Verified | Verified | Windows, encryption available |
| macOS Apple Silicon | 13/13 | Verified | Verified | macOS, encryption available |
| macOS Intel | 13/13 | Verified | Verified | macOS, encryption available |
| Linux x64 | 13/13 | Verified | Verified | GNOME libsecret, encryption available |

Each actual Electron check required a license before activation, loaded the **Resistor Edu** window,
opened the management/settings flow, exercised the packaged engine RPC and released its QA lease.
The checks ran in their CI target environments; they do not establish every user machine configuration.

The 13 engine cases cover authenticated host startup, missing-auth rejection, native KLayout/ngspice
without Docker, circuit edits and SPICE paths, actual divider operating point **0.9 V / 90 µA**,
busy-job cancellation, process-owner protection, rectangle editing, GDSII/OASIS round trips,
workspace traversal rejection, launcher exit, history persistence after restart, and actual SKY130
inverter transient with signed current. The ideal operating-point functional verdict remains **UNKNOWN**;
the numerical check is not a manufacturing verdict. These cases do not claim Magic/Netgen execution.

Evidence: [sanitized candidate artifact hashes](evidence/edu-native-release-20261112/candidate-artifacts-manifest.json)
and [actual execution, Intel timing and QA cleanup summary](evidence/edu-native-release-20261112/native-execution-summary.json).
Absolute local paths and credential values are excluded. The candidate manifest intentionally retains
`public_release_created: false` as the observation at **08:47:25 UTC**, when candidate artifacts were
verified. Later publication is recorded separately rather than rewriting that earlier stage as public.

## Publication gates

Each installer must have an exact-source JSON receipt, actual desktop activation/window/engine checks, runtime and executable hashes, and public installer bytes matching the receipt. The four new targets must share one source SHA. The dedicated `edu-v0.33.0` release must not replace the repository's shared Latest pointer.

The website update is a narrow overlay onto the then-current live source: Edu cards, Edu redirects/source, release notice, Edu update metadata and corresponding learning-manifest hashes. Industry/common feeds, other OS history, policy pages, course content, API functions and inherited deployment configuration must be preserved.

## Known limits

- Windows binaries are **unsigned**. Mac binaries are **ad-hoc signed, not Apple notarized**. Do not claim trusted signing or advise disabling OS protections.
- macOS requires version **15 or later**. Linux requires a graphical session and an OS keyring.
- Valid Edu activation is required. The Edu course grants Edu on two personal devices; Industry is a separate product entitlement.
- Magic/Netgen and additional physical-verification decks require separate setup. Packaged engine checks do not establish foundry signoff.
- The policy pages include approved responsibility and retention choices, but international-transfer details, child-data scope, remaining operational verification and the effective date still require confirmation. Publication is not evidence of legal completeness.

## Final publication

The [public GitHub release](https://github.com/Lead729726-cell/Resistor/releases/tag/edu-v0.33.0)
was published at **2026-11-12 08:49:03 UTC**, release ID `442658466`, with four installers and four paired
JSON receipts. Its tag resolves to `ad2682a71f9bf9c88d2e5f54ae1368b3120799d5`. The shared Latest pointer
remains `editions-v0.31.0`, ID `417979794`. See the
[GET-only public metadata readback](evidence/edu-native-release-20261112/github-public-metadata.json).

The production preparation downloaded and checked the actual bytes of all four public installers against
their receipt hashes. It then prepared **297 source files**, preserving **291** and replacing exactly
**six overlay files**, against the then-current approved-policy deployment
`dpl_DMwmn5hMxdyD3GNBfxFEvzBNKRHg`. See the
[preparation and publication receipt](evidence/edu-native-release-20261112/production-preparation.json).

The resulting Vercel deployment is `dpl_9YVotLE1xFjsugiKUcv1ouQoES3X`, created at **08:51:44 UTC**.
Its preparation fingerprint is `3bf156c1af5bf3b23edaaf6e1f6085b3340565606e8b1a117777b4af7748316c`.
Final GET-only verification completed at **2026-11-12 08:52:26 UTC: 70/70 passed**.
Both `resistor.kr` and `resistor-downloads.vercel.app`, plus the project's production target, resolved to
that READY deployment before and after the checks. The actual 297-file source inventory matched the
prepared payload: 291 protected source hashes remained unchanged and all six overlay bodies matched
their SHA-256 and byte counts. See the [final public verification](evidence/edu-native-release-20261112/public-verification.json).

The checks confirmed all four 0.33.0 cards and official redirects, paired receipt/updater compatibility,
Industry and Windows ARM64 history, common feeds, the approved policy page hashes, updated learning
manifest entries, unchanged GitHub Latest and the same healthy license authority. Read-only catalog
responses kept direct checkout disabled. No purchase, email, license mutation or redundant full installer
download was performed by this final verifier.

Actual browser inspection confirmed the four public cards. Selecting Apple Silicon changed the main
download action to `/download/edu/macos-arm64`, then automatic selection was restored. At a
390×844 mobile viewport, the menu opened and closed and the observed body/scroll width was 375 px,
within the viewport. This checks that observed screen, not every device or every accessibility scenario.

- [Public desktop download screen](evidence/edu-workbench-20261112/edu-033-public-download.png)
- [Public mobile download screen](evidence/edu-workbench-20261112/edu-033-mobile-download.png)
- [Approved privacy choices on the public page](evidence/edu-workbench-20261112/privacy-approved-public.png)

Download: [Resistor Edu](https://resistor.kr/download/edu/).
The 70 native publication checks are separate from the earlier whole-site redesign's 350 checks and the
policy-only follow-up's 74 checks. None of these numbers is a manufacturing signoff or legal-completeness claim.
