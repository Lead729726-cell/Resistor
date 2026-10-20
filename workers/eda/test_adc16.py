"""Independent mathematical, geometry, provenance and failure-path ADC16 QA."""
import copy, math, random, tempfile, unittest
from fractions import Fraction as F
from pathlib import Path
import adc16 as A, adc16_digital as D, adc16_physical as L, adc16_sim as S
import native, physical_library as P
from geometry import EDAError


class Adc16Tests(unittest.TestCase):
 def test_all_23_blocks_are_real_editable_hierarchy(self):
  A.populate_catalog();self.assertEqual(len(A.CATALOG),23)
  for kind,item in A.CATALOG.items():
   ir=A.schematic(kind);self.assertTrue(native.validate(ir)['valid'],kind)
   self.assertEqual(ir['ports'],item['ports']);self.assertIn('tran',item['analyses'])
   for cell in [ir,*ir['cells'].values()]:
    self.assertTrue(all(d['kind']in('nmos','pmos','capacitor','resistor','block','port')for d in cell['devices']),kind)
  for top in('sar_adc16','sigma_delta16','pipeline_adc16'):self.assertFalse(A.CATALOG[top]['physical_supported'])

 def test_quad_split_equations_units_and_loading(self):
  # Independent exact charge-conservation reduction, from finest bank upward.
  bridge=F(32,15);fine_total=F(32);attenuation=[F(1)]
  for _ in range(3):
   equivalent=bridge*fine_total/(bridge+fine_total)
   self.assertEqual(equivalent,2)
   attenuation=[v*bridge/(bridge+fine_total)for v in attenuation]+[F(1)]
   fine_total=30+equivalent
  for bank,a in enumerate(attenuation):
   for bit in range(4):self.assertEqual(F(2<<bit,32)*a,F(1<<(4*bank+bit),65536))
  self.assertAlmostEqual(2*1.2/65536,36.62109375e-6)
  self.assertAlmostEqual(1.8/65536,27.4658203125e-6)
  for v in [dict(input_differential_V=1.21),dict(unit_F=2e-12),dict(hold_s=0),dict(test_mode=3),dict(reference_V=float('nan'))]:
   with self.assertRaises(EDAError):A.parameters('sar_adc16',v)
  for kind,v in [('sigma_delta16',dict(input_V=1.8)),('pipeline_adc16',dict(clock_Hz=1e6))]:
   with self.assertRaises(EDAError):A.parameters(kind,v)
  with self.assertRaises(EDAError):A.parameters('sar_adc16',dict(acquisition_s=7e-6))
  A.parameters('sar16_analog',dict(acquisition_s=7e-6))

 def test_physical_array_has_unique_unit_ids_and_common_centroid(self):
  ir=A.schematic('sar16_analog');before=copy.deepcopy(ir);flat,_=P.materialize(ir,max_primitives=768)
  self.assertEqual(ir,before);rows,rest=L.array_plan(flat['devices'])
  units=[(col,row,d,group)for row,items in enumerate(rows)for col,d,group in items]
  self.assertEqual(len(units),244);self.assertEqual(len({d['id']for _,_,d,_ in units}),244)
  for group in {g for _,_,_,g in units}:
   points=[(x,y)for x,y,_,g in units if g==group]
   self.assertEqual([sum(p[i]for p in points)/len(points)for i in(0,1)],[7.5,7.5])
  removed=next(d['id']for _,_,d,_ in units)
  with self.assertRaises(EDAError):L.array_plan([d for d in flat['devices']if d['id']!=removed])

 def test_full_pipeline_all_65536_nominal_centers(self):
  for code in range(65536):
   digits,flash,residue=D.pipeline_digits((code+.5)/32768-1)
   self.assertTrue(-1<=residue<=1);self.assertEqual(D.decode_pipeline(digits,flash),code)
  for digits,flash in [([1]*13,1),([2]+[1]*13,1),([1]*14,2)]:
   with self.assertRaises(EDAError):D.decode_pipeline(digits,flash)
  self.assertEqual(D.quantize16(-1.2),0);self.assertEqual(D.quantize16(1.2),65535)
  self.assertEqual(D.quantize16(0),32768)
  with self.assertRaises(EDAError):D.quantize16(float('nan'))

 def test_cic3_against_independent_boxcar_convolution(self):
  rng=random.Random(729726);bits=[rng.randrange(2)for _ in range(1280)];resets=[1]+[0]*1279
  # Three direct sliding boxcars, unbounded integers; no RTL state recurrence.
  def box(values):return[sum(values[max(0,i-255):i+1])for i in range(len(values))]
  expected=box(box(box(bits[1:])))
  rows=D.cic3_reference(bits,resets)
  self.assertEqual([i for i,(_,v)in enumerate(rows)if v],[768,1024])
  for i,(code,valid)in enumerate(rows):
   if valid:self.assertEqual(code,min(65535,expected[i-1]>>8))
  ones=D.cic3_reference([0]+[1]*1024,[1]+[0]*1024)
  self.assertEqual([c for c,v in ones if v],[65535,65535])
  with self.assertRaises(EDAError):D.cic3_reference([1,2],[0,0])

 def test_retained_charge_schedule_has_16_real_decisions(self):
  p=dict(cell='sar16_analog',testbench=A.recommended_settings('sar_adc16',A.SAR_DEFAULTS),design_template=dict(parameters=A.SAR_DEFAULTS))
  with tempfile.TemporaryDirectory()as f:
   file,values=__import__('sar12').control_testbench(p,f,'models','analog',A.schematic('sar16_analog')['ports'],bit_count=16,default_values=A.SAR_DEFAULTS,values_override=A.sar_inputs(A.SAR_DEFAULTS),prepare_fraction=.5,validate_parameters=False)
   text=file.read_text();self.assertEqual(text.count('stop when time ='),34)
   self.assertIn('SAR16_NATIVE_COMPLETE',text);self.assertNotIn('delete all',text)
   self.assertEqual(text.splitlines().count('run'),1);self.assertEqual(text.splitlines().count('resume'),34)
   self.assertIn('v(B15)',text);self.assertNotIn('uic',text)

 def test_partial_nonfinite_and_nonincreasing_trace_never_passes(self):
  with tempfile.TemporaryDirectory()as f:
   folder=Path(f);file=folder/'waveform.dat';file.write_text('time v\n0 0\n.5 1\n1 2\n')
   rows=S.actual_rows(folder,2,1);self.assertEqual(S.sample(rows,.25,1),.5)
   with self.assertRaises(EDAError):S.actual_rows(folder,2,2)
   for t in(-1,2):
    with self.assertRaises(EDAError):S.sample(rows,t,1)
   for bad in ['time v\n0 nan\n','time v\n0 1\n0 2\n','time v\n0\n']:
    file.write_text(bad)
    with self.assertRaises(EDAError):S.actual_rows(folder,2)

 def test_recommended_settings_fit_native_budget(self):
  for kind,item in A.CATALOG.items():
   s=A.recommended_settings(kind,item['parameter_defaults']);self.assertLessEqual(s['duration_s']/s['step_s'],200000)
  for stem in('sar16','sigma_delta16','pipeline16'):self.assertIn('devices',A.digital(stem))

 def test_failed_accuracy_cannot_become_pass_or_measured_enob(self):
  p=dict(design_template={'id':'sigma_delta16'},testbench={'corner':'ss','temperature_C':125,'supply_V':1.8})
  run={'artifacts':{}};report={'checks':[S.check('raw error',False,119)],'scope':'unit test only'}
  with tempfile.TemporaryDirectory()as f:S.finish(run,p,Path(f),report,{'frames':6})
  self.assertEqual(run['analysis_result'],'fail');self.assertIsNone(run['measurements']['ENOB_bits'])
  self.assertEqual(run['measurements']['corner'],'ss');self.assertEqual(run['measurements']['temperature_C'],125)

 def test_edited_digital_hierarchy_is_not_replaced_by_original_rtl(self):
  ir=A.schematic('sdm16_filter');ir['devices'][0]['pins'][next(iter(ir['devices'][0]['pins']))]='CHANGED'
  p=dict(design_template={'id':'sdm16_filter','parameters':{}},schematic=ir)
  with self.assertRaises(EDAError):S.digital_block(None,{},p,None,{})

 def test_loop_feedforward_cancels_input_dependent_dc_shift(self):
  c=A.library()['SDM16_INTEGRATOR2'];r={d['name']:d['parameters']['value']for d in c['devices']if d['kind']=='resistor'}
  for vin in(.3,.9,1.5):
   ref=(.9/r['R_REF_CM']+vin/r['R_REF_SIGNAL'])/(1/r['R_REF_CM']+1/r['R_REF_SIGNAL'])
   # At mean DAC=VIN the declared second-stage resistor currents sum to zero
   # when the first integrator mean equals VCM, for all three inputs.
   total=(.9-ref)/r['R_INPUT']+(vin-ref)/r['R_FEEDBACK']
   self.assertAlmostEqual(total,0,places=15)


if __name__=='__main__':unittest.main()
