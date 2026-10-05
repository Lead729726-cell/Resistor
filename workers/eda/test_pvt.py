"""Isolated real PVT engine regressions plus explicitly named scheduler guards."""
import copy,json,os,subprocess,threading,time,uuid
from pathlib import Path
RUN=Path('/workspace/.runtime/evidence')/('pvt-'+uuid.uuid4().hex);RUN.mkdir(parents=True)
os.environ['MOS_STATE']=str(RUN/'state');os.environ['MOS_TOKEN']='isolated-test-only'
import server as S
import pvt as P
from geometry import EDAError

CASES=[]
def assert_(condition,message='assertion failed'):
    if not condition:raise AssertionError(message)
def case(name,action):
    begin=time.monotonic()
    try:value=action();CASES.append({'name':name,'result':'pass','seconds':time.monotonic()-begin,'details':value});return value
    except Exception as err:CASES.append({'name':name,'result':'fail','seconds':time.monotonic()-begin,'error':repr(err)});raise
def reject(code,action):
    try:action()
    except EDAError as err:assert_(err.code==code,(err.code,code,str(err)));return {'error_code':code}
    raise AssertionError('Expected '+code)
def cfg(analysis='dc',**extra):return {'analysis':analysis,'corners':['tt'],'temperatures_C':[27],'supplies_V':[1.2,1.8],'supply':{'kind':'testbench','source_names':['VD']},'metrics':[{'name':'Id','source':'measurement','key':'Id_max'}],**extra}
def call(method,**params):return P.rpc('pvt.'+method,params)
def create(p,config,**extra):return call('create',project_id=p['id'],expected_revision=p['revision'],command_id=str(uuid.uuid4()),config=config,**extra)
def wait(e,timeout=90):
    begin=time.monotonic()
    while time.monotonic()-begin<timeout:
        e=call('status',project_id=e['project_id'],study_id=e['id'])
        if e['execution_status'] in P.TERMINAL:return e
        time.sleep(.05)
    raise AssertionError('Isolated actual PVT exceeds bounded test timeout')
def evaluate(p,c):
    e=create(p,c);call('start',project_id=p['id'],study_id=e['id'],expected_revision=p['revision'],command_id='room:'+str(uuid.uuid4()));e=wait(e);assert_(e['execution_status']=='completed',e);assert_(all(v['execution_status']=='completed' and v['analysis_result']=='pass' for v in e['points']),e);return e
def proof(e):
    return {'study_id':e['id'],'source_revision':e['source_revision'],'source_signature':e['source_signature'],'summary':e['summary'],'points':[{'condition':p['condition'],'run_id':p['run_id'],'project_id':p['project_id'],'metrics':p['metrics'],'manifest_path':p.get('manifest_path')} for p in e['points']]}

def actual_grid():
    global mos,grid
    mos=S.create({'name':'Actual MOS PVT source','example':'mosfet'});grid=evaluate(mos,cfg(corners=['tt','ff'],temperatures_C=[27,125],max_parallel=2,constraints=[{'metric':'Id','op':'>=','value':1e-9}]))
    assert_(len(grid['points'])==8);values=[p['metrics']['Id'] for p in grid['points']];assert_(max(values)>min(values)>0);assert_(grid['summary']['Id']['min']==min(values) and grid['summary']['Id']['max']==max(values));assert_(grid['all_constraints_pass']);assert_(grid['worst_constraints'][0]['pass'])
    for point in grid['points']:
        run=S.get_run(point['run_id']);p=S.get_project(point['project_id']);assert_(p['pvt_point']['parent_project_id']==mos['id']);assert_(run['measurements']['corner']==point['condition']['corner']);assert_(run['measurements']['temperature_C']==point['condition']['temperature_C']);assert_(run['measurements']['Id_max']==point['metrics']['Id']);deck=Path(run['artifacts']['testbench']).read_text();assert_(f'VD D 0 {point["condition"]["supply_V"]:.12g}' in deck);assert_(f'.temp {point["condition"]["temperature_C"]:.12g}' in deck)
    source=S.get_project(mos['id']);assert_(source['revision']==mos['revision'] and source['schematic']==mos['schematic'] and len(source['runs'])==0);return proof(grid)
