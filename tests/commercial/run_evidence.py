"""Record independent synthetic/parser audit suites and separate real calibration."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2]


def hashes(paths):
    return {p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths if p.is_file()}


def suite(name):
    source = ROOT / 'tests' / 'commercial' / name
    run = subprocess.run([sys.executable, str(source)], cwd=ROOT, capture_output=True, text=True, timeout=30)
    output = run.stdout + run.stderr
    count = re.search(r'Ran (\d+) tests?', output)
    return {'suite': source.relative_to(ROOT).as_posix(), 'test_count': int(count[1]) if count else None,
            'status': 'pass' if run.returncode == 0 else 'fail', 'exit_code': run.returncode,
            'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'output': output}


if __name__ == '__main__':
    target = ROOT / 'docs' / 'evidence'; target.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).isoformat()
    parser = suite('test_results.py'); audit = suite('test_bridge_audit.py')
    actual_path = ROOT / '.runtime' / 'evidence' / 'commercial-adapter-ngspice.json'
    actual = json.loads(actual_path.read_text()) if actual_path.exists() else {'status': 'unavailable', 'vendor_execution_verified': False}
    sources = [ROOT / 'workers' / 'eda' / 'commercial_results.py', *sorted((ROOT / 'tests' / 'commercial' / 'fixtures').glob('*'))]
    report = {'schema_version': 1, 'recorded_at': timestamp, 'test_category': 'synthetic_text_grammar_parser', 'vendor_execution_verified': False,
              'parser_suite': parser, 'source_hashes': hashes(sources), 'fixture_origin': 'new synthetic grammar fixtures, not vendor output',
              'actual_open_source_calibration': {'source': actual_path.relative_to(ROOT).as_posix(), 'source_sha256': hashlib.sha256(actual_path.read_bytes()).hexdigest() if actual_path.exists() else None, 'evidence': actual},
              'limitations': ['No commercial binary or license execution verified.', 'Calibre summary grammar is a restricted complete site export, not every native report dialect.', 'Binary PSF/PSFXL/encrypted vendor databases unsupported.', 'No inferred current paths or GDS/opaque database correspondence.']}
    (target / 'commercial-results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    native_path = target / 'commercial-backend.json'
    native = json.loads(native_path.read_text()) if native_path.exists() else {}
    owner_covered = bool(native.get('cases')) and all(case.get('result') == 'pass' for case in native['cases']) and len(native['cases']) >= 34
    report = {'schema_version': 1, 'recorded_at': timestamp, 'test_category': 'isolated_bridge_validator_receipt_and_http_transport_audit', 'vendor_execution_verified': False,
              'audit_suite': audit, 'source_hashes': hashes([ROOT / 'platform' / 'commercial' / 'runner.py', ROOT / 'platform' / 'commercial' / 'agent.py', ROOT / 'workers' / 'eda' / 'commercial_backend.py']),
              'uses_synthetic_credential': True, 'credential_printed_or_included': False, 'placeholder_executable_launched': False,
              'resolved_findings': ['Redirect forwarding of private agent header is blocked.', 'Client external file= reference syntax rejected.', 'First job creates state/jobs directory.', 'Receipt replay remains stable after agent restart.'],
              'source_reviewed_fixes': ['Bounded directory traversal rejects more than4096 entries before materializing a whole tree.', 'Unsafe operator state paths rejected before Tcl/SKILL generation.', 'Exact executable/resource-copy output hashes rejected.', 'Opaque sensitive environment output rejected.', 'Failed/canceled terminal runs remove current_flow before persistence.'],
              'owner_native_regressions': {'source': native_path.relative_to(ROOT).as_posix(), 'case_count': len(native.get('cases', [])), 'completed': owner_covered,
                  'vendor_execution_verified': False, 'source_sha256': hashlib.sha256(native_path.read_bytes()).hexdigest() if native_path.exists() else None},
              'pending_owner_regressions': [] if owner_covered else ['Native integration exercise of resource-output suppression and late cancel.']}
    (target / 'commercial-audit.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'parser': {k: parser[k] for k in ('test_count', 'status')}, 'bridge_audit': {k: audit[k] for k in ('test_count', 'status')},
                      'actual_ngspice': actual['status'], 'vendor_execution_verified': False, 'evidence': ['docs/evidence/commercial-results.json', 'docs/evidence/commercial-audit.json']}))
    sys.exit(0 if parser['status'] == audit['status'] == 'pass' else 1)
