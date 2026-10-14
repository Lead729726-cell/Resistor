"""Real KLayout geometry and persistent worker API tests in an isolated workspace."""
import copy
import json
import os
from pathlib import Path
import sys
import unittest
import uuid
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'workers/eda'))
import klayout.db as k
import server as S
import layout_review as R

class IndustryReviewTests(unittest.TestCase):
    def setUp(self):
        p = S.create({'example': 'layout', 'name': 'Public mask intent QA'})
        for bounds in [['-2000', '0', '-1000', '1000'], ['1000', '0', '2000', '1000']]:
            p = S.edit(p['id'], {'type': 'add_box', 'layer_id': '68/20', 'box': bounds}, 'layout')
        self.source = p
        self.source_hash = R.snapshot(p)['layout_sha256']
        self.review = S.rpc('review.create', {'project_id': p['id'], 'expected_revision': p['revision'], 'command_id': uuid.uuid4().hex})
        self.p = self.review['working_project']
        self.ids = [s['id'] for s in R.snapshot(self.p)['shapes']]

    def call(self, method, **args):
        result = S.rpc(method, {'project_id': self.p['id'], 'review_id': self.review['id'],
            'expected_revision': self.p['revision'], 'expected_review_revision': self.review['review_revision'], 'command_id': uuid.uuid4().hex, **args})
        if 'review_revision' in result and 'constraints' in result: self.review = result
        return result

    def add(self, kind, criteria=None, targets=None, priority='must'):
        return self.call('review.add_constraint', constraint={'kind': kind, 'title': 'Intent '+kind, 'reason': 'Designer explicit test criterion',
            'priority': priority, 'author': 'Public QA', 'target_ids': self.ids if targets is None else targets, 'criteria': criteria})

    def move(self, ident, dx):
        self.p = S.rpc('layout.apply_command', {'project_id': self.p['id'], 'expected_revision': self.p['revision'], 'command_id': uuid.uuid4().hex,
            'command': {'type': 'move_shape', 'id': ident, 'dx': dx, 'dy': '0'}})

    def test_source_preserved_and_edition_identity(self):
        self.assertNotEqual(self.p['id'], self.source['id'])
        self.move(self.ids[0], '500')
        self.assertEqual(S.get_project(self.source['id'])['revision'], self.source['revision'])
        self.assertEqual(R.snapshot(S.get_project(self.source['id']))['layout_sha256'], self.source_hash)
        self.assertEqual(self.p['edition'], 'indust')
        self.assertEqual(self.p['engine']['version'], k.__version__)

    def test_exact_symmetry_pass_then_fail_and_undo(self):
        self.add('symmetry', {'axis': 'x', 'axis_twice_dbu': '0'})
        self.assertEqual(self.call('review.evaluate')['latest']['results'][0]['status'], 'pass')
        self.move(self.ids[0], '5')
        self.assertEqual(self.call('review.status')['latest']['freshness'], 'stale')
        after = self.call('review.evaluate')['latest']
        self.assertEqual(after['results'][0]['status'], 'fail')
        self.assertTrue(after['results'][0]['affected_by_change'])
        self.assertFalse(after['comparison']['geometry_equal'])
        self.p = S.edit(self.p['id'], {'type': 'undo'}, 'layout')
        self.assertEqual(self.call('review.evaluate')['latest']['results'][0]['status'], 'pass')

    def test_spacing_exact_threshold_and_violation(self):
        self.add('spacing', {'minimum_dbu': '2000'})
        result = self.call('review.evaluate')['latest']['results'][0]
        self.assertEqual(result['status'], 'pass')
        self.assertEqual(result['metrics']['distance_squared_dbu2'], '4000000')
        self.move(self.ids[1], '-5')
        self.assertEqual(self.call('review.evaluate')['latest']['results'][0]['status'], 'fail')

    def test_fixed_region_detects_new_shape_not_only_old_targets(self):
        self.add('fixed_region', {'box': ['-2500', '-500', '2500', '1500'], 'layers': ['68/20']}, [])
        self.assertEqual(self.call('review.evaluate')['latest']['results'][0]['status'], 'pass')
        self.p = S.edit(self.p['id'], {'type': 'add_box', 'layer_id': '68/20', 'box': ['-500', '0', '500', '500']}, 'layout')
        self.assertEqual(self.call('review.evaluate')['latest']['results'][0]['status'], 'fail')

    def test_missing_criteria_and_electrical_data_never_pass(self):
        self.add('symmetry')
        self.add('matching', {'description': 'Need delta Vth < specified designer budget'}, priority='should')
        self.assertEqual([r['status'] for r in self.call('review.evaluate')['latest']['results']], ['not_run', 'not_run'])

    def test_deleted_target_unresolved_not_nearest(self):
        self.add('spacing', {'minimum_dbu': '2000'})
        self.p = S.edit(self.p['id'], {'type': 'delete_shape', 'id': self.ids[0]}, 'layout')
        result = self.call('review.evaluate')['latest']['results'][0]
        self.assertEqual(result['status'], 'not_run')
        self.assertEqual(result['mapping'][0]['status'], 'unresolved')

    def test_regenerated_ids_only_exact_unique_mapping(self):
        snap = R.snapshot(self.p)
        changed = copy.deepcopy(snap); changed['shapes'][0]['id'] = 'new/id'
        self.assertEqual(R.resolve(snap['shapes'][0], changed)['status'], 'unique_exact_geometry')
        changed['shapes'].append(copy.deepcopy(changed['shapes'][0]))
        self.assertEqual(R.resolve(snap['shapes'][0], changed)['status'], 'ambiguous')
        changed['shapes'][0]['hull'] = [[0,0],[1,0],[1,1]]; changed['shapes'][0]['signature'] = R.digest(changed['shapes'][0]['hull'])
        changed['shapes'].pop()
        self.assertEqual(R.resolve(snap['shapes'][0], changed)['status'], 'unresolved')

    def test_duplicate_origin_does_not_collapse_onto_unique_replacement(self):
        snap = R.snapshot(self.p); anchor = copy.deepcopy(snap['shapes'][0]); anchor['signature_occurrences'] = 2
        snap['shapes'][0]['id'] = 'replacement'
        self.assertEqual(R.resolve(anchor, snap)['status'], 'ambiguous')

    def test_byte_change_not_mask_mismatch(self):
        self.p = S.edit(self.p['id'], {'type': 'add_label', 'layer_id': '68/20', 'text': 'PUBLIC_NOTE', 'position': ['0','0']}, 'layout')
        change = self.call('review.evaluate')['latest']['comparison']
        self.assertTrue(change['geometry_equal']); self.assertFalse(change['file_bytes_equal']); self.assertFalse(change['annotations_equal'])

    def test_gds_oasis_roundtrip_hierarchy_arrays_magnification_and_dbu(self):
        layout = k.Layout(); layout.dbu = .0025
        top = layout.create_cell('TOP'); child = layout.create_cell('UNIT')
        child.shapes(layout.layer(87,31)).insert(k.Box(-10,-20,20,30))
        top.insert(k.CellInstArray(child.cell_index(), k.ICplxTrans(2,90,True,200,300), k.Vector(150,20), k.Vector(10,170), 2,3))
        top.insert(k.CellInstArray(child.cell_index(), k.ICplxTrans(1.5,37.25,False,1000,2000)))
        S.geo.assign_ids(layout)
        before_geometry = S.geo.semantic_hash(layout,top); before_hierarchy = S.geo.hierarchy_hash(layout)
        for fmt in ('gds','oas'):
            path = S.STATE/('precision-'+uuid.uuid4().hex+'.'+fmt); layout.write(str(path))
            actual = k.Layout(); actual.read(str(path))
            self.assertEqual(actual.dbu, .0025)
            self.assertEqual(S.geo.semantic_hash(actual, actual.cell('TOP')), before_geometry)
            self.assertEqual(S.geo.hierarchy_hash(actual), before_hierarchy)
            self.assertEqual(actual.get_info(next(iter(actual.layer_indices()))).datatype, 31)
            scene=S.geo.scene(actual,{'id':'public-precision','revision':1,'cell':'TOP','grid_dbu':1,'source':'fixture','schematic':{'devices':[]}},[])
            array_instance=next(v for v in scene['instances'] if 'array' in v)
            single_instance=next(v for v in scene['instances'] if 'array' not in v)
            self.assertEqual(array_instance['magnification'],2)
            self.assertEqual(array_instance['rotation'],90)
            self.assertTrue(array_instance['mirror'])
            self.assertEqual(array_instance['array']['vector_a'],['150','20'])
            self.assertEqual(array_instance['array']['vector_b'],['10','170'])
            self.assertAlmostEqual(single_instance['rotation'],37.25,places=10)
            self.assertEqual(single_instance['magnification'],1.5)

    def test_reports_reopen_checksum_historical_freshness_and_errors(self):
        self.add('spacing', {'minimum_dbu': '2000'})
        self.call('review.evaluate')
        saved = self.call('review.save_report', decision='accepted_for_review_scope', reason='Exact requested geometry only', author='QA reviewer')
        opened = self.call('review.open_report', report_id=saved['report']['id'])
        self.assertEqual(saved['report'], opened['report']); self.assertEqual(saved['sha256'], opened['sha256']); self.assertFalse(opened['report']['signoff'])
        self.move(self.ids[0], '5')
        self.assertEqual(self.call('review.open_report', report_id=saved['report']['id'])['freshness'], 'stale')
        Path(saved['path']).write_text('{"broken":true}', encoding='utf-8')
        with self.assertRaises(S.EDAError) as error: self.call('review.open_report', report_id=saved['report']['id'])
        self.assertEqual(error.exception.code, 'EVIDENCE_MISSING')

    def test_stale_result_and_mandatory_unassessed_cannot_be_accepted(self):
        self.add('matching', {'description':'Electrical model needed'})
        self.call('review.evaluate')
        with self.assertRaises(S.EDAError) as error:
            self.call('review.save_report', decision='accepted_for_review_scope', reason='No assumption', author='QA')
        self.assertEqual(error.exception.code,'UNRESOLVED_REQUIREMENT')
        self.move(self.ids[0], '5')
        with self.assertRaises(S.EDAError) as error:
            self.call('review.save_report', decision='deferred', reason='Recheck required', author='QA')
        self.assertEqual(error.exception.code,'STALE_REVIEW')

    def test_revision_conflicts_project_mismatch_idempotency(self):
        args = {'project_id': self.p['id'], 'review_id':self.review['id'], 'expected_revision':self.p['revision'],
            'expected_review_revision': self.review['review_revision'], 'command_id':uuid.uuid4().hex,
            'constraint':{'kind':'note','title':'Review note','reason':'User intent','author':'QA','target_ids':[], 'priority':'note'}}
        one = S.rpc('review.add_constraint',args); two = S.rpc('review.add_constraint',args)
        self.assertEqual(one,two)
        with self.assertRaises(S.EDAError): S.rpc('review.add_constraint',{**args,'command_id':uuid.uuid4().hex})
        with self.assertRaises(S.EDAError): S.rpc('review.add_constraint',{**args,'constraint':{**args['constraint'],'title':'different'}})
        with self.assertRaises(S.EDAError): self.call('review.status', project_id=self.source['id'])
        with self.assertRaises(S.EDAError): self.call('review.evaluate', expected_revision=1)

    def test_spacing_holes_diagonal_distance_and_touching(self):
        a={'hull':[[0,0],[100,0],[100,100],[0,100]],'holes':[[[20,20],[80,20],[80,80],[20,80]]]}
        b={'hull':[[40,40],[60,40],[60,60],[40,60]],'holes':[]}
        self.assertEqual(R.distance_squared(a,b),400)
        b={'hull':[[100,100],[110,100],[110,110],[100,110]],'holes':[]}
        self.assertEqual(R.distance_squared(a,b),0)
        b={'hull':[[103,104],[110,104],[110,110],[103,110]],'holes':[]}
        self.assertEqual(R.distance_squared({**a,'holes':[]},b),25)

    def test_relative_order_and_unit_conversion(self):
        self.add('relative_position', {'direction':'left'})
        self.add('spacing', {'minimum_dbu':'2000'})
        result=self.call('review.evaluate')['latest']['results']
        self.assertEqual(result[0]['status'],'pass')
        self.assertEqual(result[1]['metrics']['distance_um_approx'],2.0)

    def test_invalid_input_and_limit_fail_closed(self):
        for criteria in [{'minimum_dbu':'-1'}, {'minimum_dbu':True}, {'minimum_dbu':'2.5'}, {'minimum_dbu':'2147483648'}]:
            with self.assertRaises(S.EDAError): self.add('spacing', criteria)
        before=R.MAX_SHAPES; R.MAX_SHAPES=1
        try:
            with self.assertRaises(S.EDAError) as error: self.call('review.evaluate')
            self.assertEqual(error.exception.code,'REVIEW_LIMIT')
        finally: R.MAX_SHAPES=before

    def test_constraint_edit_remove_preserves_history_and_stales_report(self):
        self.add('spacing', {'minimum_dbu':'2000'})
        constraint_id=self.review['constraints'][0]['id']
        self.call('review.evaluate')
        changed=self.call('review.update_constraint',constraint_id=constraint_id,constraint={'kind':'spacing','title':'Revised gap','reason':'New explicit criterion','author':'Designer','priority':'must','target_ids':self.ids,'criteria':{'minimum_dbu':'2005'}})
        self.assertIsNone(changed['latest']);self.assertEqual(changed['constraints'][0]['id'],constraint_id)
        self.assertEqual(changed['constraint_history'][0]['previous']['criteria']['minimum_dbu'],'2000')
        self.assertEqual(self.call('review.evaluate')['latest']['results'][0]['status'],'fail')
        removed=self.call('review.remove_constraint',constraint_id=constraint_id)
        self.assertEqual(removed['constraints'],[]);self.assertEqual(len(removed['constraint_history']),2)

if __name__ == '__main__':
    suite=unittest.defaultTestLoader.loadTestsFromTestCase(IndustryReviewTests)
    result=unittest.TextTestRunner(verbosity=2).run(suite)
    S.POOL.shutdown(wait=True); S.DB.close()
    sys.exit(0 if result.wasSuccessful() else 1)
