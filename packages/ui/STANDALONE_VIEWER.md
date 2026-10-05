# Local GDS viewer

Open `?mode=viewer` to mount the independent viewer. It reads user-selected files with browser File APIs; loading, inspecting, applying PDK layers, querying cells / bounds, importing current results and exporting a viewer file use no native RPC, authentication, collaboration or server upload.

- GDSII `.gds` / `.gdsii`: 64 MiB maximum, root / child cell selection, integer DBU bounds and up to 100,000 displayed shapes. The original bytes remain available for cell and scope queries.
- PDK layers: KLayout `.lyp`, layer-stack JSON, or the bundled public SKY130 display profile. Source notes distinguish display heights from process dimensions. Models and physical verification decks do not execute here.
- Current JSON: validated supplied conventional branch-current samples and explicit paths. Positive, negative and zero amperes retain their signs and SI units. GDS alone supplies no current. Mismatched project / revision results remain numerical until the user explicitly confirms association with the current GDS; the added note preserves original identity and says the layout/hash was not verified.
- `.register-view.json`: scene, PDK, current result, display settings, source identity and optional original GDS bytes. Including the GDS preserves cell / scope queries after reopening. A scene-only bundle can query only its exported subset. Exported scene and current-result identity / revision remain intact.
- Native mutation tools are disabled; imported files are never overwritten. Invalid files show an error and preserve the previously loaded view.

## Focused browser verification

With direct Vite running, execute:

```powershell
node packages/ui/tests/standalone-viewer-smoke.mjs
```

The focused run passed using the actual bundled `examples/sky130/inverter.gds`: 90 / 90 shapes, a child-cell geometry query, exact outside bounds followed by full-range restore, built-in SKY130 mapping, actual public LYP import, 2D / 3D and disabled editing tools. The imported current values are explicitly labeled visualization test fixtures; this check does not claim a simulator execution. It proves signed and zero values, no arrows before explicit association, a mapped arrow after association, bundle save / reopen with original GDS and display settings, and previous-scene preservation after a corrupt GDS upload. Browser errors and native / auth / event requests were both zero.

Evidence: `qa/standalone-viewer-evidence.json`, `qa/register-local-viewer.png`, and `qa/standalone.register-view.json`. Parent component checks separately verify real native-current exports and packaged cold viewer startup without Docker.
