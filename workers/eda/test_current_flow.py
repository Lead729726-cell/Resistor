"""Actual signed-current regression on an isolated native server, not UI mocks.

docker exec mos-studio-eda /bin/bash -lc 'python3 /workspace/workers/eda/test_current_flow.py'
"""
import bisect
import json
import math
import os
from pathlib import Path
import signal
import subprocess
import time
import urllib.request
import uuid

folder=Path('/workspace/.runtime/evidence/current-flow-'+uuid.uuid4().hex);folder.mkdir();token=uuid.uuid4().hex;port=8877
env={**os.environ,'MOS_STATE':str(folder/'state'),'MOS_PORT':str(port),'MOS_BIND':'127.0.0.1','MOS_TOKEN':token}
log=(folder/'worker.log').open('w');worker=None;evidence=[]
def rpc(method,params):
    request=urllib.request.Request(f'http://127.0.0.1:{port}/rpc',json.dumps({'method':method,'params':params}).encode(),{'Content-Type':'application/json','X-MOS-Token':token})
    with urllib.request.urlopen(request,timeout=90) as response:result=json.load(response)
    assert result['ok'],result.get('error');return result['result']
def wait(job):
    for _ in range(1800):
        job=rpc('job.status',{'run_id':job['id']})
        if job['execution_status'] not in {'queued','running'}:
            assert job['execution_status']=='completed' and job['analysis_result']=='pass',(job['message'],job['manifest_path']);return job
        time.sleep(.1)
    raise AssertionError('Native job timeout')
def branch(run,device_id):return next(b for b in run['current_flow']['branches'] if b.get('device_id')==device_id)
def record(name,run):
    flow=run['current_flow'];evidence.append({'case':name,'result':'pass','run_id':run['id'],'manifest_path':run['manifest_path'],'revision':run['revision'],'analysis':flow['analysis'],'samples':len(flow['x']),
        'branches':[{**{key:value for key,value in b.items() if key!='values_A'},'min_A':min(b['values_A']),'max_A':max(b['values_A'])} for b in flow['branches']],
        'voltage_nodes':[{'net':v['net'],'source_vector':v['source_vector'],'min_V':min(v['values_V']),'max_V':max(v['values_V'])} for v in flow['node_voltages']]})
def baseline_compare(run):
    artifacts=run['artifacts'];source=Path(artifacts['testbench']).read_text().replace(artifacts['current_probe_netlist'],artifacts['reference_netlist'])
    source='\n'.join(line for line in source.splitlines() if 'register_flow_' not in line and 'register_voltage_' not in line and 'current-flow.dat' not in line and 'node-voltages.dat' not in line and not line.startswith('save all '))+'\n'
    output=folder/('baseline-'+run['id']);output.mkdir();deck=output/'baseline.spice';deck.write_text(source)
    process=subprocess.run(['ngspice','-b',str(deck)],cwd=output,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=120);(output/'ngspice.log').write_text(process.stdout)
    assert process.returncode==0,process.stdout
    rows=[[float(v) for v in line.split()] for line in (output/'waveform.dat').read_text().splitlines()[1:]]
    axis=[row[0] for row in rows];errors=[]
    for column,wave in enumerate(run['waveforms'][:2],1):
        maximum=0
        for x,y in zip(wave['x'],wave['y']):
            j=min(len(rows)-1,max(1,bisect.bisect_left(axis,x)));a,b=rows[j-1],rows[j]
            interpolated=a[column]+(b[column]-a[column])*(x-a[0])/(b[0]-a[0]) if b[0]!=a[0] else b[column]
            maximum=max(maximum,abs(y-interpolated))
        errors.append(maximum)
    assert max(errors)<1e-4,errors
    evidence.append({'case':'zero-volt probes preserve existing '+run['measurements']['analysis']+' voltage/current waveform columns','result':'pass','run_id':run['id'],'max_absolute_column_errors':errors,'baseline_path':str(output)})

