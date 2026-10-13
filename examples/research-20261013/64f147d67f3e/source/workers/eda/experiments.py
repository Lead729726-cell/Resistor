"""Bounded, seeded search. Every objective comes from native verified candidate runs."""
import copy
import itertools
import json
import math
import random
import threading
import time
import uuid
import native
from geometry import EDAError

BACKEND=None
METRICS={'Id_max','Id_min','area_um2','power_W'}
def configure(backend):
    global BACKEND
    BACKEND=backend
    BACKEND.DB.execute('CREATE TABLE IF NOT EXISTS experiments(id TEXT PRIMARY KEY,data TEXT NOT NULL)'); BACKEND.db_commit()
def put(e):
    with BACKEND.LOCK:
        row=BACKEND.DB.execute('SELECT data FROM experiments WHERE id=?',(e['id'],)).fetchone()
        if row:
            old=json.loads(row[0])
            if old['execution_status']=='canceled': e['execution_status']='canceled'; e['ended_at']=old.get('ended_at')
        BACKEND.DB.execute('INSERT OR REPLACE INTO experiments VALUES(?,?)',(e['id'],json.dumps(e))); BACKEND.db_commit()
def status(params):
    with BACKEND.LOCK:
        row=BACKEND.DB.execute('SELECT data FROM experiments WHERE id=?',(params['experiment_id'],)).fetchone()
        if not row: raise EDAError('NOT_FOUND','Experiment not found.')
        return json.loads(row[0])
def create(params):
    p=BACKEND.get_project(params['project_id'])
    if p['example']!='mosfet' or p['source']!='pdk' or p.get('manual_layout_edits'): raise EDAError('UNSUPPORTED_EXPERIMENT','Verified physical candidate evaluation currently requires the unmodified public single-MOS PCell.')
    algorithm=params.get('algorithm','grid'); budget=params.get('trial_budget',4); variables=copy.deepcopy(params.get('variables',[])); objective=params.get('objective',{'metric':'Id_max','goal':'maximize'}); constraints=params.get('constraints',[]); wall_time=native.num(params.get('wall_time_s',300))
    if not 60<=wall_time<=1800: raise EDAError('EXPERIMENT_RANGE','Aggregate wall_time_s must be 60..1800 seconds.')
    if algorithm not in {'grid','random','tpe'} or isinstance(budget,bool) or not isinstance(budget,int) or not 1<=budget<=16: raise EDAError('EXPERIMENT_RANGE','Use grid/random/tpe and 1..16 trials.')
    if not 1<=len(variables)<=2: raise EDAError('EXPERIMENT_RANGE','Choose one or two MOS W/L variables.')
    seen=set()
    for v in variables:
        key=(v.get('device_id'),v.get('parameter'))
        if key in seen or key[0]!='mn1' or key[1] not in {'w_um','l_um'}: raise EDAError('UNSUPPORTED_VARIABLE','Only unique mn1 w_um/l_um variables are physically mapped.')
        seen.add(key); lo=native.num(v.get('min')); hi=native.num(v.get('max')); limits=(.42,100) if key[1]=='w_um' else (.15,20)
        if not limits[0]<=lo<hi<=limits[1]: raise EDAError('PARAMETER_RANGE','Search variable bounds exceed the tested app subset.')
        if abs(lo/.005-round(lo/.005))>1e-7 or abs(hi/.005-round(hi/.005))>1e-7: raise EDAError('OFF_GRID','Physical search bounds must align to the 0.005um manufacturing grid.')
        steps=v.get('steps',max(2,budget))
        if isinstance(steps,bool) or not isinstance(steps,int) or not 2<=steps<=16: raise EDAError('EXPERIMENT_RANGE','Grid variable steps must be 2..16.')
        v.update(min=lo,max=hi,steps=steps)
    if objective.get('metric') not in METRICS or objective.get('goal') not in {'minimize','maximize'}: raise EDAError('INVALID_OBJECTIVE','Choose a supported actual measurement and goal.')
    for c in constraints:
        if c.get('metric') not in METRICS or c.get('op') not in {'<=','>='}: raise EDAError('INVALID_CONSTRAINT','Constraint must refer to a supported actual metric.')
        c['value']=native.num(c.get('value'))
    seed=params.get('seed',0)
    if isinstance(seed,bool) or not isinstance(seed,int) or not 0<=seed<=2147483647: raise EDAError('EXPERIMENT_RANGE','Seed must be a nonnegative 32-bit integer.')
    settings=native.testbench({**p.get('testbench',{}),**params.get('settings',{}),'analysis':'dc'})
    e={'id':uuid.uuid4().hex,'project_id':p['id'],'source_revision':p['revision'],'execution_status':'queued','algorithm':algorithm,'variables':variables,'objective':objective,'constraints':constraints,'trial_budget':budget,'wall_time_s':wall_time,'seed':seed,'settings':settings,'trials':[],'created_at':BACKEND.now(),'active_run_ids':[],'limits':['MOS nf=m=1; actual PCell regeneration, Magic DRC, Netgen LVS and ngspice DC required for every feasible candidate.','area_um2 is the actual layout bounding-box footprint; power_W is Vds times maximum sampled drain current.','TPE is a local seeded univariate Parzen density search; no cloud/AI service or fabricated evaluation.']}
    put(e); return e