def actual_op():
    e=evaluate(mos,cfg('op',metrics=[{'name':'gm','source':'measurement','key':'gm'}]));assert_(all(p['metrics']['gm']>0 for p in e['points']));return proof(e)
def actual_ac():
    e=evaluate(mos,cfg('ac',supplies_V=[1.8],metrics=[{'name':'gm_ac','source':'waveform','key':'gain_magnitude','reduction':'max'}]));run=S.get_run(e['points'][0]['run_id']);assert_(run['measurements']['current_flow_status']=='unsupported_complex_ac');assert_(not run.get('current_flow'));return proof(e)
def actual_tran():return proof(evaluate(mos,cfg('tran',supplies_V=[1.8],settings={'duration_s':2e-9,'step_s':20e-12})))
def configured():
    global configured_source
    l=S.load_layout(mos);path=RUN/'naked-mos.gds';l.write(str(path));p=S.create({'name':'Configured imported MOS','example':'fixture'});p=S.rpc('layout.import',{'project_id':p['id'],'path':str(path)})
    settings={'profile_id':'sky130A','top_cell':p['cell'],'corner':'tt','temperature_C':27,'ports':[{'name':'B','mode':'ground','dc_V':0},{'name':'D','mode':'voltage','dc_V':1.8},{'name':'S','mode':'ground','dc_V':0},{'name':'G','mode':'voltage','dc_V':.9}],'analysis':'op','pex':False}
    p=S.rpc('analysis.configure',{'project_id':p['id'],'settings':settings});configured_source=p
    e=evaluate(p,cfg('op',supply={'kind':'port','name':'D'},metrics=[{'name':'D','source':'waveform','key':'D','reduction':'last'},{'name':'supply_current','source':'branch','key':'testbench/VREGISTER_PORT_1','reduction':'last'}]));assert_([v['metrics']['D'] for v in e['points']]==[1.2,1.8]);assert_(all(v['metrics']['supply_current']<0 for v in e['points']));assert_(all(b['mapping']=='unmapped' for v in e['points'] for b in S.get_run(v['run_id'])['current_flow']['branches']));return proof(e)
def generic_source():
    p=S.create({'name':'Actual generic RC PVT','example':'fixture'});p=copy.deepcopy(p);p['ports']=['IN','OUT','VDD'];p['schematic']={'devices':[{'id':'supply','name':'SUPPLY','kind':'voltage','parameters':{'dc':1.8},'pins':{'+':'VDD','-':'0'}},{'id':'input','name':'INPUT','kind':'voltage','parameters':{'dc':.8},'pins':{'+':'IN','-':'0'}},{'id':'r1','name':'R1','kind':'resistor','parameters':{'value':1000},'pins':{'+':'IN','-':'OUT'}},{'id':'r2','name':'R2','kind':'resistor','parameters':{'value':1000},'pins':{'+':'OUT','-':'0'}},{'id':'rdummy','name':'RD','kind':'resistor','parameters':{'value':10000},'pins':{'+':'VDD','-':'0'}},{'id':'c','name':'C1','kind':'capacitor','parameters':{'value':1e-9},'pins':{'+':'OUT','-':'0'}}],'wires':[],'junctions':[]};p['revision']=2;p['next_revision']=3
    return S.commit(p,S.load_layout(S.get_project(p['id'])),1)
def generic_cfg(analysis):return cfg(analysis,supply={'kind':'device','device_id':'supply'},metrics=[{'name':'output','source':'waveform','key':'OUT','reduction':'max'}])
def generic_op():
    global rc
    rc=generic_source();c=generic_cfg('op');c['metrics']=[{'name':'supply','source':'waveform','key':'VDD','reduction':'last'},{'name':'output','source':'waveform','key':'OUT','reduction':'last'}];e=evaluate(rc,c);assert_([round(v['metrics']['supply'],12) for v in e['points']]==[1.2,1.8]);assert_(all(abs(v['metrics']['output']-.4)<1e-8 for v in e['points']));return proof(e)
