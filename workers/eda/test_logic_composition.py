import copy
import unittest
import native,logic_composition,custom_circuit,digital_units
from geometry import EDAError

class LogicCompositionTests(unittest.TestCase):
    def test_all_existing_gates_place_without_unrelated_library_cells(self):
        ir={'devices':[]}
        for i,gate in enumerate(logic_composition.GATES):
            native.apply(ir,{'type':'place_logic_gate','gate':gate,'id':'g'+str(i),'name':'U'+str(i),'x':i*200,'y':200})
            d=ir['devices'][-1]
            self.assertEqual(d['pin_roles']['Y'],'output')
            self.assertEqual(d['pins']['VGND'],'0')
            self.assertEqual(d['pins']['VPWR'],'VPWR')
            self.assertEqual(digital_units.flattened({'ports':[],'devices':[d],'cells':ir['cells']})['devices'][0]['kind'] in ('nmos','pmos'),True)
        self.assertNotIn('FULL_ADDER',ir['cells'])
        self.assertFalse(native.validate(ir)['valid']) # floating inputs remain floating

    def test_demo_prepare_is_nonmutating_and_uses_real_mos_models(self):
        for kind in ('nand-chain','half-adder','mux-chain'):
            ir={'devices':[]};native.apply(ir,{'type':'initialize_logic_demo','kind':kind})
            before=copy.deepcopy(ir);self.assertTrue(native.validate(ir)['valid'])
            self.assertEqual(native.connectivity(ir)[0]['conflicts'],[])
            q=custom_circuit.prepare({'schematic':ir,'ports':ir['ports']})
            self.assertEqual(ir,before);self.assertEqual(q['schematic'].get('cells',{}),{})
            self.assertFalse(any(d['kind']=='block' for d in q['schematic']['devices']))
            self.assertTrue(any(d.get('model')=='sky130_fd_pr__nfet_01v8' for d in q['schematic']['devices']))
            self.assertTrue(any(d['kind']=='voltage' and d['pins']['-']=='0' for d in q['schematic']['devices']))
            self.assertEqual(ir['logic_practice']['verification'],'not_run')

    def test_reference_conflict_and_bad_placement_are_atomic(self):
        ir={'devices':[]};cmd={'type':'place_logic_gate','gate':'INV','id':'u','name':'U1','x':100,'y':200}
        for bad in ({'gate':'FAKE'},{'rotation':45},{'power_nets':{'VPWR':'bad space','VGND':'0'}},{'extra':True}):
            before=copy.deepcopy(ir)
            with self.assertRaises(EDAError):native.apply(ir,{**cmd,**bad})
            self.assertEqual(ir,before)
        native.apply(ir,cmd);ir['cells']['RES_LOGIC_INV_v1']['devices'][0]['parameters']['w_um']=9
        before=copy.deepcopy(ir)
        with self.assertRaises(EDAError):native.apply(ir,{**cmd,'id':'v','name':'U2'})
        self.assertEqual(ir,before)
        case_collision={'devices':[],'cells':{'res_logic_INV_v1':{'ports':[],'devices':[]}}}
        with self.assertRaises(EDAError):native.apply(case_collision,cmd)
        with self.assertRaises(EDAError):native.apply(ir,{'type':'initialize_logic_demo','kind':'half-adder'})
        self.assertEqual(ir,before)

    def test_role_pin_geometry_and_existing_coordinates_are_compatible(self):
        legacy={'kind':'block','pins':{'A':'','Y':'','VPWR':'','VGND':''}}
        self.assertEqual(native.pin_offsets(legacy),{'A':(-55,-36),'Y':(-55,-12),'VPWR':(-55,12),'VGND':(-55,36)})
        d={**legacy,'pin_roles':{'A':'input','Y':'output','VPWR':'power','VGND':'power'}}
        self.assertEqual(native.pin_offsets(d),{'A':(-55,0),'Y':(73,0),'VPWR':(10,-68),'VGND':(10,68)})
        self.assertEqual(native.pin_offsets({**d,'rotation':90,'mirror':True}),{'A':(0,55),'Y':(0,-73),'VPWR':(68,-10),'VGND':(-68,-10)})

    def test_role_metadata_cannot_bypass_device_model_validation(self):
        d={'id':'n','name':'N','kind':'nmos','pins':{'D':'Y','G':'A','S':'0','B':'0'},'pin_roles':{'D':'output','G':'input','S':'power','B':'power'},'parameters':{'w_um':1,'l_um':.15},'x':0,'y':0}
        with self.assertRaises(EDAError):native.validate_device(d)

    def test_ground_zero_is_global_through_nested_analysis_flattening(self):
        r={'id':'r','name':'R1','kind':'resistor','pins':{'+':'A','-':'0'},'parameters':{'value':1000},'x':0,'y':0}
        cell={'ports':['A'],'devices':[r]}
        top={'ports':[],'devices':[{'id':'u','name':'U1','kind':'block','cell_name':'inner','pins':{'A':'IN'},'parameters':{},'x':0,'y':0}],'cells':{'inner':cell}}
        before=copy.deepcopy(top);flat=digital_units.flattened(top)
        self.assertEqual(flat['devices'][0]['pins'],{'+':'IN','-':'0'});self.assertEqual(top,before)

if __name__=='__main__':unittest.main()
