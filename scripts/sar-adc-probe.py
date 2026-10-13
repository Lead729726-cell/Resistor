"""Detached native probe: no live project database imports."""
import sys,json,subprocess
from pathlib import Path
sys.path.insert(0,'/workspace/workers/eda')
import sar_adc as A,native,design_tools,physical_library as P,floorplan as F
class Engine:
    design_tools=design_tools
    def process(self,run,folder,args,name,manifest,timeout=120):
        r=subprocess.run(args,cwd=folder,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=timeout)
        (folder/(name+'.log')).write_text(r.stdout)
        if r.returncode:raise RuntimeError(name+' '+r.stdout[-2500:])
        return r.stdout
root=Path('/workspace/.runtime/sar8/probe-sweep' if '--sweep' in sys.argv else '/workspace/.runtime/sar8/probe');root.mkdir(parents=True,exist_ok=True)
ir=A.schematic('sar8_analog');assert native.validate(ir)['valid'],native.validate(ir)
if '--physical' in sys.argv:ir,_=P.materialize(ir)
values={**A.DEFAULTS,'sweep_codes':int('--sweep' in sys.argv)}
p=dict(cell='sar8_analog',ports=ir['ports'],schematic=ir,testbench=A.recommended_settings(values),design_template=dict(id='sar8_analog',parameters=values))
run=dict(artifacts={},measurements={});A.execute(Engine(),run,p,root,{'settings':{}},{})
(root/'result.json').write_text(json.dumps(run,indent=2)+'\n')
print(json.dumps(run['reference_verification']),flush=True)
if '--layout' in sys.argv:
    flat,replacements=P.materialize(ir);folder=root/'generator'
    l=P.physical(folder,flat,p['cell'],p['ports'],F.policy());l.write(str(root/'sar8_analog.gds'))
    print(json.dumps(dict(primitives=len(flat['devices']),floorplan=F.inspect(l,p['cell'],F.policy()))),flush=True)
