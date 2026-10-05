"""Native transistor execution and revision/approval hierarchy integration checks."""
import copy,hashlib,json,os,time,uuid
from pathlib import Path
ROOT=Path('/workspace');resume_path=os.environ.get('REGISTER_NATIVE_RESUME');prior=json.loads(Path(resume_path).read_text()) if resume_path else None
OUT=Path(prior['state_root']).parent if prior else ROOT/'.runtime/evidence'/('digital-hierarchy-'+uuid.uuid4().hex);OUT.mkdir(parents=True,exist_ok=True)
SOURCE=['workers/eda/digital_units.py','workers/eda/digital_mux.py','workers/eda/hierarchy_transfer.py','workers/eda/server.py','workers/eda/current_flow.py','workers/eda/test_digital_hierarchy.py']
SOURCE_HASHES={p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in SOURCE}
if prior and prior.get('source_sha256')!=SOURCE_HASHES:raise RuntimeError('Cannot retain prior native cases after source changes; run a fresh audit.')
os.environ['MOS_STATE']=str(OUT/'state');os.environ['MOS_TOKEN']='isolated-not-a-credential'
os.environ['PATH']='/foss/tools/magic/bin:/foss/tools/netgen/bin:/foss/tools/ngspice/bin:'+os.environ['PATH']
import server as S
import digital_units as U
import geometry as G
from geometry import EDAError
cases=[];projects={}
if prior:
    for c in prior['cases']:
        if c['result']=='pass' and 'project_id' in c:
            p=S.get_project(c['project_id']);projects[p['digital_unit']['kind']]=p
def save():
    receipt={'schema_version':1,'passed':sum(c['result']=='pass' for c in cases),'case_count':len(cases),'cases':cases,'state_root':str(OUT/'state'),'actual_tools':['ngspice','Magic','Netgen','KLayout'],'resumed_from':resume_path,'source_sha256':SOURCE_HASHES}
    (ROOT/'docs/evidence/digital-hierarchy-native.json').write_text(json.dumps(receipt,indent=2));(OUT/'result.json').write_text(json.dumps(receipt,indent=2))
def case(name,fn):
    previous=next((c for c in prior['cases'] if c['case']==name and c['result']=='pass'),None) if prior else None
    if previous:cases.append(previous);print('RETAIN actual evidence '+name,flush=True);return
    start=time.monotonic()
    try:
        result=fn() or {};cases.append({'case':name,'result':'pass','elapsed_s':time.monotonic()-start,**result});print('PASS '+name,flush=True)
    except Exception as e:cases.append({'case':name,'result':'fail','error':str(e)});save();raise
def failure(fn,code):
    try:fn()
    except EDAError as e:assert e.code==code,(e.code,code);return
    raise AssertionError('Expected '+code)
def create(kind,physical=True,**extra):
    args={'kind':kind,'physical':physical,'command_id':uuid.uuid4().hex,**extra};p=S.rpc('digital.create',args)
    assert S.rpc('digital.create',args)['id']==p['id'];return p
def run(p,method='simulation.run',**extra):
    r=S.rpc(method,{'project_id':p['id'],'expected_revision':p['revision'],**(p['testbench'] if method=='simulation.run' else {}),**extra});deadline=time.monotonic()+340
    while (r:=S.get_run(r['id']))['execution_status'] in ('queued','running') and time.monotonic()<deadline:time.sleep(.1)
    assert r['execution_status']=='completed' and r['analysis_result']=='pass',(r['id'],r.get('message'));return r
def actual(kind,physical=True,**settings):
    p=create(kind,physical,**settings);projects[kind]=p;r=run(p);v=r['unit_verification'];expected={'full_adder':8,'adder4':512,'cpu4':16}[kind]
    assert v['pass'] and v['passed_cases']==expected and v['expected_cases']==expected
    assert 'ngspice' in v['source'];return {'project_id':p['id'],'run_id':r['id'],'passed_cases':v['passed_cases'],'physical_shapes':G.scene(S.load_layout(p),p,p['layers'])['total_shape_count']}
