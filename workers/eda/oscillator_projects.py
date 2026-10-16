"""Editable SKY130 oscillators. Outputs come from MOS solves, never replayed clocks.

Ideal external R/C and deterministic startup seeds are explicit. No physical,
phase-noise, sensor calibration or silicon qualification is implied.
"""
import math
from pathlib import Path
from statistics import median

from geometry import EDAError
from chip_references import cell, element, mos, passive, block
import digital_units
import signal_metrics as M

COMMON = ['VPWR', 'VGND']
CATALOG = {
    'osc_ring5': dict(name='발진 · 5단 CMOS 링 클록', ports=['OUT', *COMMON],
        parameter_defaults={'stage_F': 2e-12}, category='발진기·센서',
        scope='10개 실제 SKY130 MOS · 5단 지연 링 · 외부 클록 없음 · 이상적 단계 부하',
        targets=['발진 시작과 5개 단계 파형', '실제 주파수·듀티·단계 지연', '부하와 PVT에 따른 변화']),
    'osc_rc_sensor': dict(name='센서 · 정전용량 → 주파수', ports=['OUT', 'CAP', *COMMON],
        parameter_defaults={'timing_Ohm': 100000., 'sense_F': 10e-12}, category='발진기·센서',
        scope='6개 실제 MOS + 저항 양의 피드백 · 이상적 센서 C · 외부 클록 없음',
        targets=['CAP 충·방전과 출력 전환', 'C 변화에 따른 주파수 변화', '실제 스위칭 전압과 공급 전력']),
    'osc_beat': dict(name='센서 · 두 링 발진기의 비트 검출', ports=['REF', 'SENSE', 'XOR', 'OUT', *COMMON],
        parameter_defaults={'stage_F': 2e-12, 'detune_ratio': .15, 'filter_Ohm': 20000., 'filter_F': 5e-12},
        category='발진기·센서', scope='독립 5단 링 2개 + 실제 CMOS XOR + 이상적 RC · Δf 읽기',
        targets=['REF와 SENSE의 독립 주파수', '저역통과 후 비트 주파수', '하위 셀과 주파수 차 비교']),
    'osc_burst': dict(name='저전력 · 이벤트 구동 버스트 클록', ports=['EN', 'OUT', *COMMON],
        parameter_defaults={'stage_F': 2e-12}, category='발진기·센서',
        scope='NAND + 인버터 4단 링 · 외부 EN 2개 구간 · 발진 출력은 실제 MOS 해석',
        targets=['EN에 따른 시작·정지·재시작', '켜진 구간 주파수와 꺼진 구간 정지', '구간별 공급 전력 비교']),
}
for row in CATALOG.values():
    row.update(analyses=['tran'], physical_status='not-generated',
        model_scope='SKY130 MOS with ideal external R/C; deterministic transient, no noise/jitter qualification')


def parameters(kind, values):
    if 'stage_F' in values and not 50e-15 <= values['stage_F'] <= 10e-12:
        raise EDAError('PARAMETER_RANGE', 'Oscillator stage capacitance must be 50fF..10pF.')
    if kind == 'osc_rc_sensor':
        if not 10000 <= values['timing_Ohm'] <= 1e6 or not 1e-12 <= values['sense_F'] <= 100e-12:
            raise EDAError('PARAMETER_RANGE', 'Sensor R must be 10k..1M ohm and C 1..100pF.')
    if kind == 'osc_beat' and not .05 <= values['detune_ratio'] <= .3:
        raise EDAError('PARAMETER_RANGE', 'Beat capacitance detuning must be 5..30 percent.')
    return values


def settings(kind, values):
    # Scale the observation window with the physical timing component, not with
    # a target output clock. Slow/failed candidates still fail measured criteria.
    scale = values.get('stage_F', 2e-12) / 2e-12
    duration = (8e-6 if kind == 'osc_burst' else 2e-6) * scale
    if kind == 'osc_rc_sensor':
        duration = min(1e-3, 40 * values['timing_Ohm'] * values['sense_F'])
    # Keep the complete voltage/current result below the bounded loopback API
    # budget. ngspice still takes smaller adaptive steps at MOS transitions.
    return dict(analysis='tran', duration_s=duration, step_s=duration / (4000 if kind=='osc_beat' else 10000))


