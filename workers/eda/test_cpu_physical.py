"""Independent full CPU reference-layout audit; preserve native failures and timing."""
import hashlib,json,os,time,uuid
from pathlib import Path
ROOT=Path('/workspace');OUT=ROOT/'.runtime/evidence'/('cpu-physical-'+uuid.uuid4().hex);OUT.mkdir(parents=True)
SOURCE=['workers/eda/digital_units.py','workers/eda/digital_mux.py','workers/eda/server.py','workers/eda/current_flow.py','workers/eda/test_cpu_physical.py']
SOURCE_HASHES={f:hashlib.sha256((ROOT/f).read_bytes()).hexdigest() for f in SOURCE}
os.environ['MOS_STATE']=str(OUT/'state');os.environ['MOS_TOKEN']='isolated-not-a-credential'
os.environ['PATH']='/foss/tools/magic/bin:/foss/tools/netgen/bin:/foss/tools/ngspice/bin:'+os.environ['PATH']
import server as S
import geometry as G
cases=[];PERIOD=float(os.environ.get('REGISTER_CPU_PERIOD_NS','400'))
p=S.rpc('digital.create',{'kind':'cpu4','physical':True,'period_ns':PERIOD,'command_id':uuid.uuid4().hex,'name':'CPU full physical audit'})
scene=G.scene(S.load_layout(p),p,p['layers'],{'max_shapes':100000})
def save():
    data={'schema_version':1,'project_id':p['id'],'revision':p['revision'],'state_root':str(OUT/'state'),'physical_shapes':scene['total_shape_count'],'whole_scene':not scene['truncated'],'period_ns':PERIOD,'cases':cases,'foundry_signoff':False,'source_sha256':SOURCE_HASHES}
    (ROOT/'docs/evidence/cpu-physical-native.json').write_text(json.dumps(data,indent=2));(OUT/'result.json').write_text(json.dumps(data,indent=2))
def stage(name,method,**extra):
    started=time.monotonic();r=S.rpc(method,{'project_id':p['id'],'expected_revision':p['revision'],**(p['testbench'] if method=='simulation.run' else {}),**extra});deadline=time.monotonic()+780
    print('START '+name+' '+r['id'],flush=True)
    while (r:=S.get_run(r['id']))['execution_status'] in ('queued','running') and time.monotonic()<deadline:time.sleep(.25)
    row={'stage':name,'run_id':r['id'],'execution_status':r['execution_status'],'analysis_result':r['analysis_result'],'elapsed_s':time.monotonic()-started,'message':r.get('message'),'markers':len(r.get('markers',[])),'parasitics':r.get('parasitics'),'artifacts':r.get('artifacts'),'unit_verification':r.get('unit_verification')}
    cases.append(row);save();print(json.dumps({k:v for k,v in row.items() if k not in ('artifacts','unit_verification')}),flush=True)
    if r['execution_status'] in ('queued','running'):S.rpc('job.cancel',{'run_id':r['id']});raise RuntimeError('Audit deadline exceeded; native cancellation requested.')
    return r
save()
for name,method in [('drc','verification.run_drc'),('lvs','verification.run_lvs'),('pex','extraction.run_pex')]:
    result=stage(name,method)
    if result['execution_status']!='completed' or result['analysis_result']!='pass':raise RuntimeError('Native '+name+' did not pass; evidence retained.')
result=stage('post-layout-'+format(PERIOD,'g')+'ns','simulation.run',post_layout=True)
if result['execution_status']!='completed':raise RuntimeError('Post-layout execution failed; evidence retained.')
