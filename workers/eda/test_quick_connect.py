import copy,unittest
import native
from geometry import EDAError

class QuickConnectTests(unittest.TestCase):
    def ir(self,mode='explicit'):
        return {'ports':[],'connectivity_mode':mode,'devices':[dict(id='r1',name='R1',kind='resistor',pins={'+':'','-':''},parameters={'value':1000},x=100,y=100),dict(id='r2',name='R2',kind='resistor',pins={'+':'','-':''},parameters={'value':1000},x=300,y=100)],'wires':[],'junctions':[]}
    def command(self):return dict(type='connect_pins',id='wire1',from_device_id='r1',from_pin='+',to_device_id='r2',to_pin='+',points=[[100,56],[300,56]])
    def test_explicit_pin_click_creates_one_actual_net_and_wire(self):
        ir=self.ir();native.apply(ir,self.command());self.assertEqual(ir['devices'][0]['pins']['+'],'N_1');self.assertEqual(ir['devices'][1]['pins']['+'],'N_1');self.assertEqual(ir['wires'][0]['net'],'N_1');self.assertEqual(ir['devices'][0]['pins']['-'],'')
    def test_existing_named_net_is_preserved(self):
        ir=self.ir();ir['devices'][0]['pins']['+']='OUT';native.apply(ir,self.command());self.assertEqual(ir['devices'][1]['pins']['+'],'OUT')
    def test_two_named_nets_never_merge_by_guess(self):
        ir=self.ir();ir['devices'][0]['pins']['+']='VDD';ir['devices'][1]['pins']['+']='GND';before=copy.deepcopy(ir)
        with self.assertRaises(EDAError):native.apply(ir,self.command())
        self.assertEqual(ir,before)
    def test_changed_pin_position_is_rejected_without_partial_mutation(self):
        ir=self.ir();ir['devices'][1]['rotation']=90;before=copy.deepcopy(ir)
        with self.assertRaises(EDAError):native.apply(ir,self.command())
        self.assertEqual(ir,before)
    def test_duplicate_wire_does_not_change_pin_names(self):
        ir=self.ir();ir['wires']=[dict(id='wire1',points=[[0,0],[0,10]])];before=copy.deepcopy(ir)
        with self.assertRaises(EDAError):native.apply(ir,self.command())
        self.assertEqual(ir,before)
    def test_geometric_wire_uses_native_contacts_without_inserting_labels(self):
        ir=self.ir('geometric');native.apply(ir,self.command());self.assertEqual(ir['devices'][0]['pins']['+'],'');graph,_=native.connectivity(ir);net=next(n for n in graph['nets'] if n['wire_ids']);self.assertEqual(len(net['pins']),2)
    def test_geometric_route_cannot_short_another_named_wire(self):
        ir=self.ir('geometric');ir['devices'][0]['pins']['+']='A';ir['wires']=[dict(id='other',points=[[200,40],[200,56]],net='B')];before=copy.deepcopy(ir)
        with self.assertRaises(EDAError):native.apply(ir,self.command())
        self.assertEqual(ir,before)
    def test_crossing_without_junction_is_not_a_short(self):
        ir=self.ir('geometric');ir['devices'][0]['pins']['+']='A';ir['wires']=[dict(id='other',points=[[200,40],[200,80]],net='B')]
        native.apply(ir,self.command());graph,_=native.connectivity(ir);self.assertFalse(graph['conflicts'])
    def test_zero_length_and_diagonal_paths_are_rejected(self):
        for points in [[[100,56],[100,56],[300,56]],[[100,56],[200,60],[300,56]]]:
            ir=self.ir();c=self.command();c['points']=points
            with self.assertRaises(EDAError):native.apply(ir,c)
    def test_unselected_floating_terminal_is_not_silently_connected(self):
        ir=self.ir();extra=copy.deepcopy(ir['devices'][0]);extra.update(id='r3',name='R3',x=200,y=100);ir['devices'].append(extra);before=copy.deepcopy(ir)
        with self.assertRaises(EDAError):native.apply(ir,self.command())
        self.assertEqual(ir,before)

if __name__=='__main__':unittest.main()
