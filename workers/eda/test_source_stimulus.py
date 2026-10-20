import copy,tempfile,unittest
from unittest.mock import patch
from pathlib import Path
import native,source_stimulus,logic_composition,custom_circuit,conversion
from geometry import EDAError

PULSE={'kind':'pulse','low':0,'high':1.8,'delay_s':2e-9,'rise_s':100e-12,'fall_s':100e-12,'width_s':4.9e-9,'period_s':10e-9}
def source(kind='voltage'):return {'id':'v','name':'VIN','kind':kind,'pins':{'+':'A','-':'0'},'parameters':{'dc':.2},'x':0,'y':0}

class SourceStimulusTests(unittest.TestCase):
 def test_legacy_dc_spice_is_byte_compatible_and_pulse_has_explicit_dc_bias(self):
  d=source();self.assertIn('VVIN A 0 0.2\n',native.emit({'devices':[d]},'top',[]))
  ir={'devices':[d]};native.apply(ir,{'type':'set_source','id':'v','dc':.2,'stimulus':PULSE});text=native.emit(ir,'top',[])
  self.assertIn('VVIN A 0 DC 0.2 PULSE(0 1.8 2e-09 1e-10 1e-10 4.9e-09 1e-08)',text)
  native.apply(ir,{'type':'set_source','id':'v','dc':1.8,'stimulus':None});self.assertNotIn('PULSE',native.emit(ir,'top',[]))
 def test_pwl_and_current_source_use_si_numbers_without_expression_interpolation(self):
  d=source('current');d['stimulus']={'kind':'pwl','points':[[0,0],[1e-9,-.001],[2e-9,.002]]}
  self.assertIn('IVIN A 0 DC 0.2 PWL(0 0 1e-09 -0.001 2e-09 0.002)',native.emit({'devices':[d]},'top',[]))
 def test_invalid_source_edits_are_atomic(self):
  for bad in [{**PULSE,'rise_s':0},{**PULSE,'period_s':1e-9},{**PULSE,'low':False},{**PULSE,'high':'1.8)\n.control\nshell bad'},{**PULSE,'extra':1},{**PULSE,'delay_s':float('inf')},{'kind':'pwl','points':[[0,0],[0,1]]},{'kind':'pwl','points':[[1e-9,0],[2e-9,1]]}]:
   ir={'devices':[source()]};before=copy.deepcopy(ir)
   with self.assertRaises(EDAError):native.apply(ir,{'type':'set_source','id':'v','dc':0,'stimulus':bad})
   self.assertEqual(ir,before)
 def test_clock_preset_is_explicit_and_nested_sources_survive_analysis_copy(self):
  for kind in ('nand-chain','half-adder','mux-chain'):
   ir={'devices':[]};logic_composition.demo(ir,kind);native.apply(ir,{'type':'configure_logic_transient'});before=copy.deepcopy(ir)
   q=custom_circuit.prepare({'schematic':ir,'ports':ir['ports']});self.assertEqual(ir,before)
   self.assertEqual(next(d for d in q['schematic']['devices'] if d['id']=='source_a')['stimulus'],source_stimulus.validate(PULSE))
   self.assertEqual(ir['timing_check']['polarity'],'inverting' if kind=='nand-chain' else 'same')
 def test_resolution_and_tmax_are_enforced_without_fabricating_a_waveform(self):
  d=source();d['stimulus']=PULSE
  with self.assertRaises(EDAError):source_stimulus.check_resolution([d],native.testbench({'analysis':'tran','step_s':1e-9}))
  source_stimulus.check_resolution([d],native.testbench({'analysis':'op','step_s':1e-9}))
  p={'cell':'top','ports':['A'],'schematic':{'devices':[d]}}
  with tempfile.TemporaryDirectory() as folder:
   (Path(folder)/'net.spice').write_text(native.emit(p['schematic'],p['cell'],p['ports']))
   tb,*_=custom_circuit.spice_tb(p,Path(folder),native.testbench({'step_s':5e-12,'duration_s':40e-9}),Path(folder)/'net.spice')
   self.assertIn('tran 5e-12 4e-08 0 5e-12',tb)
 def test_forward_layout_records_exact_external_stimulus_and_replays_it(self):
  ir={'ports':['A','Y','VPWR'],'devices':[source(),{'id':'n','name':'MN','kind':'nmos','model':'sky130_fd_pr__nfet_01v8','pins':{'D':'Y','G':'A','S':'0','B':'0'},'parameters':{'w_um':1,'l_um':.15},'x':100,'y':100}]}
  ir['devices'][0]['id']='source_a';ir['devices'][0]['stimulus']=PULSE
  # The root sources remain outside the physical circuit. No wave may be lost.
  p={'pdk_id':'sky130A','schematic':ir,'ports':ir['ports']}
  result,settings,replacements,sources=conversion.forward_input(p,{})
  original=next(d for d in ir['devices'] if d['id']=='source_a')
  wave=next(d for d in sources if d['name']==original['name'])
  self.assertEqual(wave['stimulus'],original['stimulus']);self.assertIsNot(wave['stimulus'],original['stimulus'])
  with tempfile.TemporaryDirectory() as folder,patch('custom_circuit.design_tools.supported_model_deck',return_value=Path('/unit-test-model-deck')):
   (Path(folder)/'net.spice').write_text(native.emit(result,'test',result['ports']))
   tb,*_=custom_circuit.spice_tb({'schematic':result,'ports':result['ports'],'cell':'test','conversion':{'external_sources':sources}},Path(folder),native.testbench({'step_s':5e-12,'duration_s':40e-9}),Path(folder)/'net.spice')
   self.assertIn('PULSE(0 1.8 2e-09',tb)
 def test_recipe_bounds_are_explicit_and_invalid_edits_preserve_prior_criteria(self):
  ir={'devices':[]};logic_composition.demo(ir,'nand-chain');logic_composition.transient(ir);before=copy.deepcopy(ir)
  for bad in [{'high_V':0},{'minimum_cycles':True},{'end_s':0},{'extra':1},{'max_delay_s':-1}]:
   with self.assertRaises(EDAError):native.apply(ir,{'type':'set_timing_check','recipe':{**ir['timing_check'],**bad}})
   self.assertEqual(ir,before)

if __name__=='__main__':unittest.main()
