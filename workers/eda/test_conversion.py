import copy
import unittest
import conversion as C
import physical_library as P
import native
from geometry import EDAError

class ConversionQA(unittest.TestCase):
    def test_complete_mask_updates_interface_without_inheriting_verification(self):
        meta={'physical_interface_complete':False,'combined_verification':'pass','R_Ohm':1000}
        report={'direction':'forward','ready':True,'run_id':'native','preview_hash':'hash','passive_replacements':[{'requested_SI':1000,'nominal_geometry_SI':998.3}]}
        result=C.mixed_after_forward(meta,report)
        self.assertFalse(meta['physical_interface_complete']);self.assertTrue(result['physical_interface_complete'])
        self.assertEqual(result['combined_verification'],'not-run');self.assertEqual(result['R_Ohm'],1000)
        self.assertEqual(result['physical_conversion']['passive_replacements'],report['passive_replacements'])
        for direction,ready in [('reverse',True),('forward',False)]:
            self.assertEqual(C.mixed_after_forward(meta,{**report,'direction':direction,'ready':ready}),meta)
    def test_ground_symbol_is_not_replayed_as_an_external_current_source(self):
        ir={'ports':['VDD','OUT'],'devices':[dict(id='r',name='R',kind='resistor',pins={'+':'VDD','-':'0'},parameters={'value':10000},x=0,y=0),dict(id='v',name='V',kind='voltage',pins={'+':'VDD','-':'0'},parameters={'dc':1.8},x=100,y=0),dict(id='g',name='G',kind='ground',pins={'G':'0'},parameters={},x=0,y=100)],'cells':{},'connectivity_mode':'explicit'}
        # OUT is not declared by a physical device, so use the actual VDD port.
        ir['ports']=['VDD']
        result,_,_,sources=C.forward_input({'pdk_id':'sky130A','ports':ir['ports'],'schematic':ir},{'body_net':'0'})
        self.assertEqual([s['kind'] for s in sources],['voltage']);self.assertEqual(len(result['devices']),1)
    def test_extracted_transistors_preserve_terminal_order_and_units(self):
        text='.subckt inv Y VPWR VGND A\nX0 VPWR A Y VPWR sky130_fd_pr__pfet_01v8_hvt w=650n l=0.15 ad=.2\nX1 VGND A Y VGND sky130_fd_pr__nfet_01v8 w=.65 l=150n\n.ends\n'
        r=C.parse_extracted(text,'inv');self.assertTrue(r['ready']);self.assertEqual(r['ports'],['Y','VPWR','VGND','A'])
        d=r['schematic']['devices'][0];self.assertEqual(d['pins'],dict(D='VPWR',G='A',S='Y',B='VPWR'));self.assertAlmostEqual(d['parameters']['w_um'],.65)
        self.assertEqual(r['losses'][0]['parameters'],['ad']);self.assertIn('sky130_fd_pr__nfet_01v8',native.emit(r['schematic'],'inv',r['ports']))
    def test_continuation_and_geometry_sized_passives(self):
        t='.subckt rc IN OUT\n+ VGND\nX0 IN OUT VGND sky130_fd_pr__res_xhigh_po_1p41 l=3.36\nX1 OUT VGND sky130_fd_pr__cap_mim_m3_1 l=10 w=10\n.ends\n'
        r=C.parse_extracted(t,'rc');self.assertTrue(r['ready']);a,b=r['schematic']['devices'];self.assertEqual(a['pins']['B'],'VGND');self.assertAlmostEqual(a['parameters']['value'],P.RES_CONTACT+P.RES_SLOPE*3.36);self.assertAlmostEqual(b['parameters']['value'],207.6e-15)
    def test_unknown_models_and_expressions_block_partial_application(self):
        for line in ['X0 A B C D unknown_model w=1 l=1','R0 A B {secret}','X0 A B C D sky130_fd_pr__nfet_01v8 w=1 l=1 nf=2']:
            r=C.parse_extracted('.subckt x A B C D\n'+line+'\n.ends','x');self.assertFalse(r['ready']);self.assertTrue(r['issues'])
    def test_directives_are_not_executed_and_unclosed_cells_fail(self):
        r=C.parse_extracted('.subckt x A B\n.include /private/models\nR0 A B 1k\n.ends','x');self.assertFalse(r['ready']);self.assertEqual(r['issues'][0]['code'],'UNSUPPORTED_DIRECTIVE')
        with self.assertRaises(EDAError):C.parse_extracted('.subckt x A B\nR0 A B 1k','x')
    def test_port_aliases_are_not_guessed_or_merged(self):
        r=C.parse_extracted('.subckt x A[0] B\nR0 A[0] B 1k\n.ends','x');self.assertFalse(r['ready']);self.assertEqual(r['ports'],['A[0]','B'])
    def test_source_is_not_mutated_and_explicit_body_survives(self):
        ir={'ports':['IN','OUT','GND'],'devices':[dict(id='r',name='R',kind='resistor',pins={'+':'IN','-':'OUT'},parameters={'value':10000},x=300,y=100),dict(id='c',name='C',kind='capacitor',pins={'+':'OUT','-':'GND'},parameters={'value':1e-12},x=100,y=300)],'cells':{},'connectivity_mode':'explicit'}
        p={'pdk_id':'sky130A','schematic':ir,'ports':ir['ports']};before=copy.deepcopy(p)
        result,spec,replaced,excluded=C.forward_input(p,{'body_net':'GND','order':'schematic'});self.assertEqual(p,before);self.assertEqual(spec['body_net'],'GND');self.assertEqual(result['devices'][0]['kind'],'resistor');self.assertEqual(result['devices'][0]['pins']['B'],'GND');self.assertEqual(len(replaced),2)
        with self.assertRaises(EDAError):C.forward_input(p,{'body_net':'guessed_ground'})
    def test_matching_group_internal_order_stays_indivisible(self):
        ir=P.gate('cell_inv');ir['cells']={};a=ir['devices'][0];b=copy.deepcopy(a);b.update(id='other',name='OTHER',x=1,y=1)
        c=copy.deepcopy(a);c.update(id='third',name='THIRD',x=100,y=100)
        for d,role in [(a,'A'),(b,'B'),(c,'A')]:d.update(matching_group='matched',matching_role=role)
        ir['devices']=[a,b,c,ir['devices'][1]]
        result,_,_,_=C.forward_input({'pdk_id':'sky130A','ports':ir['ports'],'schematic':ir},{'order':'schematic'})
        self.assertEqual([d['name'] for d in result['devices'] if d.get('matching_group')], [a['name'],b['name'],c['name']])
    def test_bad_specs_and_source_budget_are_rejected(self):
        ir=P.gate('cell_inv');p={'pdk_id':'sky130A','ports':ir['ports'],'schematic':ir}
        for settings in [{'chip_limits':{'width_um':10,'height_um':10,'edge_um':10}},{'pin_side':'arbitrary'},{'order':'random'},{'unexpected':True}]:
            with self.assertRaises(EDAError):C.forward_input(p,settings)
    def test_geometric_connections_resolve_before_flattening(self):
        # Existing native pin connector provides exact net resolution. A
        # contradictory named wire must never be routed as a guessed graph.
        ir=P.gate('cell_inv');ir['connectivity_mode']='geometric'
        with self.assertRaises(EDAError):C.resolved(ir)
    def test_numerics_never_accept_nonfinite_zero_or_ambiguous_suffixes(self):
        for v in ['NaN','inf','0','-1','1ms','1;quit','{1+2}']:
            with self.assertRaises(EDAError):C.number(v)
        self.assertEqual(C.number('1MEG'),1e6);self.assertEqual(C.number('1m'),.001);self.assertAlmostEqual(C.number('150n',True),.15)

if __name__=='__main__':unittest.main()