case('full adder: actual 8 input combinations + native physical generation',lambda:actual('full_adder'))
case('full adder: Magic DRC',lambda:{'run_id':run(projects['full_adder'],'verification.run_drc')['id']})
case('full adder: Netgen LVS',lambda:{'run_id':run(projects['full_adder'],'verification.run_lvs')['id']})
def extracted_adder():
    p=create('full_adder',period_ns=100);pex=run(p,'extraction.run_pex');r=run(p,post_layout=True)
    assert r['unit_verification']['passed_cases']==8
    return {'project_id':p['id'],'pex_run_id':pex['id'],'run_id':r['id'],'passed_cases':8}
case('full adder: actual RC extraction and post-layout 8 combinations at 100ns',extracted_adder)
case('4-bit adder: actual 512 combinations + native physical generation',lambda:actual('adder4'))
case('4-bit CPU: actual clocked ROM/ACC/PC/flags',lambda:actual('cpu4',False))
case('slow hot adder: actual 512 combinations',lambda:actual('adder4',False,corner='ss',temperature_C=125,supply_V=1.62))
case('fast cold CPU: actual 16 instructions',lambda:actual('cpu4',False,corner='ff',temperature_C=-40,supply_V=1.8))
def guards():
    failure(lambda:create('cpu4',False,program=[{'op':'LOAD','value':0}]),'INVALID_PROGRAM')
    failure(lambda:create('full_adder',False,period_ns=1),'PARAMETER_RANGE')
    failure(lambda:S.rpc('digital.create',{'kind':'cpu4','command_id':uuid.uuid4().hex,'shell':'bad'}),'INVALID_PARAMETER')
case('creation rejects unsupported/unsafe/incomplete inputs',guards)
def waveform_guard():
    p=projects['cpu4'];r=copy.deepcopy(S.get_project(p['id'])['runs'][-1]);next(w for w in r['waveforms'] if w['name']=='ACC0')['y']=[.9]*len(r['waveforms'][0]['y']);U.verify(p,r,p['testbench']);assert not r['unit_verification']['pass']
case('actual-wave verifier rejects unknown logic levels',waveform_guard)
target=projects['full_adder'];source=target
def wrap():
    global target
    req={'project_id':target['id'],'mode':'wrap','parent_name':'CHIP_TOP'};old=G.identity_hash(S.load_layout(target));v=S.rpc('hierarchy.preview',req)
    assert not v['before']['truncated'] and not v['after']['truncated'];assert v['impact']['mask']['mask_changed'] is False
    assert S.get_project(target['id'])['revision']==target['revision'] and G.identity_hash(S.load_layout(target))==old
    args={'project_id':target['id'],'request':req,'preview_hash':v['preview_hash'],'approved':True,'expected_revision':target['revision'],'command_id':uuid.uuid4().hex}
    failure(lambda:S.rpc('hierarchy.apply',{**args,'approved':False}),'APPROVAL_REQUIRED')
    target=S.rpc('hierarchy.apply',args);assert S.rpc('hierarchy.apply',args)['revision']==target['revision']
    assert target['cell']=='CHIP_TOP' and target['schematic']['devices'][0]['cell_name']=='full_adder'
    assert run(target)['unit_verification']['passed_cases']==8
    return {'revision':target['revision'],'mask_changed':False}
case('read-only complete parent preview; approval; idempotent commit; actual simulation',wrap)
case('wrapped physical adder: Netgen LVS',lambda:{'run_id':run(target,'verification.run_lvs')['id']})
def cpu_wrap():
    p=projects['cpu4'];req={'project_id':p['id'],'mode':'wrap','parent_name':'CPU_CHIP'};v=S.rpc('hierarchy.preview',req)
    p=S.rpc('hierarchy.apply',{'project_id':p['id'],'request':req,'preview_hash':v['preview_hash'],'approved':True,'expected_revision':p['revision'],'command_id':uuid.uuid4().hex});r=run(p);assert r['unit_verification']['passed_cases']==16
    return {'run_id':r['id'],'probe_prefix':p['digital_unit']['internal_probe_prefix']}
