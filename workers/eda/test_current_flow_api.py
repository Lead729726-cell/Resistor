"""Verify the live authenticated worker and retain exact result/geometry authority IDs."""
import hashlib
import json
from pathlib import Path
import time
import urllib.request

workspace=Path('/workspace');config=json.loads((workspace/'.runtime/worker.json').read_text())
def rpc(method,params):
    request=urllib.request.Request('http://127.0.0.1:8765/rpc',json.dumps({'method':method,'params':params}).encode(),{'Content-Type':'application/json','X-MOS-Token':config['token']})
    with urllib.request.urlopen(request,timeout=90) as response:body=json.load(response)
    assert body['ok'],body.get('error');return body['result']
p=rpc('project.create',{'example':'mosfet','name':'Actual signed current live API verification'})
scene=rpc('view.get_scene',{'project_id':p['id'],'max_shapes':2000});ids=sorted(shape['id'] for shape in scene['shapes']);cases=[]
for analysis in ('dc','op'):
    run=rpc('simulation.run',{'project_id':p['id'],'analysis':analysis})
    for _ in range(1800):
        run=rpc('job.status',{'run_id':run['id']})
        if run['execution_status'] not in {'queued','running'}:break
        time.sleep(.1)
    assert run['execution_status']=='completed' and run['analysis_result']=='pass',run['message']
    flow=run['current_flow'];assert flow['project_id']==p['id'] and flow['revision']==scene['revision']==run['revision'] and flow['run_id']==run['id']
    assert hashlib.sha256(Path(run['artifacts']['testbench']).parent.joinpath('input.oas').read_bytes()).hexdigest()==flow['layout_sha256']
    branch=next(branch for branch in flow['branches'] if branch.get('device_id')=='mn1');assert branch['mapping']=='device_terminals' and max(branch['values_A'])>1e-7
    labels={label['text']:label['position'] for label in scene['labels'] if label['text'] in {'D','S'}}
    assert branch['path_dbu']==[labels['D'],labels['S']]
    source=next(branch for branch in flow['branches'] if branch['id']=='testbench/VD');assert min(source['values_A'])<0 and source['source_vector']=='i(VD)'
    after=rpc('view.get_scene',{'project_id':p['id'],'max_shapes':2000});assert sorted(shape['id'] for shape in after['shapes'])==ids
    cases.append({'case':'live authenticated '+analysis+' current flow bound to actual scene/immutable geometry','result':'pass','project_id':p['id'],'run_id':run['id'],'revision':run['revision'],'scene_shape_count':len(ids),'scene_ids_sha256':hashlib.sha256(json.dumps(ids).encode()).hexdigest(),'manifest_path':run['manifest_path'],'current_flow':flow})
collision_node='register_cf_node_'+hashlib.sha256(('mosfet\0xmn1').encode()).hexdigest()[:16]
p=rpc('schematic.apply_command',{'project_id':p['id'],'command':{'type':'add_device','device':{'id':'collision_probe','name':'CLAMP','kind':'voltage','pins':{'+':collision_node,'-':'S'},'parameters':{'dc':.2}}}})
run=rpc('simulation.run',{'project_id':p['id'],'analysis':'op'})
for _ in range(1800):
    run=rpc('job.status',{'run_id':run['id']})
    if run['execution_status'] not in {'queued','running'}:break
    time.sleep(.1)
assert run['execution_status']=='completed' and run['analysis_result']=='pass',run['message']
flow=run['current_flow'];branch=next(branch for branch in flow['branches'] if branch.get('device_id')=='mn1')
assert branch['values_A'][0]>1e-7 and abs(branch['values_A'][0]-cases[1]['current_flow']['branches'][0]['values_A'][0])<1e-10
probe=Path(run['artifacts']['current_probe_netlist']).read_text();mos_line=next(line.split() for line in probe.splitlines() if line.startswith('XMN1 '));assert mos_line[1]!=collision_node
cases.append({'case':'deliberately colliding native net name retains independent 0.2V clamp and unchanged actual MOS drain current','result':'pass','project_id':p['id'],'run_id':run['id'],'revision':run['revision'],'manifest_path':run['manifest_path'],'collision_net':collision_node,'current_flow':flow})
exported=rpc('layout.export',{'project_id':p['id'],'format':'gds'});imported=rpc('project.create',{'example':'fixture','name':'Imported GDS cannot self-authorize spatial current mapping'})
imported=rpc('layout.import',{'project_id':imported['id'],'path':exported['path']});assert imported['import_metadata']['sidecar_preserved'] and imported['source']=='pdk'
run=rpc('simulation.run',{'project_id':imported['id'],'analysis':'op'})
for _ in range(1800):
    run=rpc('job.status',{'run_id':run['id']})
    if run['execution_status'] not in {'queued','running'}:break
    time.sleep(.1)
assert run['execution_status']=='completed' and run['analysis_result']=='pass',run['message']
flow=run['current_flow'];assert all(branch['mapping']=='unmapped' and 'path_dbu' not in branch for branch in flow['branches']);assert max(next(branch for branch in flow['branches'] if branch.get('device_id')=='mn1')['values_A'])>1e-7
cases.append({'case':'actual sidecar-preserved GDS import retains signed ngspice values but cannot authorize physical paths','result':'pass','project_id':imported['id'],'run_id':run['id'],'revision':run['revision'],'manifest_path':run['manifest_path'],'current_flow':flow})
live={'schema_version':1,'cases':cases};live_path=workspace/'.runtime/evidence/current-flow-live-final.json';live_path.write_text(json.dumps(live,indent=2))
isolated=json.loads((workspace/'.runtime/evidence/current-flow.json').read_text());assert len(isolated['cases'])==16 and all(case['result']=='pass' for case in isolated['cases'])
combined={'schema_version':1,'case_count':20,'isolated_actual_engine':isolated,'live_authenticated_api':live,'limits':['AC current directions are unsupported because native values are complex phasors.','MOS drain-terminal arrows include displacement current; current is not assumed to flow exclusively into the source.','Only actual named single-MOS D/S anchors currently have spatial mappings. Inverter, testbench, resistor/source and imported-GDS branches remain unmapped, including imports with app sidecars.','Paths are terminal-anchor links, not reconstructed conductor current-density fields.','Post-layout flow records core MOS and active voltage-source branches; distributed extracted R/C currents are not included.']}
dest=workspace/'docs/evidence/current-flow.json';dest.parent.mkdir(exist_ok=True)
if dest.exists():
    previous=dest.read_bytes();backup=dest.with_name('current-flow-prior-'+hashlib.sha256(previous).hexdigest()[:16]+'.json')
    if not backup.exists():backup.write_bytes(previous)
dest.write_text(json.dumps(combined,indent=2))
print('Live signed MOS DC/OP + authority IDs/geometry SHA + colliding-node and imported-GDS mapping guard: 4 API cases PASS; preserved 16 isolated cases and previous live evidence.')