def inverter(ir, name, a, y, x=0, y0=0):
    for suffix, kind, width in [('P', 'pmos', 8.), ('N', 'nmos', 4.)]:
        mos(ir, name + suffix, kind, y, a, 'VPWR' if kind == 'pmos' else 'VGND', width, .15)
        ir['devices'][-1].update(x=180 + x, y=160 + y0 + (140 if kind == 'nmos' else 0))


def ring(cap, gated=False):
    ports = (['EN'] if gated else []) + ['OUT', *COMMON]
    ir = cell(ports)
    if gated:
        lib = digital_units.make_library(1)
        ir['cells'] = {'NAND2': lib['NAND2']}
        block(ir, 'ENABLE_GATE', 'NAND2', lib['NAND2']['ports'], {'A0': 'OUT', 'A1': 'EN', 'Y': 'Q0'})
        ir['devices'][-1].update(x=180, y=220)
    for i in range(5):
        out = f'Q{i}' if i < 4 else 'OUT'
        if not gated or i:
            inverter(ir, f'INV{i}', 'OUT' if i == 0 else f'Q{i-1}', out, i * 260)
        passive(ir, f'C_STAGE{i}', 'capacitor', out, 'VGND', cap)
        ir['devices'][-1].update(x=180 + i * 260, y=480)
    return ir


def schematic(kind, values):
    if kind in ('osc_ring5', 'osc_burst'):
        ir = ring(values['stage_F'], kind == 'osc_burst')
    elif kind == 'osc_rc_sensor':
        ir = cell(CATALOG[kind]['ports'])
        for i, (a, y) in enumerate([('SUM', 'MID'), ('MID', 'HYST'), ('HYST', 'OUT')]):
            inverter(ir, f'INV{i}', a, y, i * 300)
        for name, a, b, value in [('R_INPUT', 'CAP', 'SUM', 10e6),
                                  ('R_FEEDBACK', 'HYST', 'SUM', 20e6),
                                  ('R_TIMING', 'OUT', 'CAP', values['timing_Ohm'])]:
            passive(ir, name, 'resistor', a, b, value)
        passive(ir, 'C_SENSOR', 'capacitor', 'CAP', 'VGND', values['sense_F'])
        for i, d in enumerate(ir['devices'][6:]):
            d.update(x=180 + 300 * i, y=520)
    else:
        ir = cell(CATALOG[kind]['ports'])
        lib = digital_units.make_library(1)
        ir['cells'] = {'NAND2': lib['NAND2'], 'XOR2': lib['XOR2'],
            'REFERENCE_RING': ring(values['stage_F']),
            'SENSOR_RING': ring(values['stage_F'] * (1 + values['detune_ratio']))}
        for name, child, mapping in [('REFERENCE', 'REFERENCE_RING', {'OUT': 'REF'}),
                                     ('SENSOR', 'SENSOR_RING', {'OUT': 'SENSE'}),
                                     ('PHASE_DETECTOR', 'XOR2', {'A': 'REF', 'B': 'SENSE', 'Y': 'XOR'})]:
            block(ir, name, child, ir['cells'][child]['ports'], mapping)
        passive(ir, 'R_ENVELOPE', 'resistor', 'XOR', 'OUT', values['filter_Ohm'])
        passive(ir, 'C_ENVELOPE', 'capacitor', 'OUT', 'VGND', values['filter_F'])
    ir.setdefault('cells', {})
    for i, port in enumerate(CATALOG[kind]['ports']):
        element(ir, 'PORT_' + port, 'port', {'P': port}, {})
        ir['devices'][-1].update(x=180 + i * 220, y=760)
    return ir


