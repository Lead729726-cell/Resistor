# Analog SoC sensor-interface references

Resistor 0.20 adds seven editable SKY130 macros and actual public-PDK layouts.
The integrated circuit is a sensor interface with clocked one-bit output; ADC,
CPU, pad ring and a tapeout-ready complete SoC remain separate designs.

| Reference | Actual circuit | Measurement |
|---|---|---|
| `soc_bias` | NMOS diode/resistor bias, VDD/2 divider, decoupling, OTA VCM buffer | VCM and bias range |
| `soc_cascode_mirror` | Four-NMOS self-biased cascode mirror | Current/compliance DC sweep; external IREF |
| `soc_miller_ota` | 5-MOS differential input + balanced 2-MOS output + 5pF/5k Miller network | Open-loop gain and unwrapped phase margin |
| `soc_pga` | OTA, feedback resistors, CMOS gain-select transmission gate | Actual ×2/×8 transfer, sine-fit residual |
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

PGA: `A=1+Rf/Rg`; GAIN=1 uses 70k/10k (×8). GAIN=0 uses
`Rf=70k || (70k/6 + R_on)`. The actual MOS switch resistance makes low gain
greater than ×2 and varies with voltage/process/temperature.

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
The separate AFE sweep executes 18 MOS-corner/temperature/voltage combinations:
9 pass, 9 fail the low-gain accuracy criterion. All failures are preserved.
Cold and 1.6V gain-select switch resistance is a measured limit; broad PVT
performance is not qualified. RC remains typical in that sweep and PEX is absent.

Layouts deliberately use spacious one-row PCells. Deterministic interval-heap
rail coloring is O(n log n) and optimal for the defined interval allocation,
not a global detailed chip router. Flattening rejects ambiguous device/net names,
recursive cells, >64 levels and >100000 primitives. Physical conversion/routing
enforces 512 primitives, including already modeled devices, and rejects declared
ports absent from the actual primitive graph. Grid and engine APIs are preserved.

Mismatch, thermal/flicker noise, reliability, common-centroid matching, substrate
coupling, guard rings, full-chip antenna/density, ESD, EM/IR, packaging and foundry
signoff remain separate work. Existing ADC/CPU/LDO/PLL examples have not been
jointly verified as one finished SoC.

Reproduce with `node scripts/analog-soc-library.mjs` and
`node scripts/analog-soc-qa.mjs`; detached probe/PVT scripts never open the live DB.
Background: [Berkeley Two-Stage OTA Design](https://rfic.eecs.berkeley.edu/courses/ee240sp06/pdf/topic13.pdf).
Device sizes and measurements come from actual Resistor circuits, not the lecture.
