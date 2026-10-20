"""Traceable literature review and measurements. Never grants a verification pass."""
import copy
import hashlib
import json
import math
from pathlib import Path
import signal_metrics as M
from geometry import EDAError

VERSION = 'literature-review-20261013-v1'
DOCUMENT = Path(__file__).with_name('literature.json')


def sources():
    return json.loads(DOCUMENT.read_text(encoding='utf-8'))


def references(kind):
    if kind.startswith('sar12_') or kind=='sar_adc12':
        return ['vibe-tapeout-2026', 'clock-gating-2026']
    if kind.startswith('osc_'):
        return ['ti-schmitt-2025', 'ti-relaxation-2024']
    if kind.startswith('cell_') or kind == 'mux4':
        return ['ez130-2026', 'zlibboost-2026']
    if kind in ('full_adder', 'adder4', 'adder16', 'cpu4', 'cpu16'):
        return ['ez130-2026', 'clock-gating-2026']
    if kind.startswith('sar'):
        return ['sar-reset-2025', 'clock-gating-2026', 'isscc-trends-2026']
    if kind.startswith('sdm') or kind == 'sigma_delta8':
        return ['sdm-cic-2025', 'clock-gating-2026', 'isscc-trends-2026']
    if kind == 'chip_ldo':
        return ['ldo-psrr-2025', 'isscc-trends-2026']
    return ['isscc-trends-2026', 'placement-2024']


def record(kind):
    document = sources()
    by_id = {p['id']: p for p in document['papers']}
    ids = references(kind)
    return dict(schema_version=1, review_version=VERSION, reviewed_at='2026-10-20' if kind.startswith('sar12_') or kind=='sar_adc12' else '2026-10-16' if kind.startswith('osc_') else document['reviewed_at'],
                reference_ids=ids, references=[copy.deepcopy(by_id[i]) for i in ids],
                relationship='method-inspired review; existing owned circuits, not a reproduction of the cited chips',
                paper_performance_reproduced=False,
                qualification='not-run; actual revision-bound engine results are required',
                pending=['Thermal/flicker noise and mismatch yield except explicitly executed studies.',
                         'Full PVT/RC, EM/IR, ESD, antenna/density, foundry signoff.',
                         'Complete sequential timing, STA/Liberty and physical CPU/ADC-controller closure.'])


def inventory(templates, units):
    return dict(**sources(), review_version=VERSION,
                coverage=[dict(id=t['id'], name=t['name'], **record(t['id'])) for t in [*templates, *units]])


def statistics(wave, a, b):
    """Exact first/second moments of a linearly interpolated native waveform."""
    M.validate_wave(wave)
    points = M.window(wave, a, b)
    if not points:
        return dict(available=False, reason='Actual samples do not cover the complete requested interval.')
    area = square = 0.
    for (x, u), (y, v) in zip(points, points[1:]):
        dt = y-x
        area += dt*(u+v)/2
        square += dt*(u*u+u*v+v*v)/3
    mean = area/(b-a)
    return dict(available=True, start=a, end=b, integral=area, mean=mean,
                rms=math.sqrt(max(0, square/(b-a))),
                ac_rms=math.sqrt(max(0, square/(b-a)-mean*mean)),
                minimum=min(v for _, v in points), maximum=max(v for _, v in points),
                peak_to_peak=max(v for _, v in points)-min(v for _, v in points),
                method='Exact moments of piecewise-linear samples with interpolated boundaries; adaptive-step weighted.')


def crossings(wave, threshold, a, b, rising):
    M.validate_wave(wave)
    points = M.window(wave, a, b)
    result = []
    for (x, u), (y, v) in zip(points, points[1:]):
        if (u < threshold <= v if rising else v <= threshold < u):
            result.append(x+(threshold-u)*(y-x)/(v-u))
    return result


