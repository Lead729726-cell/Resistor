"""Actual process interruption against isolated native state, without restarting UI worker.

Run: docker exec mos-studio-eda /bin/bash -lc 'python3 /workspace/tests/integration/interruption.py'
"""
import json
import os
from pathlib import Path
import signal
import subprocess
import time
import urllib.request
import uuid

folder=Path('/workspace/.runtime/evidence/interruption-'+uuid.uuid4().hex)
folder.mkdir();state=folder/'state';token=uuid.uuid4().hex;port=8876
env={**os.environ,'MOS_STATE':str(state),'MOS_PORT':str(port),'MOS_BIND':'127.0.0.1','MOS_TOKEN':token}
log=(folder/'worker.log').open('w');worker=None
def start():
    process=subprocess.Popen(['python3','/workspace/workers/eda/server.py'],env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
    for _ in range(300):
        if process.poll() is not None:raise AssertionError('Isolated worker exited; inspect '+str(folder/'worker.log'))
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{port}/health',timeout=1) as response:
                if response.status==200:return process
        except OSError:time.sleep(.1)
    raise AssertionError('Isolated worker health timeout')
def rpc(method,params):
    request=urllib.request.Request(f'http://127.0.0.1:{port}/rpc',json.dumps({'method':method,'params':params}).encode(),{'Content-Type':'application/json','X-MOS-Token':token})
    with urllib.request.urlopen(request,timeout=90) as response:result=json.load(response)
    assert result['ok'],result.get('error');return result['result']
def descendants(pid):
    result=[]
    try:children={child for task in Path(f'/proc/{pid}/task').iterdir() for child in (task/'children').read_text().split()}
    except OSError:return result
    for child in children:result.extend(descendants(int(child)));result.append(int(child))
    return result
def stop(process,interrupt=False):
    if process is None or process.poll() is not None:return
    children=descendants(process.pid)
    os.killpg(process.pid,signal.SIGKILL if interrupt else signal.SIGTERM)
    process.wait(timeout=10)
    for pid in children:
        try:os.kill(pid,signal.SIGKILL)
        except ProcessLookupError:pass

try:
    worker=start()
    physical=rpc('project.create',{'example':'differential_pair','name':'Interrupted actual native engines'})
    jobs=[rpc('simulation.run',{'project_id':physical['id'],'analysis':'tran','post_layout':True,'duration_s':1e-3,'step_s':5e-9}) for _ in range(2)]
    mos=rpc('project.create',{'example':'mosfet','name':'Interrupted candidate coordinator'})
    exp=rpc('experiment.create',{'project_id':mos['id'],'algorithm':'grid','trial_budget':1,'wall_time_s':300,'variables':[{'device_id':'mn1','parameter':'w_um','min':.65,'max':1.3}],'objective':{'metric':'Id_max','goal':'maximize'}})
    exp=rpc('experiment.evaluate',{'experiment_id':exp['id']})
    for _ in range(300):
        exp=rpc('experiment.status',{'experiment_id':exp['id']})
        statuses=[rpc('job.status',{'run_id':j['id']}) for j in jobs]
        if exp['active_run_ids'] and all(j['execution_status']=='running' for j in statuses):break
        time.sleep(.1)
    assert exp['active_run_ids'],'Experiment did not submit an actual candidate gate'
    assert all(j['execution_status']=='running' for j in statuses)
    queued_id=exp['active_run_ids'][0];assert rpc('job.status',{'run_id':queued_id})['execution_status']=='queued'
    # Native manifests establish that both occupied slots launched real engines.
    for _ in range(100):
        logs=[rpc('job.logs',{'run_id':j['id']})['text'] for j in jobs]
        if all('ngspice' in text.lower() for text in logs):break
        time.sleep(.1)
    stop(worker,interrupt=True);worker=None
    worker=start()
    reopened=[rpc('job.status',{'run_id':j['id']}) for j in jobs]+[rpc('job.status',{'run_id':queued_id})]
    for job in reopened:
        assert job['execution_status']=='failed' and job['analysis_result']=='unknown',job
        assert 'Worker restarted' in rpc('job.logs',{'run_id':job['id']})['text']
    exp=rpc('experiment.status',{'experiment_id':exp['id']});assert exp['execution_status']=='failed',exp
    assert all(not trial['feasible'] and trial['score'] is None and trial['execution_status']=='failed' for trial in exp['trials'])
    assert not exp['active_run_ids']
    evidence={'case':'actual isolated worker interruption preserves failed/unknown native jobs and failed experiment','result':'pass','state_path':str(state),'jobs':[{'id':j['id'],'execution_status':j['execution_status'],'analysis_result':j['analysis_result'],'manifest_path':j['manifest_path']} for j in reopened],'experiment':exp,'worker_log':str(folder/'worker.log')}
    Path('/workspace/.runtime/evidence/interruption.json').write_text(json.dumps(evidence,indent=2))
    print('Actual isolated worker interruption: 2 running engines + queued candidate gate failed/unknown, experiment failed without feasible score PASS')
finally:
    stop(worker);log.close()