def spice_tb(p, folder, config, netlist, model_deck, sub):
    kind = p['design_template']['id']
    supply = config['supply_V']
    if supply < 1.5:
        raise EDAError('STIMULUS_RANGE', 'These SKY130 oscillator references require 1.5..1.8V.')
    duration = config['duration_s']
    rows = [f'Resistor actual oscillator {kind}', '.options method=gear maxord=2',
        f'.include "{model_deck}"', '.option scale=1e-6', f'.include "{netlist}"',
        f'.temp {config["temperature_C"]}', 'VGND VGND 0 0', f'VDD VPWR VGND {supply:.12g}']
    names, vectors, units = ['OUT', 'supply_current'], ['v(OUT)', '-i(VDD)'], ['V', 'A']
    def probe(name, vector):
        names.append(name); vectors.append(vector); units.append('V')
    if kind == 'osc_rc_sensor':
        rows += ['.ic v(CAP)=0 v(xu.HYST)=0']
        for name, vector in [('CAP', 'v(CAP)'), ('HYST', 'v(xu.HYST)'), ('SUM', 'v(xu.SUM)')]:
            probe(name, vector)
    elif kind == 'osc_beat':
        for instance, phase in [('REFERENCE', .1), ('SENSOR', .2)]:
            rows += [f'.ic v(xu.{instance}.Q0)={supply*phase:.12g} v(xu.{instance}.Q1)={supply*.9:.12g}']
        for name in ['REF', 'SENSE', 'XOR']:
            probe(name, f'v({name})')
    else:
        rows += [f'.ic v(xu.Q0)={supply*.1:.12g} v(xu.Q1)={supply*.9:.12g} v(OUT)={supply*.2:.12g}']
        if kind == 'osc_burst':
            points = [(0, 0), (.05, 0), (.0501, supply), (.35, supply), (.3501, 0),
                      (.5, 0), (.5001, supply), (.8, supply), (.8001, 0), (1, 0)]
            rows += ['VEN EN VGND PWL(' + ' '.join(f'{t*duration:.12g} {y:.12g}' for t, y in points) + ')']
            probe('EN', 'v(EN)')
        for i in range(4):
            probe(f'Q{i}', f'v(xu.Q{i})')
    rows += ['XU ' + ' '.join(sub) + ' ' + p['cell'], '.control', 'set num_threads=1',
        'set numdgt=17', 'set noaskquit', 'set wr_singlescale', 'set wr_vecnames',
        f'tran {config["step_s"]:.12g} {duration:.12g} uic']
    rows += [f'let mos_wave_{i} = {vector}' for i, vector in enumerate(vectors)]
    rows += ['wrdata waveform.dat ' + ' '.join(f'mos_wave_{i}' for i in range(len(vectors))),
             'write waveform.raw all', 'quit', '.endc', '.end']
    dest = Path(folder) / 'testbench.spice'
    dest.write_text('\n'.join(rows) + '\n')
    return dest, names, units, 's', 'time'


def crossings(wave, threshold, start, end, rising=True):
    points = M.window(wave, start, end)
    result = []
    for (a, u), (b, v) in zip(points, points[1:]):
        if (u < threshold <= v) if rising else (u > threshold >= v):
            result.append(a + (threshold - u) * (b - a) / (v - u))
    return result


