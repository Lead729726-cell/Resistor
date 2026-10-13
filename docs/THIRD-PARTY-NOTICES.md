# Third-party notices and distribution boundary

Application source is MIT licensed. Runtime dependency versions are pinned in package-lock.json; this file records license metadata read from the installed packages on 2026-09-30.

The read-only PDK viewer also includes the public `sky130A.lyp` (Copyright2022
Mabrains LLC, Apache-2.0) from the pinned open_pdks installation. The original
header and Apache license are preserved. `adapters/pdks/sky130/display.json`
derives names/colors from it; display heights are illustrative application metadata.
See `adapters/pdks/sky130/DISPLAY-NOTICE.txt`.

| Component | Installed version | License | Upstream |
| --- | --- | --- | --- |
| React / React DOM | 19.3.0 | MIT | https://github.com/facebook/react |
| Three.js | 0.186.1 | MIT | https://github.com/mrdoob/three.js |
| Lucide React | 0.577.0 | ISC | https://github.com/lucide-icons/lucide |
| Electron | 44.5.0 | MIT plus bundled Chromium notices | https://github.com/electron/electron |
| Vite (development) | 7.3.6 | MIT | https://github.com/vitejs/vite |
| Electron Packager (development) | 20.3.0 | BSD-2-Clause | https://github.com/electron/packager |

The Windows runtime keeps Electron's LICENSE and LICENSES.chromium.html. Dependency license text is copied alongside the packaged app.

## External engine and PDK source notices

The following source notices were inspected on 2026-09-30. From v0.26, CPython 3.13.16, KLayout 0.30.5 and ngspice 47 are also redistributed in native packages; original license texts are included. Magic/Netgen/Xschem/Yosys/Icarus are separately installed public tools unless explicitly recorded in a future package. ngspice has component-specific licenses, so its COPYING file must remain available rather than assigning one license to the whole executable.

| Component | Source notice / license | Inspected reference |
| --- | --- | --- |
| KLayout 0.30.5 | GNU GPL v3 text | [Versioned LICENSE](https://github.com/KLayout/klayout/blob/v0.30.5/LICENSE) |
| Xschem | GNU GPL v2 or later; separate scconfig notices | [LICENSE](https://github.com/StefanSchippers/xschem/blob/master/LICENSE) |
| Magic | University of California permissive copyright notice | [LICENSE](https://github.com/RTimothyEdwards/magic/blob/master/LICENSE) |
| OpenCircuitDesign Netgen | GNU GPL, any version per source header | [netgen.c header](https://github.com/RTimothyEdwards/netgen/blob/master/base/netgen.c) |
| ngspice | Berkeley/BSD and other component-specific notices | [COPYING](https://github.com/ngspice/ngspice/blob/master/COPYING) |
| Used SKY130 primitive models | Apache-2.0 in actual installed file headers | `/foss/pdks/sky130A/libs.ref/sky130_fd_pr/spice/sky130_fd_pr__nfet_01v8__tt.pm3.spice` and matching HVT PMOS file |
| SKY130 Xschem support files | Apache-2.0 installed license | `/foss/pdks/sky130A/libs.tech/xschem/LICENSE` |

Model file headers and installed profile provenance govern the used subset. Additional image components, separately licensed generators and future profiles require their own notice inventory when distributed.

The native bundle includes public SKY130A model/deck data only, Apache-2.0 notices and a provenance manifest. The original optional OSIC keyboard-hook source in the Magic RC is removed for portability; original and relocated hashes are recorded. Private PDKs and commercial binaries are never bundled.

CPython retains its PSF license in the interpreter distribution. The KLayout wheel retains its GPLv3 LICENSE and its corresponding source is freely available at https://github.com/KLayout/klayout/archive/refs/tags/v0.30.5.tar.gz. The MIT worker integration source is included and published at the release's exact Git revision. ngspice retains its component-specific COPYING and corresponding version-47 source is available at https://sourceforge.net/projects/ngspice/files/ng-spice-rework/47/ngspice-47.tar.gz/download. These source links accompany the native package download guide; MIT application licensing does not replace GPL or component-specific tool licenses.

Pinned download URLs, hashes, versions and binary/file inventory are recorded in scripts/native-runtime-lock.json, scripts/native-pdk-lock.json and each packaged native-runtime/manifest.json. Mac/Linux CPython uses the 20261009 python-build-standalone redistribution (https://github.com/astral-sh/python-build-standalone); its notices remain in the Python tree. Native binaries run in the authoritative worker process, separate from the Electron renderer. The optional Docker runner still uses the pinned IIC-OSIC image and its upstream component notices: https://github.com/iic-jku/IIC-OSIC-TOOLS.

Collaboration uses ws8.22.0 (MIT), Node24 built-in SQLite/crypto/HTTP, and no paid provider. The separate stdio agent adapter uses @modelcontextprotocol/sdk1.31.0 (MIT) and zod4.4.3 (MIT). Original installed license texts are copied into release/licenses. The cloud Node base image is fixed by digest; EDA tools remain in the separately maintained pinned upstream image.
