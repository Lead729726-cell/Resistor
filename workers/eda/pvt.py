"""Bounded PVT grids evaluated through the existing actual native job pool.

Each point owns an immutable private project. The parent circuit is never
edited. No metrics are substituted when a job fails or a vector is missing.
"""
from __future__ import annotations
import copy,hashlib,itertools,json,math,re,shutil,threading,time,uuid
from pathlib import Path
import native
import configured_analysis as CA
import current_flow
from geometry import EDAError

S=None
THREADS={}
TERMINAL={'completed','failed','canceled'}
BUILTIN_SOURCES={'inverter':['VVDD'],'mosfet':['VD'],'wire':['VIN'],'current_mirror':['VDOUT'],'differential_pair':['VOP','VON']}

def configure(server):
    global S
    S=server;S.DB.execute('CREATE TABLE IF NOT EXISTS pvt_studies(id TEXT PRIMARY KEY,data TEXT NOT NULL)');S.db_commit()
def put(study):
    with S.LOCK:S.DB.execute('INSERT OR REPLACE INTO pvt_studies VALUES(?,?)',(study['id'],json.dumps(study,allow_nan=False)));S.db_commit()
def raw_status(params):
    if not isinstance(params.get('project_id'),str):raise EDAError('PROJECT_REQUIRED','PVT requests require the source project scope.')
    with S.LOCK:row=S.DB.execute('SELECT data FROM pvt_studies WHERE id=?',(params.get('study_id'),)).fetchone()
    if not row:raise EDAError('NOT_FOUND','PVT study not found.')
    e=json.loads(row[0])
    if e['project_id']!=params['project_id']:raise EDAError('FORBIDDEN','PVT study belongs to another source project.')
    return e
def source_signature(project):
    if project.get('analysis_setup'):return CA.signature(project['analysis_setup']['profile_id'])
    return S.input_signature()
def source_path(study):return S.STATE/'pvt'/study['id']
def immutable_source(study):
    path=source_path(study)
    for name,expected in study['snapshot_hashes'].items():
        target=path/name
        if not target.is_file() or target.is_symlink() or S.profile.sha(target)!=expected:raise EDAError('PVT_INPUT_CHANGED','Immutable study source snapshot changed.')
    return json.loads((path/'source-project.json').read_text())
def freshness(e):
    try:
        p=S.get_project(e['project_id']);src=immutable_source(e)
        return 'current' if p['revision']==e['source_revision'] and source_signature(src)==e['source_signature'] else 'stale'
    except Exception:return 'stale'
def public(e):
    value=copy.deepcopy(e);value['freshness']=freshness(e);return value
def number(value,name,lo,hi):
    if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value) or not lo<=value<=hi:raise EDAError('PVT_RANGE',f'{name} must be finite in {lo}..{hi}.')
    return float(value)
def integer(value,name,lo,hi):
    if isinstance(value,bool) or not isinstance(value,int) or not lo<=value<=hi:raise EDAError('PVT_RANGE',f'{name} must be an integer in {lo}..{hi}.')
    return value
def text(value,name):
    if not isinstance(value,str) or not re.fullmatch(r'[A-Za-z0-9_.:+/ -]{1,160}',value):raise EDAError('INVALID_PVT_CONFIG','Invalid bounded '+name+'.')
    return value
def source_mode(p):
    if p.get('analysis_setup'):return 'configured-layout'
    if p.get('design_template'):return 'template'
    return 'builtin' if p['source']=='pdk' and p['example'] in BUILTIN_SOURCES else 'generic'