def cycle_metrics(wave, threshold, start, end, hysteresis_V=0.):
    """Interpolated complete cycles; exact clipped duty per sampled segment."""
    M.validate_wave(wave)
    if any(b <= a for a, b in zip(wave['x'], wave['x'][1:])):
        raise EDAError('INVALID_WAVEFORM', 'Oscillator measurements require strictly increasing sample times.')
    if not math.isfinite(hysteresis_V) or hysteresis_V < 0:
        raise EDAError('INVALID_THRESHOLDS', 'Crossing hysteresis must be finite and nonnegative.')
    edges = crossings(wave, threshold, start, end)
    if hysteresis_V:
        # A filtered XOR still has carrier ripple. Re-arm only below the low
        # threshold and count a linearly interpolated high crossing once.
        low, high = threshold-hysteresis_V, threshold+hysteresis_V
        points = M.window(wave,start,end)
        edges=[];armed=bool(points) and points[0][1] <= low
        for (a,u),(b,v) in zip(points,points[1:]):
            if v <= low:armed=True
            if armed and u < high <= v:
                edges.append(a+(high-u)*(b-a)/(v-u));armed=False
    if len(edges) < 4:
        return dict(available=False, complete_cycles=max(0, len(edges) - 1), frequency_Hz=None, duty=None)
    periods = [b - a for a, b in zip(edges, edges[1:])]
    first, last = edges[0], edges[-1]
    high = 0.
    points = M.window(wave, first, last)
    for (a, u), (b, v) in zip(points, points[1:]):
        if u >= threshold and v >= threshold:
            high += b - a
        elif (u < threshold) != (v < threshold):
            cross = a + (threshold - u) * (b - a) / (v - u)
            high += b - cross if v >= threshold else cross - a
    # Large holes cannot masquerade as a well sampled periodic signal.
    largest_step = max((b - a for (a, _), (b, _) in zip(points, points[1:])), default=math.inf)
    resolved = largest_step <= min(periods) / 8
    return dict(available=resolved, complete_cycles=len(periods), frequency_Hz=len(periods)/(last-first) if resolved else None,
        duty=high/(last-first) if resolved else None, period_min_s=min(periods), period_max_s=max(periods),
        deterministic_period_span_s=max(periods)-min(periods), max_sample_step_s=largest_step,
        crossing_threshold_V=threshold, crossing_hysteresis_half_width_V=hysteresis_V,
        period_scope='Deterministic transient only; not random jitter or phase noise.')


def rc_period(resistance, capacitance, low, high, drive_low, drive_high):
    """Ideal unloaded Schmitt RC reference, not the MOS circuit's exact period."""
    if not all(math.isfinite(v) for v in [resistance, capacitance, low, high, drive_low, drive_high]) or not (
            resistance > 0 and capacitance > 0 and drive_low < low < high < drive_high):
        raise EDAError('INVALID_THRESHOLDS', 'RC reference requires positive R/C and Vlow < VL < VH < Vhigh.')
    return resistance * capacitance * (math.log((drive_high-low)/(drive_high-high)) +
                                     math.log((high-drive_low)/(low-drive_low)))


