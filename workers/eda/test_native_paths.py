import unittest
from pathlib import Path
import native
from geometry import EDAError

class NativePathTests(unittest.TestCase):
    def test_space_unicode_filename_remains_one_tcl_list_element(self):
        self.assertEqual(native.netgen_circuit(Path('/tmp/design 공간/layout.spice'),'inverter'),'{/tmp/design 공간/layout.spice} inverter')
    def test_plain_filename_has_identical_cell_and_path(self):
        self.assertEqual(native.netgen_circuit(Path('/tmp/layout.spice'),'top'),'{/tmp/layout.spice} top')
    def test_control_braces_and_nonidentifier_cells_are_rejected(self):
        for name,cell in [('/tmp/{file}','top'),('/tmp/file\n','top'),('/tmp/file','bad;exec')]:
            with self.assertRaises(EDAError):native.netgen_circuit(name,cell)

if __name__=='__main__':unittest.main()
