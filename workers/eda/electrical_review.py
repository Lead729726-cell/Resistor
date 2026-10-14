"""Read actual revision-bound OTA mismatch evidence; never derive it from masks.

Finite public-model follower offsets are circuit measurements, not pair-device
matching, calibrated yield, silicon correlation, or manufacturing signoff.
"""
import hashlib
import json
import math
from pathlib import Path
import re
import characterization as Q
from geometry import EDAError

ASSESSMENT = 'ota_follower_offset'
SCOPE = 'Public SKY130 OTA unity follower offset, finite local-mismatch samples; no device-pair/yield/foundry signoff.'


def finite(value, lo, hi):
    return not isinstance(value, bool) and isinstance(value, (int, float)) and math.isfinite(value) and lo <= value <= hi


def validate(criteria):
    # Old designer descriptions remain record-only, with no automatic verdict.
    if not criteria or set(criteria) <= {'description'}:
        return
    keys = {'assessment', 'run_ids', 'offset_limit_V', 'minimum_samples', 'seed', 'conditions', 'require_pre_and_post'}
    if set(criteria) != keys or criteria['assessment'] != ASSESSMENT:
        raise EDAError('INVALID_REVIEW', 'Select the supported OTA follower assessment with complete explicit criteria.')
    ids = criteria['run_ids']
    if not isinstance(ids, list) or not 1 <= len(ids) <= 12 or any(not isinstance(v, str) or not re.fullmatch(r'[a-f0-9]{32}', v) for v in ids) or len(set(ids)) != len(ids):
        raise EDAError('INVALID_REVIEW', 'Select 1..12 distinct actual native run IDs.')
    if not finite(criteria['offset_limit_V'], 1e-6, .1) or type(criteria['minimum_samples']) is not int or not 4 <= criteria['minimum_samples'] <= 64 or type(criteria['seed']) is not int or not 1 <= criteria['seed'] <= 1000000000 or type(criteria['require_pre_and_post']) is not bool:
        raise EDAError('INVALID_REVIEW', 'Specify bounded voltage, sample count, seed and pre/post coverage.')
    conditions = criteria['conditions']
    if not isinstance(conditions, list) or not 1 <= len(conditions) <= 6:
        raise EDAError('INVALID_REVIEW', 'Select 1..6 explicit PVT conditions.')
    for c in conditions:
        if not isinstance(c, dict) or set(c) != {'corner', 'temperature_C', 'supply_V'} or c['corner'] not in ('tt', 'ff', 'ss') or not finite(c['temperature_C'], -40, 125) or not finite(c['supply_V'], 1.6, 1.8):
            raise EDAError('INVALID_REVIEW', 'Supported PVT: TT/FF/SS, -40..125 C, 1.6..1.8 V.')
    if len({condition_key(c) for c in conditions}) != len(conditions):
        raise EDAError('INVALID_REVIEW', 'Duplicate PVT conditions do not add coverage.')


def condition_key(settings):
    return tuple(settings[key] for key in ('corner', 'temperature_C', 'supply_V'))


def bytes_sha(file):
    return hashlib.sha256(Path(file).read_bytes()).hexdigest()


def read_json(S, file, maximum=4*1024*1024):
    file = S.trusted(file)
    if file.stat().st_size > maximum:
        raise EDAError('EVIDENCE_CORRUPT', 'Electrical evidence exceeds the bounded file size.')
    return json.loads(file.read_text(encoding='utf-8')), file


