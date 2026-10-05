import json
from pathlib import Path
import sqlite3
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'workers' / 'eda'))
from project_index import FIELDS, list_projects


class ProjectIndexTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.execute('CREATE TABLE projects(id TEXT PRIMARY KEY, data TEXT NOT NULL)')

    def tearDown(self):
        self.db.close()

    def store(self, value):
        self.db.execute('INSERT INTO projects VALUES(?, ?)', (value['id'], json.dumps(value)))

    def test_legacy_full_response_retains_exact_hierarchy_units_and_runs(self):
        value = dict(id='a', name='계층 Ω', cell='TOP', pdk_id='sky130A', revision=7, source='pdk',
                     schematic={'cells': {'child': {'node': 'Y', 'w_um': 0.42}}},
                     box_dbu=['9007199254740993', '0', '9007199254740998', '5'],
                     runs=[{'analysis_result': 'pass', 'current_A': -0.00001234}])
        self.store(value)
        self.assertEqual(list_projects(self.db), [value])
        self.assertEqual(list_projects(self.db, False), [value])

    def test_metadata_matches_card_values_and_excludes_large_design_data(self):
        value = dict(id='a', name='CPU Ω', cell='CPU4', pdk_id='sky130A', revision=9, source='pdk',
                     schematic={'devices': [{'id': f'M{i}', 'w_um': 0.42} for i in range(10000)]}, runs=[])
        self.store(value)
        actual = list_projects(self.db, True)
        self.assertEqual(actual, [{key: value[key] for key in FIELDS}])
        self.assertLess(len(json.dumps(actual)), 512)
        self.assertEqual(len(list_projects(self.db)[0]['schematic']['devices']), 10000)

    def test_order_and_pvt_filter_match_existing_project_list(self):
        for index, flag in enumerate([None, False, 0, '', {}, [], True, 'point-id', {'study_id': 's'}]):
            self.store(dict(id=str(index), name=str(index), pvt_point=flag))
        full = list_projects(self.db)
        metadata = list_projects(self.db, True)
        self.assertEqual([p['id'] for p in metadata], [p['id'] for p in full])
        self.assertEqual([p['id'] for p in metadata], ['5', '4', '3', '2', '1', '0'])


if __name__ == '__main__':
    unittest.main()