def generic_dc():
    c=generic_cfg('dc');c['settings']={'dc_source_id':'input','start_V':0,'end_V':1,'step_V':.1};e=evaluate(rc,c);assert_(all(abs(v['metrics']['output']-.5)<1e-7 for v in e['points']));return proof(e)
def generic_ac():
    c=generic_cfg('ac');c['supplies_V']=[1.8];c['settings']={'ac_source_id':'input','ac_start_Hz':1,'ac_end_Hz':1e6,'ac_points_dec':10};c['metrics']=[{'name':'gain','source':'waveform','key':'OUT_magnitude','reduction':'max'}];e=evaluate(rc,c);assert_(0<e['points'][0]['metrics']['gain']<=.500001);return proof(e)
def generic_tran():
    c=generic_cfg('tran');c['supplies_V']=[1.8];c['settings']={'duration_s':1e-8,'step_s':1e-10};e=evaluate(rc,c);assert_(abs(e['points'][0]['metrics']['output']-.4)<1e-8);return proof(e)
def template_source(kind):return S.rpc('design.create_template',{'template_id':kind,'name':'Actual template PVT '+kind,'command_id':str(uuid.uuid4())})
def template_rc():
    p=template_source('rc_lowpass');sources=call('sources',project_id=p['id']);assert_(sources['mode']=='template' and sources['bindings']==[{'kind':'testbench','source_names':['VIN']}] and sources['analyses']==['tran']);assert_(not any(d['kind']=='voltage' for d in p['schematic']['devices']))
    c=cfg('tran',supply=sources['bindings'][0],metrics=[{'name':'tau','source':'measurement','key':'measured_tau_s'},{'name':'amplitude','source':'waveform','key':'OUT','reduction':'max'}]);e=evaluate(p,c);expected=p['design_template']['parameters']['resistance_Ohm']*p['design_template']['parameters']['capacitance_F']
    for point in e['points']:
        assert_(abs(point['metrics']['tau']/expected-1)<.01);assert_(abs(point['metrics']['amplitude']-point['condition']['supply_V'])<1e-6);run=S.get_run(point['run_id']);deck=Path(run['artifacts']['testbench']).read_text();assert_(f'VIN IN VGND 0 AC 1 PULSE(0 {point["condition"]["supply_V"]:.12g}' in deck);assert_(run['measurements']['metric_source']=='actual-ngspice-samples');child=S.get_project(point['project_id']);assert_(child['design_template']==p['design_template'] and child['schematic']==p['schematic'])
    for analysis in ('op','ac'):reject('UNSUPPORTED_ANALYSIS',lambda a=analysis:create(p,{**c,'analysis':a}))
    reject('PVT_SUPPLY_BINDING',lambda:create(p,{**c,'supply':{'kind':'testbench','source_names':['VDD']}}));reject('UNSUPPORTED_ANALYSIS',lambda:create(p,{**c,'settings':{'post_layout':True}}));assert_(S.get_project(p['id'])['revision']==p['revision'] and not S.get_project(p['id'])['runs']);return {**proof(e),'sources':sources,'analytical_tau_s':expected,'original_schematic_preserved':True,'unused_supply_op_ac_rejected':True,'post_layout_explicitly_unsupported':True}
def template_common_source():
    p=template_source('common_source');sources=call('sources',project_id=p['id']);assert_(sources['mode']=='template' and sources['bindings']==[{'kind':'testbench','source_names':['VDD']}] and sources['analyses']==['op','dc','ac','tran'])
    c=cfg('op',supply=sources['bindings'][0],metrics=[{'name':'current_A','source':'waveform','key':'supply_current','reduction':'last'},{'name':'output_V','source':'waveform','key':'OUT','reduction':'last'}]);e=evaluate(p,c);assert_(e['summary']['current_A']['min']>0 and e['summary']['current_A']['max']-e['summary']['current_A']['min']>1e-10);assert_(e['summary']['output_V']['max']>e['summary']['output_V']['min'])
    for point in e['points']:
        run=S.get_run(point['run_id']);deck=Path(run['artifacts']['testbench']).read_text();assert_(f'VDD VPWR VGND {point["condition"]["supply_V"]:.12g}' in deck);assert_(run['measurements']['supply_V']==point['condition']['supply_V']);assert_(run['measurements']['metric_source']=='actual-ngspice-samples');assert_(S.get_project(point['project_id'])['design_template']==p['design_template'])
    assert_(S.get_project(p['id'])['schematic']==p['schematic'] and not S.get_project(p['id'])['runs']);return {**proof(e),'sources':sources,'current_vector':'-i(VDD)','original_schematic_preserved':True}