def evaluate(params):
    e=status(params)
    if e['execution_status']!='queued': return e
    running=sum(1 for row in BACKEND.DB.execute('SELECT data FROM experiments') if json.loads(row[0])['execution_status']=='running')
    if running>=2: raise EDAError('EXPERIMENT_CONCURRENCY','At most two experiments may run at once.')
    e.update(execution_status='running',started_at=BACKEND.now(),deadline_epoch_s=time.time()+e['wall_time_s']); put(e)
    threading.Thread(target=run,args=(e['id'],),daemon=True,name='register-experiment-'+e['id'][:8]).start(); return e
def cancel(params):
    e=status(params)
    if e['execution_status'] in {'queued','running'}:
        e.update(execution_status='canceled',ended_at=BACKEND.now()); put(e)
        for rid in e.get('active_run_ids',[]): BACKEND.rpc('job.cancel',{'run_id':rid})
    return e
def compare(params):
    e=status(params); sign=1 if e['objective']['goal']=='minimize' else -1
    ranked=sorted((t for t in e['trials'] if t.get('feasible')),key=lambda t:sign*t['score'])
    return {'experiment_id':e['id'],'objective':e['objective'],'trials':ranked,'best_trial_id':ranked[0]['id'] if ranked else None,'source':'actual-native-gated-evaluations'}
def candidate(e,rng,index):
    variables=e['variables']
    if e['algorithm']=='grid':
        axes=[[v['min']+(v['max']-v['min'])*i/(v['steps']-1) for i in range(v['steps'])] for v in variables]; points=list(itertools.product(*axes)); count=min(e['trial_budget'],len(points)); selected=0 if count==1 else round(index*(len(points)-1)/(count-1)); return list(points[selected])
    feasible=[t for t in e['trials'] if t.get('feasible')]
    if e['algorithm']=='random' or len(feasible)<3: return [rng.uniform(v['min'],v['max']) for v in variables]
    sign=1 if e['objective']['goal']=='minimize' else -1; values=sorted(feasible,key=lambda t:sign*t['score']); cut=max(1,math.ceil(len(values)*.25)); good=values[:cut]; bad=values[cut:]
    def density(x,items,j,v):
        span=v['max']-v['min']; centers=[t['values'][j] for t in items]; mean=sum(centers)/len(centers); sigma=max(span*.08,math.sqrt(sum((c-mean)**2 for c in centers)/len(centers)))
        return .1/span+.9*sum(math.exp(-.5*((x-c)/sigma)**2)/(sigma*math.sqrt(2*math.pi)) for c in centers)/len(centers)
    options=[]
    for _ in range(64):
        base=rng.choice(good)['values']; point=[min(v['max'],max(v['min'],rng.gauss(base[j],(v['max']-v['min'])*.15))) for j,v in enumerate(variables)]
        ratio=sum(math.log(density(point[j],good,j,v))-math.log(density(point[j],bad,j,v)) for j,v in enumerate(variables)); options.append((ratio,point))
    return max(options,key=lambda t:t[0])[1]
def wait_run(eid,submitted):
    while True:
        state=status({'experiment_id':eid})
        if time.time()>=state.get('deadline_epoch_s',float('inf')):
            state=cancel({'experiment_id':eid}); state['stop_reason']='aggregate_wall_time_exceeded';put(state);raise EDAError('EXPERIMENT_TIMEOUT','Aggregate experiment wall time exceeded; active native run canceled.')
        if state['execution_status']=='canceled': BACKEND.rpc('job.cancel',{'run_id':submitted['id']}); raise EDAError('CANCELED','Experiment canceled.')
        r=BACKEND.get_run(submitted['id'])
        if r['execution_status'] not in {'queued','running'}: return r
        time.sleep(.1)