def evidence(S, p, run_id):
    run = S.get_run(run_id)
    if run['project_id'] != p['id'] or run['revision'] != p['revision'] or run.get('freshness') != 'current':
        raise EDAError('EVIDENCE_STALE', 'Run belongs to another project/revision or changed engine/model inputs.')
    if run.get('workflow') in ('commercial-backend', 'imported-results') or run.get('kind') != 'simulation' or run.get('tool') != 'ngspice' or run['execution_status'] != 'completed' or run['analysis_result'] not in ('pass', 'fail'):
        raise EDAError('EVIDENCE_UNAVAILABLE', 'A completed actual native characterization is required.')
    report, report_file = read_json(S, run['artifacts']['characterization'])
    manifest, manifest_file = read_json(S, run['manifest_path'])
    if any(manifest.get(key) != value for key, value in [('run_id', run_id), ('project_id', p['id']), ('revision', p['revision']), ('input_signature', run['input_signature']), ('execution_status', 'completed')]):
        raise EDAError('EVIDENCE_CORRUPT', 'Manifest identity/state differs from the actual stored run.')
    expected = manifest.get('artifacts', {}).get(str(report_file))
    if expected != bytes_sha(report_file):
        raise EDAError('EVIDENCE_CORRUPT', 'Characterization checksum differs from the completed native manifest.')
    native = manifest.get('characterization', {})
    config = report['config']
    if report.get('mode') != 'mismatch' or report.get('native_engine') != 'ngspice' or native.get('mismatch_switch') != 1 or native.get('process_switch') != 0 or native.get('config') != config:
        raise EDAError('EVIDENCE_UNSUPPORTED', 'Only the active public local-mismatch OTA fixture is evaluated.')
    for role, field in [('characterization_models', 'model_deck_sha256'), ('characterization_fixture', 'fixture_sha256')]:
        file = S.trusted(run['artifacts'][role])
        if bytes_sha(file) != native[field]:
            raise EDAError('EVIDENCE_CORRUPT', 'Native model/fixture checksum changed.')
    rows = report['rows']
    if config['mode'] != 'mismatch' or type(config['samples']) is not int or not 4 <= config['samples'] <= 64 or len(rows) != config['samples']:
        raise EDAError('EVIDENCE_CORRUPT', 'Native mismatch sample coverage changed.')
    commands = manifest['commands']
    if sum(c.get('returncode') == 0 and any('ngspice' in str(a) for a in c.get('argv', [])) for c in commands) != len(rows):
        raise EDAError('EVIDENCE_CORRUPT', 'Completed native ngspice commands do not cover the sample set.')
    settings = report['settings']
    if any(settings[key] != manifest['settings'][key] for key in ('corner', 'temperature_C', 'supply_V')) or type(report['post_layout']) is not bool or report['post_layout'] != manifest['settings'].get('post_layout', False):
        raise EDAError('EVIDENCE_CORRUPT', 'PVT or extraction settings disagree.')
    if report['post_layout'] and not any(c.get('returncode') == 0 and 'magic' in Path(str(c.get('argv', [''])[0])).name for c in commands):
        raise EDAError('EVIDENCE_CORRUPT', 'Post-layout fixture has no actual completed extraction command.')
    for i, row in enumerate(rows):
        folder = report_file.parent/f'sample-{i+1:03d}'
        for name, key in [('offset.dat', 'output_sha256'), ('characterization.spice', 'controller_sha256')]:
            if bytes_sha(S.trusted(str(folder/name))) != row[key]:
                raise EDAError('EVIDENCE_CORRUPT', 'Raw sample/controller checksum changed.')
        data = Q.table(folder/'offset.dat', 4)
        if len(data) != 1 or row['index'] != i+1 or row['seed'] != config['seed']+i or any(data[0][j] != row[key] for j, key in [(1, 'output_V'), (2, 'input_V'), (3, 'supply_current_A')]) or row['offset_V'] != row['output_V']-row['input_V']:
            raise EDAError('EVIDENCE_CORRUPT', 'Raw native sample, seed or offset equation disagrees.')
    metrics = Q.mismatch_result(rows, config)
    if metrics != report['metrics']:
        raise EDAError('EVIDENCE_CORRUPT', 'Reported metrics disagree with independently recomputed samples.')
    return {'run_id': run_id, 'post_layout': report['post_layout'], 'settings': {key: settings[key] for key in ('corner', 'temperature_C', 'supply_V')},
            'metrics': metrics, 'seed': config['seed'], 'manifest_sha256': bytes_sha(manifest_file),
            'characterization_sha256': expected, 'model_deck_sha256': native['model_deck_sha256'], 'scope': SCOPE}


def evaluate(S, p, constraint):
    result = {'electrical_assessment': 'not_run', 'status': 'not_run', 'reason': 'Select actual OTA mismatch run IDs and explicit PVT/sample/voltage criteria.'}
    criteria = constraint['criteria']
    if not criteria or criteria.get('assessment') != ASSESSMENT:
        return result
    if constraint['targets']:
        return {**result, 'reason': 'This circuit-level offset assessment does not establish matching of selected mask/device pairs.'}
    if p.get('design_template', {}).get('id') != 'soc_miller_ota':
        return {**result, 'reason': 'Only the owned public OTA follower is supported; arbitrary circuits require a characterized evaluator.'}
    try:
        rows = [evidence(S, p, run_id) for run_id in criteria['run_ids']]
        required = {condition_key(c) for c in criteria['conditions']}
        actual = {condition_key(r['settings']) for r in rows}
        stages = {False, True} if criteria['require_pre_and_post'] else None
        if actual != required or any(r['metrics']['samples'] < criteria['minimum_samples'] or r['seed'] != criteria['seed'] for r in rows) or (stages is not None and any({r['post_layout'] for r in rows if condition_key(r['settings']) == c} != stages for c in required)):
            return {**result, 'reason': 'Explicit PVT, common seed, sample count or pre/post coverage is incomplete.', 'metrics': {'runs': rows}}
        observed = max(r['metrics']['offset_abs_max_V'] for r in rows)
        passed = observed <= criteria['offset_limit_V']
        return {'status': 'pass' if passed else 'fail', 'electrical_assessment': 'evaluated',
                'reason': 'Finite native OTA follower offset criterion '+('satisfied.' if passed else 'violated.'),
                'metrics': {'offset_abs_max_V': observed, 'offset_limit_V': criteria['offset_limit_V'], 'runs': rows, 'scope': SCOPE,
                            'device_pair_matching_verified': False, 'yield_verified': False, 'foundry_signoff': False}}
    except EDAError as error:
        return {**result, 'status': 'error' if error.code == 'EVIDENCE_CORRUPT' else 'not_run', 'error_code': error.code, 'reason': str(error)}
    except (OSError, ValueError, KeyError, TypeError, IndexError) as error:
        return {**result, 'status': 'error', 'error_code': 'EVIDENCE_CORRUPT', 'reason': 'Missing or malformed native electrical evidence: '+str(error)}
