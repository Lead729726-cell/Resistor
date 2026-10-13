# Resistor · 8-bit SAR and bounded chip layouts

The SAR reference has editable SKY130 MOS circuits and 256 equal 400 fF
capacitor units. Its CDAC weights are 128:64:32:16:8:4:2:1 plus one dummy unit.
VREF, VCM, bias, supplies and the clock/control bridge are explicit external
testbench assumptions. The controller is real Yosys-synthesized RTL and an
editable CMOS connection graph.

## Use

1. Open **설계 도구 → 통합 설계 → 회로 · 연결 탐색**.
2. Read the circuit catalog and open **SAR ADC · 8개 블록 라이브러리**.
3. Create the eight blocks, then open the full ADC. Double-click ANALOG or
   CONTROL to inspect their children. Every child is a reusable circuit.
4. Run **Simulate** for actual charge-retaining ngspice decisions, followed by
   RTL / synthesized gates / CMOS graph replay. Inspect CODE, TOP, COMP,
   SAMPLE, supply current and reference current in the waveform viewer.
5. To create masks, select **샘플링 + CDAC + 비교기 코어**, request the physical
   core and enable the chip envelope. Full controller masks/timing are not
   implemented. Independently run DRC, LVS, PEX and post-layout simulation.
6. Set `sweep_codes` to 1 before creating a new analog-core reference to test
   all 256 bin centers. This is a static code test, not an INL/DNL or ENOB test.

## Circuit and equations

During acquisition SAMPLE is HIGH: each bottom plate tracks VIN and the top
plate tracks VCM. When SAMPLE falls, bottom switches select ground or VREF.
For ideal equal units and no parasitics:

`VTOP = VCM - VIN + VREF × trial / 256`

Comparator HIGH retains a trial bit when VIN exceeds the DAC trial. It starts
at bit 7 and makes eight comparisons. The control bridge reads the **actual
simulated comparator output**, not a quantized VIN. ngspice `stop`/`resume`
retains capacitor charge across decisions. Actual decision logs must reproduce
every trial, CODE and VALID in all three digital implementations.

Default VREF = 1.2 V, VCM = VDD/2, external BIAS = 0.9 V, acquisition = 2 µs,
bit settling = 2 µs. The nominal conversion interval is 18 µs (about 55.56 kS/s).
The comparator uses two real CMOS restoration stages after its first output
inverter. The external control bridge uses 200 Ω series resistance and 0.5 pF
loading per control (100 ps nominal RC plus actual gate load), avoiding an
unphysical ideal gate-voltage impulse. This is an explicit driver assumption,
not synthesized-controller transistor timing.
`LSB = VREF / 256 = 4.6875 mV`. Output bits are 8; ENOB is unmeasured.
The native simulator includes MOS charge injection, leakage and the installed
public models. Post-layout runs retain all extracted RC and document exact
series/parallel reductions; there is no RC deletion or voltage clamping.

[Analog Devices SAR architecture](https://www.analog.com/en/resources/technical-articles/successive-approximation-registers-sar-and-flash-adcs.html)
provides the charge-redistribution reference equation.
[ngspice documentation](https://ngspice.sourceforge.io/docs.html) describes
native transient continuation and model/control syntax.

## Chip area policy

New UI templates default to a **1,000 × 1,000 µm / 1 mm² envelope** with a
10 µm edge clearance. Width, height, maximum area and clearance are explicit
in µm / µm², with a 5 nm grid. Width × height must not exceed maximum area.

The bounded generator folds actual PCells into rows, retains indivisible
matched groups and uses M3 row rails and M4 trunks outside all PCells. The
final KLayout bbox includes routing and reachable hierarchy. It must fit the
envelope before the immutable revision is written. No geometry is clipped or
scaled. ABBA matching only verifies the nominal first spatial moment; it does
not certify dummies, guard rings, substrate isolation or statistical matching.

**칩 크기 · 현재 배치 경계 검사** previews actual dimensions and required space.
Applying a limit to an existing layout preserves its coordinates and requires
the current revision. Out-of-bounds rectangles, paths, instances, imports and
hierarchy changes are rejected before commit. Bundle import preserves the
policy; replacing a constrained project retains the destination constraint.
Original long-row references and user designs are retained. Generate a new
bounded physical template to repack a source circuit.

## Reproduction and evidence

- `node scripts/bounded-sar-library.mjs`: eight bounded physical references,
  separate DRC/LVS/PEX/pre/post native runs, exports and source hashes.
- `node scripts/sar-code-sweep.mjs`: actual 256-bin-center native test.
- `python3 scripts/sar-controller-qa.py` inside the worker: 4,867 assertions in
  each RTL, gate and CMOS-graph implementation; reset, busy START handling,
  acquisition, every bit trial, all codes and VALID.
- `node scripts/chip-envelope-integration.mjs`: actual native persistence,
  rejected geometry rollback, revision conflicts and bundle preservation.
- `python3 -m unittest test_sar_adc test_floorplan`: hierarchy, equal physical
  units, invalid inputs, decision parser integrity and hierarchy envelope tests.

[Physical results](../examples/bounded-sar/evidence.json) record executed
status, current source hash, revision, tool logs and the actual envelope.
Previous failed executions remain under `examples/bounded-sar/history/`.

## Remaining qualification

The code criterion is ±1 output code at the configured static input points.
Complete INL/DNL transition searches, coherent-tone SINAD/ENOB, random mismatch
yield, reference-buffer design, dynamic comparator metastability, controller
transistor timing, pad/ESD rings, substrate isolation, density/antenna, EM/IR and
foundry approval remain separate qualification. An envelope is not a foundry
die or package specification. Apple Developer ID/notarization still requires
the owner's signing resources; native Mac CI and notarization are distinct.