def config(raw,p):
    fields={'analysis','corners','temperatures_C','supplies_V','supply','metrics','constraints','settings','wall_time_s','point_timeout_s','max_parallel'}
    if not isinstance(raw,dict) or set(raw)-fields:raise EDAError('INVALID_PVT_CONFIG','Unknown PVT configuration fields.')
    c=copy.deepcopy(raw);analysis=c.get('analysis')
    if analysis not in {'op','dc','ac','tran'}:raise EDAError('UNSUPPORTED_ANALYSIS','Use OP/DC/AC/transient actual analysis.')
    if p.get('active_backend')=='commercial':raise EDAError('PVT_BACKEND_UNAVAILABLE','PVT actual engine scope is open-source; commercial tools remain an installation/license gate.')
    mode=source_mode(p)
    if mode=='configured-layout':
        setup=p['analysis_setup'];locked=S.pdk_registry.lock(setup['profile_id']);corners=locked['manifest']['corners'];temp_bounds=(-100,300);volt_bounds=(-100,100)
        if analysis=='ac':raise EDAError('UNSUPPORTED_ANALYSIS','Configured-layout AC is not supported by the actual configured pipeline.')
        if not locked['capabilities']['simulation'] or locked['fingerprint']!=setup['pdk_fingerprint']:raise EDAError('PROFILE_CHANGED','Configured PDK is unavailable or changed.')
        if S.profile.sha(S.snapshot_dir(p)/'layout.oas')!=setup['layout_sha256']:raise EDAError('LAYOUT_CHANGED','Configured geometry changed since actual port inspection.')
    else:
        corners=S.profile.capabilities()['supported_corners'];temp_bounds=(-40,125);volt_bounds=(.1,1.8)
        if not corners:raise EDAError('PDK_MISSING','Public model resources are unavailable.')
        check=native.validate(p['schematic'])
        if not check['valid']:raise EDAError('SCHEMATIC_INVALID','Fix the actual circuit before PVT evaluation.',check)
    for key in ('corners','temperatures_C','supplies_V'):
        values=c.get(key)
        if not isinstance(values,list) or not values or len(values)>32 or len(set(values))!=len(values):raise EDAError('PVT_RANGE','Each grid axis must contain1..32 distinct values.')
    if any(v not in corners for v in c['corners']):raise EDAError('UNSUPPORTED_CORNER','Corner is not declared by the actual pinned PDK profile.')
    c['temperatures_C']=[number(v,'temperature_C',*temp_bounds) for v in c['temperatures_C']];c['supplies_V']=[number(v,'supply_V',*volt_bounds) for v in c['supplies_V']]
    if len(c['corners'])*len(c['temperatures_C'])*len(c['supplies_V'])>32:raise EDAError('PVT_RANGE','Cartesian PVT grid is limited to32 actual runs.')
    supply=c.get('supply');settings=c.setdefault('settings',{})
    if not isinstance(supply,dict) or not isinstance(settings,dict):raise EDAError('INVALID_PVT_CONFIG','Explicit supply binding and typed analysis settings required.')
    if mode=='template':
        import design_tools
        declared=design_tools.pvt_sources(p)
        if supply not in declared['bindings']:raise EDAError('PVT_SUPPLY_BINDING','Select the exact active owned template voltage sources.')
        if analysis not in declared['analyses']:
            if p['design_template']['id']=='current_mirror' and analysis=='dc':raise EDAError('PVT_SWEPT_SUPPLY','VDOUT is swept by the mirror DC testbench and cannot also be a fixed supply condition.')
            raise EDAError('UNSUPPORTED_ANALYSIS','This analysis does not apply the selected template source as a variable fixed supply or pulse amplitude.')
        if set(settings)-{'duration_s','step_s','post_layout'}:raise EDAError('INVALID_PVT_CONFIG','Template PVT accepts only bounded transient timing; stimuli belong to the actual template.')
        if 'post_layout' in settings and not isinstance(settings['post_layout'],bool):raise EDAError('INVALID_PVT_CONFIG','post_layout must be boolean.')
        if settings.get('post_layout'):raise EDAError('UNSUPPORTED_ANALYSIS','Template PVT currently uses the native reference schematic; post-layout template batches are not verified.')
        if analysis!='tran' and set(settings)&{'duration_s','step_s'}:raise EDAError('INVALID_PVT_CONFIG','Transient timing has no effect on the selected template analysis.')
        native.testbench({**p.get('testbench',{}),**{key:v for key,v in settings.items() if key in native.TESTBENCH},'analysis':analysis})
    elif mode=='builtin':
        if set(supply)!={'kind','source_names'} or supply['kind']!='testbench' or supply['source_names']!=BUILTIN_SOURCES[p['example']]:raise EDAError('PVT_SUPPLY_BINDING','Select the exact active built-in testbench voltage source names.')
        if set(settings)-{'post_layout','duration_s','step_s','load_F','vds_V','vbs_V','vgs_V','dc_sweep','netlister'}:raise EDAError('INVALID_PVT_CONFIG','Unknown builtin analysis settings.')
        native.testbench({**p.get('testbench',{}),**{key:v for key,v in settings.items() if key in native.TESTBENCH},'analysis':analysis})
        if settings.get('dc_sweep','vgs') not in {'vgs','vds'} or settings.get('netlister','native') not in {'native','xschem'}:raise EDAError('INVALID_PVT_CONFIG','Unsupported native analysis selector.')
        if 'post_layout' in settings and not isinstance(settings['post_layout'],bool):raise EDAError('INVALID_PVT_CONFIG','post_layout must be boolean.')
        if p['example']=='wire' and not settings.get('post_layout'):raise EDAError('UNSUPPORTED_ANALYSIS','Wire requires actual post-layout extraction.')
        if p['example']=='mosfet':
            if analysis=='dc' and settings.get('dc_sweep')=='vds':raise EDAError('PVT_SWEPT_SUPPLY','VD is swept by DC analysis and cannot also represent a fixed supply condition.')
            if 'vgs_V' in settings:number(settings['vgs_V'],'vgs_V',0,1.8)
    elif mode=='configured-layout':
        if set(supply)!={'kind','name'} or supply['kind']!='port':raise EDAError('PVT_SUPPLY_BINDING','Configured analysis needs an actual named voltage-biased port.')
        row=next((r for r in p['analysis_setup']['ports'] if r['name']==supply['name']),None)
        if row is None or row['mode']!='voltage':raise EDAError('PVT_SUPPLY_BINDING','Supply port must be an actual configured voltage bias; floating/ground ports cannot vary.')
        if set(settings)-{'sweep_port','start_V','end_V','step_V','duration_s','step_s','pex'}:raise EDAError('INVALID_PVT_CONFIG','Unknown configured analysis overrides.')
        merged={**p['analysis_setup'],**settings,'analysis':analysis}
        if analysis=='dc':
            swept=next((r for r in merged['ports'] if r['name']==merged.get('sweep_port')),None)
            if swept is None or swept['mode']!='voltage':raise EDAError('INVALID_SWEEP','Select an actual voltage-biased sweep port.')
            if merged['sweep_port']==supply['name']:raise EDAError('PVT_SWEPT_SUPPLY','A DC-swept port cannot also be the fixed supply condition.')
            lo=number(merged.get('start_V',0),'start_V',-100,100);hi=number(merged.get('end_V',1.8),'end_V',-100,100);step=number(merged.get('step_V',.01),'step_V',-100,100)
            if step==0 or (hi-lo)*step<=0 or abs((hi-lo)/step)>200000:raise EDAError('INVALID_SWEEP','DC sweep must advance with at most200000 nominal samples.')
            settings.update(start_V=lo,end_V=hi,step_V=step,sweep_port=merged['sweep_port'])
        if 'pex' in settings and not isinstance(settings['pex'],bool):raise EDAError('INVALID_PVT_CONFIG','pex must be boolean.')
    else:
        if set(supply)!={'kind','device_id'} or supply['kind']!='device':raise EDAError('PVT_SUPPLY_BINDING','Generic schematic needs an actual voltage-source device ID.')
        device=next((d for d in p['schematic']['devices'] if d['id']==supply['device_id']),None)
        if device is None or device['kind']!='voltage':raise EDAError('PVT_SUPPLY_BINDING','Supply binding must resolve to an actual voltage-source device.')
        # Generic analysis grammar is shared with the design tools native adapter.
        if set(settings)-{'dc_source_id','start_V','end_V','step_V','duration_s','step_s','ac_source_id','ac_start_Hz','ac_end_Hz','ac_points_dec'}:raise EDAError('INVALID_PVT_CONFIG','Unknown generic analysis settings.')
        if analysis=='dc' and settings.get('dc_source_id')==supply['device_id']:raise EDAError('PVT_SWEPT_SUPPLY','The swept device cannot also be a fixed supply condition.')
        if not any('0' in d['pins'].values() for d in p['schematic']['devices']):raise EDAError('GROUND_REQUIRED','Generic IR must contain explicit actual reference node0.')
        if analysis in {'dc','ac'}:
            selected=settings.get('dc_source_id' if analysis=='dc' else 'ac_source_id');source=next((d for d in p['schematic']['devices'] if d['id']==selected),None)
            if source is None or source['kind']!='voltage':raise EDAError('PVT_STIMULUS_REQUIRED','Select an actual top-level IR voltage source for DC/AC analysis.')
        if analysis=='dc':
            lo=number(settings.get('start_V',0),'start_V',-100,100);hi=number(settings.get('end_V',1.8),'end_V',-100,100);step=number(settings.get('step_V',.01),'step_V',-100,100)
            if step==0 or (hi-lo)*step<=0 or abs((hi-lo)/step)>200000:raise EDAError('INVALID_SWEEP','DC sweep must advance with at most200000 nominal points.')
            settings.update(start_V=lo,end_V=hi,step_V=step)
        if analysis=='ac':
            settings['ac_start_Hz']=number(settings.get('ac_start_Hz',1),'ac_start_Hz',1e-3,1e12);settings['ac_end_Hz']=number(settings.get('ac_end_Hz',1e9),'ac_end_Hz',settings['ac_start_Hz'],1e12);settings['ac_points_dec']=integer(settings.get('ac_points_dec',30),'ac_points_dec',1,1000)
            if settings['ac_start_Hz']==settings['ac_end_Hz'] or math.log10(settings['ac_end_Hz']/settings['ac_start_Hz'])*settings['ac_points_dec']>200000:raise EDAError('PVT_RANGE','AC sweep needs ascending frequencies and at most200000 nominal samples.')
    if analysis=='tran':
        duration=number(settings.get('duration_s',p.get('analysis_setup',p.get('testbench',{})).get('duration_s',30e-9)),'duration_s',1e-12,.001);step=number(settings.get('step_s',p.get('analysis_setup',p.get('testbench',{})).get('step_s',20e-12)),'step_s',1e-12,duration)
        if duration/step>200000:raise EDAError('PVT_RANGE','Transient permits at most200000 nominal samples.')
        settings.update(duration_s=duration,step_s=step)
    metrics=c.get('metrics')
    if not isinstance(metrics,list) or not 1<=len(metrics)<=16:raise EDAError('INVALID_PVT_CONFIG','Choose1..16 actual measurement/vector metrics.')
    names=set()
    for m in metrics:
        if not isinstance(m,dict) or set(m)-{'name','source','key','reduction','absolute'} or m.get('source') not in {'measurement','waveform','branch'}:raise EDAError('INVALID_PVT_CONFIG','Metric must explicitly select actual measurement, waveform or signed branch.')
        text(m.get('name'),'metric name');text(m.get('key'),'metric vector key')
        if m['name'] in names:raise EDAError('INVALID_PVT_CONFIG','Metric names must be unique.')
        names.add(m['name']);m.setdefault('absolute',False)
        if not isinstance(m['absolute'],bool) or m.get('reduction','max') not in {'min','max','mean','last'}:raise EDAError('INVALID_PVT_CONFIG','Invalid metric reduction.')
        if m['source']!='measurement':m.setdefault('reduction','max')
        if analysis=='ac' and m['source']=='branch':raise EDAError('UNSUPPORTED_METRIC','Complex AC current arrows are unsupported; use actual magnitude/phase waveforms.')
    constraints=c.setdefault('constraints',[])
    if not isinstance(constraints,list) or len(constraints)>32:raise EDAError('INVALID_PVT_CONFIG','At most32 actual metric constraints.')
    for row in constraints:
        if not isinstance(row,dict) or set(row)!={'metric','op','value'} or row['metric'] not in names or row['op'] not in {'<=','>='}:raise EDAError('INVALID_PVT_CONFIG','Constraints must bind a declared metric.')
        row['value']=number(row['value'],'constraint',-1e100,1e100)
    c['wall_time_s']=number(c.get('wall_time_s',300),'wall_time_s',60,1800);c['point_timeout_s']=number(c.get('point_timeout_s',120),'point_timeout_s',5,300);c['max_parallel']=integer(c.get('max_parallel',1),'max_parallel',1,2)
    return c,mode

