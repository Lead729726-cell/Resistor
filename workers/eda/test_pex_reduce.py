import unittest
from pex_reduce import reduce_text,number
from geometry import EDAError
class ExactReductionQA(unittest.TestCase):
    def test_analytical_chain_and_units(self):
        text='.subckt DUT A B\nR1 A n 1k\nR2 n B 2k\n.ends DUT\n'
        out,r=reduce_text(text);self.assertIn(' a b 3000',out);self.assertEqual(r['resistors_after'],1);self.assertFalse(r['approximation']);self.assertEqual(number('3.2m'),.0032)
    def test_capacitance_and_observed_node_stop_elimination(self):
        text='.subckt DUT A B\nR1 A n 100\nR2 n B 200\nC1 n 0 1p\n.ends DUT\n'
        out,r=reduce_text(text);self.assertIn('C1 n 0 1p',out);self.assertEqual(r['resistors_after'],2)
        out,r=reduce_text(text.replace('C1 n 0 1p\n',''),['N']);self.assertEqual(r['resistors_after'],2)
    def test_parallel_paths_and_device_terminals_are_preserved(self):
        text='.subckt DUT A B\nR1 A n 10\nR2 n B 20\nR3 A m 30\nR4 m B 40\nX1 A G B B model w=1 l=.15\n.ends DUT\n'
        out,r=reduce_text(text);self.assertEqual(r['resistors_after'],1);self.assertIn('X1 A G B B model w=1 l=.15',out)
        # Original 30 || 70 equals the two retained exact branch values.
        values=[float(l.split()[3]) for l in out.splitlines() if l.startswith('rmesh')];self.assertAlmostEqual(1/sum(1/v for v in values),21)
    def test_three_terminal_star_delta_known_equations(self):
        text='.subckt D A B C\nR1 A n 10\nR2 B n 20\nR3 C n 30\n.ends D\n'
        out,r=reduce_text(text);self.assertEqual(r['eliminated_unobserved_nodes'],1)
        values={tuple(l.split()[1:3]):float(l.split()[3]) for l in out.splitlines() if l.startswith('rmesh')}
        self.assertAlmostEqual(values[('a','b')],10+20+10*20/30);self.assertAlmostEqual(values[('a','c')],10+30+10*30/20);self.assertAlmostEqual(values[('b','c')],20+30+20*30/10)
    def test_unsupported_resistor_statement_and_zero_stay(self):
        out,r=reduce_text('.subckt D A B\nR1 A n 0\nR2 n B 20\nR3 A B {unknown}\n.ends D\n');self.assertIn('R1 A n 0',out);self.assertIn('R3 A B {unknown}',out);self.assertEqual(r['resistors_after'],1)
    def test_multiple_subcircuits_rejected(self):
        with self.assertRaises(EDAError):reduce_text('.subckt A a b\n.ends A\n.subckt B x y\n.ends B\n')
if __name__=='__main__':unittest.main()
