# Analog SoC sensor-interface references

Resistor 0.21 improves seven editable SKY130 macros and actual public-PDK layouts.
The integrated circuit is a sensor interface with clocked one-bit output; ADC,
CPU, pad ring and a tapeout-ready complete SoC remain separate designs.

| Reference | Actual circuit | Measurement |
|---|---|---|
| `soc_bias` | NMOS diode/resistor bias, VDD/2 divider, decoupling, OTA VCM buffer | VCM and bias range |
| `soc_cascode_mirror` | Four-NMOS self-biased cascode mirror | Current/compliance DC sweep; external IREF |
| `soc_miller_ota` | Equal-width ABBA input units + balanced 2-MOS output + 5pF/5k Miller network | Open-loop gain, phase margin, native noise and mismatch |
| `soc_pga` | Fixed ×2/×8 branches, CMOS voltage selector and output OTA buffer | Actual transfer, sine-fit residual |
| `soc_filter2` | Two RC poles, each followed by a real OTA buffer | Gain and −3dB bandwidth |
| `soc_tia` | Virtual VCM summing node with parallel R/C feedback | Actual input-current/output-voltage transfer |
| `soc_sensor_afe` | Bias → PGA → filter → comparator → reset MUX → DFF | Gains and clocked decisions from actual OUT−VCM |

## Use

Open **설계 도구 → 통합 설계 → 회로 · 연결 탐색 → 회로 template 지원 범위 읽기**.
**7개 SoC 회로 생성 · 센서 AFE 열기** creates separate hierarchical projects.
**기존 SoC 블록 프로젝트 읽기 → SoC 블록 열기** reopens them. Schematic Hierarchy
exposes OTA input stages, feedback paths and actual INV/MUX/DFF.

For a layout, select the reference in the same dialog, enable **실제 physical core
요청** and create a separate physical project. Real poly/MIM replaces ideal R/C,
with a sizing audit; physical layout and schematic are flattened together.
Original hierarchy remains in its separate project. Run DRC, LVS, PEX and
pre/post simulation separately, or use **회로 → 물리 검증**.

The example ZIP includes hierarchical and physical projects, GDS/OASIS, SPICE,
waveform CSVs and actual job receipts. Nominal seven-macro physical verification
is distinct from model-corner functional testing and manufacturing approval.

## Equations and assumptions

PGA: `A=1+Rf/Rg`; fixed branches use 10k/10k (×2) and 70k/10k (×8).
A transmission gate selects the branch voltage into a high-impedance MOS input;
an additional unity OTA buffers OUT. Switch resistance now affects acquisition
settling rather than the feedback ratio. Three OTAs cost more area and current
than the old single-OTA PGA. The gain criterion is tightened from 8% to 3%.

Filter: ideal `H(s)=1/(1+sRC)^2`, `fp=1/(2πRC)`,
`f−3dB=fp·sqrt(sqrt(2)−1)`. Default R=40k, C=20pF. Finite OTA transfer and
extracted parasitics change the measured response.

TIA: ideal `Vout−VCM=Iin·Rf/(1+sRfCf)` for sensor current flowing from IIN
toward ground, measured with a real zero-volt probe. Rf=100k, Cf=1pF.
Sensor capacitance and noise performance are not specified by this test.

OTA: `PM=180°+phase(A(jωu))`, at the first downward unity crossing.
Phase is unwrapped before interpolation. External 1G/1F DC servo biases the
device while breaking AC feedback; external load is 1pF. This is one nominal
open-loop characterization, not a return-ratio test of every feedback/load.

Cascode compliance is the first swept point with <5% current error; it is not a
guaranteed continuous full-range specification. The named criterion checks all
sampled points from 1.5V through VDD.

Sine amplitudes use uniform resampling and least-squares sine/DC fitting, avoiding
adaptive simulator step-density bias. Mean power uses time-weighted integration
with interpolated window boundaries. Clocked AFE checks compare DATA 200ns after
each rising edge against actual OUT−VCM at that edge; ±25mV threshold ambiguity
is explicitly excluded. At least 50 unambiguous samples must all agree.
Reset is a synchronous data MUX, not an asynchronous reset or CDC synchronizer.

BIAS=0.9V is external for individual signal macros. The bias macro and integrated
AFE generate their own BIAS/VCM. Supply, stimulus, clock and output load are
external owned fixtures. VCM is ratiometric VDD/2, not a precision bandgap.

## Evidence and limits

[Physical results](../examples/analog-soc/evidence.json),
[model-corner sweep](../examples/analog-soc/pvt.json) retain failures as well as passes.
Seven circuits pass nominal TT/27°C/1.8V DRC/LVS/PEX/pre/post named criteria.
The schematic AFE sweep executes 18 MOS-corner/temperature/voltage combinations
and passes the new 3% gain criterion at all 18 points. The prior 9 failures remain
in [v0.20 history](../examples/analog-soc/history/v0.20.0/pvt.json).
RC remains typical; source and post-PEX qualifications are reported separately.

Layouts deliberately use spacious one-row PCells. Deterministic interval-heap
rail coloring is O(n log n) and optimal for the defined interval allocation,
not a global detailed chip router. Flattening rejects ambiguous device/net names,
recursive cells, >64 levels and >100000 primitives. Physical conversion/routing
enforces 512 primitives, including already modeled devices, and rejects declared
ports absent from the actual primitive graph. Grid and engine APIs are preserved.

The OTA inputs use two 5µm units per side in an ABBA row, preserving 10µm total
width per input. The physical routing report computes both centroids from actual
generated gate anchors. This cancels the nominal first spatial moment; dummies,
guard rings, stress and substrate coupling have not been qualified.

## Native noise and mismatch

Select a SoC Miller OTA project and open **OTA 잡음 · 편차** in integrated tools.
The dedicated unity follower fixture uses 1pF external load and 0.9V BIAS.
Noise uses ngspice SPARSE, 10Hz–10MHz and V/√Hz vectors. Native integrated RMS
is independently checked by integrating squared density. Mismatch enables only
the installed public model's `MC_MM_SWITCH` (global process switch stays zero),
sets each seed **before** parsing AGAUSS models, and performs 4–64 actual OP
solves. Reusing the same seed/model/circuit permits reproducibility checks.
Thresholds are explicit engineering limits, not foundry acceptance criteria.
Canceled, incomplete, inactive-mismatch or nonfinite data cannot receive PASS.
Physical projects may run the same fixture with actual PEX and exact RC reduction.

Reliability, global process Monte Carlo, substrate coupling, guard rings,
full-chip antenna/density, ESD, EM/IR, packaging and foundry signoff remain separate
work. Existing ADC/CPU/LDO/PLL examples have not been jointly verified as one
finished SoC. Apple notarization requires the owner's Developer ID credentials;
Mac native CI execution is distinct from full Docker EDA execution on a user's Mac.

Reproduce with `node scripts/analog-soc-library.mjs` and
`node scripts/analog-soc-qa.mjs`; detached probe/PVT scripts never open the live DB.
Background: [Berkeley Two-Stage OTA Design](https://rfic.eecs.berkeley.edu/courses/ee240sp06/pdf/topic13.pdf).
Device sizes and measurements come from actual Resistor circuits, not the lecture.
Noise, source-before-seed ordering and output units follow the
[ngspice manual](https://ngspice.sourceforge.io/docs/ngspice-manual.pdf).
