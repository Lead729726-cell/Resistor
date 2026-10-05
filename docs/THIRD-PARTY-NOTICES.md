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

The following source notices were inspected on 2026-09-30. These binaries remain in the external pinned Docker image; they are not redistributed in our Windows package. ngspice has component-specific licenses, so its COPYING file must remain available rather than assigning one license to the whole executable.

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

EDA binaries, model files and rule decks are not bundled into the Windows application. The checked-in example GDS files include public SKY130 geometry; `examples/sky130/NOTICE.txt` identifies the sources and additions, and the Apache-2.0 license is preserved beside them. The Docker runner uses the externally maintained IIC-OSIC tools image locked by digest. Its tools include KLayout, Magic, Netgen, ngspice and Xschem; these retain their respective licenses, source references and image distribution notices. Upstream image: https://github.com/iic-jku/IIC-OSIC-TOOLS. Tool/PDK versions and installed file hashes are recorded by doctor/run manifests. The full SKY130 profile remains in the image and is not renamed or copied as a private PDK.

Using subprocesses does not waive the terms of any tool or PDK. This release ships our integration source and renderer. Rebundling EDA binaries, changing image distribution, including a PDK in project export, or adding a private/commercial profile requires a separate review of that component's actual terms. A local reference does not grant redistribution rights. Unsupported private and commercial backends are not represented by surrogate open models.



Collaboration uses ws8.22.0 (MIT), Node24 built-in SQLite/crypto/HTTP, and no paid provider. The separate stdio agent adapter uses @modelcontextprotocol/sdk1.31.0 (MIT) and zod4.4.3 (MIT). Original installed license texts are copied into release/licenses. The cloud Node base image is fixed by digest; EDA tools remain in the separately maintained pinned upstream image.
