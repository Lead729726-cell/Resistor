import unittest,tempfile
from pathlib import Path
import custom_circuit as C

class CustomCircuitQA(unittest.TestCase):
    def test_distributed_pex_nodes_are_distinct_without_guessed_logical_voltage(self):
        with tempfile.TemporaryDirectory() as folder:
            p=Path(folder)/'pex.spice';p.write_text('.subckt top VDD\nX0 VDD OUT.t0 0 sky130_fd_pr__res_xhigh_po_1p41 l=7\nX1 OUT.t1 0.t0 0.t1 sky130_fd_pr__res_xhigh_po_1p41 l=7\nR0 OUT.t0 OUT.t1 45\n.ends\n')
            nodes=C.extracted_terminal_nodes(p,['VDD']);self.assertEqual(nodes,['0.t0','0.t1','OUT.t0','OUT.t1','VDD']);self.assertNotIn('OUT',nodes)

if __name__=='__main__':unittest.main()
