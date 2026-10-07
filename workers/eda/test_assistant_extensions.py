"""Isolated actual geometry/engine tests plus labelled numerical sample fixtures."""
import copy,hashlib,json,math,os,time,uuid
from pathlib import Path
ROOT=Path('/workspace');OUT=ROOT/'.runtime/evidence'/('assistant-extensions-'+uuid.uuid4().hex);OUT.mkdir(parents=True)
os.environ['MOS_STATE']=str(OUT/'state');os.environ['MOS_TOKEN']='isolated-tests-only'
os.environ['PATH']='/foss/tools/magic/bin:/foss/tools/netgen/bin:/foss/tools/ngspice/bin:'+os.environ['PATH']
import server as S
import design_tools as D
import digital_units as U
import signal_metrics as M
import geometry as G
from geometry import EDAError
cases=[]
def save():
    paths=['workers/eda/design_tools.py','workers/eda/digital_units.py','workers/eda/signal_metrics.py','workers/eda/test_assistant_extensions.py']
    record={'schema_version':1,'case_count':len(cases),'passed':sum(c['pass'] for c in cases),'cases':cases,'state_root':str(OUT/'state'),'source_sha256':{p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in paths}}
    (OUT/'result.json').write_text(json.dumps(record,indent=2));(ROOT/'docs/evidence/assistant-extensions.json').write_text(json.dumps(record,indent=2))
def case(name,fn,source='actual-native-geometry'):
    try:details=fn() or {};cases.append({'name':name,'pass':True,'source':source,**details});print('PASS '+name,flush=True);save()
    except Exception as e:cases.append({'name':name,'pass':False,'error':str(e),'source':source});save();raise
def rejects(fn,code):
    try:fn()
    except EDAError as e:assert e.code==code,(e.code,code);return
    raise AssertionError('Expected '+code)
def new():return S.rpc('design.create_template',{'template_id':'rc_lowpass','command_id':uuid.uuid4().hex})
def box(p,b):return S.rpc('layout.apply_command',{'project_id':p['id'],'expected_revision':p['revision'],'command_id':uuid.uuid4().hex,'command':{'type':'add_box','layer_id':'68/20','box':[str(v) for v in b]}})
def detour():
    p=new();l=S.load_layout(p);l.layer(68,20);p['layers']=S.profile.layers(l);old=p['revision'];p.update(revision=p['next_revision'],next_revision=p['next_revision']+1);p=S.commit(p,l,parent=old);p=box(p,[1800,-500,2200,500]);rules=D.routing_rules(p)
    args={'project_id':p['id'],'layer_id':'68/20','start':['0','0'],'end':['4000','0'],'width':'140','rule_fingerprint':rules['fingerprint']}
    assert not S.rpc('design.route_preview',args)['valid']
    r=S.rpc('design.route_search',args);assert r['preview']['valid'] and r['searched_candidates']>=3;r2=S.rpc('design.route_search',args);assert r['preview']['preview_hash']==r2['preview']['preview_hash']
    assert S.get_project(p['id'])['revision']==p['revision']
    apply={'project_id':p['id'],'expected_revision':p['revision'],'command_id':uuid.uuid4().hex,'preview':r['input'],'preview_hash':r['preview']['preview_hash'],'rule_fingerprint':r['preview']['rule_fingerprint']}
    changed=S.rpc('design.route_apply',apply);assert changed['revision']==p['revision']+1
    assert S.rpc('design.route_apply',apply)['revision']==changed['revision']
    rejects(lambda:S.rpc('design.route_apply',{**apply,'command_id':uuid.uuid4().hex}),'REVISION_CONFLICT')
    return {'input':args,'preview':r,'revision_after':changed['revision']}
case('blocked straight path finds deterministic native-checked detour; commit/replay/stale guard',detour)
def blocked():
    p=new();l=S.load_layout(p);l.layer(68,20);p['layers']=S.profile.layers(l);old=p['revision'];p.update(revision=p['next_revision'],next_revision=p['next_revision']+1);p=S.commit(p,l,parent=old);p=box(p,[-500,-500,500,500]);r=S.rpc('design.route_search',{'project_id':p['id'],'layer_id':'68/20','start':['0','0'],'end':['4000','0'],'width':'140'});assert r['status']=='blocked' and not r['preview']['valid'];return {'searched':r['searched_candidates']}
