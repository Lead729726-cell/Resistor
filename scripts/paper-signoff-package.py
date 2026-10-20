"""Verify native provenance and package an explicit allowlist of public evidence.

No application user-data directories, credentials or unrelated tutorial helpers
are selected. The top-level readiness result stays not_ready on known blockers.
"""
import hashlib, json, math, re, shutil, subprocess, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / '.runtime/paper-signoff'
OUT = ROOT / 'examples/paper-signoff'
RUNS = ROOT / '.runtime/hardware/lab/.runtime/eda/runs'


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def read(relative):
    return json.loads((WORK / relative).read_text())


def require(value, description):
    if not value:
        raise RuntimeError('Evidence check failed: ' + description)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    analog = read('analog-state.json')
    coupled = read('coupling/audit.json')
    timing = read('timing/report.json')
    compare = read('comparator/report.json')
    mask = read('mask-drc/report.json')
    lvs = read('digital-lvs/report.json')
    logic = read('controller/report.json')
    preflight = read('tool-preflight.json')
    source_checks = {}
    for record in analog['records']:
        require(re.fullmatch('[a-f0-9]{32}', record['id']), 'native run identifier')
        folder = RUNS / record['id']
        manifest = json.loads((folder / 'manifest.json').read_text())
        require(manifest['revision'] == analog['revision'] and manifest['execution_status'] == 'completed', 'analog revision/completion')
        for name, expected in manifest['adapter_sources'].items():
            require(sha(ROOT / 'workers/eda' / name) == expected, 'worker source ' + name)
            source_checks[name] = expected
        # Every native artifact recorded by the engine, not only the pretty graph.
        for path, expected in manifest['artifacts'].items():
            require(sha(Path(path)) == expected, 'native artifact ' + path)
    pex = RUNS / coupled['run_id']
    require(sha(pex / 'sar12_analog.gds') == coupled['source_gds_sha256'], 'same analog GDS')
    require(sha(pex / 'pex.spice') == coupled['RC_sha256'], 'actual RC input')
    require(sha(WORK / 'coupling/cap-only.spice') == coupled['cap_only_sha256'], 'actual C input')
    for name, expected in compare['source_hashes'].items():
        require(sha(ROOT / 'workers/eda' / name) == expected, 'comparator source')
    require(compare['native_runs'] == len(compare['results']) == 702, '702 independent transients')
    for row in compare['results']:
        folder = WORK / 'comparator' / row['folder']
        require(folder.parent == WORK / 'comparator', 'owned comparator folder')
        samples = [list(map(float, line.split())) for line in (folder / 'result.dat').read_text().splitlines()[1:] if line.strip()]
        require(all(math.isfinite(v) for sample in samples for v in sample), 'all raw waveform values finite')
        sample = next(s for s in reversed(samples) if s[0] <= 2.55e-6)
        require(sample[0] == row['sample_s'] and sample[1] == row['OUTP_V'] and sample[2] == row['OUTN_V'], 'raw comparator sample correspondence')
    gds = WORK / 'pnr/sar12_controller.gds'
    require(mask['gds_sha256'] == lvs['gds_sha256'] == read('pnr/gds-export.json')['gds_sha256'] == sha(gds), 'DRC/LVS/GDS identity')
    require(lvs['layout_sha256'] == sha(WORK / 'digital-lvs/layout.spice'), 'layout netlist identity')
    require(lvs['reference_sha256'] == sha(WORK / 'digital-lvs/reference.spice'), 'reference netlist identity')
    require(timing['rtl_sha256'] == sha(ROOT / 'workers/eda/rtl/sar12.v'), 'RTL timing identity')
    for case in timing['cases']:
        stem = ('post-route/' if case['stage'] == 'post-route' else '') + case['corner'] + ('-negative' if case['expected_negative_control'] else '')
        require(case['raw_log_sha256'] == sha(WORK / 'timing' / stem / 'sta.log'), 'STA log identity')
        netlist = WORK / ('pnr/routed-signal.v' if case['stage'] == 'post-route' else 'timing/sar12_mapped.v')
        require(case['netlist_sha256'] == sha(netlist), 'STA netlist identity')
        lib = WORK / 'lib' / ('sky130_fd_sc_hd__' + case['corner'] + '.lib')
        require(case['library_sha256'] == sha(lib), 'STA library identity')
        if case['stage'] == 'post-route':
            require(case['spef_sha256'] == sha(WORK / 'pnr/routed.spef'), 'STA SPEF identity')
            log = (WORK / 'timing' / stem / 'sta.log').read_text()
            require('Found 0 partially unannotated drivers.' in log, 'complete connected-net parasitics')
    for case in logic['reports']:
        path = WORK / ('pnr/routed-signal.v' if case['implementation'] == 'routed' else 'timing/sar12_mapped.v')
        require(case['netlist_sha256'] == sha(path), 'functional gate netlist identity')
    native_log = (WORK / 'pnr.log').read_text()
    counts = re.findall(r'Number of violations = (\d+)', native_log)
    require(counts and counts[-1] == '0', 'router final violation count')
    require('All shapes on net VPWR are connected.' in native_log and 'All shapes on net VGND are connected.' in native_log, 'native power connectivity')
    spef_nets = len(re.findall(r'^\*D_NET ', (WORK / 'pnr/routed.spef').read_text(), re.M))
    require(spef_nets == 177, 'native routed SPEF net count')
    negative = read('digital-lvs/fault-report.json')
    require(negative['native_result'] == 'rejected' and negative['reference_sha256'] == lvs['reference_sha256'], 'native width negative control')
    nominal = [c for c in timing['cases'] if c['stage'] == 'post-route' and not c['expected_negative_control']]
    report = {
        'schema_version': 1, 'edition': 'Resistor Indust', 'date': '2026-10-20',
        'source_git_base': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
        'paper': {'url': 'https://arxiv.org/abs/2610.15240v1', 'author': 'Kentaro Yoshioka',
                  'title': 'The Era of Vibe Tapeout: Dark Age or Golden Age for Analog Circuit Design?',
                  'scope': 'Methodology reference. Paper 11-bit 5.12MS/s; this is a different 12-bit design.'},
        'native_adapter_sources_verified': len(source_checks),
        'analog': analog, 'digital_post_route_sta': nominal,
        'digital_gds': read('pnr/gds-export.json'), 'digital_mask_drc': mask,
        'digital_lvs': {k: v for k, v in lvs.items() if k != 'native_cell_references'},
        'digital_gate_assertions': sum(r['assertions'] for r in logic['reports']),
        'digital_spef_nets': spef_nets,
        'comparator': {'native_runs': 702, 'engine_failures': sum(r['execution'] != 'completed' for r in compare['results']),
                       'unresolved_points': sum(not r['resolved'] for r in compare['results']),
                       'large_signal_failing_groups': [r for r in compare['summaries'] if not r['large_signal_polarity_correct']],
                       'scope': compare['scope']},
        'analog_coupling_matrix': {k: coupled[k] for k in ('matrix_preserved', 'matrix_relative_L1', 'cap_only_matrix_sum_F', 'RC_lumped_matrix_sum_F', 'matrix_absolute_difference_F')},
        'commercial_execution': 'not_run', 'foundry_approved_deck': 'not_provided',
        'whole_analog_digital_chip_sta': 'not_run', 'manufacturing_signoff': False,
        'manufacturing_readiness': 'not_ready',
        'blockers': ['Analog C/RC capacitance matrix inconsistent; precision coupling preservation failed.',
                     'No complete analog/digital/pad interface closure or post-PEX coherent 256-point ADC FFT.',
                     'No multi-RC-corner OCV/SI, EM/IR, package/reliability/foundry-deck signoff.',
                     'Public input releases pinned and hashed but manufacturing-qualified release alignment unverified.',
                     'No licensed commercial executable discovered on this worker PATH; license state not tested.'],
        'scope': 'Actual reference-design verification, not a commercial-engine run, foundry tapeout approval or universal STA engine API.'}
    (OUT / 'report.json').write_text(json.dumps(report, indent=2, allow_nan=False) + '\n')
    # Explicit source allowlist. Do not add .env, user-data or unrelated helper files.
    files = {}
    def add(path, arc):
        path = Path(path)
        require(path.is_file(), 'package file ' + str(path))
        require(not any(p.startswith('.env') for p in Path(arc).parts), 'no environment files')
        files[arc] = path
    for path in sorted((ROOT / 'scripts').glob('paper-*')):
        if path.is_file(): add(path, 'source/scripts/' + path.name)
    for relative in ['scripts/requirements-paper-qa.txt', 'tests/test_paper_signoff.py', 'workers/eda/rtl/sar12.v', 'docs/paper-signoff-validation.md', 'examples/paper-signoff/THIRD_PARTY.md']:
        add(ROOT / relative, 'source/' + relative)
    for name in ['report.json', 'README.md', 'THIRD_PARTY.md']:
        add(OUT / name, name)
    for path in sorted((OUT / 'figures').iterdir()): add(path, 'figures/' + path.name)
    allowed = {'.json', '.log', '.spice', '.dat', '.tcl', '.sdc', '.sdf', '.v', '.ys', '.def', '.gds', '.odb', '.spef', '.rpt', '.tsv', '.guide'}
    for folder in ['timing', 'pnr', 'mask-drc', 'digital-lvs', 'controller', 'coupling', 'comparator', 'hold-before']:
        for path in sorted((WORK / folder).rglob('*')):
            if path.is_file() and path.suffix in allowed:
                add(path, 'native/' + str(path.relative_to(WORK)).replace('\\', '/'))
    for name in ['pnr.log', 'tool-preflight.json', 'provision-receipt.json', 'openroad-download-current.json', 'analog-state.json']:
        add(WORK / name, 'native/' + name)
    if (WORK / 'workflow.json').is_file():
        add(WORK / 'workflow.json', 'native/workflow.json')
        for path in sorted(WORK.glob('paper-*-workflow.log')):
            add(path, 'native/' + path.name)
    for path in [WORK / 'corner-source/receipt.json', WORK / 'rcx_patterns.rules', *sorted((WORK / 'lib').glob('*.lib'))]:
        add(path, 'native/' + str(path.relative_to(WORK)).replace('\\', '/'))
    for record in analog['records']:
        folder = RUNS / record['id']
        for path in sorted(folder.iterdir()):
            if path.suffix in {'.log', '.spice', '.tcl', '.json', '.tsv'} and path.name != 'project.json':
                add(path, 'native/analog/' + record['label'] + '/' + path.name)
    add(pex / 'sar12_analog.gds', 'native/analog/sar12_analog.gds')
    add(pex / 'input.oas', 'native/analog/input.oas')
    # A full copy of optional formatter sources or executable binaries is not
    # required; pinned URLs, receipts and source hashes remain available.
    license_url = 'https://raw.githubusercontent.com/google/skywater-pdk-libs-sky130_fd_sc_hd/ac7fb61f06e6470b94e8afdf7c25268f62fbd7b1/LICENSE'
    import urllib.request
    with urllib.request.urlopen(license_url, timeout=60) as response:
        license_text = response.read()
    license_file = WORK / 'SKYWATER-LICENSE.txt'
    license_file.write_bytes(license_text)
    add(license_file, 'licenses/SKYWATER-LICENSE.txt')
    index = {'edition': 'Resistor Indust', 'files': {name: {'sha256': sha(path), 'bytes': path.stat().st_size} for name, path in sorted(files.items())},
             'source_sha256': source_checks, 'manufacturing_signoff': False}
    (OUT / 'evidence-index.json').write_text(json.dumps(index, indent=2) + '\n')
    archive = ROOT / 'examples/Resistor-Paper-SAR12-Verification.zip'
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=8) as bundle:
        for name, path in sorted(files.items()): bundle.write(path, name)
        bundle.write(OUT / 'evidence-index.json', 'evidence-index.json')
    with zipfile.ZipFile(archive) as bundle:
        require(bundle.testzip() is None, 'ZIP CRC')
        for name, item in index['files'].items():
            require(hashlib.sha256(bundle.read(name)).hexdigest() == item['sha256'], 'ZIP SHA256 ' + name)
    receipt = {'edition': 'Resistor Indust', 'file': archive.name, 'bytes': archive.stat().st_size,
               'sha256': sha(archive), 'files': len(files) + 1, 'manufacturing_signoff': False}
    (OUT / 'archive.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps(receipt))


if __name__ == '__main__':
    main()
