"""Publication-size figures drawn only from actual native evidence."""
import json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection
import numpy as np
import klayout.db as k

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / '.runtime/paper-signoff'
OUT = ROOT / 'examples/paper-signoff/figures'


def load(path):
    return json.loads((WORK / path).read_text())


def save(fig, name):
    fig.savefig(OUT / (name + '.png'), dpi=190, bbox_inches='tight')
    fig.savefig(OUT / (name + '.svg'), bbox_inches='tight')
    svg = OUT / (name + '.svg')
    svg.write_text('\n'.join(line.rstrip() for line in svg.read_text().splitlines()) + '\n')
    plt.close(fig)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 10, 'axes.spines.top': False, 'axes.spines.right': False})
    report = load('comparator/report.json')
    fig, axes = plt.subplots(1, 3, figsize=(13, 4.5), sharey=True)
    for ax, corner in zip(axes, ['tt', 'ss', 'ff']):
        for n, (variant, name) in enumerate([('nominal', 'Nominal'), ('qp_plus_0p5fF', 'QP +0.5fF'), ('qn_plus_0p5fF', 'QN +0.5fF')]):
            rows = [s for s in report['summaries'] if s['corner'] == corner and s['variant'] == variant]
            if any(s['offset_bracket_V'] is None for s in rows):
                raise ValueError('Do not invent an unmeasured transition bracket')
            lo = np.array([s['offset_bracket_V'][0] / report['LSB_V'] for s in rows])
            hi = np.array([s['offset_bracket_V'][1] / report['LSB_V'] for s in rows])
            ax.errorbar(np.array([s['common_mode_V'] for s in rows]) + (n - 1) * .009,
                        (lo + hi) / 2, yerr=(hi - lo) / 2, fmt='o', capsize=4, label=name)
        ax.axhline(0, color='#84909e', lw=.8)
        ax.set(title={'tt': 'TT 27C', 'ss': 'SS 125C', 'ff': 'FF -40C'}[corner], xlabel='Input common-mode (V)', ylim=(-.35, .35))
        ax.grid(alpha=.15)
    axes[0].set_ylabel('Measured transition bracket (LSB)')
    axes[-1].legend(loc='upper right', fontsize=9)
    fig.suptitle('Actual MOS comparator: 702 transients, 1.8V, 0.55us after EVAL', y=1.04)
    fig.text(.5, -.02, 'Brackets are finite-grid observations, not statistical error bars. One unresolved zero-input point; no mismatch/noise yield claimed.', ha='center', fontsize=9)
    save(fig, 'comparator-cm')
    audit = load('coupling/audit.json')
    rows = audit['largest_differences'][:10][::-1]
    fig, ax = plt.subplots(figsize=(11, 6))
    y = np.arange(len(rows))
    ax.barh(y - .19, [r['C_only_F'] * 1e12 for r in rows], .35, label='Native C-only')
    ax.barh(y + .19, [r['RC_lumped_F'] * 1e12 for r in rows], .35, label='Native RC, resistors shorted for audit')
    ax.set_yticks(y, [r['node1'] + ' / ' + r['node2'] for r in rows])
    ax.set(xlabel='Extracted capacitance (pF)', title='Extraction consistency FAIL: largest native matrix differences')
    ax.legend(fontsize=9)
    ax.grid(axis='x', alpha=.15)
    fig.text(.5, -.01, 'Same GDS, exact device-terminal mapping; L1 relative difference = %.3f. No corrective capacitors inserted.' % audit['matrix_relative_L1'], ha='center', fontsize=9)
    save(fig, 'coupling-matrix')
    after = [s for s in load('timing/report.json')['cases'] if s['stage'] == 'post-route' and not s['expected_negative_control']]
    before = [s for s in load('hold-before/report.json')['cases'] if s['stage'] == 'post-route' and not s['expected_negative_control']]
    fig, ax = plt.subplots(figsize=(9, 4.8))
    x = np.arange(3)
    ax.bar(x - .19, [s['hold_slack_ns'] for s in before], .35, label='Before multi-corner hold repair')
    ax.bar(x + .19, [s['hold_slack_ns'] for s in after], .35, label='After 2 actual hold buffers')
    ax.axhline(0, color='#e04b4b', lw=1)
    ax.set_xticks(x, [s['corner'] for s in after])
    ax.set(ylabel='Worst hold slack (ns)', title='Actual post-CTS OpenSTA + OpenRCX SPEF, 250ns clock')
    ax.legend(loc='upper right', fontsize=9)
    ax.grid(axis='y', alpha=.15)
    fig.text(.5, -.02, 'Same I/O, load and uncertainty. Nominal wire-RC model in all three cell corners; digital controller only.', ha='center', fontsize=9)
    save(fig, 'hold-repair')
    layout = k.Layout()
    layout.read(str(WORK / 'pnr/sar12_controller.gds'))
    top = layout.cell('sar12_controller')
    fig, ax = plt.subplots(figsize=(9, 9), facecolor='#151b25')
    ax.set_facecolor('#151b25')
    for layer, color, name in [(67, '#868d9e', 'li1'), (68, '#6ba1f1', 'met1'), (69, '#e38db2', 'met2'), (70, '#68cdb0', 'met3'), (71, '#d7ac65', 'met4'), (72, '#bc97e3', 'met5')]:
        index = layout.find_layer(layer, 20)
        if index is None:
            continue
        polygons = [np.array([(p.x * layout.dbu, p.y * layout.dbu) for p in poly.each_point_hull()]) for poly in k.Region(top.begin_shapes_rec(index)).each()]
        ax.add_collection(PolyCollection(polygons, facecolors=color, edgecolors='none', alpha=.78, label=name))
    ax.set(xlim=(0, 120), ylim=(0, 120), aspect='equal', xlabel='um', ylabel='um', title='SAR12 digital controller: native routed mask geometry')
    ax.tick_params(colors='#bdc5d6')
    ax.xaxis.label.set_color('#bdc5d6')
    ax.yaxis.label.set_color('#bdc5d6')
    ax.title.set_color('#eef2fb')
    ax.legend(loc='upper right', facecolor='#eceff6', fontsize=8)
    fig.text(.5, .02, '120 x 120um die fixture; actual standard-cell masks + PDN + routes. Not the complete ADC.', color='#bdc5d6', ha='center', fontsize=9)
    # Raster preview only; the exact full-fidelity geometry is the bundled GDS.
    fig.savefig(OUT / 'controller-layout.png', dpi=210, bbox_inches='tight')
    plt.close(fig)
    print('Four native-evidence figures saved')


if __name__ == '__main__':
    main()