def measurements(p, run, config):
    kind = p['design_template']['id']
    v = p['design_template']['parameters']
    waves = {w['name']: w for w in run.get('waveforms', [])}
    m = run.setdefault('measurements', {})
    checks = []
    supply = config['supply_V']
    duration = config['duration_s']
    start, end = duration * .4, duration
    def check(name, passed, observed=None):
        checks.append(dict(name=name, pass_=bool(passed), observed=observed))
    for w in waves.values():
        M.validate_wave(w)
    out = waves.get('OUT')
    # UIC starts at the first positive solver timestep, not a fabricated t=0
    # sample. Require that initial gap to fit within the requested max step.
    complete = (out is not None and 0 <= out['x'][0] <= config.get('step_s',duration/40000)
                and bool(M.window(out,out['x'][0],end)))
    check('Complete requested transient interval', complete, out['x'][-1] if out else None)
    required = {'OUT', 'supply_current'} | ({'REF', 'SENSE', 'XOR'} if kind == 'osc_beat' else
        {'CAP', 'HYST', 'SUM'} if kind == 'osc_rc_sensor' else {'EN'} if kind == 'osc_burst' else set())
    check('Required actual node and current traces present', required <= waves.keys(), len(required & waves.keys()))
    if complete and required <= waves.keys():
        power = M.supply_metrics(waves['supply_current'], start, end, supply)
        m['supply_observation'] = power
        if power['available']:
            m.update(average_supply_power_W=power['average_power_W'], average_supply_current_A=power['average_current_A'])
        if kind == 'osc_burst':
            windows = [('enabled_first', .1, .3), ('disabled_middle', .4, .48),
                       ('enabled_again', .55, .75), ('disabled_final', .85, 1)]
            for label, a, b in windows:
                a *= duration; b *= duration
                info = cycle_metrics(out, supply / 2, a, b)
                points = M.window(out, a, b)
                if label.startswith('enabled'):
                    check(label + ' has at least 3 resolved cycles', info['available'], info['complete_cycles'])
                else:
                    quiet = bool(points) and all(y >= .7*supply for _, y in points)
                    check(label + ' is held HIGH', quiet, min((y for _, y in points), default=None))
                m[label] = dict(cycles=info, power=M.supply_metrics(waves['supply_current'], a, b, supply))
            m['output_frequency_Hz'] = m['enabled_first']['cycles']['frequency_Hz']
        else:
            if kind == 'osc_beat':
                for name in ('REF', 'SENSE'):
                    info = cycle_metrics(waves[name], supply/2, start, end)
                    m[name.lower() + '_cycles'] = info
                    check(name + ' has at least 3 resolved cycles', info['available'], info['complete_cycles'])
                f1, f2 = (m[n + '_cycles']['frequency_Hz'] for n in ('ref', 'sense'))
                m['difference_frequency_Hz'] = abs(f1-f2) if f1 and f2 else None
                points = M.window(out, start, end)
                lo, hi = min(y for _, y in points), max(y for _, y in points)
                threshold = (lo+hi)/2
                check('Filtered beat exceeds 100mV peak-to-peak', hi-lo > .1, hi-lo)
            else:
                threshold = supply/2
            info = cycle_metrics(out, threshold, start, end, (hi-lo)*.25 if kind=='osc_beat' else 0.)
            m['output_cycles'] = info
            m.update(output_frequency_Hz=info['frequency_Hz'], duty_cycle=info['duty'])
            check('Output has at least 3 resolved complete cycles', info['available'], info['complete_cycles'])
            points = M.window(out, start, end)
            if kind != 'osc_beat':
                check('Output reaches both logic rails', min(y for _, y in points) < .3*supply and max(y for _, y in points) > .7*supply,
                    [min(y for _, y in points), max(y for _, y in points)])
                check('Duty within 10..90 percent', info['duty'] is not None and .1 < info['duty'] < .9, info['duty'])
            if kind == 'osc_ring5':
                m['average_stage_delay_s'] = 1/(10*info['frequency_Hz']) if info['frequency_Hz'] else None
            elif kind == 'osc_beat':
                delta, measured = m['difference_frequency_Hz'], info['frequency_Hz']
                error = abs(measured-delta)/delta if measured and delta else None
                m['beat_relative_error'] = error
                check('Measured beat agrees with abs(fREF-fSENSE) within 10 percent', error is not None and error < .1, error)
            elif kind == 'osc_rc_sensor':
                # Read CAP at actual output crossings; do not substitute ideal thresholds.
                rises = crossings(out, supply/2, start, end)
                falls = crossings(out, supply/2, start, end, False)
                lows = [M.value_at(waves['CAP'], t) for t in rises]
                highs = [M.value_at(waves['CAP'], t) for t in falls]
                low = median(lows) if lows else None; high = median(highs) if highs else None
                m.update(cap_switch_low_V=low, cap_switch_high_V=high, timing_RC_s=v['timing_Ohm']*v['sense_F'])
                valid = low is not None and high is not None and 0 < low < high < supply
                check('CAP crosses separated switching levels', valid, [low, high] if valid else None)
                m['unloaded_RC_reference_frequency_Hz'] = 1/rc_period(v['timing_Ohm'],v['sense_F'],low,high,0,supply) if valid else None
                m['RC_reference_scope'] = 'Uses measured thresholds in the ideal unloaded exponential RC equation; feedback loading, MOS delay/leakage and parasitics cause differences.'
    checks = [dict(name=c['name'], **{'pass':c['pass_']}, observed=c['observed']) for c in checks]
    m.update(metric_source='actual-ngspice-samples', reference_scope='schematic-only; ideal external R/C; startup seeds; no physical/noise/sensor calibration signoff')
    report = dict(schema_version=1, kind=kind, source='actual-ngspice-samples', checks=checks,
        **{'pass':all(c['pass'] for c in checks)}, scope='Only named deterministic waveform criteria in the requested interval. No jitter, phase noise, foundry signoff or calibrated physical sensor.')
    run['reference_verification'] = report
    return report