def create(params):
    replay=S.completed_receipt('pvt.create',params)
    if replay is not None:return replay
    p=S.get_project(params['project_id']);expected=params.get('expected_revision')
    if isinstance(expected,bool) or not isinstance(expected,int) or expected!=p['revision']:raise EDAError('REVISION_CONFLICT','PVT create requires the current source expected_revision.')
    c,mode=config(params.get('config'),p);src=S.history_project(p['id'],p['revision']);signature=source_signature(src);sid=uuid.uuid4().hex;folder=S.STATE/'pvt'/sid;folder.mkdir(parents=True)
    shutil.copyfile(S.snapshot_dir(src)/'layout.oas',folder/'source-layout.oas');S.dump(folder/'source-project.json',src)
    snapshot_hashes={name:S.profile.sha(folder/name) for name in ('source-layout.oas','source-project.json')}
    points=[{'id':uuid.uuid4().hex,'index':i,'condition':{'corner':corner,'temperature_C':temperature,'supply_V':supply},'execution_status':'queued','analysis_result':'unknown','metrics':{},'constraints_pass':None} for i,(corner,temperature,supply) in enumerate(itertools.product(c['corners'],c['temperatures_C'],c['supplies_V']))]
    e={'id':sid,'project_id':src['id'],'source_revision':src['revision'],'source_signature':signature,'layout_sha256':snapshot_hashes['source-layout.oas'],'snapshot_hashes':snapshot_hashes,'mode':mode,'config':c,'execution_status':'created','created_at':S.now(),'points':points,'active_run_ids':[],'summary':{},'notes':['Actual native runs only. Supply binding is explicit and recorded for every point.','Process corner may have no effect on ideal primitives without process-dependent models.','No statistical yield, foundry signoff or commercial execution is claimed.']}
    def action():
        if source_signature(src)!=signature:raise EDAError('PVT_INPUT_CHANGED','PDK/tool resources changed during study creation.')
        put(e);return public(e)
    return S.mutate('pvt.create',params,action)

