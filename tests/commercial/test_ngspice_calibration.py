"""Actual open-source runner/parser calibration, separate from vendor fixtures.

Invoke with --executable /absolute/path/to/ngspice [--evidence path.json].
No commercial executable, license, PDK, extracted GDS or physical routing claim.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'workers' / 'eda'))
sys.path.insert(0, str(ROOT / 'platform' / 'commercial'))
import commercial_results
import runner

DECK = '''Actual ngspice resistor calibration, no layout mapping
VSUP IN 0 DC 1
VSENSE IN MID 0
R1 MID 0 1000
.control
set num_threads=1
dc VSUP -1 1 1
wrdata waveform.dat v(MID)
wrdata currents.dat i(VSENSE)
quit 0
.endc
.end
'''


def calibrate(executable):
    executable = Path(executable).resolve(strict=True)
    with tempfile.TemporaryDirectory(prefix='register-ngspice-result-') as folder:
        root = Path(folder); deck = root / 'calibration.spice'; deck.write_text(DECK)
        manifest = {'schema_version': 1, 'id': 'actual_ngspice_result_calibration', 'name': 'Actual open-source result calibration', 'tool_id': 'ngspice', 'version': 'installed',
                    'runner': {'kind': 'local', 'executable': str(executable), 'env_names': [], 'resources': {'deck': str(deck)},
                               'recipes': {'simulation': {'argv': ['-b', '{resource.deck}'], 'outputs': {'waves': 'waveform.dat', 'currents': 'currents.dat'},
                                                         'timeout_s': 10, 'parameters': {}, 'result_context': {}}}}}
        manifest = runner.normalize(manifest, [root, executable.parent]); locked = runner.lock(manifest)
        receipt = runner.execute(manifest, {'operation': 'simulation', 'top_cell': 'calibration', 'parameters': {}}, {}, root / 'job', locked['fingerprint'])
        if receipt.get('error_code'): raise AssertionError('Actual ngspice execution failed: ' + receipt['error_code'])
        context = {'tool_id': 'ngspice', 'backend_profile_id': manifest['id'], 'project_id': 'calibration-only', 'revision': 0, 'run_id': 'actual-calibration',
                   'analysis': 'dc', 'execution_status': 'completed', 'geometry_binding': False, 'input_origin': 'explicit_calibration_deck',
                   'execution_log': (root / 'job' / 'stdout.log').read_text(),
                   'formats': {'waves': 'table', 'currents': 'table'},
                   'wave_schema': {'x': {'column': 0, 'unit': 'V'}, 'signals': [{'column': 1, 'name': 'MID', 'unit': 'V'}]},
                   'current_schema': {'x': {'column': 0, 'unit': 'V'}, 'branches': [{'column': 1, 'id': 'VSENSE', 'name': 'VSENSE', 'unit': 'A', 'from_net': 'IN', 'to_net': 'MID', 'source_vector': 'i(VSENSE)'}]}}
        parsed = commercial_results.parse_results('simulation', root / 'job' / 'outputs', {key: value['path'] for key, value in receipt['outputs'].items()}, context)
        assert parsed['analysis_result'] == 'pass', parsed
        flow = parsed['current_flow']; assert flow['source'] == 'ngspice'; assert flow['x'] == [-1, 0, 1]
        values = flow['branches'][0]['values_A']
        assert all(math.isclose(a, b, abs_tol=1e-12) for a, b in zip(values, [-.001, 0, .001])), values
        assert flow['branches'][0]['mapping'] == 'unmapped'; assert 'layout_sha256' not in flow
        log = (root / 'job' / 'stdout.log').read_text()
        return {'schema_version': 1, 'test': 'actual-ngspice-result-adapter-calibration', 'status': 'pass', 'vendor_execution_verified': False,
                'actual_tool': 'ngspice', 'fixture_kind': 'actual_open_source_execution', 'deck_sha256': hashlib.sha256(DECK.encode()).hexdigest(),
                'source_hashes': {path.relative_to(ROOT).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest() for path in (ROOT / 'platform' / 'commercial' / 'runner.py', ROOT / 'workers' / 'eda' / 'commercial_results.py', Path(__file__).resolve())},
                'receipt': receipt, 'analysis_result': parsed['analysis_result'], 'current_flow': flow, 'parser_provenance': parsed['parser_provenance'],
                'actual_sample_exports': {key: (root / 'job' / 'outputs' / item['path']).read_text() for key, item in receipt['outputs'].items()},
                'stdout_sha256': hashlib.sha256(log.encode()).hexdigest(), 'physical_layout_mapping': 'none'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--executable', required=True); parser.add_argument('--evidence'); args = parser.parse_args()
    evidence = calibrate(args.executable)
    if args.evidence:
        target = Path(args.evidence); target.parent.mkdir(parents=True, exist_ok=True); target.write_text(json.dumps(evidence, indent=2))
    print(json.dumps({'status': evidence['status'], 'actual_tool': evidence['actual_tool'], 'current_A': evidence['current_flow']['branches'][0]['values_A'],
                      'vendor_execution_verified': False, 'evidence': args.evidence}))
