"""Predeclared public-fixture comparison against direct KLayout Python extension.

This measures automated correctness and script runtime, not designer time/value.
The baseline includes scripting support; it is not a comparison of default GUIs.
"""
import copy
import hashlib
import json
from pathlib import Path
import statistics
import sys
import time
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'workers/eda'))
import klayout.db as k
import server as S
import layout_review as R

plan = {
    'schema_version':1, 'edition':'indust', 'task':'Two selected mask polygons: symmetry / gap / protected-region review',
    'baseline':'KLayout 0.30.5 direct Python extension (Region XOR / separation_check / clipped XOR)',
    'same_conditions':'Identical public GDS, DBU=0.001 um, same explicit thresholds and original/candidate masks; no PDK performance assertion',
    'sample_count':14, 'repetitions':5, 'success_criteria':{'verdict_agreement':14,'false_pass':0,'false_fail':0,'unassessed_without_criteria':True},
    'metrics':['exact verdict accuracy','false pass/fail count','automatic evaluator wall time median','fixture geometry/hierarchy compatibility'],
    'human_setup_time':'not_measured','human_review_time':'not_measured','customer_value':'not_measured','commercial_baseline':'unavailable',
    'claim_policy':'No improvement percentage or superiority from this microbenchmark.'
}
out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
(out/'comparison-plan.json').write_text(json.dumps(plan,indent=2)+'\n',encoding='utf-8')
plan_sha=hashlib.sha256((out/'comparison-plan.json').read_bytes()).hexdigest()

def make(dx=0, extra=False):
    p=S.create({'example':'layout','name':'Public comparison mask'})
    l=k.Layout();l.dbu=.001;t=l.create_cell('layout')
    t.shapes(l.layer(68,20)).insert(k.Box(-2000,0,-1000,1000))
    t.shapes(l.layer(68,20)).insert(k.Box(1000+dx,0,2000+dx,1000))
    if extra:t.shapes(l.layer(68,20)).insert(k.Box(-500,0,500,500))
    p.update(revision=2,next_revision=3)
    return S.commit(p,l,parent=1)

base_p=make();base=R.snapshot(base_p)
gds=S.STATE/'public-review-baseline.gds';S.load_layout(base_p).write(str(gds))
cases=[]
for dx in [0,5,-5]:cases.append(('symmetry',dx,False,{'axis':'x','axis_twice_dbu':'0'},dx==0))
for minimum in [0,1995,2000,2005,2500]:cases.append(('spacing',0,False,{'minimum_dbu':str(minimum)},minimum<=2000))
for dx in [5,-5,1000]:cases.append(('spacing',dx,False,{'minimum_dbu':'2000'},dx>=0))
for dx,extra in [(0,False),(5,False),(0,True)]:cases.append(('fixed_region',dx,extra,{'box':['-2500','-500','2500','1500'],'layers':['68/20']},not(dx or extra)))
rows=[]
for index,(kind,dx,extra,criteria,expected) in enumerate(cases):
    candidate=R.snapshot(make(dx,extra));targets=candidate['shapes'][:2] if kind!='fixed_region' else []
    intent={'id':str(index),'kind':kind,'title':kind,'priority':'must','targets':targets,'criteria':criteria,'method':R.KINDS[kind][0],'required_data':R.KINDS[kind][1]}
    def direct_klayout():
        a,b=[R.polygon(v) for v in candidate['shapes'][:2]]
        if kind=='symmetry':return (k.Region(a.transformed(k.ICplxTrans(1,180,True,0,0)))^k.Region(b)).is_empty()
        if kind=='spacing':return k.Region(a).separation_check(k.Region(b),int(criteria['minimum_dbu'])).is_empty()
        clip=k.Region(k.Box(*map(int,criteria['box'])))
        return ((R.region(base['shapes'])&clip)^(R.region(candidate['shapes'])&clip)).is_empty()
    reference_times=[];review_times=[]
    for repeat in range(plan['repetitions']):
        started=time.perf_counter_ns();reference=direct_klayout();reference_times.append(time.perf_counter_ns()-started)
        started=time.perf_counter_ns();review=R.evaluate_constraint(intent,base,candidate);review_times.append(time.perf_counter_ns()-started)
    actual=review['status']=='pass'
    rows.append({'case':index,'kind':kind,'candidate_dx_dbu':dx,'candidate_extra_mask':extra,'criteria':criteria,'expected':expected,
        'klayout_python_result':reference,'resistor_result':review['status'],'agreement':reference==actual==expected,
        'klayout_python_median_ms':statistics.median(reference_times)/1e6,'resistor_evaluator_median_ms':statistics.median(review_times)/1e6,
        'geometry_hash':candidate['geometry_hash']})
criteria_missing=R.evaluate_constraint({**intent,'criteria':None},base,candidate)['status']=='not_run'
report={'schema_version':1,'plan_sha256':plan_sha,'engine':{'name':'KLayout','version':k.__version__},'fixture_sha256':S.profile.sha(gds),'cases':rows,
    'verdict_agreement':sum(v['agreement'] for v in rows),'false_pass':sum(v['resistor_result']=='pass' and not v['expected'] for v in rows),
    'false_fail':sum(v['resistor_result']=='fail' and v['expected'] for v in rows),'criteria_missing_unassessed':criteria_missing,
    'human_setup_time':None,'human_review_time':None,'customer_value_verified':False,'commercial_baseline_executed':False,'superiority_claim':False,
    'interpretation':'Both use KLayout. Script timings measure evaluator overhead on small fixtures, not an engineer workflow improvement.'}
(out/'comparison-results.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
S.POOL.shutdown(wait=True);S.DB.close()
assert all(v['agreement'] for v in rows) and criteria_missing,report
print('PASS predeclared KLayout extension comparison: 14 / 14 exact fixture verdicts; customer workflow value not measured')
