"""Independent numerical corruption/edge fixtures; native runs are separate."""
import copy,math,unittest,json
import chip_references as C
import design_tools as D
import native
from geometry import EDAError

class ChipReferenceQA(unittest.TestCase):
    def project(self,kind):return {'design_template':{'id':kind,'parameters':copy.deepcopy(C.CATALOG[kind]['parameter_defaults'])}}
    def fixture(self,kind,out,extras=None):
        times=[i*1e-6 for i in range(101)]
        w=[{'name':'OUT','x':times,'y':out}, {'name':'supply_current','x':times,'y':[30e-6]*101}]
        w+=extras or []
        return {'waveforms':w,'measurements':{}}
    def test_all_six_are_valid_editable_transistor_graphs(self):
        for kind in C.CATALOG:
            v=D._parameters(kind,{});ir=C.schematic(kind,v)
            self.assertTrue(native.validate(ir)['valid'],kind)
            spice=native.emit(ir,kind,C.CATALOG[kind]['ports'])
            self.assertIn('sky130_fd_pr__',spice)
            self.assertNotIn('\nB',spice);self.assertNotIn('\nE',spice)
    def test_invalid_width_not_forwarded_to_model_bin(self):
        with self.assertRaises(EDAError):D._parameters('chip_ldo',{'pass_width_um':100})
    def test_json_sorted_named_pin_map_preserves_hierarchy(self):
        ir=C.schematic('chip_ldo',C.CATALOG['chip_ldo']['parameter_defaults'])
        restored=json.loads(json.dumps(ir,sort_keys=True))
        self.assertTrue(native.validate(restored)['valid'])
        self.assertEqual(native.emit(ir,'chip_ldo',C.CATALOG['chip_ldo']['ports']),native.emit(restored,'chip_ldo',C.CATALOG['chip_ldo']['ports']))
        restored['devices'][0]['pins'].pop('BIAS')
        self.assertFalse(native.validate(restored)['valid'])
    def test_invalid_order_and_boolean_are_rejected(self):
        for values in ({'load_low_A':200e-6,'load_high_A':20e-6},{'pass_width_um':True}):
            with self.assertRaises(EDAError):D._parameters('chip_ldo',values)
    def test_ldo_known_constant_1v2(self):
        run=self.fixture('chip_ldo',[1.2]*101)
        r=C.measurements(self.project('chip_ldo'),run,{'analysis':'tran','supply_V':1.8})
        self.assertTrue(r['pass']);self.assertAlmostEqual(run['measurements']['average_supply_power_W'],54e-6)
    def test_oscillation_cannot_hide_behind_mean(self):
        run=self.fixture('chip_ldo',[1.2+(.2 if i%2 else -.2) for i in range(101)])
        self.assertFalse(C.measurements(self.project('chip_ldo'),run,{'analysis':'tran','supply_V':1.8})['pass'])
    def test_missing_ldo_recovery_is_not_pass(self):
        run=self.fixture('chip_ldo',[1.2]*101)
        for w in run['waveforms']:w['x']=w['x'][:25];w['y']=w['y'][:25]
        self.assertFalse(C.measurements(self.project('chip_ldo'),run,{'analysis':'tran','supply_V':1.8})['pass'])
    def test_time_weighted_average_independent_of_sample_density(self):
        self.assertAlmostEqual(C.integrate([0,.1,.2,1],[0,.1,.2,1],0),.5)
    def test_threshold_crossing_interpolates(self):
        self.assertEqual(C.crossings({'x':[0,1,2,3],'y':[0,2,0,2]},1),[.5,2.5])
    def test_constant_oscillator_never_reports_lock(self):
        run=self.fixture('chip_pll',[.9]*101,[{'name':'REF','x':[i*1e-6 for i in range(101)],'y':[i%2*1.8 for i in range(101)]}])
        r=C.measurements(self.project('chip_pll'),run,{'analysis':'tran','supply_V':1.8})
        self.assertFalse(r['pass']);self.assertIsNone(run['measurements']['output_frequency_Hz'])
    def test_ota_known_40db_gain_and_bandwidth(self):
        run={'waveforms':[{'name':'OUT_gain','x':[10,100,1000,10000],'y':[100,100,100/math.sqrt(2),10]}],'measurements':{}}
        C.measurements(self.project('chip_ota'),run,{'analysis':'ac','supply_V':1.8})
        self.assertEqual(run['measurements']['low_frequency_gain_dB'],40)
        self.assertAlmostEqual(run['measurements']['bandwidth_3dB_Hz'],1000)
    def test_empty_op_criteria_are_not_design_pass(self):
        run={'waveforms':[],'measurements':{}}
        self.assertIsNone(C.measurements(self.project('chip_ldo'),run,{'analysis':'op','supply_V':1.8})['pass'])

if __name__=='__main__':unittest.main()
