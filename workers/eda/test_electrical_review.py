"""Boundaries/coverage tests use explicit stubs, separate from actual native QA."""
import copy
import unittest
from unittest.mock import patch
import electrical_review as E
from geometry import EDAError

class ElectricalReviewTests(unittest.TestCase):
    def setUp(self):
        self.criteria = dict(assessment=E.ASSESSMENT, run_ids=['a'*32, 'b'*32], offset_limit_V=.01,
            minimum_samples=32, seed=729726, conditions=[dict(corner='tt',temperature_C=27,supply_V=1.8)], require_pre_and_post=True)
        self.p = dict(id='p',revision=1,design_template=dict(id='soc_miller_ota'))
        self.constraint = dict(criteria=self.criteria,targets=[])
        self.rows = [dict(run_id=r,post_layout=post,settings=self.criteria['conditions'][0],seed=729726,
            metrics=dict(samples=32,offset_abs_max_V=.007)) for r,post in zip(self.criteria['run_ids'],[False,True])]
    def test_strict_criteria_units_and_bounds(self):
        E.validate(self.criteria)
        for key,value in [('run_ids',[{}]),('run_ids',['a'*32]*2),('offset_limit_V',float('nan')),('offset_limit_V',.7),
                ('minimum_samples',True),('minimum_samples',65),('seed',0),('require_pre_and_post',1),
                ('conditions',[dict(corner='tt',temperature_C=126,supply_V=1.8)]),('conditions',self.criteria['conditions']*2)]:
            with self.subTest(key=key,value=value),self.assertRaises(EDAError):E.validate({**self.criteria,key:value})
        E.validate({'description':'Record only; no automatic PASS'})
    def evaluate(self, rows=None, criteria=None):
        with patch.object(E,'evidence',side_effect=rows or self.rows):
            return E.evaluate(object(),self.p,{**self.constraint,'criteria':criteria or self.criteria})
    def test_pass_fail_voltage_is_in_volts(self):
        result=self.evaluate();self.assertEqual(result['status'],'pass');self.assertEqual(result['electrical_assessment'],'evaluated')
        self.assertEqual(result['metrics']['offset_abs_max_V'],.007)
        self.assertFalse(result['metrics']['yield_verified']);self.assertFalse(result['metrics']['device_pair_matching_verified'])
        self.assertEqual(self.evaluate(criteria={**self.criteria,'offset_limit_V':.001})['status'],'fail')
    def test_incomplete_pvt_sample_seed_and_post_never_pass(self):
        for key,value in [('post_layout',False),('seed',1),('settings',dict(corner='ss',temperature_C=27,supply_V=1.8)),('metrics',dict(samples=16,offset_abs_max_V=0))]:
            rows=copy.deepcopy(self.rows);rows[1][key]=value
            with self.subTest(key=key):self.assertEqual(self.evaluate(rows)['status'],'not_run')
    def test_stale_and_corrupt_have_distinct_states(self):
        for code,state in [('EVIDENCE_STALE','not_run'),('EVIDENCE_UNAVAILABLE','not_run'),('EVIDENCE_CORRUPT','error')]:
            with patch.object(E,'evidence',side_effect=EDAError(code,'explicit test failure')):
                self.assertEqual(E.evaluate(object(),self.p,self.constraint)['status'],state)
    def test_masks_and_other_circuits_cannot_claim_pair_matching(self):
        self.assertEqual(E.evaluate(object(),self.p,{**self.constraint,'targets':[{'id':'mask'}]})['status'],'not_run')
        self.assertEqual(E.evaluate(object(),dict(id='other'),self.constraint)['status'],'not_run')
        self.assertEqual(E.evaluate(object(),self.p,dict(criteria={'description':'Match device Vth'},targets=[]))['status'],'not_run')

if __name__=='__main__':unittest.main()
