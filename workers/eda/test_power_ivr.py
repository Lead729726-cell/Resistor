"""Graph and equation fixtures; actual solver evidence is produced by ivr-lab."""
import math
import tempfile
import unittest
from pathlib import Path
import power_ivr as P
import current_flow as F
import signal_metrics as M
import design_tools as D
import digital_units as U
import research as R
import semiconductor_starters as ST
import native
from geometry import EDAError

class IvrQA(unittest.TestCase):
    def test_ivrs_starter_is_schematic_only_with_complete_owned_duration(self):
        spec=ST.configuration(P.ID)
        self.assertEqual(spec['template_id'],P.ID);self.assertFalse(spec['physical_core'])
        self.assertEqual(spec['parameters'],P.DEFAULTS)
        self.assertEqual(spec['testbench']['duration_s'],260e-6)
        self.assertEqual(spec['testbench']['load_F'],P.DEFAULTS['output_F'])
        self.assertEqual(spec['metadata']['verification'],'not-run')
        self.assertEqual(ST.configuration(P.ID,'slow_hot')['testbench']['supply_V'],1.62)

    def test_seven_named_blocks_and_actual_mos_feedback_with_no_ideal_dut_sources(self):
        ir=P.schematic({});self.assertTrue(native.validate(ir)['valid'])
        self.assertEqual(len(ir['devices']),7);self.assertEqual(len(ir['cells']),7)
        flat=U.flattened(ir);self.assertEqual(len(flat['devices']),27)
        self.assertTrue(all(d['kind'] not in ['voltage','current'] for d in flat['devices']))
        self.assertEqual(len(ir['cells']['IVR_PASS_BANK']['devices']),8)
        fb=ir['cells']['IVR_FEEDBACK']['devices'];self.assertAlmostEqual(.6*(1+fb[0]['parameters']['value']/fb[1]['parameters']['value']),1.2)
        self.assertIn('sky130_fd_pr__pfet_01v8_hvt',native.emit(ir,P.ID,P.PORTS))

    def test_parameter_unit_edges_and_integer_bank(self):
        for change in [None,[],{'pass_units':1.5},{'pass_units':True},{'output_F':1},
            {'output_V':float('nan')},{'load_low_A':200e-6,'load_high_A':20e-6},{'unknown':1}]:
            with self.assertRaises(EDAError):P.parameters(change)
        self.assertEqual(P.parameters({'pass_units':32})['pass_units'],32)
        self.assertAlmostEqual(D._parameters(P.ID,{})['output_V'],1.2)

    def test_preview_binding_counts_and_physical_unknown(self):
        a=D.template_preview(dict(template_id=P.ID));b=D.template_preview(dict(template_id=P.ID))
        self.assertEqual(a['preview_hash'],b['preview_hash']);self.assertEqual(a['device_count'],27)
        self.assertIsNone(a['physical_area_um2']);self.assertFalse(a['engine_executed'])
        self.assertNotEqual(a['preview_hash'],D.template_preview(dict(template_id=P.ID,parameters={'pass_units':4}))['preview_hash'])

    def test_owned_sequence_preserves_supply_and_enable_events(self):
        with tempfile.TemporaryDirectory() as folder:
            p=dict(design_template=dict(parameters={}),cell=P.ID);s={**P.settings(),**dict(supply_V=1.8,temperature_C=27,corner='tt')}
            file,names,*_=P.spice_tb(p,folder,s,'core.spice','models.spice',P.PORTS);text=file.read_text()
            self.assertIn('101u 1.65',text);self.assertIn('180.1u 0 220u 0',text)
            self.assertIn('load_current',names);self.assertIn('v(LOADSTEP)',text)
            with self.assertRaises(EDAError):P.spice_tb(p,folder,{**s,'duration_s':1e-6},'a','b',P.PORTS)

    def test_save_dependencies_retains_arithmetic_and_differential_inputs(self):
        actual=F.save_dependencies(['-i(VDD)','v(OUT)/60000+(v(OUT)-v(LOADSTEP))/6666','v(A,B)','@m.x[id]'])
        self.assertEqual(actual,['i(VDD)','v(OUT)','v(LOADSTEP)','v(A)','v(B)','@m.x[id]'])
        deck=F.instrument_control('.control\nlet mos_wave_0 = v(A,B)\nquit\n.endc',[dict(source_vector='i(VDD)')],['v(A,B)'])
        self.assertIn('save v(A) v(B) i(VDD)',deck)

    def test_voltage_current_product_exact_integral_and_base_si(self):
        voltage=dict(x=[0.,1e-6],y=[1.,2.]);current=dict(x=[0.,1e-6],y=[1e-6,3e-6])
        result=M.variable_supply_metrics(current,voltage,0,1e-6)
        self.assertAlmostEqual(result['energy_J']/1e-12,19/6)
        self.assertAlmostEqual(P.product_mean(voltage,current,0,1e-6)/1e-6,19/6)
        square=dict(x=[0.,1.],y=[0.,1.]);self.assertAlmostEqual(P.product_mean(square,square,0,1),1/3)
        self.assertAlmostEqual(P.product_mean(square,square,.25,.75),(.75**3-.25**3)/(3*.5))

    def test_missing_misaligned_or_nonfinite_samples_do_not_produce_metrics(self):
        w=dict(x=[0.,1.],y=[1.,2.]);self.assertFalse(M.variable_supply_metrics(w,w,0,2)['available'])
        self.assertFalse(M.variable_supply_metrics(w,dict(x=[0.,2.],y=[1.,2.]),0,1)['available'])
        for bad in [dict(x=[0,0],y=[1,1]),dict(x=[0,1],y=[1,float('nan')])]:
            with self.assertRaises(EDAError):P.stats(bad,0,1)
        with self.assertRaises(EDAError):P.stats(w,0,2)

    def test_psrr_reference_equation_log_frequency_and_missing_coverage(self):
        wave=dict(x=[10.,1000.],y=[.1,.001]);self.assertAlmostEqual(P.psrr(wave,100),40.)
        self.assertIsNone(P.psrr(wave,1));self.assertIsNone(P.psrr(dict(x=[10,100],y=[0,0]),50))
        with self.assertRaises(EDAError):P.psrr(dict(x=[10,10],y=[1,1]),10)

    def test_sampled_settling_and_adaptive_time_weighted_mean(self):
        w=dict(x=[0.,1.,2.,3.],y=[0.,.5,1.01,1.]);self.assertEqual(P.settled(w,1,0,3,.02),2.)
        self.assertIsNone(P.settled(w,2,0,3,.02))
        self.assertAlmostEqual(P.stats(dict(x=[0,.1,1],y=[0,.1,1]),0,1)['mean'],.5)

    def test_negative_disabled_rail_cannot_pass_as_a_discharged_output(self):
        x=[0.,35e-6,40e-6,75e-6,80e-6,98e-6,135e-6,180e-6,190e-6,220e-6,230e-6,260e-6]
        out=[1.2]*len(x);out[8:10]=[-1.,-1.]
        run=dict(measurements={},waveforms=[dict(name=name,x=x,y=y) for name,y in [('OUT',out),('VIN',[1.8]*len(x)),('supply_current',[250e-6]*len(x)),('load_current',[200e-6]*len(x))]])
        P.measurements(dict(design_template=dict(parameters={})),run,dict(analysis='tran'))
        check=next(c for c in run['reference_verification']['checks'] if c['name'].startswith('Disable'))
        self.assertFalse(check['pass']);self.assertFalse(run['reference_verification']['pass'])

    def test_declared_variable_supply_never_falls_back_to_nominal_voltage(self):
        p=dict(id='fixture',design_template=dict(id=P.ID,supply_voltage_trace='VIN'),testbench=dict(supply_V=1.8))
        run=dict(waveforms=[dict(name='supply_current',x=[0.,1.],y=[1.,1.])],measurements={})
        R.annotate(p,run,dict(analysis='tran',supply_V=1.8));self.assertFalse(run['measurements']['research_metrics']['supply']['available'])
        run['waveforms'].append(dict(name='VIN',x=[0.,1.],y=[0.,1.]))
        R.annotate(p,run,dict(analysis='tran',supply_V=1.8));self.assertAlmostEqual(run['measurements']['research_metrics']['supply']['energy_J'],.5)

if __name__=='__main__':unittest.main()
