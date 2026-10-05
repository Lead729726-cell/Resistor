"""Genuine concurrent edited-inverter regression; tolerances/steps stay unchanged."""
import concurrent.futures
import json
import os
from pathlib import Path
import signal
import subprocess
import time
import urllib.request
import uuid

folder=Path('/workspace/.runtime/evidence/thread-budget-'+uuid.uuid4().hex);folder.mkdir()
port=8878;token=uuid.uuid4().hex;log=(folder/'worker.log').open('w');worker=None
env={**os.environ,'MOS_STATE':str(folder/'state'),'MOS_PORT':str(port),'MOS_BIND':'127.0.0.1','MOS_TOKEN':token}
def rpc(method,params):
    request=urllib.request.Request(f'http://127.0.0.1:{port}/rpc',json.dumps({'method':method,'params':params}).encode(),{'Content-Type':'application/json','X-MOS-Token':token})
    with urllib.request.urlopen(request,timeout=30) as response:result=json.load(response)
    assert result['ok'],result.get('error');return result['result']
def wait(run):
    start=time.monotonic()
    while time.monotonic()-start<90:
        run=rpc('job.status',{'run_id':run['id']})
        if run['execution_status'] not in {'queued','running'}:
            assert run['execution_status']=='completed' and run['analysis_result']=='pass',run.get('message');return run
        time.sleep(.05)
    raise AssertionError('Original 90-second completion bound exceeded')
def rows(path):return [[float(v) for v in line.split()] for line in path.read_text().splitlines()[1:]]
try:
    worker=subprocess.Popen(['python3','/workspace/workers/eda/server.py'],env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
    for _ in range(300):
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{port}/health',timeout=1) as response:
                if response.status==200:break
        except OSError:time.sleep(.1)
    p=rpc('project.create',{'example':'inverter','name':'Native concurrent edited inverter'})
    p=rpc('schematic.apply_command',{'project_id':p['id'],'command':{'type':'update_device','id':'mn1','parameters':{'w_um':1.3}}})
    assert next(d for d in p['schematic']['devices'] if d['id']=='mn1')['parameters']['w_um']==1.3
    start=time.monotonic()
    jobs=[rpc('simulation.run',{'project_id':p['id'],'analysis':'tran'}) for _ in range(2)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:runs=list(pool.map(wait,jobs))
    parallel_elapsed=time.monotonic()-start;evidence=[]
    for run in runs:
        manifest=json.loads(Path(run['manifest_path']).read_text());deck=Path(run['artifacts']['testbench']).read_text()
        assert manifest['settings']['ngspice_num_threads']==1 and 'set num_threads=1\n' in deck
        assert run['measurements']['samples']==1544 and run['revision']==p['revision']
        n=next(b for b in run['current_flow']['branches'] if b.get('device_id')=='mn1')
        pm=next(b for b in run['current_flow']['branches'] if b.get('device_id')=='mp1')
        assert max(n['values_A'])>1e-7 and min(pm['values_A'])<-1e-7
        evidence.append({'case':'Concurrent native edited inverter W=1.3: genuine transient and signed currents','result':'pass','run_id':run['id'],'manifest_path':run['manifest_path'],'elapsed_s':run['elapsed_s'],'samples':len(n['values_A']),'nmos_max_A':max(n['values_A']),'pmos_min_A':min(pm['values_A']),'num_threads':1})
    # Direct replay with eight threads provides a numeric reference, not a mock.
    # Only model-evaluation parallelism changes; netlist, solver options and
    # analysis settings remain byte-identical outside that control assignment.
    run=runs[0];reference=folder/'eight-thread-reference';reference.mkdir()
    original=Path(run['artifacts']['testbench']).read_text();(reference/'testbench.spice').write_text(original.replace('set num_threads=1\n','set num_threads=8\n'))
    with (reference/'ngspice.log').open('w') as f:
        process=subprocess.run(['ngspice','-b','testbench.spice'],cwd=reference,stdout=f,stderr=subprocess.STDOUT,timeout=120)
    assert process.returncode==0
    errors={}
    for name in ('waveform.dat','current-flow.dat'):
        a=rows(Path(run['manifest_path']).parent/name);b=rows(reference/name)
        assert len(a)==len(b) and all(len(x)==len(y) for x,y in zip(a,b))
        maximum=max(abs(x-y) for left,right in zip(a,b) for x,y in zip(left,right));assert maximum<1e-12,(name,maximum);errors[name]=maximum
    evidence.append({'case':'Single-thread and eight-thread real output compatibility','result':'pass','run_id':run['id'],'reference_path':str(reference),'maximum_absolute_errors':errors})
    summary={'schema_version':1,'cases':evidence,'source_state':str(folder),'parallel_wall_seconds':parallel_elapsed,'original_completion_bound_s':90,'model_and_tolerance_changes':False,
        'reference':'https://ngspice.sourceforge.io/docs/ngspice-manual.pdf (Ngspice on multi-core processors using OpenMP)'}
    Path('/workspace/.runtime/evidence/current-thread-budget.json').write_text(json.dumps(summary,indent=2));print(json.dumps(summary),flush=True)
finally:
    if worker and worker.poll() is None:os.killpg(worker.pid,signal.SIGTERM);worker.wait(timeout=10)
    log.close()
