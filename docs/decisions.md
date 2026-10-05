# Architecture decisions

2026-09-30, client timezone Asia/Seoul.

## ADR-001 — Container runner

Docker Desktop's Linux engine is available. A normal Linux WSL distro is absent; the only WSL distro is docker-desktop. Reuse the already installed IIC-OSIC image by immutable digest instead of modifying other projects' workers. Bind only 127.0.0.1:18765, because 8765 belongs to an existing service. PDK model and deck files stay inside the tool image; public example GDS geometry is exported with source notices. Every real run records installed tools, PDK commit and input hashes.

## ADR-002 — Initial Windows shell

The prompt recommends Tauri 2 + Rust but permits an evidence-backed change. This machine has Node 24.16.0, no cargo/rustc on PATH or in the default cargo directory, and no detected Microsoft Visual Studio C++ installation. [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) require Rust and MSVC on Windows. This initial release uses pinned Electron 44.5.0 to build and verify an executable without changing the user's system toolchain. This is a compatibility decision, not a measured claim that Electron is faster or smaller. A later Tauri port is a tracked option; no uncompiled Rust scaffold is presented as a verified desktop application.

Renderer is sandboxed, Node integration disabled, context isolation enabled, permission requests denied, navigation restricted, and the preload exposes one RPC function. Token and filesystem/process access stay in the main process. This follows [Electron's security guidance](https://www.electronjs.org/docs/latest/tutorial/security). The same React UI runs in development through an origin-checked Vite loopback proxy.

## ADR-003 — Single layout authority

The Python KLayout database owns design geometry. UI coordinates are render data; all edits go through typed worker transactions. IPC coordinates use decimal strings. GPU coordinates subtract a local origin. Illustrative mask heights do not imply physical process reconstruction or TCAD. Physical stack thickness remains unknown unless a source is attached.

## ADR-004 — Baseline layout scope

Use a public installed SKY130 standard-cell inverter with actual PDK tap cells as the first integrated circuit, and the PDK's actual Magic MOS generator for characterization geometry. An isolated inverter initially produced native missing-well-tap violations; add real public tapvpwrvgnd cells rather than hiding those markers. A schematic W/L change and a layout change are independent until a tested generator regenerates both views; LVS must expose the mismatch. Broader analog placement, matching, and routing remain future templates with their own DRC/LVS regression gates.