def summarize(e):
    summary={}
    for metric in e['config']['metrics']:
        key=metric['name'];valid=[p for p in e['points'] if p['execution_status']=='completed' and p['analysis_result']=='pass' and key in p['metrics']]
        if valid:
            lo=min(valid,key=lambda p:p['metrics'][key]);hi=max(valid,key=lambda p:p['metrics'][key]);summary[key]={'min':lo['metrics'][key],'max':hi['metrics'][key],'min_point_id':lo['id'],'max_point_id':hi['id'],'min_condition':lo['condition'],'max_condition':hi['condition'],'valid_points':len(valid)}
    e['summary']=summary;e['counts']={state:sum(p['execution_status']==state for p in e['points']) for state in ('queued','running','completed','failed','canceled')};e['all_constraints_pass']=all(p.get('constraints_pass') is True for p in e['points'])
    worst=[]
    for constraint in e['config']['constraints']:
        metric=summary.get(constraint['metric'])
        if metric:
            end='max' if constraint['op']=='<=' else 'min';value=metric[end];worst.append({**constraint,'worst_value':value,'point_id':metric[end+'_point_id'],'condition':metric[end+'_condition'],'pass':value<=constraint['value'] if constraint['op']=='<=' else value>=constraint['value']})
    e['worst_constraints']=worst;return e