def template_swept_mirror():
    p=template_source('current_mirror');sources=call('sources',project_id=p['id']);assert_(sources['mode']=='template' and sources['bindings']==[{'kind':'testbench','source_names':['VDOUT']}] and sources['analyses']==['op','tran']);c=cfg('dc',supply=sources['bindings'][0],metrics=[{'name':'mirror','source':'waveform','key':'output_current'}]);result=reject('PVT_SWEPT_SUPPLY',lambda:create(p,c));assert_(not call('list',project_id=p['id']) and not S.get_project(p['id'])['runs']);return {**result,'sources':sources,'no_native_job_submitted':True,'swept_source':'VDOUT'}
def actual_failure():
    c=cfg(metrics=[{'name':'missing','source':'measurement','key':'no_such_metric'}]);e=create(mos,c);call('start',project_id=mos['id'],study_id=e['id']);e=wait(e);assert_(e['execution_status']=='completed');assert_(all(p['execution_status']=='failed' and p['error_code']=='PVT_METRIC_MISSING' and not p['metrics'] for p in e['points']));assert_(e['summary']=={});return {'study_id':e['id'],'point_errors':[p['error_code'] for p in e['points']],'actual_run_ids':[p['run_id'] for p in e['points']]}
def receipt():
    params={'project_id':mos['id'],'expected_revision':mos['revision'],'command_id':'room:'+str(uuid.uuid4()),'config':cfg()};e=call('create',**params);assert_(e['execution_status']=='created');assert_(call('create',**params)['id']==e['id']);reject('IDEMPOTENCY_CONFLICT',lambda:call('create',**{**params,'config':cfg(supplies_V=[1.8])}));return {'study_id':e['id'],'execution_status':'created','command_id_prefixed':True}
def scope():
    other=S.create({'name':'Other project','example':'fixture'});assert_(call('list',project_id=other['id'])==[])
    for method in ('status','start','cancel'):reject('FORBIDDEN',lambda m=method:call(m,project_id=other['id'],study_id=grid['id']))
    assert_(call('sources',project_id=mos['id'])['bindings']==[{'kind':'testbench','source_names':['VD']}]);return {'cross_project_denied':True}
def canceled_native():
    e=create(mos,cfg(corners=['tt','ff','ss'],temperatures_C=[-40,27,125],supplies_V=[1.2,1.8],max_parallel=2));call('start',project_id=mos['id'],study_id=e['id']);start=time.monotonic();ids=[]
    while time.monotonic()-start<15:
        e=call('status',project_id=mos['id'],study_id=e['id']);ids=e['active_run_ids']
        if ids and any(rid in S.PROCESSES for rid in ids):break
        time.sleep(.001)
    assert_(ids,'Native study did not submit a cancellable run');c=call('cancel',project_id=mos['id'],study_id=e['id'],command_id=str(uuid.uuid4()));assert_(c['execution_status']=='canceled');time.sleep(.3);e=call('status',project_id=mos['id'],study_id=e['id']);assert_(e['execution_status']=='canceled');assert_(all(S.get_run(rid)['execution_status'] in P.TERMINAL for rid in ids));return {'study_id':e['id'],'actual_canceled_run_ids':ids,'remaining_metrics_not_invented':all(not p['metrics'] for p in e['points'] if p['execution_status']=='canceled')}