case('covered endpoint never returns an applicable route',blocked)
def path_guards():
    p=new();base={'project_id':p['id'],'layer_id':'68/20','start':['0','0'],'end':['4000','0'],'width':'140'}
    for points in [[['0','0'],['4000','5']],[['0','0'],['2000','2000'],['4000','0']],[['0','0'],['3000','0'],['1000','0'],['4000','0']],[['0','0'],['0','1000'],['1000','1000'],['1000','-1000'],['0','-1000'],['0','0'],['4000','0']]]:
        rejects(lambda:D._route(p,{**base,'points':points}),'INVALID_GEOMETRY')
    rejects(lambda:D.route_search({**base,'points':[['0','0'],['4000','0']]}),'UNSUPPORTED_PARAMETER')
case('custom endpoints, diagonal, reversal and self-crossing are rejected',path_guards)
def numerics():
    w={'x':[0,1,2],'y':[0,2,4]};M.validate_wave(w);assert M.value_at(w,.5)==1;assert M.value_at(w,3) is None
    m=M.supply_metrics(w,.5,1.5,2);assert m['available'] and m['energy_J']==4 and m['average_current_A']==2
    assert not M.supply_metrics(w,0,3,2)['available'];assert not M.stable({'x':[0,2],'y':[0,1]},0,.2,.9,1)
    for malformed in [{'x':[0,1],'y':[1]},{'x':[1,0],'y':[0,0]},{'x':[0,1],'y':[0,float('nan')]}]:rejects(lambda:M.validate_wave(malformed),'INVALID_WAVEFORM')
case('interpolation, signed trapezoidal energy and window boundary validation',numerics,'numerical-fixtures')
def cpu_guards():
    for v in [True,15,65,32.5]:rejects(lambda:U.cpu_cycles(v),'PARAMETER_RANGE')
    program=[{'op':'ADD','value':1}]*16;rows=U.cpu_trace(program,32);assert rows[15]['expected']==0 and rows[16]['pc_before']==0 and rows[31]['expected']==0 and rows[15]['carry_expected']==1
case('cycle range and independent arithmetic oracle wraps PC while retaining accumulator',cpu_guards,'numerical-fixtures')
cpu={}
def actual_cpu():
    program=copy.deepcopy(U.DEFAULT_PROGRAM);program[0]={'op':'ADD','value':1};program[15]={'op':'XOR','value':15}
    p=S.rpc('digital.create',{'kind':'cpu4','physical':False,'program':program,'period_ns':50,'cycles':32,'command_id':uuid.uuid4().hex});r=S.rpc('simulation.run',{'project_id':p['id'],'expected_revision':p['revision'],**p['testbench']});deadline=time.monotonic()+330
    while (r:=S.get_run(r['id']))['execution_status'] in ('queued','running') and time.monotonic()<deadline:time.sleep(.15)
    assert r['execution_status']=='completed',(r['id'],r.get('message'));v=r['unit_verification'];assert v['pass'] and v['passed_cases']==32 and v['reset_verified'] and v['rom_wraps']==2,v
    assert v['power']['available'] and all(row['power']['available'] for row in v['rows']);cpu.update(project=p,run=r)
    return {'project_id':p['id'],'run_id':r['id'],'program':program,'verification':v}
case('actual SKY130 ngspice 32-cycle CPU, reset/ROM wrap and measured supply energy',actual_cpu,'actual-ngspice')
def corruption():
    p=cpu['project'];r=copy.deepcopy(cpu['run']);w=next(w for w in r['waveforms'] if w['name']=='PC0');w['y']=[.9]*len(w['y']);assert not U.verify(p,r,p['testbench'])['pass']
    r=copy.deepcopy(cpu['run']);r['waveforms']=[w for w in r['waveforms'] if w['name']!='RESET'];rejects(lambda:U.verify(p,r,p['testbench']),'MISSING_WAVEFORM')
    r=copy.deepcopy(cpu['run'])
    for w in r['waveforms']:
        size=len(w['x'])//2;w['x']=w['x'][:size];w['y']=w['y'][:size]
    v=U.verify(p,r,p['testbench']);assert not v['pass'] and not v['power']['available'] and v['passed_cases']<32
case('actual-wave replay rejects unknown PC, missing reset and truncated observation',corruption,'altered-actual-waveform-regression')
print(json.dumps({'passed':len(cases),'evidence':str(OUT/'result.json')}),flush=True)