def extract_metrics(run,config):
    values={}
    for m in config['metrics']:
        if m['source']=='measurement':data=[run.get('measurements',{}).get(m['key'])]
        elif m['source']=='waveform':
            found=next((v for v in run.get('waveforms',[]) if v['name']==m['key']),None);data=found.get('y',[]) if found else []
        else:
            found=next((v for v in run.get('current_flow',{}).get('branches',[]) if v['id']==m['key'] or v['name']==m['key']),None);data=found.get('values_A',[]) if found else []
        if not data or any(isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) for v in data):raise EDAError('PVT_METRIC_MISSING','Actual run has no finite selected metric: '+m['key'])
        if m['absolute']:data=[abs(v) for v in data]
        reduction=m.get('reduction','last' if m['source']=='measurement' else 'max');value=min(data) if reduction=='min' else max(data) if reduction=='max' else sum(data)/len(data) if reduction=='mean' else data[-1]
        values[m['name']]=value
    constraints=all(values[c['metric']]<=c['value'] if c['op']=='<=' else values[c['metric']]>=c['value'] for c in config['constraints']);return values,constraints

def point_project(e,point,source):
    p=copy.deepcopy(source);condition=point['condition'];c=e['config'];p.update(id=uuid.uuid4().hex,name=f'PVT {e["id"][:8]} point{point["index"]+1}',revision=1,next_revision=2,runs=[],undo_stack=[],redo_stack=[],pvt_point={'study_id':e['id'],'parent_project_id':e['project_id'],'source_revision':e['source_revision'],'point_id':point['id'],'condition':condition,'supply_binding':c['supply']})
    if e['mode']=='configured-layout':
        setup=p['analysis_setup'];setup.update(c['settings'],analysis=c['analysis'],corner=condition['corner'],temperature_C=condition['temperature_C'])
        row=next(r for r in setup['ports'] if r['name']==c['supply']['name']);row['dc_V']=condition['supply_V']
    elif e['mode'] in {'builtin','template'}:
        setup={**p.get('testbench',{}),**{key:v for key,v in c['settings'].items() if key in native.TESTBENCH},'analysis':c['analysis'],'corner':condition['corner'],'temperature_C':condition['temperature_C']}
        if e['mode']=='builtin' and p['example']=='mosfet':setup['vds_V']=condition['supply_V']
        else:setup['supply_V']=condition['supply_V']
        p['testbench']=native.testbench(setup)
    else:
        next(d for d in p['schematic']['devices'] if d['id']==c['supply']['device_id'])['parameters']['dc']=condition['supply_V']
        p['pvt_generic_settings']={**c['settings'],'analysis':c['analysis'],'corner':condition['corner'],'temperature_C':condition['temperature_C']}
    l=S.k.Layout();l.read(str(source_path(e)/'source-layout.oas'))
    with S.LOCK:return S.commit(p,l,analysis_configuration=e['mode']=='configured-layout')

def submit(e,point,p):
    params={'project_id':p['id'],'expected_revision':p['revision'],'command_id':'pvt:'+point['id'],**e['config']['settings'],'analysis':e['config']['analysis'],'corner':point['condition']['corner'],'temperature_C':point['condition']['temperature_C']}
    if e['mode']=='configured-layout':return S.rpc('analysis.run',params)
    if e['mode'] in {'builtin','template'}:
        params.update(p['testbench'])
        if e['mode']=='builtin' and p['example']=='mosfet':params['vgs_V']=e['config']['settings'].get('vgs_V',S.history_project(e['project_id'],e['source_revision']).get('testbench',{}).get('supply_V',1.8)/2)
        return S.rpc('simulation.run',params)
    rid=uuid.uuid4().hex;folder=S.STATE/'runs'/rid;folder.mkdir(parents=True);shutil.copyfile(S.snapshot_dir(p)/'layout.oas',folder/'input.oas');S.load_layout(p).write(str(folder/(p['cell']+'.gds')));S.dump(folder/'project.json',p)
    run={'id':rid,'project_id':p['id'],'revision':p['revision'],'kind':'simulation','workflow':'pvt-generic','execution_status':'queued','analysis_result':'unknown','freshness':'current','artifacts':{},'manifest_path':str(folder/'manifest.json'),'input_signature':e['source_signature'],'pvt_study_id':e['id']}
    S.put_run(run);S.POOL.submit(S.execute_job,run,p,{'_pvt':True,**p['pvt_generic_settings']},folder);return run