def run(eid):
    e=status({'experiment_id':eid}); rng=random.Random(e['seed']); source=BACKEND.history_project(e['project_id'],e['source_revision'])
    total=e['trial_budget']
    if e['algorithm']=='grid': total=min(total,math.prod(v['steps'] for v in e['variables']))
    try:
        for index in range(total):
            e=status({'experiment_id':eid})
            if e['execution_status']=='canceled': return
            if time.time()>=e['deadline_epoch_s']:
                e=cancel({'experiment_id':eid});e['stop_reason']='aggregate_wall_time_exceeded';put(e);return
            values=[round(round(value/.005)*.005,12) for value in candidate(e,rng,index)]; trial={'id':uuid.uuid4().hex,'index':index,'values':values,'parameters':{v['parameter']:value for v,value in zip(e['variables'],values)},'feasible':False,'score':None,'execution_status':'running','runs':[]}
            p=copy.deepcopy(source); l=BACKEND.load_layout(source); p.update(id=uuid.uuid4().hex,name=f'Experiment {eid[:8]} trial {index+1}',revision=1,next_revision=2,undo_stack=[],redo_stack=[],runs=[],origin_experiment_id=eid,origin_project_id=e['project_id'],origin_revision=e['source_revision'])
            with BACKEND.LOCK: p=BACKEND.commit(p,l)
            trial['project_id']=p['id']; trial['candidate_project_id']=p['id']; e['trials'].append(trial); put(e)
            try:
                p=BACKEND.mutate('layout.apply_command',{'project_id':p['id'],'expected_revision':1,'command_id':eid+':'+str(index),'command':{'type':'update_device','id':'mn1','parameters':trial['parameters']}},lambda:BACKEND.edit(p['id'],{'type':'update_device','id':'mn1','parameters':trial['parameters']},'layout'))
                trial['revision']=p['revision']; gates=[]
                for method in ('verification.run_drc','verification.run_lvs'):
                    submitted=BACKEND.rpc(method,{'project_id':p['id'],'expected_revision':p['revision'],'command_id':eid+':'+str(index)+':'+method}); e['active_run_ids']=[submitted['id']]; put(e); r=wait_run(eid,submitted); gates.append(r); trial['runs'].append({'id':r['id'],'kind':r['kind'],'execution_status':r['execution_status'],'analysis_result':r['analysis_result'],'manifest_path':r['manifest_path']})
                if any(r['execution_status']!='completed' or r['analysis_result']!='pass' for r in gates): trial.update(execution_status='completed',reason='Native DRC/LVS gate failed; no objective score assigned.')
                else:
                    submitted=BACKEND.rpc('simulation.run',{'project_id':p['id'],'expected_revision':p['revision'],'command_id':eid+':'+str(index)+':simulation',**e['settings']}); e['active_run_ids']=[submitted['id']]; put(e); r=wait_run(eid,submitted); trial['runs'].append({'id':r['id'],'kind':r['kind'],'execution_status':r['execution_status'],'analysis_result':r['analysis_result'],'manifest_path':r['manifest_path']})
                    if r['execution_status']!='completed' or r['analysis_result']!='pass': trial.update(execution_status='failed',reason=r.get('message','Native simulation failed.'))
                    else:
                        layout=BACKEND.load_layout(p); b=layout.cell(p['cell']).bbox(); metrics={'Id_max':r['measurements']['Id_max'],'Id_min':r['measurements']['Id_min'],'area_um2':b.width()*b.height()*layout.dbu**2,'power_W':e['settings']['vds_V']*r['measurements']['Id_max']}
                        feasible=all(metrics[c['metric']]<=c['value'] if c['op']=='<=' else metrics[c['metric']]>=c['value'] for c in e['constraints'])
                        trial.update(execution_status='completed',metrics=metrics,measurements=metrics,feasible=feasible,score=metrics[e['objective']['metric']] if feasible else None,reason='Actual gates and objective constraints passed.' if feasible else 'Actual objective constraint failed.')
            except Exception as err:
                trial.update(execution_status='canceled' if getattr(err,'code',None)=='CANCELED' else 'failed',reason=str(err),error_code=getattr(err,'code','ENGINE_ERROR'))
            with BACKEND.LOCK:
                current=status({'experiment_id':eid}); current['trials'][-1]=trial; current['active_run_ids']=[]; put(current)
                if current['execution_status']=='canceled': return
        e=status({'experiment_id':eid}); e.update(execution_status='completed',ended_at=BACKEND.now()); put(e); ranked=compare({'experiment_id':eid}); e['best_trial_id']=ranked['best_trial_id']; put(e)
    except Exception as err:
        e=status({'experiment_id':eid}); e.update(execution_status='failed',message=str(err),ended_at=BACKEND.now()); put(e)
