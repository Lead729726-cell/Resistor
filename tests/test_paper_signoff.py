"""Fail-closed tests for independent native-result auditing, no EDA stubs."""
import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def module(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / (name + '.py'))
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


C = module('paper-coupling-qa')
P = module('paper-prepare')
S = module('paper-sta')
L = module('paper-digital-lvs')


class CouplingAuditTests(unittest.TestCase):
    cap = '.subckt top IN OUT VSS\nXM IN OUT VSS VSS nmos w=1 l=0.15\nC1 IN OUT 2f\nC2 OUT VSS 3f\n.ends\n'
    rc = '.subckt top IN OUT VSS\nXM IN_1 OUT_1 VSS VSS nmos w=1 l=0.15\nR1 IN IN_1 10\nR2 OUT OUT_1 20\nC1 IN_1 OUT_1 2f\nC2 OUT_1 VSS 3f\n.ends\n'

    def test_equal_distributed_network(self):
        result = C.compare(self.cap, self.rc)
        self.assertTrue(result['matrix_preserved'])
        self.assertEqual(result['matrix_absolute_difference_F'], 0.)
        self.assertEqual(result['native_resistors'], 2)

    def test_grounded_coupling_is_detected(self):
        grounded = self.rc.replace('C1 IN_1 OUT_1 2f', 'C1 IN_1 0 2f\nC3 OUT_1 0 2f')
        self.assertFalse(C.compare(self.cap, grounded)['matrix_preserved'])

    def test_conflicting_short_does_not_guess(self):
        with self.assertRaisesRegex(ValueError, 'conflicting'):
            C.compare(self.cap, self.rc.replace('.ends', 'R3 IN OUT 0.01\n.ends'))

    def test_missing_terminal_mapping_is_not_pass(self):
        result = C.compare(self.cap, self.rc.replace('.ends', 'C3 floating OUT 1f\n.ends'))
        self.assertFalse(result['matrix_preserved'])
        self.assertEqual(len(result['unmapped_caps']), 1)

    def test_wrong_device_or_geometry_rejected(self):
        for rc in [self.rc.replace('w=1 ', 'w=2 '), self.rc.replace('XM ', 'XOTHER '), self.rc.replace('nmos', 'pmos')]:
            with self.subTest(rc=rc), self.assertRaises(ValueError):
                C.compare(self.cap, rc)

    def test_units(self):
        for value, expected in [('1f', 1e-15), ('2.5p', 2.5e-12), ('1e-12', 1e-12), ('3meg', 3e6), ('1m', 1e-3)]:
            self.assertEqual(C.number(value), expected)
        for invalid in ['NaN', 'inf', '-1f', '1ff', '']:
            with self.assertRaises(ValueError):
                C.number(invalid)


class NativeParserTests(unittest.TestCase):
    def test_liberty_subset_preserves_characterization(self):
        text = 'library (p) { time_unit : "1ns"; cell (a) { function : "{x}"; pin(A) { direction : input; } } cell (b) { area:2; } }'
        selected = P.liberty_subset(text, {'a'})
        self.assertIn('cell (a) { function : "{x}"; pin(A) { direction : input; } }', selected)
        self.assertNotIn('cell (b)', selected)
        self.assertIn('time_unit : "1ns"', selected)
        with self.assertRaises(ValueError):
            P.liberty_subset(text, {'missing'})

    def test_native_negative_slack_is_retained(self):
        self.assertEqual(S.slacks('worst slack max 222.65\nworst slack min -0.05'), [222.65, -.05])
        with self.assertRaises(ValueError):
            S.slacks('completed PASS')

    def test_subcell_match_does_not_hide_top_level_failure(self):
        self.assertTrue(L.lvs_matched('Final result: Circuits match uniquely.\n'))
        self.assertTrue(L.lvs_matched('Final result: Circuits match uniquely.\n.\n'))
        self.assertFalse(L.lvs_matched('Circuits match uniquely.\nFinal result: Top level cell failed pin matching.'))
        self.assertFalse(L.lvs_matched('Final result: Circuits match uniquely with property errors.'))
        self.assertFalse(L.lvs_matched('Final result: Circuits match uniquely.\n.\nThe following cells had property errors:\ncell_a'))
        self.assertFalse(L.lvs_matched('LVS Done.'))

    def test_narrow_classification_keeps_width_and_pins(self):
        source = 'X1 D G S B sky130_fd_pr__nfet_01v8 w=360000u l=150000u\nX2 D G S B sky130_fd_pr__nfet_01v8 w=420000u l=150000u\n'
        tech = 'device msubcircuit sky130_fd_pr__special_nfet_01v8 scnfet\nw<0.42 l=l'
        view, changes = L.narrow_device_view(source, tech)
        self.assertIn('X1 D G S B sky130_fd_pr__special_nfet_01v8 w=360000u l=150000u', view)
        self.assertIn('X2 D G S B sky130_fd_pr__nfet_01v8', view)
        self.assertEqual(len(changes), 1)
        with self.assertRaises(ValueError):
            L.narrow_device_view(source, '')


if __name__ == '__main__':
    unittest.main()