def start(params):
    raw_status(params);replay=S.completed_receipt('pvt.start',params)
    if replay is not None:return replay
    launch=[False]
    def action():
        e=raw_status(params)
        if e['execution_status']!='created':return public(e)
        if freshness(e)!='current':raise EDAError('PVT_STALE','Source revision, snapshot or PDK resources changed before start.')
        running=sum(json.loads(row[0])['execution_status']=='running' for row in S.DB.execute('SELECT data FROM pvt_studies'))
        if running>=2:raise EDAError('PVT_CONCURRENCY','At most two PVT studies may run at once; native jobs share the existing two-worker pool.')
        e.update(execution_status='running',started_at=S.now(),deadline_epoch_s=time.time()+e['config']['wall_time_s']);put(e);launch[0]=True;return public(e)
    value=S.mutate('pvt.start',params,action)
    if launch[0]:
        thread=threading.Thread(target=run_study,args=(value['id'],value['project_id']),daemon=True,name='register-pvt-'+value['id'][:8]);THREADS[value['id']]=thread;thread.start()
    return value
def cancel(params,reason='user_canceled'):
    raw_status(params);active=[]
    def action():
        e=raw_status(params)
        if e['execution_status'] not in TERMINAL:
            active.extend(e['active_run_ids']);e.update(execution_status='canceled',stop_reason=reason,ended_at=S.now())
            for point in e['points']:
                if point['execution_status'] in {'queued','running'}:point.update(execution_status='canceled',analysis_result='unknown',error_code='PVT_CANCELED',message=reason,metrics={},constraints_pass=None)
            summarize(e);put(e)
        return public(e)
    value=S.mutate('pvt.cancel',params,action)
    for rid in active:S.rpc('job.cancel',{'run_id':rid})
    return value

def run_study(sid,pid):
    scope={'study_id':sid,'project_id':pid}
    try:
        e=raw_status(scope);source=immutable_source(e)
        while True:
            e=raw_status(scope)
            if e['execution_status']!='running':return
            if time.time()>=e['deadline_epoch_s']:cancel(scope,'aggregate_wall_time_exceeded');return
            if source_signature(source)!=e['source_signature']:raise EDAError('PVT_INPUT_CHANGED','Actual model/deck/tool input hash changed during evaluation.')
            for point in e['points']:
                if point['execution_status']!='running':continue
                run=S.get_run(point['run_id'])
                if run['execution_status'] not in TERMINAL and time.time()-point['submitted_epoch_s']>=e['config']['point_timeout_s']:
                    S.rpc('job.cancel',{'run_id':run['id']});run=S.get_run(run['id']);point['error_code']='PVT_POINT_TIMEOUT'
                if run['execution_status'] in TERMINAL:
                    point.update(execution_status='failed',analysis_result=run['analysis_result'],elapsed_s=run.get('elapsed_s'),manifest_path=run.get('manifest_path'),message=run.get('message'))
                    if run['execution_status']=='completed' and run['analysis_result']=='pass':
                        try:metrics,passed=extract_metrics(run,e['config']);point.update(execution_status='completed',metrics=metrics,constraints_pass=passed)
                        except EDAError as err:point.update(error_code=err.code,message=str(err),metrics={},constraints_pass=None)
                    else:point.setdefault('error_code','PVT_NATIVE_FAILED')
            with S.LOCK:
                current=raw_status(scope)
                if current['execution_status']!='running':return
                current['points']=e['points'];current['active_run_ids']=[p['run_id'] for p in e['points'] if p['execution_status']=='running'];summarize(current);put(current);e=current
            free=e['config']['max_parallel']-len(e['active_run_ids'])
            for point in [p for p in e['points'] if p['execution_status']=='queued'][:free]:
                p=point_project(e,point,source)
                with S.LOCK:
                    current=raw_status(scope)
                    if current['execution_status']!='running':return
                    actual=next(v for v in current['points'] if v['id']==point['id']);job=submit(current,actual,p);actual.update(project_id=p['id'],run_id=job['id'],execution_status='running',submitted_epoch_s=time.time(),supply_binding=current['config']['supply']);current['active_run_ids'].append(job['id']);put(current)
            e=raw_status(scope)
            if all(p['execution_status'] in TERMINAL for p in e['points']):
                with S.LOCK:
                    e=raw_status(scope)
                    if e['execution_status']!='running':return
                    e.update(execution_status='completed',ended_at=S.now(),active_run_ids=[]);summarize(e);put(e)
                return
            time.sleep(.1)
    except Exception as err:
        with S.LOCK:
            e=raw_status(scope)
            if e['execution_status']!='running':return
            active=list(e['active_run_ids']);e.update(execution_status='failed',error_code=getattr(err,'code','ENGINE_ERROR'),message=str(err),ended_at=S.now(),active_run_ids=[])
            for point in e['points']:
                if point['execution_status'] in {'queued','running'}:point.update(execution_status='failed',analysis_result='unknown',metrics={},constraints_pass=None,error_code=e['error_code'])
            summarize(e);put(e)
        for rid in active:S.rpc('job.cancel',{'run_id':rid})
    finally:THREADS.pop(sid,None)

