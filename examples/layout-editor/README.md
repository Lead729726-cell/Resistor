# Direct layout editing example

Open `direct-edit.register.zip` in Resistor 0.18.0 or later. This project was
created using the actual app, starting from **New project → Empty SKY130 layout**.

It contains a Metal 1 rectangle, a copied rectangle, a Metal 2 polygon, and a
200 DBU (0.2 µm) Manhattan Metal 1 route. The rectangle was edited to 4×2 µm,
moved with the M tool, deleted, restored, deleted by Redo, and restored again.
The screenshot shows revision 11. Coordinates use a 1 nm DBU and 5 DBU grid.

**This is an editing demonstration, not a circuit or a verified manufacturing
layout.** It has no simulation, DRC, LVS or PEX jobs. Separate native editor
verification in `../../docs/evidence/layout-editor/native.json` includes an
actual Magic DRC run on a different two-rectangle project.

- R: drag a rectangle or click two corners.
- P: click polygon vertices, then Enter.
- W: set conductor layer and width, click route points, then Enter.
- M: drag a shape. C: click the original and the new position.
- Select a rectangle to edit its coordinates, layer and Net in the inspector.
- Delete, Ctrl/⌘+Z, and Ctrl/⌘+Shift+Z manage edits.
- F fits the layout. Escape cancels a draft. Shortcuts require canvas focus.

GDSII and OASIS were exported through the actual KLayout worker and checked for
geometry and stable IDs. Adjacent `.mos.json` files retain app metadata.
Copying a mask does not copy circuit device identity or connectivity.
See [the complete drawing guide](../../docs/drawing-tools.md).
