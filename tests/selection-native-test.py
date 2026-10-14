"""Actual KLayout and native IR, isolated transactions and immutable history."""
import copy,json,sys,uuid,unittest,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'workers/eda'))
import server as S
import geometry as G
import klayout.db as k
from geometry import EDAError

class SelectionTests(unittest.TestCase):
 def call(self,p,command,mode='layout',**extra):
  return S.rpc(mode+'.apply_command',dict(project_id=p['id'],expected_revision=p['revision'],command_id=uuid.uuid4().hex,command=command,**extra))
 def hash(self,p):
  layout=S.load_layout(p);return G.semantic_hash(layout,layout.cell(p["cell"]))
 def layout(self):
  p=S.create(dict(example='layout',name='Public group QA'))
  for x in (0,2000):p=self.call(p,dict(type='add_box',layer_id='68/20',box=[str(x),'0',str(x+1000),'1000'],net='BUS'))
  return p
 def ids(self,p):return [s['id'] for s in S.rpc('view.get_scene',dict(project_id=p['id']))['shapes']]
 def test_group_move_copy_delete_one_undo_and_roundtrip(self):
  p=self.layout();ids=self.ids(p);before=self.hash(p);rev=p['revision']
  p=self.call(p,dict(type='selection',action='move',ids=ids,dx='1000',dy='-500'));self.assertEqual(p['revision'],rev+1)
  p=self.call(p,dict(type='undo'));self.assertEqual(self.hash(p),before)
  p=self.call(p,dict(type='selection',action='copy',ids=ids,dx='5000',dy='0'));self.assertEqual(len(self.ids(p)),4)
  for fmt in ('gds','oas'):self.assertTrue(S.rpc('layout.export',dict(project_id=p['id'],format=fmt))['roundtrip']['geometry_equal'])
  p=self.call(p,dict(type='selection',action='delete',ids=ids));self.assertEqual(len(self.ids(p)),2)
  p=self.call(p,dict(type='undo'));self.assertEqual(len(self.ids(p)),4)
 def test_later_failure_grid_duplicates_limit_and_generated_children_are_atomic(self):
  p=self.layout();ids=self.ids(p)
  for command in [dict(type='selection',action='move',ids=[ids[0],'missing'],dx='5',dy='0'),dict(type='selection',action='move',ids=ids,dx='3',dy='0'),dict(type='selection',action='delete',ids=ids+ids),dict(type='selection',action='delete',ids=['x']*1001)]:
   before=S.snapshot_dir(p).joinpath('layout.oas').read_bytes()
   with self.assertRaises(EDAError):self.call(p,command)
   self.assertEqual(S.get_project(p['id'])['revision'],p['revision']);self.assertEqual(S.snapshot_dir(p).joinpath('layout.oas').read_bytes(),before)
  generated=self.layout();layout=S.load_layout(generated);protected=layout.create_cell('locked_child');protected.shapes(layout.layer(68,20)).insert(k.Box(10000,0,11000,1000));layout.cell(generated['cell']).insert(k.CellInstArray(protected.cell_index(),k.Trans()));old=generated['revision'];generated['revision']=generated['next_revision'];generated['next_revision']+=1;generated=S.commit(generated,layout,parent=old)
  child=next(v for v in self.ids(generated) if v.count('/')>1);top=next(v for v in self.ids(generated) if v.count('/')==1)
  with self.assertRaises(EDAError):self.call(generated,dict(type='selection',action='delete',ids=[top,child]))
  self.assertIn(top,self.ids(generated))
 def schematic(self):
  p=S.create(dict(example='schematic',name='Mixed native group'))
  p=self.call(p,dict(type='add_device',device=dict(id='r',name='R1',kind='resistor',x=0,y=0,pins={'1':'a','2':'b'},parameters={'value':1000})), 'schematic')
  p=self.call(p,dict(type='add_wire',wire=dict(id='w',points=[[0,0],[100,0]],net='a')),'schematic')
  return self.call(p,dict(type='add_junction',junction=dict(id='j',x=0,y=0,net='a')),'schematic')
 def test_mixed_ir_translation_copy_delete_atomic_undo_and_net_preservation(self):
  p=self.schematic();original=copy.deepcopy(p['schematic']);items=[dict(kind=k,id=i) for k,i in [('device','r'),('wire','w'),('junction','j')]]
  p=self.call(p,dict(type='selection',action='move',items=items,dx=20,dy=30),'schematic');ir=p['schematic'];self.assertEqual(ir['devices'][0]['pins'],original['devices'][0]['pins']);self.assertEqual(ir['wires'][0]['points'],[[20,30],[120,30]]);self.assertEqual(ir['junctions'][0]['x'],20)
  p=self.call(p,dict(type='undo'),'schematic');self.assertEqual(p['schematic'],original)
  p=self.call(p,dict(type='selection',action='copy',items=items,dx=20,dy=20),'schematic');self.assertEqual([len(p['schematic'][k]) for k in ('devices','wires','junctions')],[2,2,2]);self.assertEqual(p['schematic']['devices'][1]['pins'],original['devices'][0]['pins'])
  p=self.call(p,dict(type='selection',action='delete',items=items),'schematic');self.assertEqual(len(p['schematic']['devices']),1)
  p=self.call(p,dict(type='undo'),'schematic');self.assertEqual(len(p['schematic']['devices']),2)
 def test_unknown_item_overflow_wrong_cell_and_receipt_never_partially_edit(self):
  p=self.schematic();original=copy.deepcopy(p['schematic']);items=[dict(kind='device',id='r'),dict(kind='wire',id='missing')]
  with self.assertRaises(EDAError):self.call(p,dict(type='selection',action='move',items=items,dx=20,dy=20),'schematic')
  self.assertEqual(S.get_project(p['id'])['schematic'],original)
  with self.assertRaises(EDAError):self.call(p,dict(type='selection',action='move',items=[dict(kind='device',id='r'),dict(kind='wire',id='w')],dx=1000000,dy=0),'schematic')
  self.assertEqual(S.get_project(p['id'])['schematic'],original)
  with self.assertRaises(EDAError):self.call(p,dict(type='selection',action='delete',items=[dict(kind='device',id='r')]),'schematic',cell_name='missing')
  self.assertEqual(S.get_project(p['id'])['schematic'],original)
  c=dict(project_id=p['id'],expected_revision=p['revision'],command_id=uuid.uuid4().hex,command=dict(type='selection',action='move',items=[dict(kind='device',id='r')],dx=20,dy=20))
  a=S.rpc('schematic.apply_command',c);b=S.rpc('schematic.apply_command',c);self.assertEqual(a['revision'],b['revision']);self.assertEqual(b['schematic']['devices'][0]['x'],20)
 def test_one_thousand_masks_in_large_cell_and_duplicate_occurrences(self):
  p=S.create(dict(example='layout',name='Bounded large native selection'));layout=S.load_layout(p);top=layout.cell(p['cell']);li=layout.layer(68,20)
  for i in range(5000):top.shapes(li).insert(k.Box(i*10,0,i*10+5,5))
  old=p['revision'];p['revision']=p['next_revision'];p['next_revision']+=1;p=S.commit(p,layout,parent=old);ids=self.ids(p)[:1000];start=time.monotonic()
  moved=self.call(p,dict(type='selection',action='move',ids=ids,dx='100000',dy='0'));elapsed=time.monotonic()-start
  scene=S.rpc('view.get_scene',dict(project_id=p['id']));self.assertEqual(len(scene['shapes']),5000);self.assertEqual(moved['revision'],p['revision']+1)
  self.assertTrue(all(all(int(pt[0])>=100000 for pt in s['polygon']) for s in scene['shapes'] if s['id'] in ids))
  print('Actual 1000-mask edit in 5000-mask cell: %.4f s (host-specific, no customer time claim)'%elapsed)
  with self.assertRaises(EDAError):self.call(moved,dict(type='selection',action='move',ids=[ids[0],'alias/'+ids[0].rsplit('/',1)[-1]],dx='5',dy='0'))

if __name__=='__main__':
 result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(SelectionTests));S.POOL.shutdown(wait=True);S.DB.close();sys.exit(0 if result.wasSuccessful() else 1)
