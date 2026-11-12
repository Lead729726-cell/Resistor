# Practical analog blocks: methods and model scope

Resistor Indust · reference review 2026-11-12. These are circuit-method references for independently authored blocks, not reproductions of vendor products or recent-paper performance. Numerical simulation results belong in the revision-bound QA report; this note makes no execution or PASS claim.

## Implemented building blocks

| Template | Circuit being developed | Method reference |
| --- | --- | --- |
| `sensor_current_tia` | Existing two-stage `SOC_OTA`, self-bias, current-input feedback resistor and capacitor | [TI SBOA122, pp. 2–6](https://www.ti.com/lit/an/sboa122/sboa122.pdf) |
| `adc_track_hold` | Complementary transmission gate, 10 pF ideal hold capacitor, CMOS OTA buffer | [Niknejad/Boser, EECS 240 Topic 18, slides 2–10, 20–27](https://rfic.eecs.berkeley.edu/courses/ee240sp06/pdf/topic18.pdf) |
| `sensor_schmitt` | `SOC_COMPARATOR`: five-MOS differential preamplifier and one CMOS output inverter, with resistive positive feedback | [TI SBOA313A, pp. 1–3](https://www.ti.com/lit/pdf/sboa313), [TI SCEA046B, pp. 1–2](https://www.ti.com/lit/pdf/scea046) |

## Model boundaries

The shared library uses `sky130_fd_pr__nfet_01v8` and **`sky130_fd_pr__pfet_01v8_hvt`**, not the standard-VT PMOS. [Official device documentation](https://skywater-pdk.readthedocs.io/en/main/rules/device-details.html) gives these model-valid terminal ranges:

| Model | VDS (V) | VGS (V) | VBS (V) |
| --- | --- | --- | --- |
| NMOS 1.8 V | 0 to 1.95 | 0 to 1.95 | −1.95 to +0.3 |
| PMOS 1.8 V high-VT | −1.95 to 0 | −1.95 to 0 | −0.1 to +1.95 |

These ranges describe model scope, not independently qualified absolute-maximum, ESD or lifetime ratings. Check actual terminal biases and source/drain orientation, including clock transients. Resistors, capacitors, stimuli and references are ideal unless an exported netlist explicitly instantiates a process model. A configured chip-envelope limit is not extracted layout area. The [public PDK status](https://skywater-pdk.readthedocs.io/en/main/status.html) distinguishes exploratory/test-chip use from a production-qualified release; no manufacturing signoff follows from these simulations.

## Current-input TIA

Define positive `I_PD` as current **entering the inverting summing node**. Under ideal feedback, `V_OUT = V_REF − I_PD R_F`. For small signals about the bias point:

```text
Z_F(s) = R_F / (1 + s R_F C_F)
Z_T(s) = −Z_F(s) / [1 + (1 + Z_F(s)/Z_S(s))/A(s)]
```

`R_F` is in Ω, `C_F` in F, `s` in s⁻¹, `Z_S` is the input-source impedance in Ω, and `A(s)` is dimensionless open-loop voltage gain. The passive feedback pole `1/(2πR_F C_F)` in Hz is not automatically the complete TIA bandwidth. TI's simplified design analysis assumes a dominant-pole amplifier; the two-stage OTA requires its own loop/stability evaluation. A photodiode current source plus input capacitance does not establish optical responsivity or dark-current behavior. `4k_B T/R_F` is the ideal resistor's input-referred current-noise PSD in A²/Hz; it is not a measured total-noise result. See [SBOA122](https://www.ti.com/lit/an/sboa122/sboa122.pdf).

## Transmission-gate acquisition and hold

For a constant input and a one-pole approximation, residual acquisition error is `ΔV(t) = ΔV(0) exp[−t/((R_SOURCE + R_ON) C_H)]`. A full-scale step settling within half an N-bit LSB therefore needs at least `(N+1) ln(2) (R_SOURCE+R_ON) C_H`; this is a derived budget, not an ADC ENOB measurement.

`v_n,rms = sqrt(k_B T/C_H)` estimates equilibrium sampled thermal noise; `ΔV_H = Q_INJECTED/C_H` and `ΔV_DROOP ≈ I_LEAK t_HOLD/C_H` identify hold-error mechanisms. Units are V, Ω, F, C, A, s and K; `k_B = 1.380649e−23 J/K`. The baseline explicitly connects an ideal 1 GΩ resistor from `HOLD` to `VCM`; reported droop includes this imposed leakage path and modeled MOS behavior, not an independently characterized process-leakage distribution. Complementary devices still have signal-dependent on-resistance, body effect, unequal charge partition and clock feedthrough. A noiseless deterministic transient does not measure kT/C noise; an OTA buffer adds its own errors. The baseline does not claim bootstrapping or bottom-plate cancellation. See [Berkeley Topic 18](https://rfic.eecs.berkeley.edu/courses/ee240sp06/pdf/topic18.pdf).

## Non-inverting hysteresis detector

Let `R_IN` connect input to the non-inverting node, `R_FB` connect the **actual feedback node** to it, and the inverting node be `V_REF`. With negligible input current, KCL at a transition gives:

```text
r = R_IN/R_FB
V_TRIP = (1+r) V_REF − r V_FB
V_H = (1+r) V_REF − r V_FB,L
V_L = (1+r) V_REF − r V_FB,H
V_HYS = V_H − V_L = r (V_FB,H − V_FB,L)
```

All voltages are in V; `r` is dimensionless. Use the feedback node's measured levels, not assumed supply rails or an unrelated buffer output. Offset, finite gain, buffer delay and reference/resistor errors shift thresholds. This is our KCL specialization of [TI SBOA313A's two-state method](https://www.ti.com/lit/pdf/sboa313); its open-drain product/pull-up values are not copied. The signal path uses the existing `SOC_COMPARATOR`: a five-MOS differential preamplifier followed by one two-MOS inverter, giving a non-inverting overall response. `SOC_OTA` appears only in the self-bias reference buffer for this template. The implemented architecture is not a six-transistor Schmitt core. Measure rising/falling trips, chatter and supply current separately. [SCEA046B](https://www.ti.com/lit/pdf/scea046) motivates those distinctions; its commercial input guarantees do not qualify this custom circuit.

## Evidence still required

Keep analytic estimates separate from native waveforms. Noise integration, mismatch/yield, full PVT and extracted-parasitic sweeps, ESD/latch-up, complete supply/driver power and foundry verification remain unverified unless a linked, revision-bound result explicitly records them. The ordinary simulation run, the scientific performance criterion and manufacturing qualification are different evidence layers.
