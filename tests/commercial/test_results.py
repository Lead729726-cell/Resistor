"""Synthetic grammar/security tests ONLY. No commercial license/tool proof."""
import copy
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'workers' / 'eda'))
import commercial_results as adapter

FIXTURES = Path(__file__).parent / 'fixtures'
BASE = {'project_id': 'parser-fixture', 'revision': 2, 'run_id': 'fixture-run', 'tool_id': 'spectre',
        'backend_profile_id': 'fixture-only', 'analysis': 'tran', 'layout_sha256': 'a' * 64}


def schema(fmt):
    columns = {'psf-ascii': ['time', 'OUT', 'VSENSE:p'], 'csv': ['time_s', 'out_V', 'branch_A'], 'table': [0, 1, 3]}[fmt]
    return {'x': {'column': columns[0], 'unit': 's'}, 'signals': [{'column': columns[1], 'name': 'OUT', 'unit': 'V'}],
            'branches': [{'column': columns[2], 'id': 'sense', 'name': 'VSENSE', 'unit': 'A', 'from_net': 'IN', 'to_net': 'OUT', 'source_vector': 'i(VSENSE)'}]}


def exchange(operation='simulation'):
    return {'schema_version': 1, 'format': 'register-commercial-results', 'operation': operation,
            'completion': {'finished': True, 'status': 'success'},
            'current_flow': {'schema_version': 1, 'source': 'spectre', 'analysis': 'tran', 'convention': 'conventional',
                             'x': [0, 1e-9], 'x_unit': 's', 'branches': [{'id': 'sense', 'name': 'VSENSE', 'unit': 'A', 'from_net': 'IN', 'to_net': 'OUT', 'source_vector': 'i(VSENSE)', 'values_A': [1e-6, -2e-6]}]}}