def scheduler_timeout():
    gate=threading.Event();occupied=[S.POOL.submit(gate.wait,15) for _ in range(2)];e=create(mos,cfg(supplies_V=[1.8],point_timeout_s=5));call('start',project_id=mos['id'],study_id=e['id'])
    try:e=wait(e,15);assert_(e['points'][0]['error_code']=='PVT_POINT_TIMEOUT');assert_(not e['points'][0]['metrics'])
    finally:gate.set();[v.result(15) for v in occupied]
    rid=e['points'][0]['run_id'];start=time.monotonic()
    while time.monotonic()-start<5 and not Path(S.get_run(rid)['manifest_path']).exists():time.sleep(.02)
    manifest=json.loads(Path(S.get_run(rid)['manifest_path']).read_text());assert_(manifest['commands']==[] and manifest['execution_status']=='canceled');return {'scheduler_harness':'two real native pool slots held by bounded barriers; no fabricated process output','study_id':e['id'],'run_id':rid,'timeout_s':5,'native_commands_launched':0}
def aggregate_expiry():
    e=create(mos,cfg());e.update(execution_status='running',deadline_epoch_s=time.time()-1);P.put(e);P.run_study(e['id'],e['project_id']);e=call('status',project_id=mos['id'],study_id=e['id']);assert_(e['execution_status']=='canceled' and e['stop_reason']=='aggregate_wall_time_exceeded');return {'scheduler_harness':'expired persisted deadline','study_id':e['id'],'stop_reason':e['stop_reason']}
def concurrency():
    saved=[]
    for _ in range(2):e=create(mos,cfg());e.update(execution_status='running');P.put(e);saved.append(e)
    third=create(mos,cfg())
    try:reject('PVT_CONCURRENCY',lambda:call('start',project_id=mos['id'],study_id=third['id']))
    finally:
        for e in saved:call('cancel',project_id=mos['id'],study_id=e['id'])
    return {'scheduler_harness':'persisted running state concurrency boundary','maximum_running_studies':2}
def stale_source():
    e=create(rc,generic_cfg('op'));p=S.rpc('schematic.apply_command',{'project_id':rc['id'],'command':{'type':'update_device','id':'r1','parameters':{'value':2000}}});assert_(call('status',project_id=rc['id'],study_id=e['id'])['freshness']=='stale');reject('PVT_STALE',lambda:call('start',project_id=rc['id'],study_id=e['id']));reject('REVISION_CONFLICT',lambda:call('create',project_id=rc['id'],expected_revision=rc['revision'],config=generic_cfg('op')));return {'source_revision':e['source_revision'],'current_revision':p['revision'],'freshness':'stale'}
def changed_resources():
    e=create(mos,cfg());original=P.source_signature;P.source_signature=lambda p:'changed-resource-fingerprint'
    try:assert_(call('status',project_id=mos['id'],study_id=e['id'])['freshness']=='stale');reject('PVT_STALE',lambda:call('start',project_id=mos['id'],study_id=e['id']))
    finally:P.source_signature=original
    return {'validator_harness':'changed tool/model fingerprint injected without mutating installed PDK','freshness':'stale'}
def tamper_snapshot():
    e=create(mos,cfg());path=P.source_path(e)/'source-project.json';saved=path.read_bytes();path.write_bytes(saved+b' ')
    try:reject('PVT_STALE',lambda:call('start',project_id=mos['id'],study_id=e['id']))
    finally:path.write_bytes(saved)
    return {'immutable_snapshot_sha_guard':True}
def restart_recovery():
    e=create(mos,cfg());e.update(execution_status='running',active_run_ids=[]);e['points'][0].update(execution_status='running');P.put(e)
    script='import server as S;import pvt;pvt.recover_interrupted()';out=subprocess.run(['python3','-c',script],cwd='/workspace/workers/eda',env=os.environ,capture_output=True,text=True,timeout=30);assert_(out.returncode==0,out.stderr);e=call('status',project_id=mos['id'],study_id=e['id']);assert_(e['execution_status']=='failed' and e['error_code']=='WORKER_RESTARTED');assert_(not e['points'][0]['metrics']);return {'scheduler_harness':'persisted interrupted state; separate interpreter recovery','study_id':e['id'],'status':e['execution_status'],'native_replay':False}

