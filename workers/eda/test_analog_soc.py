import copy
import math
import random
import unittest
import analog_soc as A
import physical_library as P
import digital_units as D
import native
from geometry import EDAError

class AnalogSocTests(unittest.TestCase):
    def test_matching_units_preserve_electrical_width_and_metadata(self):
        ir=A.schematic('soc_miller_ota',{})
        pair=ir['cells']['SOC_OTA_FIRST']['devices'][:4]
        self.assertEqual([d['matching_role'] for d in pair],['A','B','B','A'])
        for role in ('A','B'):
            self.assertEqual(sum(d['parameters']['w_um'] for d in pair if d['matching_role']==role),10.)
        flat,_=P.materialize(ir)
        units=[d for d in flat['devices'] if d.get('matching_group')]
        self.assertEqual(len(units),4)
        self.assertEqual([d['matching_role'] for d in units],['A','B','B','A'])
        self.assertEqual(len({(d['x'],d['y']) for d in flat['devices']}),len(flat['devices']))
    def test_all_real_editable_hierarchies_and_physical_passives(self):
        for key,row in A.CATALOG.items():
            with self.subTest(key=key):
                ir=A.schematic(key,row['parameter_defaults']);before=copy.deepcopy(ir)
                self.assertTrue(native.validate(ir)['valid'])
                self.assertEqual(ir['ports'],row['ports'])
                flat,replacements=P.materialize(ir)
                self.assertEqual(ir,before)
                self.assertTrue(native.validate(flat)['valid'])
                self.assertLessEqual(len(flat['devices']),512)
                self.assertTrue(all(d['model'].startswith('sky130_fd_pr__') for d in flat['devices']))
                for r in replacements:self.assertLess(abs(r['nominal_geometry_SI']/r['requested_SI']-1),.01)

    def test_true_physical_limit_includes_mos(self):
        ir=D.cell(['A','Y','VPWR','VGND']);ir['cells']={}
        for i in range(513):D.transistor(ir,'nmos','N'+str(i),'Y','A','VGND')
        with self.assertRaises(EDAError) as c:P.materialize(ir)
        self.assertEqual(c.exception.code,'PHYSICAL_LIMIT')

    def test_flatten_rejects_ambiguous_device_paths(self):
        ir=D.cell(['A','Y','VPWR','VGND']);lib=D.make_library(1);ir['cells']=lib
        D.block(ir,lib,'INV','X',{'A':'A','Y':'Y'})
        D.transistor(ir,'nmos','X_MN','Y','A','VGND')
        with self.assertRaises(EDAError) as c:D.flattened(ir)
        self.assertEqual(c.exception.code,'FLAT_NAME_COLLISION')

    def test_flatten_rejects_recursive_cells(self):
        ir=D.cell(['A']);child=D.cell(['A']);child['devices']=[dict(kind='block',cell_name='LOOP',name='X',pins={'A':'A'})]
        ir.update(devices=copy.deepcopy(child['devices']),cells={'LOOP':child})
        with self.assertRaises(EDAError) as c:D.flattened(ir)
        self.assertEqual(c.exception.code,'HIERARCHY_CYCLE')

    def test_flatten_rejects_ambiguous_net_paths(self):
        ir=D.cell(['A','Y','VPWR','VGND']);child=D.cell(['A','VPWR','VGND'])
        D.transistor(child,'nmos','N','HIDDEN','A','VGND')
        ir['cells']={'LEAF':child};D.block(ir,ir['cells'],'LEAF','X',{'A':'A'})
        D.transistor(ir,'nmos','OTHER','X__HIDDEN','A','VGND')
        with self.assertRaises(EDAError) as c:D.flattened(ir)
        self.assertEqual(c.exception.code,'FLAT_NAME_COLLISION')

    def test_interval_tracks_optimal_and_deterministic(self):
        rng=random.Random(420)
        for count in [0,1,8,100,500]:
            spans={str(i):(a:=rng.randrange(-100,100),a+rng.randrange(1,40)) for i in range(count)}
            tracks,n=P.interval_tracks(spans,5)
            events=sorted([(a,1) for a,b in spans.values()]+[(b+5,-1) for a,b in spans.values()])
            running=peak=0
            for _,change in events:running+=change;peak=max(peak,running)
            self.assertEqual(n,peak)
            self.assertEqual((tracks,n),P.interval_tracks(dict(reversed(list(spans.items()))),5))
            for i,(a,b) in spans.items():
                for j,(c,d) in spans.items():
                    if i!=j and tracks[i]==tracks[j]:self.assertTrue(b+5<=c or d+5<=a)

    def test_exact_window_interpolates_boundaries(self):
        mean,pairs=A.window(dict(x=[0.,.01,1.,2.],y=[0.,.02,2.,4.]),.25,1.75)
        self.assertAlmostEqual(mean,2.)
        self.assertEqual(pairs[0],(.25,.5));self.assertEqual(pairs[-1],(1.75,3.5))
        with self.assertRaises(EDAError):A.window(dict(x=[0.,1.],y=[0.,1.]),0,2)

    def test_adaptive_steps_do_not_bias_sine_fit(self):
        x=[i/1000 for i in range(1001)]+[.25+i/100000 for i in range(1000)]
        x=sorted(set(x));w=dict(x=x,y=[3+2*math.sin(2*math.pi*5*t+.3) for t in x])
        fit=A.sine_amplitude(w,.02,.98,5)
        self.assertAlmostEqual(fit['amplitude'],2,places=3)
        self.assertAlmostEqual(fit['mean'],3,places=3)

    def test_wrapped_phase_cannot_report_false_stability(self):
        p=dict(design_template=dict(id='soc_miller_ota',parameters={}))
        run=dict(measurements={},waveforms=[dict(name='OUT_gain',unit='V/V',x=[10.,100.,1000.,10000.],y=[1000.,10.,1.,.1]),dict(name='OUT_phase',unit='deg',x=[10.,100.,1000.,10000.],y=[-10.,-90.,170.,100.])])
        result=A.measurements(p,run,dict(analysis='ac',supply_V=1.8))
        self.assertAlmostEqual(run['measurements']['phase_margin_deg'],-10.)
        self.assertFalse(result['pass'])

if __name__=='__main__':unittest.main()
