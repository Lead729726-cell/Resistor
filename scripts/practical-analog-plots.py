"""Plot saved, hash-verified ngspice samples; never synthesize waveforms.

Usage: python scripts/practical-analog-plots.py path/to/report.json [--libs path]
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('report', type=Path)
parser.add_argument('--libs', type=Path, help='Optional isolated matplotlib dependency directory')
args = parser.parse_args()
if args.libs:
    sys.path.insert(0, str(args.libs.resolve()))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

report = json.loads(args.report.read_text(encoding='utf-8'))
if not report.get('completed'):
    raise SystemExit('Refusing to plot an incomplete lab report.')
root = args.report.parent.resolve()


def measured(kind, analysis):
    matches = [r for r in report['runs'] if r['template_id'] == kind and
               r['condition'] == dict(corner='tt', supply_V=1.8, temperature_C=27, analysis=analysis)]
    if len(matches) != 1 or not matches[0]['numerical_execution_passed']:
        raise ValueError(f'Missing unique completed nominal run: {kind}/{analysis}')
    row = matches[0]
    file = (root / row['artifact_directory'] / 'waveforms.json').resolve()
    if root not in file.parents:
        raise ValueError('Waveform path leaves the evidence directory.')
    data = file.read_bytes()
    if hashlib.sha256(data).hexdigest() != row['files']['waveforms.json']:
        raise ValueError('Waveform hash mismatch: ' + str(file))
    record = json.loads(data)
    if record['source'] != 'actual-ngspice-samples' or record['run_id'] != row['id']:
        raise ValueError('Wrong waveform provenance.')
    return {w['name']: w for w in record['waveforms']}, row


def series(ax, wave, label, color, xscale=1e6, yscale=1, **kw):
    ax.plot([x * xscale for x in wave['x']], [y * yscale for y in wave['y']],
            label=label, color=color, linewidth=1.6, **kw)


plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 10,
                     'axes.spines.top': False, 'axes.spines.right': False,
                     'axes.labelcolor': '#263442', 'text.color': '#172735',
                     'axes.edgecolor': '#b7c1c9', 'xtick.color': '#4b5b68',
                     'ytick.color': '#4b5b68', 'legend.frameon': False})
fig, axes = plt.subplots(3, 2, figsize=(13.6, 10.8))
fig.subplots_adjust(left=.075, right=.945, top=.88, bottom=.095, hspace=.63, wspace=.29)
fig.text(.075, .955, 'Resistor Indust  /  Practical analog blocks', fontsize=21, weight='bold')
fig.text(.075, .918, 'Actual ngspice samples  ·  SKY130 MOS  ·  TT / 1.8 V / 27 °C  ·  100 fF output load', fontsize=11)
blue, orange, green = '#1675a9', '#c46b16', '#208773'
for ax in axes.flat:
    ax.grid(color='#dce3e9', alpha=.65, linewidth=.7)
    ax.set_axisbelow(True)

tia, trun = measured('sensor_current_tia', 'tran')
ac, arun = measured('sensor_current_tia', 'ac')
ax = axes[0, 0]
series(ax, tia['OUT'], 'Output', blue)
series(ax, tia['VCM'], 'Common mode', '#8b98a3', linestyle='--')
ax.set(title='01  Sensor TIA: current to voltage', xlabel='Time (µs)', ylabel='Voltage (V)')
ax.legend(loc='upper left', ncol=2, fontsize=9)
ax2 = ax.twinx()
series(ax2, tia['input_current'], 'Sensor current', orange, yscale=1e6, linestyle=':')
ax2.set_ylabel('Sensor current (µA)', color=orange)
ax2.tick_params(axis='y', colors=orange)
ax2.set_ylim(-.1, 1.5)
ax = axes[0, 1]
series(ax, ac['transimpedance_magnitude'], 'Magnitude', blue, xscale=1, yscale=1e-3)
ax.set_xscale('log'); ax.set_yscale('log')
ax.set(title='TIA small-signal transimpedance', xlabel='Frequency (Hz)', ylabel='Magnitude (kV/A)')
ax.text(.04, .06, f"Settled signed gain: {trun['measurements']['transimpedance_V_per_A']/1000:.2f} kV/A", transform=ax.transAxes, fontsize=9)

hold, hrun = measured('adc_track_hold', 'tran')
ax = axes[1, 0]
series(ax, hold['VIN'], 'Input', orange, linestyle='--')
series(ax, hold['HOLD'], 'Storage node', green)
series(ax, hold['OUT'], 'Buffered output', blue)
for start in (30, 130, 230):
    ax.axvspan(start, start + 40, color='#d2e9ee', alpha=.45, linewidth=0)
ax.set(title='02  Track/hold: input changes during hold', xlabel='Time (µs)', ylabel='Voltage (V)', ylim=(.77,1.05))
ax.legend(ncol=3, loc='upper center', fontsize=8)
ax.text(.02, .04, 'Shading: track phase; unshaded: hold', transform=ax.transAxes, fontsize=8)
ax = axes[1, 1]
for i, cycle in enumerate(hrun['measurements']['sample_hold_cycles']):
    pairs = [(x * 1e6 - i * 100, (y - cycle['expected_V']) * 1000)
             for x, y in zip(hold['OUT']['x'], hold['OUT']['y'])
             if (i * 100 + 90) * 1e-6 <= x <= (i * 100 + 118) * 1e-6]
    ax.plot(*zip(*pairs), label=f"Cycle {i + 1}", color=(blue, orange, green)[i], linewidth=1.6)
ax.set(title='Held-output error in the measured window', xlabel='Aligned time; successive cycles shifted by 100 µs', ylabel='Output − sampled input (mV)')
ax.legend(fontsize=9)
ax.text(.02, .04, '10 pF storage; explicit 1 GΩ leakage to VCM', transform=ax.transAxes, fontsize=8)

schmitt, srun = measured('sensor_schmitt', 'tran')
ax = axes[2, 0]
series(ax, schmitt['VIN'], 'Input', orange)
series(ax, schmitt['OUT'], 'Output', blue)
ax.set(title='03  Hysteretic comparator: two thresholds', xlabel='Time (µs)', ylabel='Voltage (V)')
ax.legend(ncol=2, loc='upper left', fontsize=9)
ax = axes[2, 1]
for lo, hi, label, color in ((40e-6, 140e-6, 'Rising input', orange), (180e-6, 280e-6, 'Falling input', blue)):
    points = [(x, y) for t, x, y in zip(schmitt['VIN']['x'], schmitt['VIN']['y'], schmitt['OUT']['y']) if lo <= t <= hi]
    ax.plot(*zip(*points), label=label, color=color, linewidth=1.8)
sm = srun['measurements']
ax.set(title=f"Measured hysteresis: {sm['hysteresis_V']*1000:.1f} mV", xlabel='Input voltage (V)', ylabel='Output voltage (V)')
ax.legend(fontsize=9, loc='upper left')
fig.text(.075, .04, 'Schematic references with ideal R/C and external stimuli. No physical layout, extracted parasitics, noise/mismatch or silicon qualification.', fontsize=9, color='#546575')
for extension in ('png', 'svg', 'pdf'):
    fig.savefig(root / ('measured-overview.' + extension), dpi=155, facecolor='white')
svg = root / 'measured-overview.svg'
svg.write_text('\n'.join(line.rstrip() for line in svg.read_text(encoding='utf-8').splitlines()) + '\n', encoding='utf-8', newline='\n')
receipt = {'schema_version': 1, 'source': 'actual-ngspice-samples',
           'report_sha256': hashlib.sha256(args.report.read_bytes()).hexdigest(),
           'run_ids': [r['id'] for r in (trun, arun, hrun, srun)],
           'script_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
           'matplotlib': matplotlib.__version__}
(root / 'plot-provenance.json').write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
print(root / 'measured-overview.png')
