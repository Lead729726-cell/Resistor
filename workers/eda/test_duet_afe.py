"""Analytical/graph fixtures; these do not claim an actual solver run."""
import copy
import math
import unittest
import duet_afe as D
import design_tools as T
import digital_units
import native
from geometry import EDAError

class DuetQA(unittest.TestCase):
    def test_graph_has_named_reusable_mos_hierarchy_and_two_distinct_paths(self):
        ir=D.schematic(D.DEFAULTS)
        self.assertTrue(native.validate(ir)['valid'])
        self.assertEqual(len(ir['devices']),4)
        self.assertIn('DUET_SLOW',ir['cells']);self.assertIn('DUET_FAST',ir['cells'])
        self.assertGreater(len(digital_units.flattened(ir)['devices']),40)
        spice=native.emit(ir,D.ID,D.PORTS)
        self.assertIn('sky130_fd_pr__nfet_01v8',spice)
        self.assertNotIn('SIN(',spice);self.assertNotIn('\nB',spice)
        r=next(d for d in ir['cells']['DUET_SLOW']['devices'] if d['name']=='R_POLE')['parameters']['value']
        self.assertAlmostEqual(1/(2*math.pi*r*D.DEFAULTS['pole_F']),5000)

    def test_parameter_edges_and_units_are_checked(self):
        for key,value in [('gain_V_per_V',0),('pole_F',100),('slow_cutoff_Hz',True),('fast_cutoff_Hz',float('nan'))]:
            with self.assertRaises(EDAError):D.parameters({**D.DEFAULTS,key:value})
        with self.assertRaises(EDAError):D.parameters({**D.DEFAULTS,'slow_cutoff_Hz':20000,'fast_cutoff_Hz':30000})
        self.assertEqual(T._parameters(D.ID,{})['gain_V_per_V'],4)

    def test_preview_is_read_only_deterministic_and_invalidates_changed_values(self):
        args=dict(template_id=D.ID,name='DUET QA',parameters={},chip_limits=dict(width_um=300,height_um=300,max_area_um2=90000,edge_um=10))
        original=copy.deepcopy(args);a=T.template_preview(args);b=T.template_preview(args)
        self.assertEqual(args,original);self.assertEqual(a['preview_hash'],b['preview_hash'])
        self.assertFalse(a['engine_executed']);self.assertIsNone(a['physical_area_um2'])
        self.assertNotEqual(a['preview_hash'],T.template_preview({**args,'parameters':{'gain_V_per_V':2}})['preview_hash'])
        with self.assertRaises(EDAError):T.template_preview({**args,'command_id':'not-a-preview-field'})

    def test_bandwidth_fixture_matches_rc_equation(self):
        f=[10**(i/80) for i in range(641)];fc=5000
        w=dict(x=f,y=[4/math.sqrt(1+(x/fc)**2) for x in f])
        self.assertLess(abs(D.bandwidth(w)/fc-1),.001)
        self.assertIsNone(D.bandwidth(dict(x=[1,2],y=[4,4])))

    def test_all_auto_design_families_have_native_preview_and_declared_ports(self):
        for kind in ['rc_lowpass','soc_miller_ota','soc_filter2','soc_tia',D.ID]:
            with self.subTest(kind=kind):
                preview=T.template_preview(dict(template_id=kind))
                self.assertEqual(preview['ports'],T.CATALOG[kind]['ports'])
                self.assertGreater(preview['device_count'],0)
                self.assertIn('.subckt '+kind,preview['spice'])
                self.assertFalse(preview['engine_executed'])
                self.assertEqual(preview['layout_status'],'not-generated')
        rc=T._schematic('rc_lowpass',T._parameters('rc_lowpass',{}))
        self.assertEqual(rc['ports'],['IN','OUT','VGND'])
        self.assertEqual(len(digital_units.flattened(rc)['devices']),2)

    def test_two_tone_fixture_retains_base_si_amplitudes_and_residual(self):
        x=[i*50e-9 for i in range(16001)]
        y=[.9+.002*math.sin(2*math.pi*5000*t)+.0004*math.cos(2*math.pi*50000*t) for t in x]
        fit=D.two_tone(dict(x=x,y=y),.0004,.0008)
        self.assertLess(abs(fit['tone_5k_V']/.002-1),.001)
        self.assertLess(abs(fit['tone_50k_V']/.0004-1),.001)
        self.assertLess(fit['residual_rms_V'],1e-6)
        with self.assertRaises(EDAError):D.two_tone(dict(x=x,y=y),0,1e-6)
        with self.assertRaises(EDAError):D.two_tone(dict(x=x,y=y),0,.01)

if __name__=='__main__':unittest.main()
