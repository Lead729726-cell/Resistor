# v0.24.0 — executed evidence

Runtime source: `a8b396da993e778d68492e589c3ab376c1b7c664`; EDA generation: `9eb7adb9a008`. This folder records execution, not literature-derived performance predictions.

- [Current circuit summary](../../../examples/research-20261013/9eb7adb9a008/summary.json): 59 defaults; 64 drive/slew/load cases; 16 selected SS/FF cases; three alternate OTA compensation values and an X4 physical inverter. 143 pre-layout analyses, 13 each DRC/LVS/PEX/post-layout, and one LDO PSRR measurement. 192 criteria passes, three OTA criterion failures and one measurement-only unknown; zero current-generation execution failures.
- [Native regressions](native.json): 187 core and 85 isolated Python tests. [Solver probe](solver-probe): same extracted XOR deck/models/steps with KLU completed; the original timeout remains in the historical source generation.
- [Package resources](release.json): all four OS artifacts match the qualified runtime resources, with recorded CRLF/LF-only exceptions. [Mac native CI](mac-native.json): both architectures, four desktop checks each, plus archive/architecture/ad-hoc-signature/atomic-install/backup/data preservation. [Linux installation](linux-installation.json): native archive and atomic installation/data preservation.
- [Four complete public downloads](public-downloads.json) and [actual Electron download transport](electron-transport.json): size/SHA-256 verified; these download probes do not execute installation.
- [Published site](../literature-site/deployment.json) and [122 public checks](../literature-site/http-verification.json): new references, original measured figures, library ZIP, existing tutorials, links and four OS redirects. EDA servers and user designs are not hosted by this static site.

Windows installer GUI, Mac Docker EDA/user M1 hardware, Apple Developer ID/notarization, Windows Authenticode, complete PVT/noise/yield/STA closure and foundry approval remain outside this evidence. The successful native Mac CI is not Apple notarization. The default passing OTA and deliberately failing alternate values are both published.
