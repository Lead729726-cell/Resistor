import unittest,copy
import physical_library as P,chip_references as C,native
from geometry import EDAError

class PhysicalLibraryQA(unittest.TestCase):
    def test_all_gate_topologies_and_input_matrices(self):
        expected={'cell_inv':[1,0],'cell_nand2':[1,1,1,0],'cell_nor2':[1,0,0,0],'cell_and2':[0,0,0,1],'cell_or2':[0,1,1,1],'cell_xor2':[0,1,1,0],'cell_xnor2':[1,0,0,1],'cell_mux2':[0,1,0,1,0,0,1,1]}
        for kind,want in expected.items():
            ir=P.gate(kind);self.assertTrue(native.validate(ir)['valid'],kind)
            self.assertEqual([r['expected'] for r in P.gate_cases(kind)],want)
    def test_materialization_preserves_source_and_explicit_models(self):
        for kind in C.CATALOG:
            ir=C.schematic(kind,C.CATALOG[kind]['parameter_defaults']);before=copy.deepcopy(ir)
            flat,rows=P.materialize(ir);self.assertEqual(ir,before)
            self.assertTrue(native.validate(flat)['valid'],kind)
            self.assertFalse(any(d['kind'] in ('resistor','capacitor') and not d.get('model') for d in flat['devices']))
            for r in rows:self.assertLess(abs(r['nominal_geometry_SI']/r['requested_SI']-1),.005)
            spice=native.emit(flat,kind,flat['ports']);self.assertNotIn('\nC',spice);self.assertNotIn('\nR',spice)
    def test_pdk_passive_is_not_emitted_as_ideal_value(self):
        ir,rows=P.materialize(C.vco(500e-15));spice=native.emit(ir,'vco',ir['ports'])
        self.assertIn('sky130_fd_pr__cap_mim_m3_1 w=',spice);self.assertNotIn('5e-13',spice)
    def test_invalid_body_grid_and_model_fail(self):
        ir,_=P.materialize(C.schematic('chip_ldo',C.CATALOG['chip_ldo']['parameter_defaults']))
        d=next(d for d in ir['devices'] if d['kind']=='resistor')
        for change in ['body','grid','model']:
            bad=copy.deepcopy(d)
            if change=='body':bad['pins'].pop('B')
            if change=='grid':bad['parameters']['l_um']+=.001
            if change=='model':bad['model']='unknown_private_model'
            with self.assertRaises(EDAError):native.validate_device(bad)
    def test_truth_verification_rejects_wrong_inputs_and_missing_window(self):
        kind='cell_inv';p={'ports':P.GATES[kind][1],'design_template':{'id':kind}}
        def run(a):return {'waveforms':[{'name':'A','x':[40e-9,45e-9,90e-9,95e-9],'y':a},{'name':'Y','x':[40e-9,45e-9,90e-9,95e-9],'y':[1.8,1.8,0,0]}],'measurements':{}}
        self.assertTrue(P.measurements(p,run([0,0,1.8,1.8]),{'supply_V':1.8})['pass'])
        self.assertFalse(P.measurements(p,run([1.8]*4),{'supply_V':1.8})['pass'])
        r=run([0,0,1.8,1.8]);r['waveforms'][1]['x']=[];r['waveforms'][1]['y']=[]
        self.assertFalse(P.measurements(p,r,{'supply_V':1.8})['pass'])

if __name__=='__main__':unittest.main()