try:
    worker=subprocess.Popen(['python3','/workspace/workers/eda/server.py'],env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
    for _ in range(300):
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{port}/health',timeout=1) as response:
                if response.status==200:break
        except OSError:time.sleep(.1)
    projects={example:rpc('project.create',{'example':example,'name':'Actual signed current '+example}) for example in ('mosfet','inverter')}
    for example,p in projects.items():
        for post in (False,True):
            for analysis in ('op','dc','tran'):
                run=wait(rpc('simulation.run',{'project_id':p['id'],'analysis':analysis,'post_layout':post}));flow=run['current_flow']
                assert flow['source']=='ngspice' and flow['convention']=='conventional' and flow['analysis']==analysis
                assert flow['revision']==run['revision'] and flow['project_id']==p['id'] and flow['run_id']==run['id']
                assert all(len(b['values_A'])==len(flow['x']) and all(math.isfinite(i) for i in b['values_A']) for b in flow['branches'])
                volts={v['net'].lower():v['values_V'] for v in flow['node_voltages']}
                assert all(len(v)==len(flow['x']) and all(math.isfinite(n) for n in v) for v in volts.values())
                assert all(b['from_net'].lower() in volts and b['to_net'].lower() in volts for b in flow['branches'])
                assert all(v==0 for v in volts['0'])
                for wave in run['waveforms']:
                    net=wave['name'].lower() if example=='inverter' else 'g' if wave['name']=='Vgs' else None
                    if net and net in volts:assert max(abs(a-b) for a,b in zip(wave['y'],volts[net]))<1e-10
                assert all(b['mapping']=='unmapped' and 'path_dbu' not in b for b in flow['branches'] if b['id'].startswith('testbench/'))
                n=branch(run,'mn1');assert max(n['values_A'])>1e-7
                if example=='mosfet':
                    assert n['mapping']=='device_terminals' and len(n['path_dbu'])==2
                    vd=next(b for b in flow['branches'] if b['id']=='testbench/VD')
                    if analysis in ('op','dc'):assert max(abs(a+b) for a,b in zip(n['values_A'],vd['values_A']))<1e-9
                    if not post and analysis=='dc':baseline_compare(run)
                else:
                    pm=branch(run,'mp1');assert min(pm['values_A'])<-1e-7
                    assert n['mapping']=='unmapped' and pm['mapping']=='unmapped'
                    if analysis in ('op','dc'):assert max(abs(a+b) for a,b in zip(n['values_A'],pm['values_A']))<1e-8
                    if not post and analysis=='tran':baseline_compare(run)
                record(f'{example} {analysis} post_layout={post}: actual signed drain/source branches',run)
    p=projects['mosfet']
    for device in [{'id':'rtest','name':'RTEST','kind':'resistor','pins':{'+':'D','-':'S'},'parameters':{'value':1000}}, {'id':'itest','name':'ITEST','kind':'current','pins':{'+':'D','-':'S'},'parameters':{'dc':-1e-5}}]:
        p=rpc('schematic.apply_command',{'project_id':p['id'],'command':{'type':'add_device','device':device}})
    run=wait(rpc('simulation.run',{'project_id':p['id'],'analysis':'op'}));assert abs(branch(run,'rtest')['values_A'][0]-1.8e-3)<1e-10;assert abs(branch(run,'itest')['values_A'][0]+1e-5)<1e-12
    assert branch(run,'rtest')['mapping']=='unmapped' and branch(run,'itest')['mapping']=='unmapped';record('actual resistor/current-source signed current including negative source direction',run)
    run=wait(rpc('simulation.run',{'project_id':projects['inverter']['id'],'analysis':'ac'}));assert 'current_flow' not in run and run['measurements']['current_flow_status']=='unsupported_complex_ac';evidence.append({'case':'complex AC phasors never emitted as scalar current directions','result':'pass','run_id':run['id'],'manifest_path':run['manifest_path']})
    Path('/workspace/.runtime/evidence/current-flow.json').write_text(json.dumps({'schema_version':1,'cases':evidence,'source_state':str(folder),'references':['https://ngspice.sourceforge.io/docs/ngspice-manual.pdf (independent source convention and Save commands)']},indent=2))
    print(f'{len(evidence)} actual-engine signed-current and compatibility regressions PASS')
finally:
    if worker and worker.poll() is None:os.killpg(worker.pid,signal.SIGTERM);worker.wait(timeout=10)
    log.close()