def cic_response(frequency_Hz, input_rate_Hz=1e6, ratio=256, order=2):
    if not all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) for v in (frequency_Hz, input_rate_Hz)) or input_rate_Hz <= 0 or not 0 <= frequency_Hz <= input_rate_Hz/2:
        raise EDAError('INVALID_CIC_FREQUENCY', 'CIC frequency must be finite within the input Nyquist range.')
    if not isinstance(ratio, int) or isinstance(ratio, bool) or ratio < 2 or not isinstance(order, int) or isinstance(order, bool) or order < 1:
        raise EDAError('INVALID_CIC_CONFIGURATION', 'CIC ratio/order must be positive supported integers.')
    f = frequency_Hz/input_rate_Hz
    # The f=0 limit is one, not 0/0; true zeros are represented without log(0).
    amplitude = 1. if f == 0 else abs(math.sin(math.pi*ratio*f)/(ratio*math.sin(math.pi*f)))**order
    return dict(frequency_Hz=frequency_Hz, normalized_amplitude=amplitude,
                droop_dB=20*math.log10(amplitude) if amplitude > 1e-30 else None,
                dc_gain=ratio**order, group_delay_s=order*(ratio-1)/(2*input_rate_Hz),
                output_rate_Hz=input_rate_Hz/ratio, output_nyquist_Hz=input_rate_Hz/(2*ratio),
                formula='|sin(pi*f*R/Fs)/(R*sin(pi*f/Fs))|^N',
                source='independent mathematical CIC response, not a measured analog transfer or ENOB')


def annotate(p, run, settings):
    """Called only after an actual completed simulation; never changes its verdict."""
    kind = p.get('design_template', {}).get('id') or p.get('digital_unit', {}).get('kind')
    if not kind:
        return
    review = record(kind)
    review.update(qualification='See actual engine verdict; literature review cannot establish PASS.',
                  revision=run.get('revision'), project_id=p.get('id'), run_id=run.get('id'))
    run['literature_review'] = review
    if settings.get('analysis', 'tran') != 'tran':
        return
    waves = {w['name']: w for w in run.get('waveforms', [])}
    metrics = dict(source='returned native trace samples, possibly display-thinned; source coverage is explicit',
                   input_drivers_power='not measured', external_bias_power='not measured',
                   complete_system_power_available=False)
    if 'supply_current' in waves:
        w = waves['supply_current']
        metrics['supply'] = M.supply_metrics(w, w['x'][0], w['x'][-1], settings.get('supply_V', p['testbench']['supply_V']))
        metrics['supply']['sample_scope']='Integration of the returned trace; ADC raw-source energy is reported separately before display thinning.'
        raw=run.get('measurements',{}).get('source_energy',{}).get('9') if kind.startswith('sar12_') or kind=='sar_adc12' else None
        if raw:
            metrics['supply'].update(energy_J=raw['energy_J'],average_power_W=raw['average_power_W'],average_current_A=raw['average_power_W']/raw['source_voltage_V'],peak_current_A=raw['peak_current_A'],minimum_current_A=raw['minimum_current_A'],sample_scope='Every original adaptive-step analog VDD sample, integrated before display thinning. External driver/digital-controller power excluded.')
            metrics['source']='native raw-source integration; display decimation is not used for energy'
    else:
        metrics['supply'] = dict(available=False, reason='No analog supply-current trace; RTL/gate replay is not transistor power.')
    for name in ('OUT', 'Y', 'INT_OUT', 'TOP'):
        if name in waves:
            w = waves[name]
            if len(w['x']) > 1:
                metrics[name+'_tail'] = statistics(w, max(w['x'][0], w['x'][-1]*.75), w['x'][-1])
    run.setdefault('measurements', {})['research_metrics'] = metrics


def sar_energy(waves, frames, values, supply):
    """Signed source work, separately for acquisition/reset and bit conversion.

    VCM, VIN, BIAS and the external control drivers are explicitly unmeasured.
    This cannot be used as a total-power Walden FoM.
    """
    by_name = {w['name']: w for w in waves}
    period = values['acquisition_s']+8*values['bit_period_s']
    result = []
    for f in frames:
        start = f['frame']*period
        acquisition_end = start+values['acquisition_s']
        row = dict(frame=f['frame'], input_V=f['input_V'], code=f['code'])
        for label, a, b in [('acquisition_reset', start, acquisition_end), ('conversion', acquisition_end, start+period)]:
            terms = {}
            for name, voltage in [('supply_current', supply), ('reference_current', values['reference_V'])]:
                terms[name] = M.supply_metrics(by_name[name], a, b, voltage)
            row[label] = terms
        result.append(row)
    return dict(rows=result, convention='signed source work integral V*(-i(source))*dt; negative means energy returned to that source',
                includes=['VDD', 'VREF'], excludes=['VIN', 'VCM', 'BIAS', 'external control-driver sources', 'digital controller transistor power'],
                complete_system_energy=False, Walden_FoM=None,
                scope='Acquisition includes reset/recharge; startup-dependent directed conversions, not stationary ADC FoM or paper replication.')