def recover_interrupted():
    with S.LOCK:
        for row in list(S.DB.execute('SELECT data FROM pvt_studies')):
            e=json.loads(row[0])
            if e['execution_status']=='running':
                e.update(execution_status='failed',stop_reason='worker_restarted',error_code='WORKER_RESTARTED',ended_at=S.now(),active_run_ids=[])
                for point in e['points']:
                    if point['execution_status'] in {'queued','running'}:point.update(execution_status='failed',analysis_result='unknown',metrics={},constraints_pass=None,error_code='WORKER_RESTARTED')
                summarize(e);put(e)
def execute(run,p,folder,manifest,params):
    import design_tools
    if not p.get('pvt_point') or p['pvt_point']['parent_project_id']==p['id']:raise EDAError('INVALID_PVT_POINT','Generic native execution requires an actual private point snapshot.')
    analysis=params['analysis'];netlist=folder/'reference.spice';text_=native.emit(p['schematic'],p['cell'],p['ports']);lines=text_.splitlines();active=False;nets=set();source_name=None
    selected_id=params.get('dc_source_id' if analysis=='dc' else 'ac_source_id')
    selected=next((d for d in p['schematic']['devices'] if d['id']==selected_id),None)
    selected_name='V'+selected['name'] if selected else None
    for index,line in enumerate(lines):
        fields=line.split()
        if fields and fields[0].lower()=='.subckt':active=fields[1]==p['cell'];continue
        if fields and fields[0].lower()=='.ends':active=False;continue
        if not active or not fields:continue
        prefix=fields[0][0].upper();count=4 if prefix=='X' and any(d.get('model') in {'sky130_fd_pr__nfet_01v8','sky130_fd_pr__pfet_01v8_hvt'} and 'X'+d['name']==fields[0] for d in p['schematic']['devices']) else len(fields)-2 if prefix=='X' else 2
        nets.update(fields[1:1+count])
        if fields[0]==selected_name:
            source_name='v.xu.'+selected_name.lower()
            if analysis=='ac':lines[index]=line+' AC 1'
    if analysis in {'dc','ac'} and source_name is None:raise EDAError('PVT_STIMULUS_REQUIRED','Actual emitted top subcircuit lacks the selected voltage stimulus.')
    netlist.write_text('\n'.join(lines)+'\n');branches=[];warnings=[];probe=netlist
    if analysis!='ac':probe,branches,warnings=current_flow.prepare(p,netlist,folder,False)
    outputs=sorted(n for n in nets if n!='0')
    if not outputs or len(outputs)>64:raise EDAError('PVT_VECTOR_LIMIT','Generic PVT requires1..64 actual top-level circuit nodes.')
    for node in outputs:
        if not native.NET.fullmatch(node):raise EDAError('UNSUPPORTED_NAME','Actual node syntax is outside the safe expression subset.')
    models=design_tools.supported_model_deck(folder,params['corner']);deck=['Register actual generic PVT circuit',f'.include "{models}"','.option scale=1e-6',f'.include "{probe}"',f'.temp {params["temperature_C"]:.12g}','XU '+' '.join(p['ports'])+' '+p['cell'],'.control','set num_threads=1','set noaskquit','set wr_singlescale','set wr_vecnames']
    if analysis=='op':deck+=['op'];xunit='point';xlabel='OP'
    elif analysis=='dc':deck+=[f'dc {source_name} {params["start_V"]:.12g} {params["end_V"]:.12g} {params["step_V"]:.12g}'];xunit='V';xlabel=selected_name
    elif analysis=='tran':deck+=[f'tran {params["step_s"]:.12g} {params["duration_s"]:.12g}'];xunit='s';xlabel='time'
    else:deck+=[f'ac dec {params["ac_points_dec"]} {params["ac_start_Hz"]:.12g} {params["ac_end_Hz"]:.12g}'];xunit='Hz';xlabel='frequency'
    vectors=[];names=[];units=[]
    for node in outputs:
        expression='v('+('' if node in p['ports'] else 'xu.')+node+')'
        if analysis=='ac':vectors.extend(['mag('+expression+')','ph('+expression+')']);names.extend([node+'_magnitude',node+'_phase']);units.extend(['V/V','rad'])
        else:vectors.append(expression);names.append(node);units.append('V')
    deck += [f'let pvt_wave_{i} = {expression}' for i,expression in enumerate(vectors)];deck+=['wrdata waveform.dat '+' '.join('pvt_wave_'+str(i) for i in range(len(vectors))),'write waveform.raw','quit','.endc','.end'];content='\n'.join(deck)+'\n'
    if branches:content=current_flow.instrument_control(content,branches)
    path=folder/'testbench.spice';path.write_text(content);log=S.process(run,folder,['ngspice','-b',str(path)],'ngspice',manifest)
    if any(t in log.lower() for t in ('fatal error','timestep too small','unknown subckt','singular matrix','error on line','simulation interrupted','no such device')):raise EDAError('SIMULATION_FAILED','Generic PVT ngspice failed; actual log retained.')
    data=folder/'waveform.dat'
    if not data.is_file():raise EDAError('SIMULATION_FAILED','Actual generic ngspice waveform is missing.')
    rows=[[float(v) for v in row.split()] for row in data.read_text().splitlines()[1:]]
    if not rows or any(len(row)!=len(names)+1 or any(not math.isfinite(v) for v in row) for row in rows):raise EDAError('PARSER_FAILED','Generic native waveform columns are missing/nonfinite.')
    measurements={'analysis':analysis,'corner':params['corner'],'temperature_C':params['temperature_C'],'supply_V':p['pvt_point']['condition']['supply_V'],'x_unit':xunit,'x_label':xlabel,'samples':len(rows)}
    run['waveforms']=[{'name':name,'unit':unit,'x':[r[0] for r in rows],'y':[r[i+1] for r in rows]} for i,(name,unit) in enumerate(zip(names,units))]
    for waveform in run['waveforms']:measurements[waveform['name']+'_min']=min(waveform['y']);measurements[waveform['name']+'_max']=max(waveform['y'])
    if branches:
        flow=current_flow.read(folder,p,analysis,xunit,branches,S.load_layout(p));flow.update(project_id=p['id'],run_id=run['id'],notes=[current_flow.METHOD,*warnings]);run['current_flow']=flow;run['artifacts'].update(current_flow_data=str(folder/'current-flow.dat'),current_probe_netlist=str(probe));measurements['current_flow_status']='available_partial' if warnings else 'available'
    elif analysis=='ac':measurements['current_flow_status']='unsupported_complex_ac'
    run.update(tool='ngspice',analysis_result='pass',measurements=measurements,message=f'Actual generic PVT ngspice {analysis}: {len(rows)} samples.')
    run['artifacts'].update(reference_netlist=str(netlist),testbench=str(path),waveform_data=str(data),waveform_raw=str(folder/'waveform.raw'))
    manifest['pvt_point']=p['pvt_point'];manifest['model_files']=design_tools.model_resources(params['corner']);manifest['settings']['ngspice_num_threads']=1
    manifest['generic_scope']='Actual native IR netlist; explicit DC supply, selected source sweep/AC1V, constant bias transient. No inferred geometry linkage.'