case('CPU wrapper preserves real internal opcode/immediate probes',cpu_wrap)
def copy_preview():
    global target
    src=create('full_adder');target_layout=S.load_layout(target);bb=target_layout.cell(target['cell']).bbox();x=((bb.right-bb.left+50000+4)//5)*5
    req={'project_id':target['id'],'mode':'place','source_project_id':src['id'],'source_cell':src['cell'],'namespace':'COPY1','position':[str(x),'0'],'rotation':0,'mirror':False,'pins':{p:('VPWR' if p=='VPWR' else 'VGND' if p=='VGND' else 'COPY_'+p) for p in src['ports']},'scope':'both'}
    v=S.rpc('hierarchy.preview',req);assert v['impact']['added_shapes']>0 and v['impact']['mask']['mask_changed']
    assert v['impact']['mask']['overlap_count']==0
    args={'project_id':target['id'],'request':req,'preview_hash':v['preview_hash'],'approved':True,'expected_revision':target['revision'],'command_id':uuid.uuid4().hex}
    failure(lambda:S.rpc('hierarchy.apply',{**args,'request':{**req,'position':['0','0']}}),'STALE_PREVIEW')
    # A source edit invalidates even an otherwise unchanged destination and mapping.
    S.rpc('schematic.apply_command',{'project_id':src['id'],'expected_revision':src['revision'],'command_id':uuid.uuid4().hex,'command':{'type':'move_device','id':src['schematic']['devices'][0]['id'],'x':250,'y':200}})
    failure(lambda:S.rpc('hierarchy.apply',args),'STALE_PREVIEW')
    v=S.rpc('hierarchy.preview',req);args['preview_hash']=v['preview_hash'];old=target['revision'];target=S.rpc('hierarchy.apply',args)
    assert target['revision']==old+1 and 'COPY1_full_adder' in target['schematic']['cells'];assert S.get_project(src['id'])['revision']==2
    target=S.rpc('layout.apply_command',{'project_id':target['id'],'expected_revision':target['revision'],'command_id':uuid.uuid4().hex,'command':{'type':'undo'}});assert 'COPY1_full_adder' not in target['schematic']['cells']
    target=S.rpc('layout.apply_command',{'project_id':target['id'],'expected_revision':target['revision'],'command_id':uuid.uuid4().hex,'command':{'type':'redo'}});assert 'COPY1_full_adder' in target['schematic']['cells']
    return {'added_shapes':v['impact']['added_shapes'],'whole_before':v['impact']['before_shapes'],'whole_after':v['impact']['after_shapes'],'undo_redo':True}
case('copy native tree + pin mapping; source/mapping stale guards; undo/redo',copy_preview)
def overlap():
    src=create('full_adder');req={'project_id':target['id'],'mode':'place','source_project_id':src['id'],'namespace':'OVER','position':['0','0'],'scope':'layout'};v=S.rpc('hierarchy.preview',req)
    assert v['impact']['mask']['overlap_count']>0;assert S.get_project(target['id'])['revision']==target['revision']
    return {'overlap_regions':v['impact']['mask']['overlap_count']}
case('actual same-layer overlap hotspots visible before approval',overlap)
def child_guard():
    p=projects['full_adder'];req={'project_id':target['id'],'source_project_id':p['id'],'source_cell':'NAND2','mode':'place','namespace':'GATE','pins':{x:x for x in p['schematic']['cells']['NAND2']['ports']}}
    failure(lambda:S.rpc('hierarchy.preview',req),'NO_PHYSICAL_CELL')
    v=S.rpc('hierarchy.preview',{**req,'scope':'schematic'});assert not v['impact']['mask']['mask_changed']
case('missing physical child requires explicit schematic-only selection',child_guard)
save();print(f'{len(cases)}/{len(cases)} native digital/hierarchy cases passed',flush=True)
