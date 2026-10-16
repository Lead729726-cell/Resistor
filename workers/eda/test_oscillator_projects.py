"""Analytic/invalid-input fixtures are unit tests, never native engine evidence."""
import copy
import json
import math
import unittest

import design_tools as D
import oscillator_projects as O
import native
from geometry import EDAError


class OscillatorQA(unittest.TestCase):
    def triangle(self, times):
        return {'x': times, 'y': [1-abs(2*(t % 1)-1) for t in times]}

    def test_all_four_are_editable_mos_graphs_with_valid_named_hierarchy(self):
        for kind, row in O.CATALOG.items():
            ir = D._schematic(kind, D._parameters(kind, {}))
            self.assertTrue(native.validate(ir)['valid'], kind)
            text = native.emit(ir, kind, row['ports'])
            self.assertIn('sky130_fd_pr__', text)
            self.assertNotIn('PULSE(', text)
            self.assertNotIn('\nB', text)
            self.assertEqual(text, native.emit(json.loads(json.dumps(ir, sort_keys=True)), kind, row['ports']))

    def test_ring_has_exactly_five_inverters_and_five_declared_loads(self):
        ir = O.schematic('osc_ring5', O.CATALOG['osc_ring5']['parameter_defaults'])
        self.assertEqual(sum(d['kind'] in ('nmos', 'pmos') for d in ir['devices']), 10)
        self.assertEqual(sum(d['kind'] == 'capacitor' for d in ir['devices']), 5)

    def test_burst_enable_and_feedback_use_declared_nand_pin_names(self):
        ir = O.schematic('osc_burst', O.CATALOG['osc_burst']['parameter_defaults'])
        gate = next(d for d in ir['devices'] if d['id'] == 'ENABLE_GATE')
        self.assertEqual(gate['pins'], {'A0':'OUT','A1':'EN','Y':'Q0','VPWR':'VPWR','VGND':'VGND'})

    def test_forbidden_or_out_of_range_parameters(self):
        for kind, raw in [('osc_ring5', {'stage_F': True}), ('osc_ring5', {'stage_F': float('nan')}),
                          ('osc_ring5', {'stage_F': 0}), ('osc_ring5', {'target_Hz': 1e6}),
                          ('osc_beat', {'detune_ratio': 0}), ('osc_beat', {'detune_ratio': .5}),
                          ('osc_rc_sensor', {'timing_Ohm': 1}), ('osc_rc_sensor', {'sense_F': 1})]:
            with self.assertRaises(EDAError, msg=(kind, raw)):
                D._parameters(kind, raw)

    def test_recommended_extreme_settings_stay_inside_engine_limits(self):
        for r in (10000, 1e6):
            for c in (1e-12, 100e-12):
                native.testbench(O.settings('osc_rc_sensor', {'timing_Ohm': r, 'sense_F': c}))
        for kind in ('osc_ring5', 'osc_beat', 'osc_burst'):
            for c in (50e-15, 10e-12):
                native.testbench(O.settings(kind, {**O.CATALOG[kind]['parameter_defaults'], 'stage_F': c}))

    def test_known_schmitt_equation_and_si_conversion(self):
        # VDD=3V, thresholds 1/2V -> T=2RC ln(2), using SI.
        expected = 2 * .001 * math.log(2)
        self.assertAlmostEqual(O.rc_period(1e3, 1e-6, 1, 2, 0, 3), expected)
        self.assertAlmostEqual(O.rc_period(10 * 1000, 100 * 1e-9, 1, 2, 0, 3), expected)
        self.assertAlmostEqual(O.rc_period(2e3, 1e-6, 1, 2, 0, 3), 2*expected)

    def test_impossible_thresholds_and_units_fail(self):
        for args in [(0, 1e-9, .5, 1, 0, 1.8), (1e3, -1, .5, 1, 0, 1.8),
                     (1e3, 1e-9, 1, .5, 0, 1.8), (1e3, 1e-9, 0, 1, 0, 1.8),
                     (1e3, 1e-9, .5, 1.8, 0, 1.8)]:
            with self.assertRaises(EDAError):
                O.rc_period(*args)

    def test_exact_frequency_and_duty_do_not_depend_on_sample_density(self):
        uniform = [i/20 for i in range(201)]
        irregular = sorted(set(uniform + [i/100 for i in range(101)]))
        for ts in (uniform, irregular):
            m = O.cycle_metrics(self.triangle(ts), .5, .4, 9.8)
            self.assertTrue(m['available'])
            self.assertAlmostEqual(m['frequency_Hz'], 1)
            self.assertAlmostEqual(m['duty'], .5)

    def test_non_half_threshold_and_window_boundaries(self):
        wave = self.triangle([i/20 for i in range(201)])
        m = O.cycle_metrics(wave, .25, .3, 9.8)
        self.assertAlmostEqual(m['duty'], .75)
        self.assertEqual(O.crossings(wave, .5, .4, 2), [1.25])

    def test_hysteretic_measurement_rejects_carrier_recrossings(self):
        ts=[i/1000 for i in range(10001)]
        wave={'x':ts,'y':[1-abs(2*(t%1)-1)+.08*math.sin(60*math.pi*t) for t in ts]}
        direct=O.cycle_metrics(wave,.5,.4,9.8)
        qualified=O.cycle_metrics(wave,.5,.4,9.8,.2)
        self.assertGreater(direct['frequency_Hz'],1.5)
        self.assertAlmostEqual(qualified['frequency_Hz'],1,places=5)
        self.assertEqual(qualified['crossing_hysteresis_half_width_V'],.2)

    def test_constant_short_and_undersampled_waveforms_are_unavailable(self):
        for w in ({'x': [0, 1, 2, 3], 'y': [1]*4}, self.triangle([i/20 for i in range(21)]),
                  self.triangle([i/2 for i in range(21)])):
            self.assertFalse(O.cycle_metrics(w, .5, w['x'][0], w['x'][-1])['available'])

    def test_duplicate_unsorted_nan_and_misaligned_waveforms_rejected(self):
        for w in ({'x': [0, 0, 1], 'y': [0, 1, 0]}, {'x': [0, 2, 1], 'y': [0, 1, 0]},
                  {'x': [0, 1], 'y': [0, float('nan')]}, {'x': [0, 1], 'y': [0]}):
            with self.assertRaises(EDAError):
                O.cycle_metrics(w, .5, 0, 1)

    def test_missing_traces_and_truncated_transient_never_pass(self):
        kind = 'osc_ring5'
        p = {'design_template': {'id': kind, 'parameters': copy.deepcopy(O.CATALOG[kind]['parameter_defaults'])}}
        for waveforms in ([], [{'name': 'OUT', 'x': [0, 1e-6], 'y': [0, 1.8]}]):
            run = {'waveforms': waveforms}
            report = O.measurements(p, run, dict(supply_V=1.8, duration_s=8e-6))
            self.assertFalse(report['pass'])
            self.assertIsNone(run['measurements'].get('output_frequency_Hz'))


if __name__ == '__main__':
    unittest.main()
