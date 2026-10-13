import unittest
import klayout.db as k
import floorplan as F
from geometry import EDAError

class FloorplanTests(unittest.TestCase):
    def layout(self,box):
        l=k.Layout();l.dbu=.001;c=l.create_cell('TOP');c.shapes(l.layer(68,20)).insert(k.Box(*box));return l
    def test_units_and_exact_edges(self):
        policy=F.policy(dict(width_um=100,height_um=80,max_area_um2=8000,edge_um=5))
        r=F.enforce(self.layout((5000,5000,95000,75000)),'TOP',policy)
        self.assertEqual(r['used_area_um2'],6300)
        self.assertEqual(r['chip_area_um2'],8000)
        for box in [(4999,5000,95000,75000),(5000,5000,95001,75000),(5000,-1,95000,75000)]:
            with self.assertRaises(EDAError):F.enforce(self.layout(box),'TOP',policy)
    def test_hierarchy_bbox_is_authoritative(self):
        l=self.layout((10000,10000,20000,20000));c=l.create_cell('CHILD');c.shapes(l.layer(68,20)).insert(k.Box(0,0,10000,10000))
        l.cell('TOP').insert(k.CellInstArray(c.cell_index(),k.Trans(1000000,0)))
        with self.assertRaises(EDAError):F.enforce(l,'TOP',F.policy())
    def test_invalid_limits(self):
        for raw in [dict(width_um=True),dict(height_um=float('nan')),dict(width_um=1000,height_um=1000,max_area_um2=999999),dict(width_um=10,edge_um=5),dict(edge_um=.003),dict(typo=1)]:
            with self.subTest(raw=raw),self.assertRaises(EDAError):F.policy(raw)
    def test_empty_layout_retains_constraint(self):
        l=k.Layout();l.dbu=.001;l.create_cell('TOP')
        self.assertTrue(F.enforce(l,'TOP',F.policy())['fits'])

if __name__=='__main__':unittest.main()
