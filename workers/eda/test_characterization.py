import copy
import math
import unittest
import characterization as Q
from geometry import EDAError

class CharacterizationTests(unittest.TestCase):
    def setUp(self):
        self.p=dict(design_template=dict(id='soc_miller_ota'),testbench={})
    def test_strict_bounds_and_mode_specific_fields(self):
        for raw in [dict(mode='mismatch',samples=True),dict(mode='mismatch',seed=0),dict(mode='mismatch',samples=65),dict(mode='noise',seed=1),dict(mode='noise',frequency_start_Hz=100,frequency_end_Hz=100),dict(mode='noise',noise_limit_V=float('nan')),dict(mode='noise',injected='.control')]:
            with self.subTest(raw=raw),self.assertRaises(EDAError):Q.configuration(self.p,dict(analysis='op',characterization=raw))
        with self.assertRaises(EDAError):Q.configuration(dict(design_template=dict(id='soc_pga')),dict(characterization=dict(mode='noise')))
        original=copy.deepcopy(self.p)
        c,s=Q.configuration(self.p,dict(analysis='op',characterization=dict(mode='mismatch')))
        self.assertEqual(c['samples'],16);self.assertEqual(s['analysis'],'op');self.assertEqual(self.p,original)
    def test_inactive_mismatch_never_passes(self):
        rows=[dict(seed=i+1,offset_V=.001) for i in range(4)]
        with self.assertRaises(EDAError) as e:Q.mismatch_result(rows,dict(samples=4,seed=1,offset_limit_V=.01))
        self.assertEqual(e.exception.code,'MISMATCH_INACTIVE')
        rows[-1]['offset_V']=.02
        m=Q.mismatch_result(rows,dict(samples=4,seed=1,offset_limit_V=.01))
        self.assertEqual(m['within_limit_samples'],3);self.assertEqual(m['offset_abs_max_V'],.02)
    def test_noise_integrates_squared_density_and_units(self):
        c=dict(frequency_start_Hz=10,frequency_end_Hz=1000)
        spectrum=[[10,2e-9,3e-9],[100,2e-9,3e-9],[1000,2e-9,3e-9]]
        total=2e-9*math.sqrt(990)
        m=Q.noise_result(spectrum,[[0,total,3e-9*math.sqrt(990)]],c)
        self.assertAlmostEqual(m['numerical_output_noise_rms_V'],total,places=15)
        with self.assertRaises(EDAError):Q.noise_result(spectrum,[[0,total**2,total**2]],c)
        with self.assertRaises(EDAError):Q.noise_result(spectrum[:-1],[[0,total,total]],c)
        with self.assertRaises(EDAError):Q.noise_result(list(reversed(spectrum)),[[0,total,total]],c)
if __name__=='__main__':unittest.main()
