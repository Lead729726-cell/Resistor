import copy
import math
import tempfile
import unittest
from pathlib import Path
import research as R
import design_tools as D
import digital_units as U
import physical_library as P
import chip_references as C
import analog_soc as A
import native
from geometry import EDAError


class ResearchQA(unittest.TestCase):
    def test_every_catalog_entry_has_reviewed_primary_sources_without_pass_claim(self):
        document=D.catalog();covered=document['literature']['coverage']
        self.assertEqual({v['id'] for v in covered},set(D.CATALOG)|{v['id'] for v in U.CATALOG})
        for t in covered:
            self.assertFalse(t['paper_performance_reproduced'])
            self.assertTrue(t['references'])
            self.assertEqual(t['qualification'],'not-run; actual revision-bound engine results are required')
            for p in t['references']:self.assertTrue(p['url'].startswith('https://'));self.assertTrue(p['read_scope']);self.assertTrue(p['not_reproduced'])
    def test_drive_scaling_preserves_topology_and_old_empty_parameters(self):
        for kind in P.GATES:
            base=P.materialize(P.gate(kind))[0]
            strong=P.materialize(P.gate(kind,{'drive_scale':4}))[0]
            self.assertEqual([d['pins'] for d in base['devices']],[d['pins'] for d in strong['devices']])
            for a,b in zip(base['devices'],strong['devices']):self.assertAlmostEqual(b['parameters']['w_um'],4*a['parameters']['w_um']);self.assertEqual(a['parameters']['l_um'],b['parameters']['l_um'])
            self.assertTrue(native.validate(strong)['valid'])
        for bad in (0,1.5,3,8,True,math.inf):
            with self.assertRaises(EDAError):D._parameters('cell_inv',{'drive_scale':bad})
    def test_sensitized_mux_arcs_include_select_and_both_directions(self):
        arcs=P.gate_arcs('cell_mux2')
        self.assertEqual(len(arcs),12)
        self.assertEqual({a['input'] for a in arcs},{'A','B','S'})
        for a in arcs:self.assertEqual(sum(x!=y for x,y in zip(a['before'],a['after'])),1);self.assertNotEqual(a['output_before'],a['output_after'])
    def test_minimum_slew_every_gate_fits_public_point_budget(self):
        for kind in P.GATES:
            for slew in (.02,.1,1,5):
                settings=native.testbench(dict(duration_s=len(P.stimulus_rows(kind))*50e-9,step_s=P.gate_step(slew)))
                self.assertLessEqual(settings['duration_s']/settings['step_s'],200000)
    def test_half_supply_crossing_without_valid_high_input_cannot_pass_arc(self):
        rows=P.stimulus_rows('cell_inv');x=[0];a=[0];y=[1.8]
        for row in rows[1:]:
            edge=row['index']*50e-9;x.extend([edge,edge+1e-9]);a.extend([a[-1],1.08 if row['index']==3 else row['inputs'][0]*1.8]);y.extend([y[-1],row['expected']*1.8])
        x.append(len(rows)*50e-9);a.append(a[-1]);y.append(y[-1])
        points=sorted([*zip(x,a,y),*[(r['index']*50e-9+40e-9,1.08 if r['index']==3 else r['inputs'][0]*1.8,r['expected']*1.8) for r in rows]])
        x,a,y=map(list,zip(*points))
        run=dict(waveforms=[dict(name='A',x=x,y=a),dict(name='Y',x=x,y=y)],measurements={})
        p=dict(ports=P.GATES['cell_inv'][1],design_template=dict(id='cell_inv',parameters={}))
        result=P.measurements(p,run,dict(supply_V=1.8))
        self.assertEqual(run['measurements']['truth_passed'],2)
        self.assertEqual(run['measurements']['timing_characterization']['observed_arcs'],2)
        self.assertFalse(result['pass'])
    def test_compensation_is_applied_through_reused_ota_and_default_preserved(self):
        for kind in A.PARTS:
            ir=A.schematic(kind,{})
            if kind=='soc_cascode_mirror':continue
            resistors=[d for d in U.flattened(ir)['devices'] if d['kind']=='resistor' and 'R_ZERO' in d['name']]
            self.assertTrue(resistors,kind)
            self.assertTrue(all(d['parameters']['value']==5000 for d in resistors))
            revised=U.flattened(A.schematic(kind,{'nulling_Ohm':15000}))
            self.assertTrue(all(d['parameters']['value']==15000 for d in revised['devices'] if d['kind']=='resistor' and 'R_ZERO' in d['name']))
        with self.assertRaises(EDAError):D._parameters('soc_pga',{'nulling_Ohm':100})
    def test_moments_are_exact_for_ramp_and_nonuniform_steps(self):
        w={'x':[0,.1,.2,1],'y':[0,.1,.2,1]}
        r=R.statistics(w,.25,.75)
        self.assertAlmostEqual(r['mean'],.5)
        self.assertAlmostEqual(r['rms']**2,13/48)
        self.assertAlmostEqual(r['ac_rms']**2,1/48)
        self.assertFalse(R.statistics(w,-1,.5)['available'])
        self.assertEqual(R.crossings(w,.5,.25,.75,True),[.5])
    def test_cic_response_matches_impulse_convolution_not_paper_snr_claim(self):
        ratio=16;frequency=31250.;rate=1e6
        # Independent discrete triangular impulse from two boxcar convolutions.
        impulse=[sum(1 for j in range(ratio) if 0<=i-j<ratio)/ratio**2 for i in range(2*ratio-1)]
        real=sum(v*math.cos(2*math.pi*frequency*i/rate) for i,v in enumerate(impulse))
        imaginary=-sum(v*math.sin(2*math.pi*frequency*i/rate) for i,v in enumerate(impulse))
        self.assertAlmostEqual(R.cic_response(frequency,rate,ratio)['normalized_amplitude'],math.hypot(real,imaginary))
        self.assertEqual(R.cic_response(0)['normalized_amplitude'],1)
        self.assertAlmostEqual(R.cic_response(0)['group_delay_s'],255e-6)
        with self.assertRaises(EDAError):R.cic_response(math.nan)
    def test_signed_sar_energy_partitions_acquisition_and_conversion(self):
        w=[dict(name='supply_current',x=[0,1,9],y=[2,2,2]),dict(name='reference_current',x=[0,1,9],y=[-1,-1,-1])]
        r=R.sar_energy(w,[dict(frame=0,input_V=.6,code=128)],dict(acquisition_s=1,bit_period_s=1,reference_V=1.2),1.8)
        f=r['rows'][0]
        self.assertAlmostEqual(f['acquisition_reset']['supply_current']['energy_J'],3.6)
        self.assertAlmostEqual(f['conversion']['reference_current']['energy_J'],-9.6)
        self.assertFalse(r['complete_system_energy']);self.assertIsNone(r['Walden_FoM'])
    def test_ldo_psrr_positive_rejection_and_no_infinite_or_design_pass(self):
        p=dict(design_template=dict(id='chip_ldo',parameters=C.CATALOG['chip_ldo']['parameter_defaults']))
        for gain,expected in [(0.01,40),(10,-20),(0,None)]:
            run=dict(waveforms=[dict(name='supply_to_output_gain',x=[10,100],y=[gain,gain])],measurements={})
            r=C.measurements(p,run,dict(analysis='ac',supply_V=1.8))
            self.assertEqual(run['measurements']['psrr_rejection_at_10Hz_dB'],expected)
            self.assertIsNone(r['pass'])
    def test_psrr_stimulus_has_only_supply_ac_input(self):
        p=dict(cell='chip_ldo',ports=C.CATALOG['chip_ldo']['ports'],design_template=dict(id='chip_ldo',parameters=C.CATALOG['chip_ldo']['parameter_defaults']))
        with tempfile.TemporaryDirectory() as folder:
            path,*_=C.spice_tb(p,folder,dict(analysis='ac',supply_V=1.8,temperature_C=27),'core.spice','model.spice',p['ports'])
            text=path.read_text();self.assertIn('VDD VPWR VGND 1.8 AC 1',text);self.assertNotIn('VLOAD ',text);self.assertNotIn('VINP ',text)


if __name__=='__main__':unittest.main()
