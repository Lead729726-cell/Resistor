"""Independent pure-stdlib bridge audit. Synthetic inputs, no vendor launch."""
import base64
import copy
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import types
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'platform' / 'commercial'))
import runner
import agent


class GeometryError(Exception):
    def __init__(self, code, message): self.code = code; super().__init__(message)


# Isolate the transport module from KLayout. We test its real urllib path, not
# geometry, RPC execution, a license or a vendor simulation.
old_geometry = sys.modules.get('geometry')
sys.modules['geometry'] = types.SimpleNamespace(EDAError=GeometryError)
spec = importlib.util.spec_from_file_location('audit_commercial_backend', ROOT / 'workers' / 'eda' / 'commercial_backend.py')
backend = importlib.util.module_from_spec(spec); spec.loader.exec_module(backend)
backend.runner = runner
if old_geometry is None: del sys.modules['geometry']
else: sys.modules['geometry'] = old_geometry


class NoLaunchPool:
    def __init__(self): self.calls = 0
    def submit(self, *args): self.calls += 1
    def shutdown(self, **kwargs): pass


class BridgeAudit(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.root = Path(self.temp.name)
        self.connections = []
        self.exe = self.root / ('ngspice.exe' if os.name == 'nt' else 'ngspice')
        self.exe.write_text('Synthetic validator placeholder; never executed'); self.exe.chmod(0o700)
        self.deck = self.root / 'calibration.spice'; self.deck.write_text('Synthetic reference fixture\nR1 n 0 1000\n.end\n')
        self.manifest = {'schema_version': 1, 'id': 'audit_profile', 'name': 'Synthetic validator profile', 'tool_id': 'ngspice', 'version': 'parser-only',
                         'runner': {'kind': 'local', 'executable': str(self.exe), 'env_names': [], 'resources': {'deck': str(self.deck)},
                                    'recipes': {'simulation': {'argv': ['-b', '{resource.deck}'], 'outputs': {'waves': 'wave.dat'}, 'result_context': {}, 'parameters': {}}}}}

    def tearDown(self):
        for connection in self.connections:
            try: connection.close()
            except Exception: pass
        self.temp.cleanup()

    def rejection(self, fn):
        with self.assertRaises((runner.RunnerError, GeometryError)): fn()

    def test_operator_roots_and_executable_family_are_enforced(self):
        normalized = runner.normalize(self.manifest, [self.root]); self.assertEqual(normalized['runner']['executable'], str(self.exe.resolve()))
        bad = copy.deepcopy(self.manifest); bad['runner']['executable'] = str(self.root / 'python.exe')
        self.rejection(lambda: runner.normalize(bad, [self.root]))
        self.rejection(lambda: runner.normalize(self.manifest, [self.root / 'other']))

    def test_typed_parameters_cannot_insert_script_or_argv_fragments(self):
        normalized = runner.normalize(self.manifest, [self.root]); recipe = normalized['runner']['recipes']['simulation']
        recipe['parameters'] = {'corner': {'type': 'string', 'enum': ['tt', 'ss']}, 'voltage': {'type': 'number', 'min': 0, 'max': 2}}
        self.assertEqual(runner.parameters(recipe, {'corner': 'tt', 'voltage': 1.2})['voltage'], 1.2)
        for values in ({'corner': 'tt; exec unsafe', 'voltage': 1}, {'corner': 'tt', 'voltage': float('nan')}, {'corner': 'tt', 'voltage': 3}, {'corner': 'tt', 'voltage': 1, 'argv': '-shell'}):
            self.rejection(lambda v=values: runner.parameters(recipe, v))

    def test_unknown_placeholders_and_escape_output_paths_reject(self):
        for placeholder in ('{shell}', '{parameter.unapproved}', '{input.password}', '{resource.missing}'):
            bad = copy.deepcopy(self.manifest); bad['runner']['recipes']['simulation']['argv'] = [placeholder]
            self.rejection(lambda m=bad: runner.normalize(m, [self.root]))
        for output in ('../resources/secret', '/absolute', 'a/../b', 'a;unsafe', 'a\\b'):
            bad = copy.deepcopy(self.manifest); bad['runner']['recipes']['simulation']['outputs']['waves'] = output
            self.rejection(lambda m=bad: runner.normalize(m, [self.root]))

    def test_opaque_library_lock_is_hash_evidence_not_vendor_decoding(self):
        library = self.root / 'opaque_library'; library.mkdir(); (library / 'cell').mkdir(); (library / 'cell' / 'unknown.db').write_bytes(b'opaque-database')
        before = runner.resource_lock(library); self.assertEqual(before['kind'], 'opaque-directory'); self.assertEqual(before['files'], 1)
        (library / 'cell' / 'unknown.db').write_bytes(b'changed-database')
        self.assertNotEqual(runner.resource_lock(library)['sha256'], before['sha256'])

    def test_zip_traversal_duplicate_symlink_and_unknown_inputs_reject(self):
        for name in ('../escaped', 'unknown.txt', 'sub/layout.gds'):
            out = io.BytesIO()
            with zipfile.ZipFile(out, 'w') as z: z.writestr(name, b'fixture')
            self.rejection(lambda raw=out.getvalue(): runner.unpack(base64.b64encode(raw).decode()))
        out = io.BytesIO()
        with zipfile.ZipFile(out, 'w') as z:
            entry = zipfile.ZipInfo('layout.gds'); entry.create_system = 3; entry.external_attr = (0o120777 << 16); z.writestr(entry, b'../secret')
        self.rejection(lambda: runner.unpack(base64.b64encode(out.getvalue()).decode()))

    def test_reference_cannot_enable_runtime_scripts_models_or_external_files(self):
        accepted = agent.safe_reference('.subckt top IN OUT\nR1 IN OUT 1k\n.ends top\n'); self.assertIn('R1', accepted)
        for text in ('.control\nshell unsafe\n.endc', '.include /private/model', '.pre_osdi /private/library', '.model injected d_process(command=unsafe)', 'Vstim1 (n 0) vsource type=pwl file="/unconfined.pwl"', 'V1 n 0 PWL FILE="/unconfined.pwl"'):
            with self.subTest(text=text): self.rejection(lambda value=text: agent.safe_reference(value))

    def test_stdout_redaction_preserves_no_split_value_or_overlong_fragment(self):
        variable = 'REGISTER_AUDIT_SYNTHETIC_ENV'
        value = 'SYNTHETIC_REDACTION_BOUNDARY_VALUE'
        previous = os.environ.get(variable); os.environ[variable] = value
        try:
            raw = ('short line ' + value + '\n' + 'x' * 65520 + value + '\n' + 'last ' + value).encode()
            log = self.root / 'redacted.log'; runner.write_redacted_stream(io.BytesIO(raw), log, [variable])
            text = log.read_text()
            self.assertNotIn(value, text)
            self.assertNotIn('SYNTHETIC_REDACTION', text)
            self.assertIn('[OVERLONG_NATIVE_LINE_DISCARDED_FOR_REDACTION]', text)
            self.assertIn('[REDACTED_ENV:' + variable + ']', text)
            runner.write_redacted_stream(io.BytesIO(((value + '\n') * 200000).encode()), log, [variable])
            bounded = log.read_text()
            self.assertIn('[NATIVE_LOG_TRUNCATED]', bounded)
            self.assertNotIn(value, bounded)
            self.assertLessEqual(log.stat().st_size, 4 * 1024 * 1024 + 64)
        finally:
            if previous is None: os.environ.pop(variable, None)
            else: os.environ[variable] = previous

    def test_receipt_replay_and_restart_never_duplicate_native_submission(self):
        config = {'allowed_roots': [str(self.root)], 'profiles': [self.manifest]}
        service = agent.Service(config, self.root / 'state'); self.connections.append(service.db); service.pool.shutdown(wait=False); service.pool = NoLaunchPool()
        fingerprint = runner.lock(service.profiles['audit_profile'])['fingerprint']
        request = {'profile_id': 'audit_profile', 'settings': {'operation': 'simulation', 'top_cell': 'top', 'parameters': {}},
                   'command_id': 'audit_command', 'pinned_fingerprint': fingerprint, 'input_package': runner.pack({'layout.gds': b'fixture-geometry'})}
        first = service.submit(request); again = service.submit(request)
        self.assertEqual(first['id'], again['id']); self.assertEqual(service.pool.calls, 1)
        bad = {**request, 'settings': {**request['settings'], 'top_cell': 'other'}}; self.rejection(lambda: service.submit(bad))
        service.db.close()
        restarted = agent.Service(config, self.root / 'state')
        self.connections.append(restarted.db)
        replay = restarted.submit(request); self.assertEqual(replay['id'], first['id']); self.assertEqual(replay['execution_status'], 'failed'); self.assertEqual(replay['error_code'], 'AGENT_RESTARTED')
        restarted.pool.shutdown(wait=False); restarted.db.close()

    def test_agent_url_redirect_does_not_forward_private_token(self):
        received = []
        class Sink(BaseHTTPRequestHandler):
            def log_message(self, *args): pass
            def do_POST(self):
                received.append(bool(self.headers.get('X-Register-Agent-Token'))); self.rfile.read(int(self.headers.get('Content-Length', '0')))
                data = b'{"ok":true,"result":{"redirected":true}}'; self.send_response(200); self.end_headers(); self.wfile.write(data)
            def do_GET(self):
                received.append(bool(self.headers.get('X-Register-Agent-Token')))
                data = b'{"ok":true,"result":{"redirected":true}}'; self.send_response(200); self.end_headers(); self.wfile.write(data)
        sink = ThreadingHTTPServer(('127.0.0.1', 0), Sink)
        class Redirect(BaseHTTPRequestHandler):
            def log_message(self, *args): pass
            def do_POST(self):
                self.rfile.read(int(self.headers.get('Content-Length', '0'))); self.send_response(302)
                self.send_header('Location', 'http://127.0.0.1:' + str(sink.server_port) + '/untrusted'); self.end_headers()
        redirect = ThreadingHTTPServer(('127.0.0.1', 0), Redirect)
        threads = [threading.Thread(target=s.serve_forever, daemon=True) for s in (sink, redirect)]
        for thread in threads: thread.start()
        # Synthetic credential is never printed or returned in evidence.
        tokenfile = self.root / 'transport.token'; tokenfile.write_text('synthetic-audit-token-' + 'x' * 32); tokenfile.chmod(0o600)
        try:
            m = {'runner': {'url': 'http://127.0.0.1:' + str(redirect.server_port), 'token_file': str(tokenfile)}}
            try: backend.remote(m, 'profile.list', {}, timeout=2)
            except GeometryError: pass
            self.assertFalse(any(received), 'Private token was forwarded to another origin by HTTP redirect')
        finally:
            for server in (sink, redirect): server.shutdown(); server.server_close()


if __name__ == '__main__': unittest.main(verbosity=2)
