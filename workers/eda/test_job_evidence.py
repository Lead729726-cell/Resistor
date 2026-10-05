import contextlib
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from job_evidence import write_job_evidence


class JobEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.folder = Path(self.tmp.name)
        self.run = {'execution_status': 'completed', 'analysis_result': 'pass', 'ended_at': 'now', 'elapsed_s': 1}
        self.manifest = {'run_id': 'r'}
        (self.folder/'output.dat').write_text('native data')
        (self.folder/'manifest.json').write_text('{"preserved":true}')

    def tearDown(self):self.tmp.cleanup()
    def dump(self, path, value):path.write_text(json.dumps(value))
    def sha(self, path):return hashlib.sha256(path.read_bytes()).hexdigest()
    def write(self, dump=None, sha=None):
        with contextlib.redirect_stderr(io.StringIO()):
            return write_job_evidence(self.run, self.manifest, self.folder, dump or self.dump, sha or self.sha)

    def test_success_atomically_publishes_native_artifact_hash_and_terminal_state(self):
        self.assertTrue(self.write())
        m = json.loads((self.folder/'manifest.json').read_text())
        self.assertEqual(m['execution_status'], 'completed')
        self.assertEqual(m['artifacts'][str(self.folder/'output.dat')], self.sha(self.folder/'output.dat'))
        self.assertFalse((self.folder/'manifest.json.tmp').exists())

    def test_write_failure_keeps_existing_manifest_and_sets_failed_unknown(self):
        def broken(path, value):path.write_text('partial');raise OSError('disk full')
        self.assertFalse(self.write(dump=broken))
        self.assertEqual(self.run['execution_status'], 'failed');self.assertEqual(self.run['analysis_result'], 'unknown')
        self.assertIn('disk full', self.run['message'])
        self.assertEqual(json.loads((self.folder/'manifest.json').read_text()), {'preserved': True})
        self.assertFalse((self.folder/'manifest.json.tmp').exists())

    def test_read_failure_cannot_certify_pass(self):
        def broken(path):raise OSError('input/output error')
        self.assertFalse(self.write(sha=broken))
        self.assertEqual(self.run['analysis_result'], 'unknown')
        self.assertEqual(self.manifest['evidence_error']['code'], 'EVIDENCE_WRITE_FAILED')

    def test_cancel_remains_authoritative_during_evidence_failure(self):
        self.run.update(execution_status='canceled', analysis_result='unknown', message='Canceled by user.')
        def broken(path, value):raise OSError('disk full')
        self.assertFalse(self.write(dump=broken))
        self.assertEqual(self.run['execution_status'], 'canceled')

    def test_original_engine_failure_reason_is_preserved(self):
        self.run.update(execution_status='failed', analysis_result='unknown', message='Native convergence failure')
        def broken(path, value):raise OSError('disk full')
        self.write(dump=broken);self.assertTrue(self.run['message'].startswith('Native convergence failure;'))


if __name__ == '__main__':unittest.main()
