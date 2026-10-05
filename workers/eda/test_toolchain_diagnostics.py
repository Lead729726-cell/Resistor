import subprocess
import unittest
from types import SimpleNamespace
from toolchain_diagnostics import ToolchainDiagnostics


class DiagnosticTests(unittest.TestCase):
    def setUp(self):
        self.time = 0
        self.calls = 0
        self.output = SimpleNamespace(returncode=0, stdout='ngspice 45.2')
        self.failure = None

        def run(*args, **kwargs):
            self.calls += 1
            if self.failure:
                raise self.failure
            return self.output

        self.diagnostics = ToolchainDiagnostics(runner=run, which=lambda _: '/tools/ngspice',
            clock=lambda: self.time, commands=(('ngspice', ('ngspice', '--version')),))

    def test_timeout_is_not_cached_forever_and_path_is_preserved(self):
        self.failure = subprocess.TimeoutExpired('ngspice', 10)
        row = self.diagnostics.inspect()[0]
        self.assertFalse(row['available'])
        self.assertEqual(row['path'], '/tools/ngspice')
        self.assertEqual(row['probe_status'], 'timeout')
        self.failure = None
        self.assertFalse(self.diagnostics.inspect()[0]['available'])
        self.assertEqual(self.calls, 1)
        self.time = 16
        self.assertTrue(self.diagnostics.inspect()[0]['available'])
        self.assertEqual(self.calls, 2)

    def test_explicit_refresh_retries_immediately(self):
        self.failure = OSError('temporary failure')
        self.assertFalse(self.diagnostics.inspect()[0]['available'])
        self.failure = None
        self.assertTrue(self.diagnostics.inspect(refresh=True)[0]['available'])

    def test_success_cache_is_bounded_and_return_values_are_detached(self):
        self.diagnostics.inspect()[0]['available'] = False
        self.assertTrue(self.diagnostics.inspect()[0]['available'])
        self.assertEqual(self.calls, 1)
        self.time = 301
        self.diagnostics.inspect()
        self.assertEqual(self.calls, 2)

    def test_missing_executable_never_runs_or_claims_availability(self):
        self.diagnostics.which = lambda _: None
        self.assertEqual(self.diagnostics.inspect()[0]['probe_status'], 'missing')
        self.assertEqual(self.calls, 0)

    def test_nonzero_probe_is_not_a_success(self):
        self.output.returncode = 1
        self.output.stdout = 'ImportError: missing klayout'
        row = self.diagnostics.inspect()[0]
        self.assertFalse(row['available'])
        self.assertEqual(row['probe_status'], 'failed')


if __name__ == '__main__':
    unittest.main()
