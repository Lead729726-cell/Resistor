import unittest
import klayout.db as k
import geometry as g

class LayoutEditTests(unittest.TestCase):
    def setUp(self):
        self.l=k.Layout();self.l.dbu=.001;self.top=self.l.create_cell('layout')
        self.p={'id':'qa','revision':1,'cell':'layout','grid_dbu':5,'dbu_um':.001,'source':'pdk','layers':[{'id':'68/20'},{'id':'69/20'}],'user_cells':['layout']}
        g.apply(self.l,self.p,{'type':'add_box','layer_id':'68/20','box':['0','0','1000','500'],'net':'OUT'})
        self.shape=next(self.top.shapes(self.l.layer(68,20)).each());self.id='layout/'+self.shape.property(1)
    def test_rectangle_resize_keeps_id_changes_layer_and_net(self):
        g.apply(self.l,self.p,{'type':'update_box','id':self.id,'box':['-500','0','2500','1000'],'layer_id':'69/20','net':'NEW'})
        rows=list(self.top.shapes(self.l.layer(69,20)).each());self.assertEqual(len(rows),1)
        s=rows[0];self.assertEqual(s.property(1),self.id.split('/')[1]);self.assertEqual(s.property(2),'NEW');self.assertEqual(s.box,k.Box(-500,0,2500,1000));self.assertEqual(self.top.shapes(self.l.layer(68,20)).size(),0)
    def test_copy_keeps_original_net_and_new_id_without_faking_device(self):
        self.shape.set_property(3,'mn1')
        g.apply(self.l,self.p,{'type':'copy_shape','id':self.id,'dx':'2000','dy':'-500'})
        rows=list(self.top.shapes(self.l.layer(68,20)).each());self.assertEqual(len(rows),2)
        original=next(s for s in rows if s.property(1)==self.id.split('/')[1]);copy=next(s for s in rows if s!=original)
        self.assertEqual(original.box,k.Box(0,0,1000,500));self.assertEqual(copy.box,k.Box(2000,-500,3000,0));self.assertEqual(copy.property(2),'OUT');self.assertIsNone(copy.property(3))
    def test_invalid_edits_do_not_modify_geometry(self):
        for fields in [{'box':['0','0','0','500']},{'box':['0','0','503','500']},{'box':['0','0','2147483650','500']},{'box':['0','0','1500','500'],'net':'bad\nnet'},{'box':['0','0','1500','500'],'layer_id':'99/20'}]:
            with self.assertRaises(g.EDAError):g.apply(self.l,self.p,{'type':'update_box','id':self.id,**fields})
            self.assertEqual(self.shape.box,k.Box(0,0,1000,500));self.assertEqual(self.shape.property(2),'OUT')
    def test_wrong_edit_cell_and_pcell_paths_rejected(self):
        user=self.l.create_cell('user');self.p['user_cells'].append('user')
        with self.assertRaises(g.EDAError):g.apply(self.l,self.p,{'type':'copy_shape','id':'layout/pcell:instance/x','dx':'0','dy':'0'})
        with self.assertRaises(g.EDAError):g.apply(self.l,self.p,{'type':'move_shape','id':self.id,'cell_name':'user','dx':'0','dy':'0'})
    def test_polygon_copy_preserves_holes_and_rejects_box_editor(self):
        g.apply(self.l,self.p,{'type':'add_polygon','layer_id':'68/20','polygon':[['0','0'],['2000','0'],['2000','2000'],['0','2000']],'holes':[[['500','500'],['1500','500'],['1500','1500'],['500','1500']]]})
        s=next(s for s in self.top.shapes(self.l.layer(68,20)).each() if s.is_polygon());id='layout/'+s.property(1)
        with self.assertRaises(g.EDAError):g.apply(self.l,self.p,{'type':'update_box','id':id,'box':['0','0','500','500']})
        g.apply(self.l,self.p,{'type':'copy_shape','id':id,'dx':'3000','dy':'0'});self.assertEqual(sum(s.polygon.holes() for s in self.top.shapes(self.l.layer(68,20)).each() if s.is_polygon()),2)

if __name__=='__main__':unittest.main()
