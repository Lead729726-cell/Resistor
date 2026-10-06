"""Actual native connectivity and SPICE invariance for oriented symbols."""
import copy
import unittest
import native
from geometry import EDAError

def resistor(rotation=0,mirror=False):
    return {'id':'r','name':'R1','kind':'resistor','pins':{'+':'IN','-':'0'},'parameters':{'value':1000},'x':100,'y':200,'rotation':rotation,'mirror':mirror}

class DrawingTests(unittest.TestCase):
    def test_exact_rotated_terminal_geometry(self):
        self.assertEqual(native.pin_offsets(resistor(90))['+'],(44,0))
        self.assertEqual(native.pin_offsets(resistor(90))['-'],(-44,0))

    def test_mirrored_rotated_mos_geometry(self):
        d={'kind':'nmos','rotation':90,'mirror':True}
        self.assertEqual(native.pin_offsets(d),{'D':(42,-30),'G':(0,46),'S':(-42,-30),'B':(0,-49)})

    def test_geometric_wire_attaches_to_actual_rotated_pin(self):
        ir={'devices':[resistor(90)],'connectivity_mode':'geometric','wires':[{'id':'wire','points':[[144,200],[250,200]],'net':'IN'}]}
        result,_=native.connectivity(ir)
        attached=next(net for net in result['nets'] if 'wire' in net['wire_ids'])
        self.assertIn({'device_id':'r','pin':'+'},attached['pins'])
        self.assertNotIn({'device_id':'r','pin':'-'},attached['pins'])

    def test_explicit_spice_physics_is_invariant_under_all_orientations(self):
        ir={'devices':[resistor()]};before=native.emit(ir,'top',[])
        for rotation in (0,90,180,270):
            for mirror in (False,True):
                native.apply(ir,{'type':'transform_device','id':'r','rotation':rotation,'mirror':mirror})
                self.assertEqual(native.emit(ir,'top',[]),before)
                self.assertEqual(ir['devices'][0]['parameters'],{'value':1000})

    def test_invalid_transform_is_atomic(self):
        ir={'devices':[resistor()]};before=copy.deepcopy(ir)
        for bad in ({'rotation':45},{'rotation':True},{'mirror':'true'}):
            with self.assertRaises(EDAError):native.apply(ir,{'type':'transform_device','id':'r',**bad})
            self.assertEqual(ir,before)

    def test_copy_preserves_orientation_and_independent_parameters(self):
        ir={'devices':[resistor(270,True)]};native.apply(ir,{'type':'copy_device','id':'r','dx':20,'dy':20})
        self.assertEqual(ir['devices'][1]['rotation'],270);self.assertIs(ir['devices'][1]['mirror'],True)
        ir['devices'][1]['parameters']['value']=2000;self.assertEqual(ir['devices'][0]['parameters']['value'],1000)

if __name__=='__main__':unittest.main()
