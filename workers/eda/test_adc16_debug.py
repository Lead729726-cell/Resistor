"""Negative controls for native evidence completeness and mixed-signal binding."""
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import adc16 as A
import adc16_digital as D
import adc16_sim as S
from geometry import EDAError


class Adc16DebugTests(unittest.TestCase):
    def project(self, kind):
        ir = A.schematic(kind)
        return dict(cell=kind, ports=ir['ports'][:], schematic=ir,
                    design_template=dict(id=kind, parameters={}),
                    testbench=A.recommended_settings(kind, A.CATALOG[kind]['parameter_defaults']))

    def test_full_adc_missing_child_never_uses_original_substitute(self):
        p = self.project('sar_adc16')
        del p['schematic']['cells'][next(iter(p['schematic']['cells']))]
        with patch.object(S, 'sar', return_value=None), self.assertRaises(EDAError):
            S.execute(None, {}, p, '.', {}, {})

    def test_edited_child_port_order_never_uses_original_rtl(self):
        p = self.project('sdm16_filter')
        cell = next(c for c in p['schematic']['cells'].values() if len(c['ports']) > 1)
        cell['ports'] = list(reversed(cell['ports']))
        with patch.object(D, 'filter_replay', return_value=[]), self.assertRaises(EDAError):
            S.digital_block(None, {}, p, None, {})

    def test_digital_post_layout_cannot_bypass_extraction(self):
        p = self.project('sdm16_filter')
        with patch.object(S, 'digital_block', return_value=None), self.assertRaises(EDAError):
            S.execute(None, {}, p, '.', {}, dict(post_layout=True))

    def test_native_trace_requires_zero_origin_and_full_stop(self):
        with tempfile.TemporaryDirectory() as f:
            folder = Path(f)
            for text in ('time v\n.5 0\n1 1\n', '', 'time v\n-1 0\n1 1\n'):
                with self.subTest(text=text):
                    (folder / 'waveform.dat').write_text(text)
                    with self.assertRaises(EDAError):
                        S.actual_rows(folder, 2, 1)

    def test_pipeline_identically_truncated_replays_are_not_success(self):
        with tempfile.TemporaryDirectory() as f:
            with patch.object(D, 'replay', return_value=['0 0 0 0']), self.assertRaises(EDAError):
                D.pipeline_replay(None, {}, Path(f), {}, [[1]*14]*30, [3]*30, [1]*30)

    def test_replay_rejects_duplicate_timestamps_unknowns_and_overflow(self):
        for result in (['1 0 0'], ['0 65536 0'], ['0 0 2'], ['0 x 0'], ['0 0 0', '0 0 0']):
            with self.subTest(result=result), self.assertRaises(EDAError):
                D.replay_rows(result,len(result),3)

    def test_pipeline_checks_consumed_even_phase_and_startup_history(self):
        levels=[[0]*15 for _ in range(40)]
        # Output 29 consumes stage 0 at half-cycle 15 and stage 1 at 16.
        levels[16][1]=1
        self.assertEqual(S.pipeline_ambiguity(levels,[29]),1)
        levels[16][1]=0;levels[15][0]=2
        self.assertEqual(S.pipeline_ambiguity(levels,[29]),2)
        levels[15][0]=0;levels[28][0]=2  # Not consumed by this output.
        self.assertEqual(S.pipeline_ambiguity(levels,[29]),0)

    def test_binding_accepts_visual_only_changes(self):
        ir=A.schematic('sar_adc16');original=A.schematic('sar_adc16')
        ir['devices'][0]['x']=123.0;ir['devices'][0]['id']='new-visual-id'
        self.assertTrue(S.matches_binding(ir,original))

    def test_analog_only_fixture_reports_only_ngspice(self):
        p=self.project('sar16_unit_cap');run={'artifacts':{}}
        with tempfile.TemporaryDirectory() as f:
            S.finish(run,p,Path(f),dict(checks=[S.check('native cap',True)],scope='fixture'),{},tool='ngspice')
        self.assertEqual(run['tool'],'ngspice')


if __name__ == '__main__':
    unittest.main()