def main():
    case('actual public MOS eight-corner-temperature-supply DC points and constraints',actual_grid)
    case('actual MOS OP gm at two applied drain supplies',actual_op)
    case('actual MOS AC magnitude without fake scalar currents',actual_ac)
    case('actual MOS constant-bias transient',actual_tran)
    case('actual configured naked GDS port-biased OP and signed source current',configured)
    case('actual generic IR DC supply binding OP with analytical RC voltage',generic_op)
    case('actual generic hierarchical source DC sweep',generic_dc)
    case('actual generic AC source amplitude and magnitude',generic_ac)
    case('actual generic constant-bias RC transient',generic_tran)
    case('actual RC template pulse amplitude two-supply PVT and measured tau',template_rc)
    case('actual common-source template two-VDD OP signed supply currents',template_common_source)
    case('mirror template DC swept-supply guard before submission',template_swept_mirror)
    case('actual runs with missing metrics retain failure no substituted score',actual_failure)
    case('created study exact-once receipt and prefixed UUID mismatch',receipt)
    case('required project scope and authoritative testbench source listing',scope)
    case('actual running native job cancellation preserves canceled batch',canceled_native)
    case('five-second queued native point budget cancels without launch',scheduler_timeout)
    case('expired aggregate wall deadline cancels all unexecuted points',aggregate_expiry)
    case('two concurrent studies limit enforced atomically',concurrency)
    case('changed source revision rejects start and stale create',stale_source)
    case('changed model/tool fingerprint invalidates study',changed_resources)
    case('immutable source snapshot mutation rejected',tamper_snapshot)
    case('interrupted scheduler recovered in a separate process without replay',restart_recovery)
    case('Cartesian grid maximum32 enforced',lambda:reject('PVT_RANGE',lambda:create(mos,cfg(corners=['tt','ff','ss'],temperatures_C=[-40,0,27,60,125],supplies_V=[.9,1.2,1.8]))))
    case('DC swept supply cannot pretend fixed voltage',lambda:reject('PVT_SWEPT_SUPPLY',lambda:create(mos,cfg(settings={'dc_sweep':'vds'}))))
    case('wrong built-in voltage source rejected',lambda:reject('PVT_SUPPLY_BINDING',lambda:create(mos,cfg(supply={'kind':'testbench','source_names':['VDD_GUESS']}))))
    case('undeclared process corner rejected',lambda:reject('UNSUPPORTED_CORNER',lambda:create(mos,cfg(corners=['imaginary']))))
    case('supply range bound enforced',lambda:reject('PVT_RANGE',lambda:create(mos,cfg(supplies_V=[99]))))
    case('configured AC explicitly unsupported',lambda:reject('UNSUPPORTED_ANALYSIS',lambda:create(configured_source,cfg('ac',supply={'kind':'port','name':'D'}))))
    case('floating or grounded configured supply rejected',lambda:reject('PVT_SUPPLY_BINDING',lambda:create(configured_source,cfg('op',supply={'kind':'port','name':'B'}))))
    case('unknown direct scripts/settings rejected',lambda:reject('INVALID_PVT_CONFIG',lambda:create(mos,{**cfg(),'shell':'bad'})))
    case('complex AC branch metric rejected',lambda:reject('UNSUPPORTED_METRIC',lambda:create(mos,cfg('ac',metrics=[{'name':'current','source':'branch','key':'testbench/VD'}]))))
    case('generic voltage binding must be actual IR source',lambda:reject('PVT_SUPPLY_BINDING',lambda:create(S.get_project(rc['id']),generic_cfg('op')|{'supply':{'kind':'device','device_id':'r1'}})))

if __name__=='__main__':
    try:main()
    finally:
        report={'schema_version':1,'case_count':len(CASES),'passed':sum(c['result']=='pass' for c in CASES),'cases':CASES,'raw_folder':str(RUN),'vendor_execution_verified':False,'source_sha256':{p:S.profile.sha(S.WORKSPACE/p) for p in ['workers/eda/pvt.py','workers/eda/test_pvt.py','workers/eda/server.py','workers/eda/design_tools.py'] if (S.WORKSPACE/p).is_file()}}
        (RUN/'evidence.json').write_text(json.dumps(report,indent=2,default=str));(RUN.parent/'pvt.json').write_text(json.dumps(report,indent=2,default=str));print(json.dumps({'cases':report['case_count'],'passed':report['passed'],'raw_folder':str(RUN)}))
