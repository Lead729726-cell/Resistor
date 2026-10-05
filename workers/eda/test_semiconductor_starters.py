"""Actual native starter execution and isolation/idempotency checks."""
import copy
import hashlib
import json
import os
from pathlib import Path
import time
import uuid

ROOT = Path('/workspace')
OUT = ROOT / '.runtime/evidence' / ('semiconductor-starters-' + uuid.uuid4().hex)
OUT.mkdir(parents=True)
os.environ['MOS_STATE'] = str(OUT / 'state')
os.environ['MOS_TOKEN'] = 'isolated-not-a-credential'
os.environ['PATH'] = '/foss/tools/magic/bin:/foss/tools/netgen/bin:/foss/tools/ngspice/bin:/foss/tools/xschem/bin:' + os.environ['PATH']
import server as S
import semiconductor_starters as P
from geometry import EDAError

cases = []


def save():
    files = ['workers/eda/semiconductor_starters.py', 'workers/eda/server.py', 'workers/eda/design_tools.py',
             'workers/eda/test_semiconductor_starters.py', 'packages/ui/src/SemiconductorStarters.tsx', 'packages/contracts/src/index.ts']
    receipt = {'schema_version': 1, 'passed': sum(c['result'] == 'pass' for c in cases), 'case_count': len(cases),
        'cases': cases, 'state_root': str(OUT / 'state'), 'source_sha256': {f: hashlib.sha256((ROOT / f).read_bytes()).hexdigest() for f in files},
        'actual_tools': ['ngspice', 'Magic', 'Netgen', 'KLayout'], 'external_technologies_executed': False}
    (ROOT / 'docs/evidence/semiconductor-starters-native.json').write_text(json.dumps(receipt, indent=2, ensure_ascii=False))
    (OUT / 'result.json').write_text(json.dumps(receipt, indent=2, ensure_ascii=False))


def case(name, function):
    start = time.monotonic()
    try:
        result = function() or {}
        cases.append({'case': name, 'result': 'pass', 'elapsed_s': time.monotonic() - start, **result})
        print('PASS ' + name, flush=True)
    except Exception as error:
        cases.append({'case': name, 'result': 'fail', 'error': str(error)})
        save()
        raise


def failure(function, code):
    try:
        function()
    except EDAError as error:
        assert error.code == code, (error.code, code)
        return
    raise AssertionError('Expected ' + code)


def run(project, method='simulation.run'):
    result = S.rpc(method, {'project_id': project['id'], 'expected_revision': project['revision'], **(project['testbench'] if method == 'simulation.run' else {})})
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        result = S.get_run(result['id'])
        if result['execution_status'] not in ('queued', 'running'):
            break
        time.sleep(.05)
    assert result['execution_status'] == 'completed' and result['analysis_result'] == 'pass', (result['id'], result['message'])
    return result


def catalog_checks():
    catalog = S.rpc('starter.catalog', {})
    assert len(catalog['presets']) == 8 and len(catalog['technologies']) == 3
    assert catalog['technologies'][0]['execution_available']
    assert all(not t['execution_available'] for t in catalog['technologies'][1:])
    assert next(p for p in catalog['presets'] if p['id'] == 'signal_filter')['modes'] == ['nominal']
    failure(lambda: S.rpc('starter.create', {'preset_id': {}, 'command_id': str(uuid.uuid4())}), 'UNSUPPORTED_STARTER')
    failure(lambda: S.rpc('starter.create', {'preset_id': 'gf180mcuD', 'command_id': str(uuid.uuid4())}), 'UNSUPPORTED_STARTER')
    failure(lambda: S.rpc('starter.create', {'preset_id': 'first_cmos', 'testbench': {'supply_V': 6}, 'command_id': str(uuid.uuid4())}), 'INVALID_PARAMETER')
    failure(lambda: S.rpc('starter.create', {'preset_id': 'signal_filter', 'mode': 'slow_hot', 'command_id': str(uuid.uuid4())}), 'UNSUPPORTED_STARTER_MODE')
    return {'presets': 8, 'connected_technologies': ['sky130A'], 'reference_technologies': ['gf180mcuD', 'ihp-sg13g2']}


case('actual readiness and unsupported cross-PDK/parameter requests rejected', catalog_checks)
projects = {}
for preset in P.PRESETS:
    modes = ['nominal'] if P.PRESETS[preset].get('ideal_components') else ['nominal', 'slow_hot', 'fast_cold']
    for mode in modes:
        def execute(preset=preset, mode=mode):
            params = {'preset_id': preset, 'mode': mode, 'name': 'Native starter ' + preset + ' ' + mode, 'command_id': str(uuid.uuid4())}
            project = S.rpc('starter.create', params)
            again = S.rpc('starter.create', params)
            assert project['id'] == again['id'] and project['revision'] == 1
            expected = P.configuration(preset, mode)
            assert project['testbench'] == expected['testbench']
            assert project['semiconductor_starter'] == expected['metadata']
            assert S.history_project(project['id'], 1)['testbench'] == expected['testbench']
            assert S.native.validate(project['schematic'])['valid']
            layout = S.load_layout(project)
            assert layout.cell(project['cell']).is_empty() == (expected['layout'] == 'schematic')
            failure(lambda: S.rpc('starter.create', {**params, 'name': 'changed'}), 'COMMAND_ID_CONFLICT')
            result = run(project)
            manifest = json.loads(Path(result['manifest_path']).read_text())
            for key in ('analysis', 'corner', 'temperature_C', 'supply_V', 'load_F'):
                assert manifest['settings'][key] == project['testbench'][key]
            assert result['waveforms'] and all(w['y'] for w in result['waveforms'])
            if preset == 'mux4_reference':
                assert result['digital_verification']['passed_cases'] == 64
            projects[(preset, mode)] = project
            return {'project_id': project['id'], 'revision': 1, 'run_id': result['id'], 'conditions': project['testbench'],
                    'manifest_path': result['manifest_path'], 'measurements': result['measurements'], 'layout': expected['layout']}
        case('actual ' + preset + ' ' + mode + ' settings, immutable save and ngspice analysis', execute)


def original_isolation():
    original = projects[('first_cmos', 'nominal')]
    frozen = copy.deepcopy(S.get_project(original['id']))
    second = S.rpc('starter.create', {'preset_id': 'mos_characteristics', 'command_id': str(uuid.uuid4())})
    assert second['id'] != original['id'] and S.get_project(original['id']) == frozen
    cloned = S.rpc('project.clone', {'project_id': original['id']})
    assert cloned['semiconductor_starter'] == original['semiconductor_starter']
    bundle = S.rpc('project.export_bundle', {'project_id': original['id'], 'revision': 1})
    restored = S.rpc('project.import_bundle', {'path': bundle['path'], 'mode': 'new'})
    assert restored['semiconductor_starter'] == original['semiconductor_starter'] and restored['testbench'] == original['testbench']
    return {'original_project_id': original['id'], 'cloned_project_id': cloned['id'], 'restored_project_id': restored['id']}


case('new starter preserves original design; clone and bundle restore retain setup', original_isolation)


def physical_check():
    project = projects[('first_cmos', 'nominal')]
    drc = run(project, 'verification.run_drc')
    lvs = run(project, 'verification.run_lvs')
    assert not drc['markers']
    return {'project_id': project['id'], 'drc_run_id': drc['id'], 'lvs_run_id': lvs['id'], 'drc_markers': 0}


case('actual first-CMOS starter Magic DRC and Netgen LVS', physical_check)
save()
print(f"Semiconductor starters: {len(cases)}/{len(cases)} PASS", flush=True)
