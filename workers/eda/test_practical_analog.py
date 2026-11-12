"""Structural and adversarial metric fixtures, not solver verification evidence."""
import copy
import math
import tempfile
import unittest
from unittest.mock import patch
import practical_analog as P
import digital_units as D
import design_tools as DT
import semiconductor_starters as ST
import native
from geometry import EDAError


def project(kind):
    return dict(cell=kind,design_template=dict(id=kind,parameters={}))


def fixture(values):
    return dict(waveforms=[dict(name=name,x=[i*1e-6 for i in range(321)],y=[function(i*1e-6) for i in range(321)]) for name,function in values.items()])


class PracticalAnalogQA(unittest.TestCase):
    def test_starter_modes_materialize_exact_native_testbench_and_parameters(self):
        for kind in P.CATALOG:
            for mode,corner,temp,supply in [('nominal','tt',27,1.8),('slow_hot','ss',125,1.62),('fast_cold','ff',-40,1.8)]:
                spec=ST.configuration(kind,mode)
                self.assertEqual(spec['template_id'],kind)
                self.assertEqual(spec['parameters'],P.CATALOG[kind]['parameter_defaults'])
                self.assertEqual((spec['testbench']['corner'],spec['testbench']['temperature_C'],spec['testbench']['supply_V']),(corner,temp,supply))
                self.assertEqual(spec['testbench']['duration_s'],320e-6)
                self.assertEqual(spec['testbench']['step_s'],50e-9)
                self.assertEqual(spec['testbench']['load_F'],100e-15)
                self.assertFalse(spec['physical_core']);self.assertEqual(spec['layout'],'schematic')
                self.assertEqual(spec['metadata']['verification'],'not-run')
                spec['parameters']['compensation_F']=9e-12
                self.assertEqual(P.CATALOG[kind]['parameter_defaults']['compensation_F'],5e-12)

    def test_parameter_binding_and_preview_identity(self):
        bindings={
            'sensor_current_tia':('feedback_Ohm',250000.,'PRACTICAL_TIA','FEEDBACK_RESISTANCE','value'),
            'adc_track_hold':('hold_F',20e-12,'PRACTICAL_SAMPLE_SWITCH','HOLD_CAPACITOR','value'),
            'sensor_schmitt':('hysteresis_Ohm',1500000.,'PRACTICAL_HYSTERESIS','POSITIVE_FEEDBACK','value'),
        }
        for kind,(parameter,value,cell,name,field) in bindings.items():
            v=DT._parameters(kind,{parameter:value});ir=DT._schematic(kind,v)
            self.assertEqual(next(d for d in ir['cells'][cell]['devices'] if d['name']==name)['parameters'][field],value)
            original=DT.template_preview(dict(template_id=kind))
            changed=DT.template_preview(dict(template_id=kind,parameters={parameter:value}))
            self.assertNotEqual(original['preview_hash'],changed['preview_hash'])
            self.assertNotEqual(original['schematic_sha256'],changed['schematic_sha256'])
            self.assertFalse(changed['engine_executed']);self.assertIsNone(changed['physical_area_um2'])

    def test_pvt_binding_and_measurement_default_materialization(self):
        for kind in P.CATALOG:
            p=project(kind)
            p.update(pdk_id='sky130A',ports=P.CATALOG[kind]['ports'],schematic=P.schematic(kind,{}),testbench=native.testbench(P.settings(kind)))
            p['design_template'].update(schema_version=1,layout_status='not-generated')
            binding=DT.pvt_sources(p)
            self.assertEqual(binding['bindings'],[dict(kind='testbench',source_names=['VDD'])])
            self.assertEqual(binding['analyses'],P.CATALOG[kind]['analyses'])
            with patch.object(P,'measurements') as measure:
                DT.measurements(p,dict(waveforms=[]),dict(analysis='op',supply_V=1.6))
                actual=measure.call_args.args[2]
                self.assertEqual(actual['analysis'],'op');self.assertEqual(actual['supply_V'],1.6)
                self.assertEqual(actual['temperature_C'],27);self.assertEqual(actual['load_F'],100e-15)

    def test_configured_output_load_is_electrically_emitted(self):
        with tempfile.TemporaryDirectory() as folder:
            for kind in P.CATALOG:
                settings=native.testbench({**P.settings(kind),'load_F':2e-12})
                deck,*_=P.spice_tb(project(kind),folder,settings,'core.spice','models.spice',P.CATALOG[kind]['ports'])
                cap=next(line.split()[-1] for line in deck.read_text().splitlines() if line.startswith('CLOAD OUT VGND '))
                self.assertAlmostEqual(float(cap)/2e-12,1.)

    def test_editable_mos_hierarchies_and_explicit_ideal_passives(self):
        for kind in P.CATALOG:
            ir=P.schematic(kind,{})
            self.assertTrue(native.validate(ir)['valid'])
            self.assertGreater(len(ir['cells']),2)
            flat=D.flattened(ir)
            self.assertFalse(any(d['kind'] in ('voltage','current') for d in flat['devices']))
            self.assertTrue(all(d['model'] in native.MODEL_KIND for d in flat['devices'] if d['kind'] in ('nmos','pmos')))
            self.assertTrue(all(not d.get('model') for d in flat['devices'] if d['kind'] in ('resistor','capacitor')))
            text=native.emit(ir,kind,P.CATALOG[kind]['ports'])
            self.assertIn('sky130_fd_pr__nfet_01v8',text)
            self.assertIn('sky130_fd_pr__pfet_01v8_hvt',text)
            self.assertNotIn('POLY(',text)
            self.assertFalse(P.CATALOG[kind]['physical_supported'])

    def test_parameters_reject_nonfinite_unknown_boolean_and_dimension_errors(self):
        for kind in P.CATALOG:
            for bad in (None,[],{'unknown':1},{'compensation_F':True},{'nulling_Ohm':float('nan')},{'bias_resistance_Ohm':float('inf')}):
                with self.assertRaises(EDAError):P.parameters(kind,bad)
        for bad in ({'input_current_A':1.},{'input_F':5.},{'feedback_Ohm':0.}):
            with self.assertRaises(EDAError):P.parameters('sensor_current_tia',bad)
        self.assertEqual(P.parameters('sensor_current_tia',{})['input_current_A'],1e-6)
        self.assertEqual(P.parameters('adc_track_hold',{})['hold_F'],10e-12)
        with self.assertRaises(EDAError):P.parameters('sensor_schmitt',{'input_Ohm':200000.,'hysteresis_Ohm':500000.})

    def test_source_ownership_and_valid_analysis_scope(self):
        with tempfile.TemporaryDirectory() as folder:
            for kind in P.CATALOG:
                settings=native.testbench({**P.settings(kind),'supply_V':1.6})
                deck,names,*_=P.spice_tb(project(kind),folder,settings,'core.spice','models.spice',P.CATALOG[kind]['ports'])
                text=deck.read_text();self.assertIn('VDD VPWR VGND 1.6',text)
                self.assertIn('-i(VDD)',text);self.assertIn('tran 5e-08 0.00032 0 5e-08',text)
                self.assertIn('supply_current',names)
                with self.assertRaises(EDAError):P.spice_tb(project(kind),folder,{**settings,'duration_s':1e-6},'a','b',P.CATALOG[kind]['ports'])
                with self.assertRaises(EDAError):P.spice_tb(project(kind),folder,{**settings,'step_s':1e-6},'a','b',P.CATALOG[kind]['ports'])
                if kind!='sensor_current_tia':
                    with self.assertRaises(EDAError):P.spice_tb(project(kind),folder,{**settings,'analysis':'ac'},'a','b',P.CATALOG[kind]['ports'])

    def test_interpolation_and_time_weighted_mean(self):
        w=dict(x=[0.,.1,1.],y=[1.,1.2,3.])
        self.assertAlmostEqual(P.mean(w,.25,.75),2.)
        self.assertEqual(P.difference(w,w)['y'],[0.,0.,0.])
        self.assertAlmostEqual(P.crossings(dict(x=[0.,1.],y=[0.,2.]),dict(x=[0.,1.],y=[.6,1.2]),1.,0.,1.,True)[0]['input_V'],.9)

    def test_incomplete_duplicate_misaligned_and_nan_samples_rejected(self):
        w=dict(x=[0.,1.],y=[1.,2.])
        for bad in (dict(x=[0.,0.],y=[1.,2.]),dict(x=[0.,1.],y=[1.,float('nan')]),dict(x=[],y=[])):
            with self.assertRaises(EDAError):P.mean(bad,0,1)
        with self.assertRaises(EDAError):P.mean(w,0,2)
        with self.assertRaises(EDAError):P.difference(w,dict(x=[0.,2.],y=[1.,2.]))
        with self.assertRaises(EDAError):P.measurements(project('sensor_current_tia'),dict(waveforms=[]),dict(analysis='op',supply_V=1.8))

    def tia_fixture(self,sign=-1.):
        def stimulus(t):return 0. if t<50e-6 or t>=251e-6 else 1e-6 if t<151e-6 else .5e-6
        return fixture({'OUT':lambda t:.9+sign*200000*stimulus(t),'VCM':lambda t:.9,'supply_current':lambda t:100e-6,'input_current':stimulus})

    def test_tia_gain_sign_and_microamp_units(self):
        run=self.tia_fixture();P.measurements(project('sensor_current_tia'),run,dict(analysis='tran',supply_V=1.8))
        self.assertTrue(run['reference_verification']['pass'])
        self.assertAlmostEqual(run['measurements']['transimpedance_V_per_A'],-200000.)
        reflected=self.tia_fixture(1.);P.measurements(project('sensor_current_tia'),reflected,dict(analysis='tran',supply_V=1.8))
        self.assertFalse(reflected['reference_verification']['pass'])

    def test_ac_sign_and_missing_frequency_coverage(self):
        run=dict(waveforms=[dict(name=name,x=[10.,1e8],y=values) for name,values in [('transimpedance_magnitude',[200000.,1.]),('transimpedance_real',[-200000.,-.1])]])
        P.measurements(project('sensor_current_tia'),run,dict(analysis='ac',supply_V=1.8));self.assertTrue(run['reference_verification']['pass'])
        reflected=copy.deepcopy(run);reflected['waveforms'][1]['y'][0]=200000.
        P.measurements(project('sensor_current_tia'),reflected,dict(analysis='ac',supply_V=1.8));self.assertFalse(reflected['reference_verification']['pass'])
        run['waveforms'][0]['x'][0]=100.
        with self.assertRaises(EDAError):P.measurements(project('sensor_current_tia'),run,dict(analysis='ac',supply_V=1.8))

    def test_hold_requires_actual_input_change_and_low_clock(self):
        vin=lambda t:1. if 85e-6<=t<186e-6 else .8
        held=lambda t:1. if 130e-6<=t<231e-6 else .8
        clk=lambda t:1.8 if any(start<=t<start+40e-6 for start in (30e-6,130e-6,230e-6)) else 0.
        run=fixture({'VIN':vin,'HOLD':held,'OUT':held,'CLK':clk,'VCM':lambda t:.9,'supply_current':lambda t:100e-6})
        P.measurements(project('adc_track_hold'),run,dict(analysis='tran',supply_V=1.8));self.assertTrue(run['reference_verification']['pass'])
        self.assertEqual(len(run['measurements']['sample_hold_cycles']),3)
        self.assertEqual(run['measurements']['sample_hold_cycles'][0]['switching_step_V'],0.)
        constant=fixture({'VIN':lambda t:.8,'HOLD':lambda t:.8,'OUT':lambda t:.8,'CLK':clk,'VCM':lambda t:.9,'supply_current':lambda t:100e-6})
        P.measurements(project('adc_track_hold'),constant,dict(analysis='tran',supply_V=1.8));self.assertFalse(constant['reference_verification']['pass'])
        bad=copy.deepcopy(run);next(w for w in bad['waveforms'] if w['name']=='OUT')['y']=[.85]*321
        P.measurements(project('adc_track_hold'),bad,dict(analysis='tran',supply_V=1.8));self.assertFalse(bad['reference_verification']['pass'])

    def test_schmitt_missing_transition_cannot_pass(self):
        def vin(t):
            if t<40e-6:return .55
            if t<140e-6:return .55+.7*(t-40e-6)/100e-6
            if t<180e-6:return 1.25
            if t<280e-6:return 1.25-.7*(t-180e-6)/100e-6
            return .55
        run=fixture({'VIN':vin,'OUT':lambda t:1.8 if 103e-6<=t<243e-6 else 0.,'VCM':lambda t:.9,'supply_current':lambda t:100e-6})
        P.measurements(project('sensor_schmitt'),run,dict(analysis='tran',supply_V=1.8));self.assertTrue(run['reference_verification']['pass'])
        self.assertGreater(run['measurements']['hysteresis_V'],.15)
        next(w for w in run['waveforms'] if w['name']=='OUT')['y']=[0.]*321
        P.measurements(project('sensor_schmitt'),run,dict(analysis='tran',supply_V=1.8));self.assertFalse(run['reference_verification']['pass'])


if __name__=='__main__':unittest.main()
