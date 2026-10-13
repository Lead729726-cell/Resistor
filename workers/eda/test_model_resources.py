import unittest,tempfile
from pathlib import Path
import design_tools as D
from geometry import EDAError

class ModelResourcesQA(unittest.TestCase):
    def test_supported_mos_and_passive_resources_have_actual_corner_hashes(self):
        for corner in ('tt','ss','ff','sf','fs'):
            resources=D.model_resources(corner)
            self.assertEqual(len(resources),13)
            self.assertTrue(all(Path(r['path']).is_file() and len(r['sha256'])==64 for r in resources))
            self.assertTrue(any('nfet_01v8__'+corner+'.pm3.spice' in r['path'] for r in resources))
            self.assertTrue(any('res_typical__cap_typical.spice' in r['path'] for r in resources))
    def test_control_injection_corner_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(EDAError) as caught:D.supported_model_deck(folder,'tt\n.control')
            self.assertEqual(caught.exception.code,'INVALID_CORNER')

if __name__=='__main__':unittest.main()
