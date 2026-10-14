import os
import unittest
from pathlib import Path
from workspace_paths import legacy_local_path


class WorkspaceAliasTests(unittest.TestCase):
    def test_windows_history_remaps_only_same_wsl_workspace(self):
        root = Path('/mnt/d/Coldbrew/Resistor').resolve()
        self.assertEqual(legacy_local_path(r'D:\Coldbrew\Resistor\.runtime\eda\run\stdout.log', root, 'wsl-linux'), str(root / '.runtime/eda/run/stdout.log'))
        self.assertIsNone(legacy_local_path(r'D:\Other\private.txt', root, 'wsl-linux'))
        self.assertIsNone(legacy_local_path(r'D:\Coldbrew\Resistor\..\private.txt', root, 'wsl-linux'))

    def test_unrecognized_mount_unc_and_controls_remain_unresolved(self):
        for value in [r'\\server\design', 'D:\\design\nsecret', 'relative', '/tmp/private']:
            self.assertIsNone(legacy_local_path(value, '/home/student/design', 'wsl-linux'))
        self.assertIsNone(legacy_local_path('D:\\Coldbrew\\Resistor\0file', '/mnt/d/Coldbrew/Resistor', 'wsl-linux'))

    @unittest.skipUnless(os.name == 'nt', 'Windows path resolution requires Windows')
    def test_wsl_history_reopens_on_windows_without_exposing_other_paths(self):
        root = Path('D:/Coldbrew/Resistor')
        self.assertEqual(legacy_local_path('/mnt/d/Coldbrew/Resistor/.runtime/eda/stdout.log', root, 'native-win32'), str(root / '.runtime/eda/stdout.log'))
        self.assertIsNone(legacy_local_path('/mnt/d/private.txt', root, 'native-win32'))
        self.assertIsNone(legacy_local_path('/mnt/d/Coldbrew/Resistor/../private.txt', root, 'native-win32'))
