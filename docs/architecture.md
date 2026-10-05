# 레지스터 architecture

Windows Electron renderer → sandbox preload → desktop main → authenticated loopback RPC → Docker Linux worker → KLayout / ngspice / Magic / Netgen / Xschem. Browser development uses the same renderer and a same-origin proxy. Worker credentials remain on the server.

Shared projects use the Node HTTP/WebSocket hub. Remote browsers load the compiled web application and need no local EDA installation. The Linux Compose stack has a private EDA network, persistent native/cloud/backup volumes and a loopback hub port for an HTTPS reverse proxy. External VM, DNS and TLS are not provisioned. Paid Supabase creation was deferred by the user.

## Authoritative data

KLayout owns integer DBU geometry. Each accepted edit stores an immutable OASIS/project snapshot and advances the revision, including undo/redo. Native schematic IR contains device pins, geometric wires, explicit junctions and hierarchical cells/blocks. Crossings stay separate unless connected by an explicit junction or a valid endpoint. Recursive validation and native SPICE use the same connectivity graph. Saved testbench settings select supported analyses, public corners, temperature and supply.

SQLite stores history, run indexes and command receipts. Jobs capture input revision and dependency fingerprint, retaining actual tool versions, argument arrays, logs, netlists, waveforms, markers, outputs and hashes. Execution status, analysis result and freshness are independent. Violations are completed/fail; engine/parser failure is failed/unknown. Edits or changed model/deck dependencies mark old results stale. Interrupted native jobs/experiments retain evidence and become failed/unknown.

## Shared editing

The hub stores password hashes, hashed sessions/invites, room roles and a persistent command ledger. It checks membership and artifact/run ancestry for each authorized operation. Shared projects are independent native clones, preserving the local source. Commands carry UUID and base revision; per-room queues serialize commits. Known disjoint edits can rebase; overlapping, global or untracked changes return conflicts. Native receipts reconcile interrupted responses exactly once. Uncertain/conflicting commands remain available for explicit review and are never silently replayed.

WebSockets authenticate in the first frame and publish presence, revisions and job changes. Role changes close the affected connection; reconnect refreshes the role. The editor preserves dirty drafts during peer updates and blocks edits while a room activates. Actual GDS/OAS uploads and authenticated binary downloads replace remote filesystem paths.

## Geometry and rendering

Signed decimal coordinates travel over the protocol. The installed KLayout build enforces int32 bounds and manufacturing grid. Polygons with holes, paths, labels, pins, cells and transformed arrays retain stable identities. GDS/OAS round trips compare normalized topology/hierarchy; optional metadata uses a hash-matched sidecar.

Three.js subtracts an exact BigInt origin before GPU float conversion. Bounded scenes use a region-local origin, preserving fine DBU at distant scopes. Cached exact geometry, spatial instancing, progressive work and explicit shape/region controls support large sources. Total and returned counts remain visible. The 100k benchmark measures a 2k exact visible subset on software rendering; full 100k simultaneous 30FPS remains unverified.

2D/3D share picking, locks/visibility, hierarchy focus, clipping and exact caps including holes. Colors, illustrative heights and raster resolution do not affect verification geometry. PNG/visual GLB are separate from manufacturing GDS/OAS. Native RC inspection reports actual electrical elements; exact shape correspondence stays unknown where extraction does not provide it.

## Optimizers and agent boundary

Grid, random and seeded univariate Parzen TPE produce bounded MOS W/L proposals. Each trial gets a separate native candidate and runs actual PCell, DRC, LVS and DC gates before receiving a feasible score. Trial, concurrency and wall-time limits apply. Candidates, failed gates, cancellation, comparison and promotion are persisted.

The stdio MCP adapter exposes twelve typed tools with revision/receipt checks and job budgets. It accepts no arbitrary shell, private PDK code or credentials. External LLM/provider accounts are unconfigured. Only installed trusted public-profile scripts execute. Additional profiles, general analog routing, physical reconstruction and TCAD remain unsupported boundaries; public deck passes are not foundry signoff.