def sources(params):
    p=S.get_project(params['project_id']);mode=source_mode(p)
    if mode=='template':
        import design_tools
        declared=design_tools.pvt_sources(p);bindings=declared['bindings'];analyses=declared['analyses'];corners=S.profile.capabilities()['supported_corners']
    elif mode=='builtin':bindings=[{'kind':'testbench','source_names':BUILTIN_SOURCES[p['example']]}];corners=S.profile.capabilities()['supported_corners'];analyses=['op','dc','ac','tran']
    elif mode=='configured-layout':bindings=[{'kind':'port','name':row['name']} for row in p['analysis_setup']['ports'] if row['mode']=='voltage'];corners=S.pdk_registry.lock(p['analysis_setup']['profile_id'])['manifest']['corners'];analyses=['op','dc','tran']
    else:bindings=[{'kind':'device','device_id':d['id']} for d in p['schematic']['devices'] if d['kind']=='voltage'];corners=S.profile.capabilities()['supported_corners'];analyses=['op','dc','ac','tran']
    return {'project_id':p['id'],'revision':p['revision'],'mode':mode,'bindings':bindings,'corners':corners,'analyses':analyses,'limits':{'max_points':32,'max_parallel':2,'max_running_studies':2,'wall_time_s':[60,1800],'point_timeout_s':[5,300]}}
def rpc(method,params):
    allowed={'pvt.sources':{'project_id'},'pvt.create':{'project_id','config','expected_revision','command_id'},'pvt.start':{'project_id','study_id','expected_revision','command_id'},'pvt.status':{'project_id','study_id'},'pvt.list':{'project_id'},'pvt.cancel':{'project_id','study_id','expected_revision','command_id'}}
    if method not in allowed or set(params)-allowed[method]:raise EDAError('INVALID_REQUEST','Unknown typed PVT parameters.')
    if method=='pvt.create':return create(params)
    if method=='pvt.sources':return sources(params)
    if method=='pvt.start':return start(params)
    if method=='pvt.status':return public(raw_status(params))
    if method=='pvt.cancel':return cancel(params)
    if method=='pvt.list':
        if not isinstance(params.get('project_id'),str):raise EDAError('PROJECT_REQUIRED','PVT list requires source project ID.')
        S.get_project(params['project_id'])
        with S.LOCK:rows=[json.loads(row[0]) for row in S.DB.execute('SELECT data FROM pvt_studies ORDER BY rowid')]
        return [public(e) for e in rows if e['project_id']==params['project_id']]
    raise EDAError('UNSUPPORTED','Unknown PVT method.')
