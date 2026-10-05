"""Parser failure boundaries and real nested/global voltage probe calibration.

Run inside the EDA worker image: python3 workers/eda/test_voltage_probes.py
"""
import copy
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

import current_flow as CF
from geometry import EDAError


class VoltageProbeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.folder = Path(self.tmp.name)
        self.project = {'id': 'p', 'revision': 3, 'source': 'fixture', 'example': 'fixture', 'cell': 'top', 'schematic': {'devices': []}}
        self.branches = [{'id': 'b', 'name': 'R1', 'from_net': 'IN', 'to_net': '0', 'mapping': 'unmapped', 'source_vector': 'i(vsense)'}]

    def tearDown(self):
        self.tmp.cleanup()

    def files(self, current='time current\n0 .001\n1 .002\n', voltage='time in ground\n0 1 0\n1 2 0\n'):
        CF.voltage_probes(self.branches, self.folder)
        (self.folder/'current-flow.dat').write_text(current)
        (self.folder/'node-voltages.dat').write_text(voltage)

    def read(self):
        return CF.read(self.folder, self.project, 'tran', 's', copy.deepcopy(self.branches), None)

    def test_vectors_keep_engine_values_and_ground_is_declared_reference(self):
        self.files()
        result = self.read()
        self.assertEqual(result['node_voltages'][0]['values_V'], [1, 2])
        self.assertEqual(result['node_voltages'][1]['source_vector'], 'defined-ground-reference')
        self.assertEqual(result['node_voltages'][1]['values_V'], [0, 0])
        self.assertEqual(result['branches'][0]['values_A'], [.001, .002])

    def test_axis_mismatch_is_an_error(self):
        self.files(voltage='time in ground\n0 1 0\n1.01 2 0\n')
        with self.assertRaises(EDAError) as error:self.read()
        self.assertEqual(error.exception.code, 'VOLTAGE_AXIS_MISMATCH')

    def test_missing_voltage_data_is_an_error(self):
        self.files(); (self.folder/'node-voltages.dat').unlink()
        with self.assertRaises(EDAError) as error:self.read()
        self.assertEqual(error.exception.code, 'VOLTAGE_PROBE_FAILED')

    def test_short_columns_nonfinite_and_nonnumeric_are_errors(self):
        for text in ['time in ground\n0 1\n1 2\n', 'time in ground\n0 nan 0\n1 2 0\n', 'time in ground\n0 bad 0\n1 2 0\n']:
            with self.subTest(text=text):
                self.files(voltage=text)
                with self.assertRaises(EDAError) as error:self.read()
                self.assertEqual(error.exception.code, 'PARSER_FAILED')

    def test_row_count_mismatch_is_an_error(self):
        self.files(voltage='time in ground\n0 1 0\n')
        with self.assertRaises(EDAError) as error:self.read()
        self.assertEqual(error.exception.code, 'VOLTAGE_AXIS_MISMATCH')

    def test_probe_scope_deduplicates_case_and_records_unsupported_names(self):
        self.branches += [{'from_net': 'in', 'to_net': 'bad/node', '_voltage_nodes': ['GATE', 'IN', '0']}]
        probes = CF.voltage_probes(self.branches, self.folder)
        self.assertEqual([p['net'] for p in probes], ['IN', '0', 'GATE'])
        self.assertEqual(json.loads((self.folder/'voltage-probes.json').read_text())['omitted_nets'], ['bad/node'])

    def test_probe_limit_is_reported_without_fabricating_nodes(self):
        self.branches[0]['_voltage_nodes'] = ['n'+str(i) for i in range(300)]
        self.assertEqual(len(CF.voltage_probes(self.branches, self.folder)), 256)
        self.assertEqual(len(json.loads((self.folder/'voltage-probes.json').read_text())['omitted_nets']), 46)

    def test_legacy_current_only_results_are_still_readable(self):
        self.files(); (self.folder/'voltage-probes.json').unlink()
        self.assertNotIn('node_voltages', self.read())

    def test_real_nested_ports_internal_nodes_and_global_supply(self):
        # 1V / (1k+1k) -> mid=.5V, I=.5mA; global VDD=2V / 2k -> 1mA.
        source = self.folder/'original.spice'
        source.write_text('.global VDD\n.subckt child IN OUT\nR1 IN mid 1000\nR2 mid OUT 1000\nR3 VDD 0 2000\n.ends child\n.subckt top IN OUT\nXnested IN OUT child\n.ends top\n')
        probe, branches, _ = CF.prepare(self.project, source, self.folder)
        lines = ['hierarchy calibration', f'.include "{probe}"', 'VSUP VDD 0 2', 'VIN IN 0 1', 'VOUT OUT 0 0', 'XU IN OUT top']
        CF.add_testbench_voltage_branches(lines, branches)
        probes = CF.voltage_probes(branches, self.folder)
        text = '\n'.join(lines+['.control', 'set wr_singlescale', 'set wr_vecnames', 'op', 'quit', '.endc', '.end'])+'\n'
        deck = self.folder/'testbench.spice';deck.write_text(CF.instrument_control(text, branches, voltage_probes=probes))
        result = subprocess.run(['ngspice', '-b', str(deck)], cwd=self.folder, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=30)
        self.assertEqual(result.returncode, 0, result.stdout)
        flow = CF.read(self.folder, self.project, 'op', 'point', branches, None)
        volts = {n['net'].lower(): n['values_V'][0] for n in flow['node_voltages']}
        self.assertAlmostEqual(volts['xu.xnested.mid'], .5, places=12)
        self.assertAlmostEqual(volts['vdd'], 2, places=12)
        self.assertNotIn('xu.xnested.vdd', volts)
        currents = {b['id']: b['values_A'][0] for b in flow['branches']}
        self.assertAlmostEqual(currents['XU.Xnested/R1'], .0005, places=12)
        self.assertAlmostEqual(currents['XU.Xnested/R3'], .001, places=12)


if __name__ == '__main__':unittest.main()
