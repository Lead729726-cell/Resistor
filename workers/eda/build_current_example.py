"""Export a verified immutable native OP snapshot as a portable read-only view."""
import hashlib
import json
from pathlib import Path
import klayout.db as k
import geometry
import profile

root=Path('/workspace')
evidence=json.loads((root/'docs/evidence/current-flow.json').read_text())
cases=next(value['cases'] for value in evidence.values() if isinstance(value,dict) and any(case.get('current_flow') for case in value.get('cases',[])))
case=next(case for case in cases if case.get('current_flow',{}).get('analysis')=='op' and any(b['mapping']=='device_terminals' for b in case['current_flow']['branches']))
flow=case['current_flow'];folder=root/'.runtime/eda/runs'/flow['run_id']
assert hashlib.sha256((folder/'input.oas').read_bytes()).hexdigest()==flow['layout_sha256']
p=json.loads((folder/'project.json').read_text())
assert p['id']==flow['project_id'] and p['revision']==flow['revision']
l=k.Layout();l.read(str(folder/'input.oas'))
scene=geometry.scene(l,p,profile.layers(l),{'max_shapes':20000})
bundle={'schema_version':1,'kind':'register-view','name':'실제 SKY130 MOS · ngspice OP 전류','scene':scene,'currentFlow':flow,
        'display':{'projection':'orthographic','preset':'iso','explode':0,'clip':{'axis':'none','fraction':1},'layers':{},'showLabels':True}}
(root/'examples/sky130/current-viewer.register-view.json').write_text(json.dumps(bundle,ensure_ascii=False,indent=2))
print(json.dumps({'run_id':flow['run_id'],'shapes':len(scene['shapes']),'current_A':next(b['values_A'][0] for b in flow['branches'] if b['mapping']=='device_terminals')}))
