"""Read saved artifacts only. Run with the existing Docker EDA worker Python."""
import bisect
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import re
import sys
import tempfile
import zipfile

import klayout.db as k

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'workers/eda'))
import geometry


def read(name):
    return json.loads((OUT / name).read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def layout_record(path):
    layout = k.Layout()
    layout.read(str(path))
    top = layout.cell('mux4')
    assert top is not None
    return layout, {
        'geometry_hash': geometry.semantic_hash(layout, top),
        'cells': [c.name for c in layout.each_cell()],
        'layers': len(layout.layer_indices()),
        'stored_shapes': sum(c.shapes(li).size() for c in layout.each_cell() for li in layout.layer_indices()),
    }


bundle = OUT / 'mux4.register.zip'
receipt = read('bundle-receipt.json')
assert sha(bundle) == receipt['sha256']
with zipfile.ZipFile(bundle) as archive:
    manifest = json.loads(archive.read('manifest.json'))
    for name, expected in manifest['files'].items():
        assert hashlib.sha256(archive.read(name)).hexdigest() == expected
    project = json.loads(archive.read('project.json'))
    assert not project.get('runs'), 'Design bundle intentionally excludes run results.'
    with tempfile.TemporaryDirectory() as directory:
        bundled_layout = Path(directory) / 'layout.oas'
        bundled_layout.write_bytes(archive.read('layout.oas'))
        original, original_record = layout_record(bundled_layout)
mos = [d for d in project['schematic']['devices'] if d['kind'] in ('nmos', 'pmos')]
ports = [d for d in project['schematic']['devices'] if d['kind'] == 'port']
assert len(mos) == 20 and len(ports) == 9
records = {}
for filename in ('mux4.gds', 'mux4.oas'):
    exported, record = layout_record(OUT / filename)
    assert exported.dbu == original.dbu
    assert record['geometry_hash'] == manifest['geometry_hash'] == original_record['geometry_hash']
    assert record['cells'] == original_record['cells'] == ['mux4']
    # Native layer-by-layer merged polygon XOR independently checks occupied geometry.
    for li in original.layer_indices():
        info = original.get_info(li)
        other_li = exported.find_layer(info.layer, info.datatype)
        assert other_li is not None
        left = k.Region(original.cell('mux4').begin_shapes_rec(li))
        right = k.Region(exported.cell('mux4').begin_shapes_rec(other_li))
        assert (left ^ right).is_empty(), f'{filename} differs on {info}'
    record.update(sha256=sha(OUT / filename), polygon_xor_empty=True)
    records[filename] = record

summaries = {}
for variant in ('nominal', 'stress', 'stress-5ns'):
    summary = read(f'{variant}.summary.json')
    for run in summary['runs']:
        run.pop('waveforms', None)
    (OUT / f'{variant}.summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2))
    summaries[variant] = summary


def interpolate(times, values, time):
    index = bisect.bisect_left(times, time)
    assert index < len(times)
    if not index or times[index] == time:
        return values[index]
    return values[index - 1] + (values[index] - values[index - 1]) * (time - times[index - 1]) / (times[index] - times[index - 1])


truth_records = {}
for variant, filename, expected_count in [
    ('nominal', 'mux4-pre.truth.json', 64), ('nominal', 'mux4-post.truth.json', 64),
    ('stress', 'stress-pre.truth.json', 64), ('stress', 'stress-post.truth.json', 64),
    ('stress-5ns', 'stress-5ns-pre.truth.json', 64), ('stress-5ns', 'stress-5ns-post.truth.json', 56),
]:
    truth = read(filename)
    report = truth['verification']
    rows = report['rows']
    assert len(rows) == 64 and len({(r['select'], r['pattern']) for r in rows}) == 64
    assert sum(r['pass'] for r in rows) == report['passed_cases'] == expected_count
    assert report['pass'] == (expected_count == 64)
    folder = OUT / 'native' / variant / truth['run_id']
    lines = (folder / 'waveform.dat').read_text().splitlines()
    table = [[float(value) for value in line.split()] for line in lines[1:] if line.strip()]
    assert all(len(row) == 9 and all(math.isfinite(v) for v in row) for row in table)
    times = [row[0] for row in table]
    values = [[row[column + 1] for row in table] for column in range(7)]
    supply = truth['conditions']['supply_V']
    slot = summaries[variant]['design_template']['parameters']['slot_ns'] * 1e-9
    def bit(v):
        return 0 if v <= .3 * supply else 1 if v >= .7 * supply else None
    independent_passes = []
    for row in rows:
        sampled = [interpolate(times, v, (row['index'] + .85) * slot) for v in values]
        bits = [bit(v) for v in sampled]
        inputs = [(row['pattern'] >> index) & 1 for index in range(4)] + [row['select'] & 1, row['select'] >> 1]
        expected = (row['pattern'] >> row['select']) & 1
        left = bisect.bisect_left(times, (row['index'] + .7) * slot)
        right = bisect.bisect_right(times, (row['index'] + .95) * slot)
        window = values[6][left:right]
        passed = bits[:6] == inputs and bits[6] == expected and bool(window) and all(bit(v) == expected for v in window)
        assert passed == row['pass']
        independent_passes.append(passed)
    assert sum(independent_passes) == expected_count
    truth_records[filename] = {'run_id': truth['run_id'], 'passed': expected_count, 'total': 64,
        'slot_ns': slot * 1e9, 'conditions': truth['conditions'], 'raw_samples_checked': len(table)}

suffixes = {'': 1, 'f': 1e-15, 'p': 1e-12, 'n': 1e-9, 'u': 1e-6, 'm': 1e-3, 'k': 1e3, 'meg': 1e6, 'g': 1e9}
pex_run = next(r for r in summaries['nominal']['runs'] if r['kind'] == 'pex')
pex_folder = OUT / 'native/nominal' / pex_run['id']
quality = json.loads((pex_folder / 'pex-quality.json').read_text())
rc = {'R': [], 'C': []}
for line in (pex_folder / 'pex.spice').read_text().splitlines():
    if line[:1] not in rc:
        continue
    match = re.fullmatch(r'([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)([a-zA-Z]*)', line.split()[3])
    assert match
    value = float(match[1]) * suffixes[match[2].lower()]
    assert math.isfinite(value) and value >= 0
    rc[line[0]].append(value)
assert len(rc['R']) == quality['resistors'] == 1509
assert len(rc['C']) == quality['capacitors'] == 231
assert quality['valid'] and not quality['invalid_elements']
lvs = next(r for r in summaries['nominal']['runs'] if r['kind'] == 'lvs')
assert 'Final result: Circuits match uniquely.' in (OUT / 'native/nominal' / lvs['id'] / 'lvs.log').read_text()
drc = next(r for r in summaries['nominal']['runs'] if r['kind'] == 'drc')
assert drc['analysis_result'] == 'pass' and not drc['markers']
pvt = read('08a83d4f8ffc41dd801f716d72357964.pvt.json')
assert len(pvt['points']) == 18
assert all(p['execution_status'] == 'completed' and p['metrics']['truth_passed'] == 64 for p in pvt['points'])
for point in pvt['points']:
    folder = OUT / 'native/pvt-pre-5ns' / point['run_id']
    assert folder.is_dir()
    native_manifest = json.loads((folder / 'manifest.json').read_text())
    settings = native_manifest['settings']
    assert not settings.get('post_layout', False)
    assert settings['duration_s'] == 320e-9 and settings['load_F'] == 5e-15
    for key, value in point['condition'].items():
        assert settings[key] == value
    table = [[float(v) for v in line.split()] for line in (folder / 'waveform.dat').read_text().splitlines()[1:] if line.strip()]
    times = [row[0] for row in table]
    values = [[row[column + 1] for row in table] for column in range(7)]
    supply = settings['supply_V']
    bit = lambda v: 0 if v <= .3 * supply else 1 if v >= .7 * supply else None
    for index in range(64):
        select, gray_index = divmod(index, 16)
        pattern = gray_index ^ (gray_index >> 1)
        expected = (pattern >> select) & 1
        bits = [bit(interpolate(times, v, (index + .85) * 5e-9)) for v in values]
        inputs = [(pattern >> i) & 1 for i in range(4)] + [select & 1, select >> 1]
        left, right = bisect.bisect_left(times, (index + .7) * 5e-9), bisect.bisect_right(times, (index + .95) * 5e-9)
        window = values[6][left:right]
        assert bits[:6] == inputs and bits[6] == expected and window and all(bit(v) == expected for v in window)
current = read('mux4-current-pre.json')
mapped = [b for b in current['branches'] if b['mapping'] == 'device_terminals']
assert len(mapped) == 20 and {b['device_id'] for b in mapped} == {d['id'] for d in mos}
assert all(b['path_dbu'] and b['layer_id'] == '67/20' for b in mapped)
branch = next(b for b in mapped if b['device_id'] == 'mn_buf1')
assert math.isclose(branch['values_A'][214], 75.5509184e-6, rel_tol=1e-8)
portable = read('mux4.register-view.json')
assert portable['kind'] == 'register-view' and portable['scene']['project_id'] == project['id']
assert len(portable['scene']['shapes']) == 1704 and portable['currentFlow'] == current
regression = json.loads((ROOT / 'docs/evidence/design-tools.json').read_text())
assert regression['passed'] == regression['case_count'] == 27
sources = ['workers/eda/digital_mux.py', 'workers/eda/design_tools.py', 'workers/eda/current_flow.py',
           'workers/eda/server.py', 'packages/ui/src/DigitalVerification.tsx', 'packages/ui/src/App.tsx',
           'packages/contracts/src/index.ts', 'workers/eda/test_design_tools.py']
evidence = {
    'verified_at': datetime.now(timezone.utc).isoformat(), 'project_id': project['id'], 'revision': project['revision'],
    'interaction_method': 'cua_repl: live Register in-app browser UI; create template, edit testbench, run, clone, export, save and reopen',
    'artifact_audit_method': 'Saved native files only: KLayout polygon XOR, SHA256, raw ngspice samples, native R/C values and Netgen report',
    'mos_count': len(mos), 'ports': len(ports), 'bundle_sha256': sha(bundle), 'bundle_has_runs': False,
    'geometry_exports': records, 'truth': truth_records, 'drc_markers': 0, 'lvs': 'Circuits match uniquely',
    'pex': quality, 'pvt': {'points': 18, 'passed_cases': 1152, 'scope': '5ns pre-layout only', 'batch_id': pvt['id']},
    'current': {'source_run': current['run_id'], 'mapped_mos': 20, 'branches': len(current['branches']),
                'sample_index': 214, 'time_s': current['x'][214], 'mn_buf1_current_A': branch['values_A'][214],
                'scope': 'Pre-layout terminal reference vectors; post-layout repeated native MOS identities remain numerically available without unproved physical arrows'},
    'native_regression': {'passed': 27, 'total': 27}, 'source_sha256': {name: sha(ROOT / name) for name in sources},
    'portable_viewer': {'sha256': sha(OUT / 'mux4.register-view.json'), 'shapes': 1704, 'mapped_paths': 20,
                        'direct_ui_reopened': True, 'sample_214_current_A': branch['values_A'][214]},
    'ui_proofs': ['mux4-final-screen.jpg', 'mux4-mapped-current-screen.jpg', 'mux4-stress-screen.jpg',
                  'pvt-screen.jpg', 'mux4-standalone-viewer-screen.jpg'],
    'limits': ['Reference layout is wide, not an area optimized standard cell.', '20ns is input change interval, not a certified maximum clock.',
               'These digital checks do not constitute STA, hazard-free certification, TCAD, or foundry signoff.',
               'The test bundle contains design and PDK lock; run results are separate native artifacts.',
               'Full current UI Playwright suite was not rerun; current UI proof is direct cua_repl operation.'],
}
(OUT / 'verification.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2))
(ROOT / 'docs/evidence/mux4-manual-ui.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2))
print(json.dumps({'artifact_audit': 'PASS', 'truth_counts': {name: r['passed'] for name, r in truth_records.items()},
                  'gds_oas_polygon_xor': 'empty', 'mapped_mos': 20, 'native_regression': '27/27'}, indent=2))
