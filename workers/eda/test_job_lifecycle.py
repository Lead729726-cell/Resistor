"""Fault injection uses an isolated in-container database, never a user project."""
import contextlib
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

state = tempfile.TemporaryDirectory()
os.environ['MOS_STATE'] = state.name
import server as S


class JobLifecycleTests(unittest.TestCase):
    def setUp(self):
        self.run = {'id': 'r', 'project_id': 'p', 'revision': 1, 'kind': 'simulation', 'input_signature': 's',
                    'execution_status': 'queued', 'analysis_result': 'unknown', 'artifacts': {}}
        self.project = {'id': 'p', 'cell': 'top', 'revision': 1, 'schematic': {'devices': [], 'wires': []}}
        self.folder = Path(state.name)/'runs/r';self.folder.mkdir(parents=True, exist_ok=True)
        for f in self.folder.iterdir():f.unlink()
        S.put_run(self.run)

    def stored(self):return json.loads(S.DB.execute('SELECT data FROM runs WHERE id="r"').fetchone()[0])
    def engine(self, run, *args):run.update(analysis_result='pass', message='Fixture engine completed')
    def execute(self, dump=None, engine=None):
        with contextlib.redirect_stderr(io.StringIO()), patch.object(S, 'doctor', return_value={}), patch.object(S, 'tool_hashes', return_value={}), \
             patch.object(S, 'initial_models', return_value=[]), patch.object(S.profile, 'provenance', return_value={}), \
             patch.object(S, 'simulation', side_effect=engine or self.engine), patch.object(S, 'dump', side_effect=dump or S.dump):
            S.execute_job(self.run, self.project, {}, self.folder)

    def test_preflight_input_io_error_finishes_failed_with_evidence_instead_of_running(self):
        sha = S.profile.sha
        def broken(path):
            if Path(path).name == 'input.oas':raise OSError('input/output error')
            return sha(path)
        with patch.object(S.profile, 'sha', side_effect=broken):self.execute()
        self.assertEqual(self.stored()['execution_status'], 'failed')
        self.assertEqual(self.stored()['analysis_result'], 'unknown')
        manifest = json.loads((self.folder/'manifest.json').read_text())
        self.assertEqual(manifest['execution_status'], 'failed');self.assertIn('error', manifest)

    def test_completed_engine_evidence_write_failure_is_persisted_failed_unknown(self):
        (self.folder/'input.oas').write_bytes(b'fixture')
        def broken(path, data):raise OSError('disk full')
        self.execute(dump=broken)
        self.assertEqual(self.stored()['execution_status'], 'failed')
        self.assertEqual(self.stored()['analysis_result'], 'unknown')
        self.assertIn('disk full', self.stored()['message'])

    def test_cancel_race_is_persisted_canceled_even_if_evidence_write_fails(self):
        (self.folder/'input.oas').write_bytes(b'fixture')
        def engine(run, *args):
            canceled = {**run, 'execution_status': 'canceled', 'analysis_result': 'unknown'};S.put_run(canceled)
            self.engine(run)
        def broken(path, data):raise OSError('disk full')
        self.execute(dump=broken, engine=engine)
        self.assertEqual(self.stored()['execution_status'], 'canceled')
        self.assertEqual(self.stored()['analysis_result'], 'unknown')


if __name__ == '__main__':
    try:unittest.main()
    finally:S.DB.close();state.cleanup()