class ResultsTests(unittest.TestCase):
    def parse(self, name, fmt, role='waves', operation='simulation', **extra):
        return adapter.parse_results(operation, FIXTURES, {role: name}, {**BASE, 'formats': {role: fmt}, 'column_schema': schema(fmt) if fmt in ('psf-ascii', 'csv', 'table') else {}, **extra})

    def from_text(self, text, fmt='register-exchange-v1', role='exchange', operation='simulation', **extra):
        with tempfile.TemporaryDirectory() as folder:
            Path(folder, 'result').write_text(text, encoding='utf-8')
            return adapter.parse_results(operation, folder, {role: 'result'}, {**BASE, 'formats': {role: fmt}, **extra})

    def test_real_scalar_grammars_preserve_signed_current_and_binding(self):
        for name, fmt in [('scalar.psfascii', 'psf-ascii'), ('grouped.psfascii', 'psf-ascii'), ('mapped.csv', 'csv'), ('mapped.table', 'table')]:
            with self.subTest(name=name):
                r = self.parse(name, fmt)
                self.assertEqual(r['analysis_result'], 'pass', r)
                self.assertEqual(r['waveforms'][0]['y'], [1, .5])
                f = r['current_flow']; self.assertEqual(f['x'], [0, 1e-9]); self.assertEqual(f['source'], 'spectre')
                self.assertEqual(f['branches'][0]['values_A'], [1e-6, -2e-6])
                self.assertEqual(f['branches'][0]['mapping'], 'unmapped'); self.assertNotIn('path_dbu', f['branches'][0])
                self.assertEqual(f['revision'], 2); self.assertEqual(f['backend_profile_id'], 'fixture-only')
                self.assertEqual(f['geometry_linkage'], 'unverified')
                self.assertFalse(r['parser_provenance']['vendor_execution_verified'])
                self.assertEqual(len(r['parser_provenance']['files']['waves']['sha256']), 64)

    def test_column_semantics_are_not_inferred_from_signal_names(self):
        r = self.parse('mapped.csv', 'csv', column_schema={'x': {'column': 'time_s', 'unit': 's'}, 'signals': [{'column': 'branch_A', 'name': 'current-named-but-voltage-schema', 'unit': 'V'}]})
        self.assertEqual(r['analysis_result'], 'pass'); self.assertNotIn('current_flow', r)

    def test_column_schema_is_required(self):
        r = self.parse('mapped.csv', 'csv', column_schema=None)
        self.assertEqual(r['analysis_result'], 'unsupported')

    def test_current_requires_si_A_and_reference_terminals(self):
        for change in ({'unit': 'uA'}, {'from_net': None}, {'source_vector': None}):
            s = schema('csv'); s['branches'][0].update(change)
            self.assertEqual(self.parse('mapped.csv', 'csv', column_schema=s)['analysis_result'], 'unsupported')

    def test_ac_cannot_create_scalar_arrows(self):
        self.assertEqual(self.parse('mapped.csv', 'csv', analysis=' AC ')['analysis_result'], 'unsupported')
        e = exchange(); e['current_flow']['analysis'] = 'ac'
        self.assertEqual(self.from_text(json.dumps(e), analysis='ac')['analysis_result'], 'unsupported')

    def test_malformed_psf_does_not_partially_succeed(self):
        base = (FIXTURES / 'scalar.psfascii').read_text()
        for text in (base.replace('END', ''), base.replace('"VSENSE:p" -0.000002', ''), base.replace('FLOAT DOUBLE', 'COMPLEX DOUBLE'), base + '0', base.replace('"OUT" 0.5', '"OUT" NaN')):
            with self.subTest(text=text[-50:]):
                r = self.from_text(text, 'psf-ascii', 'waves', column_schema=schema('psf-ascii'))
                self.assertNotEqual(r['analysis_result'], 'pass'); self.assertNotIn('current_flow', r)

    def test_duplicate_or_ragged_csv_and_nonfinite_table_reject(self):
        for text in ('a,a\n1,2\n', 'a,b\n1\n', 'a,b\nNaN,2\n', 'a,b\n1,2,3\n'):
            self.assertEqual(self.from_text(text, 'csv', 'waves', column_schema=schema('csv'))['analysis_result'], 'unsupported')
        self.assertEqual(self.from_text('0 Inf', 'table', 'waves', column_schema=schema('table'))['analysis_result'], 'unsupported')

    def test_hspice_explicit_measurements_with_engineering_suffixes(self):
        r = self.parse('measurements.lis', 'hspice-lis', 'summary', measurements={'tdelay': 's', 'average_current': 'A'})
        self.assertEqual(r['analysis_result'], 'pass', r)
        self.assertAlmostEqual(r['measurements']['tdelay'], 1.5e-9)
        self.assertAlmostEqual(r['measurements']['average_current'], -2e-6)
        self.assertNotIn('current_flow', r)

    def test_failed_ambiguous_and_missing_hspice_measurements(self):
        for text, status in [('tdelay = failed\n', 'fail'), ('tdelay = 1n\ntdelay = 2n\n', 'unknown'), ('unknown = 2\n', 'unknown')]:
            self.assertEqual(self.from_text(text, 'hspice-lis', 'summary', measurements={'tdelay': 's'})['analysis_result'], status)

    def test_whole_run_verification_requires_completion(self):
        for file, fmt, op in [('drc-summary.txt', 'calibre-drc-summary', 'drc'), ('lvs-summary.txt', 'calibre-lvs-summary', 'lvs')]:
            r = self.parse(file, fmt, 'summary', op); self.assertEqual(r['analysis_result'], 'pass', r)
            text = (FIXTURES / file).read_text().replace(op.upper() + ' RUN COMPLETED', '')
            self.assertEqual(self.from_text(text, fmt, 'summary', op)['analysis_result'], 'unknown')
        self.assertEqual(self.from_text('CORRECT\n', 'calibre-lvs-summary', 'summary', 'lvs')['analysis_result'], 'unknown')

    def test_violations_and_incorrect_verification_fail(self):
        text = (FIXTURES / 'drc-summary.txt').read_text().replace('Generated: 0', 'Generated: 2')
        self.assertEqual(self.from_text(text, 'calibre-drc-summary', 'summary', 'drc')['analysis_result'], 'fail')
        text = (FIXTURES / 'lvs-summary.txt').read_text().replace(': CORRECT', ': INCORRECT')
        self.assertEqual(self.from_text(text, 'calibre-lvs-summary', 'summary', 'lvs')['analysis_result'], 'fail')

    def test_incomplete_license_or_fatal_summary_never_passes(self):
        base = (FIXTURES / 'drc-summary.txt').read_text()
        for failure in ('FATAL ERROR: denied', '**error** denied', 'License checkout failed', 'Unable to checkout a license', 'Results were truncated', 'Partial results'):
            self.assertEqual(self.from_text(base + failure, 'calibre-drc-summary', 'summary', 'drc')['analysis_result'], 'unknown')

    def test_rc_counts_and_explicit_units_are_actual_parsed_rows(self):
        for file, fmt in [('rc.spef', 'spef'), ('rc.dspf', 'dspf'), ('rc.spice', 'spice-rc')]:
            r = self.parse(file, fmt, 'rc', 'pex'); self.assertEqual(r['analysis_result'], 'pass', r)
            self.assertEqual(r['parasitics'], {'resistors': 1, 'capacitors': 2})
            self.assertAlmostEqual(r['measurements']['resistance_sum_ohm'], 100)
            self.assertAlmostEqual(r['measurements']['capacitance_sum_F'], 2e-15)
        r = self.from_text('Rtitle IN OUT 100\nR1 IN OUT 100\nC1 OUT 0 1f\n.end\n', 'spice-rc', 'rc', 'pex')
        self.assertEqual(r['parasitics'], {'resistors': 1, 'capacitors': 1})

    def test_rc_unterminated_models_expressions_include_and_encrypted_reject(self):
        for fmt, text in [('spice-rc', 'Title\nR1 p n {r}\n.end'), ('spice-rc', 'Title\n.include external\nR1 p n 1\n.end'), ('spice-rc', 'Title\nR1 p n 1'), ('dspf', '*|DSPF 1.3\n.protect\n.end'), ('spef', (FIXTURES / 'rc.spef').read_text().replace('*END', '')), ('spef', (FIXTURES / 'rc.spef').read_text().replace('100', '1:2:3'))]:
            self.assertNotEqual(self.from_text(text, fmt, 'rc', 'pex')['analysis_result'], 'pass')

    def test_exchange_binds_actual_run_and_strips_claimed_geometry(self):
        e = exchange(); b = e['current_flow']['branches'][0]
        b.update(mapping='device_terminals', device_id='guessed', path_dbu=[['0', '0'], ['2', '2']], layer_id='1/0')
        r = self.from_text(json.dumps(e)); self.assertEqual(r['analysis_result'], 'pass', r)
        actual = r['current_flow']['branches'][0]; self.assertEqual(actual['mapping'], 'unmapped')
        for key in ('device_id', 'path_dbu', 'layer_id'): self.assertNotIn(key, actual)
        for key, value in [('project_id', 'other'), ('revision', 999), ('source', 'ngspice')]:
            wrong = exchange(); wrong['current_flow'][key] = value
            self.assertEqual(self.from_text(json.dumps(wrong))['analysis_result'], 'unknown')

    def test_exchange_completion_empty_numeric_duplicate_or_counts_conflict(self):
        e = exchange(); del e['completion']; self.assertEqual(self.from_text(json.dumps(e))['analysis_result'], 'unknown')
        e = exchange(); del e['current_flow']; e['measurements'] = {'message': 'success'}
        self.assertEqual(self.from_text(json.dumps(e))['analysis_result'], 'unknown')
        self.assertEqual(self.from_text('{"schema_version":1,"schema_version":1}')['analysis_result'], 'unsupported')
        e = exchange('drc'); del e['current_flow']; e['verification'] = {'completed': True, 'status': 'pass', 'violations': 2}
        self.assertEqual(self.from_text(json.dumps(e), operation='drc')['analysis_result'], 'unknown')

    def test_failed_receipt_cannot_activate_partial_values(self):
        for status in ('failed', 'canceled'):
            r = self.parse('mapped.csv', 'csv', execution_status=status)
            self.assertEqual(r['analysis_result'], 'unknown'); self.assertNotIn('current_flow', r)
        for log in ('FATAL (SPECTRE-1): simulation stopped', '**error** license denied', 'License checkout failed', 'Partial results', '[OVERLONG_NATIVE_LINE_DISCARDED_FOR_REDACTION]', '[NATIVE_LOG_TRUNCATED]'):
            r = self.parse('mapped.csv', 'csv', execution_status='completed', execution_log=log)
            self.assertEqual(r['analysis_result'], 'unknown'); self.assertNotIn('current_flow', r)

    def test_external_library_results_do_not_claim_a_gds_hash(self):
        r = self.parse('mapped.csv', 'csv', geometry_binding=False, input_origin='external_native_database')
        self.assertEqual(r['analysis_result'], 'pass', r)
        self.assertNotIn('layout_sha256', r['current_flow'])
        self.assertEqual(r['current_flow']['input_origin'], 'external-native-database')
        self.assertTrue(any('no verified correspondence' in s for s in r['current_flow']['notes']))
        self.assertEqual(r['current_flow']['branches'][0]['mapping'], 'unmapped')

    def test_sample_matrix_limits_reject_without_partial_flow(self):
        with patch.object(adapter, 'MAX_CURRENT_VALUES', 1):
            r = self.parse('mapped.csv', 'csv')
            self.assertEqual(r['analysis_result'], 'unsupported'); self.assertNotIn('current_flow', r)

    def test_bound_file_and_paths(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); (root / 'binary').write_bytes(b'PSF\x00\x01\xff')
            for path in ('../outside', '/absolute', 'C:/absolute', 'sub/../binary', './binary', 'binary\\other'):
                self.assertNotEqual(adapter.parse_results('simulation', folder, {'waves': path}, {**BASE, 'formats': {'waves': 'psf-ascii'}})['analysis_result'], 'pass')
            self.assertEqual(adapter.parse_results('simulation', folder, {'waves': 'binary'}, {**BASE, 'formats': {'waves': 'psf-ascii'}})['analysis_result'], 'unsupported')
            (root / 'large').write_bytes(b'x' * (adapter.MAX_FILE_BYTES + 1))
            self.assertEqual(adapter.parse_results('simulation', folder, {'waves': 'large'}, {**BASE, 'formats': {'waves': 'table'}})['analysis_result'], 'unsupported')
            try: (root / 'link').symlink_to(root / 'binary')
            except OSError: pass
            else: self.assertEqual(adapter.parse_results('simulation', folder, {'waves': 'link'}, {**BASE, 'formats': {'waves': 'table'}})['analysis_result'], 'unsupported')

    def test_unknown_vendor_database_and_role_do_not_become_success(self):
        self.assertEqual(self.parse('scalar.psfascii', 'psfxl')['analysis_result'], 'unsupported')
        self.assertEqual(adapter.parse_results('simulation', FIXTURES, {'vendor_database': 'scalar.psfascii'}, BASE)['analysis_result'], 'unsupported')


if __name__ == '__main__':
    unittest.main(verbosity=2)
