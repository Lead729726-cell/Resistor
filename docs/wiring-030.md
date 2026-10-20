# Resistor 0.30 wiring patch

Edition: shared editor in Resistor Edu and Resistor Industry. Edu also includes revision-aware project learning dashboard, read reconnection and conflict-safe learning drafts from the Edu branch.

## Use

Open Schematic. Click a terminal to begin, optionally click blank space for bends, then click a different terminal to save. The guide names the source and target; blue marks the source and green the current target. These are editing previews, not DRC/LVS results. A different existing net name is red and rejected without a write. The engine still checks the complete route and unintended contacts.

- Space changes bend direction. Backspace or Previous point removes the last waypoint click.
- Esc, right-click or Cancel discards the preview without a project mutation.
- Explicit pin/net mode starts on an actual pin and ends on an actual pin. Its Finish button stays disabled until the endpoint is selected; clicking that pin saves directly.
- Geometric mode retains standalone wire drawing and explicit junctions. A crossing alone is not a junction.
- Enter on a focused terminal offers keyboard wiring. Coincident terminals are not automatically guessed.

## Evidence

QA uses a separate Edu lesson, never student submissions. In the real local app, two previously empty resistor pins acquired the same N_1 node in one engine mutation; A to Y was blocked before submission. Cancel preserved revision; Undo removed the wire. Core tests include transformed terminal positions, ambiguous overlap, distance thresholds, named-net conflicts, geometry and units.

Native installation QA additionally launches each built installer, exercises cancellation and pin-to-pin wiring on a disposable project, and checks the persisted engine revision/nets. Release receipts distinguish build, actual installation/launch and actual ngspice/KLayout checks. No foundry signoff, matching or parasitic performance is inferred from a wire preview.
