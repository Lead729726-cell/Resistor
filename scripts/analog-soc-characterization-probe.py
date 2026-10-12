"""Detached native probe; does not open the live server/project database."""
import json
import subprocess
import sys
from pathlib import Path
sys.path.insert(0, '/workspace/workers/eda')
import analog_soc as A
import characterization as Q
import native
import profile

root=Path('/workspace/.runtime/analog-soc/characterization-probe'); root.mkdir(parents=True,exist_ok=True)
class Engine:
    profile=profile
    @staticmethod
    def dump(p,value): Path(p).write_text(json.dumps(value,indent=2,allow_nan=False))
    @staticmethod
    def process(run,folder,cmd,name,manifest,timeout):
        result=subprocess.run(cmd,cwd=folder,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=timeout)
        (folder/(name+'.log')).write_text(result.stdout)
        if result.returncode: raise RuntimeError(result.stdout[-3000:])
        return result.stdout
p=dict(cell='soc_miller_ota',ports=A.PARTS['soc_miller_ota'][2],design_template=dict(id='soc_miller_ota',parameters={}),testbench={})
for mode in sys.argv[1:] or ['noise','mismatch']:
    folder=root/(mode+'-'+str(__import__('time').time_ns())); folder.mkdir()
    net=folder/'core.spice'; net.write_text(native.emit(A.schematic('soc_miller_ota',{}),p['cell'],p['ports']))
    run=dict(artifacts={}); manifest={}
    Q.execute(Engine,run,p,folder,manifest,dict(analysis='op',characterization=dict(mode=mode)),net)
    print(json.dumps(dict(mode=mode,folder=str(folder),metrics=run['measurements'],verdict=run['reference_verification'])),flush=True)
