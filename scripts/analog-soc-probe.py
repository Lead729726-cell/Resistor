"""Detached native test: never opens the live server project database."""
import sys, json, subprocess
from pathlib import Path
sys.path.insert(0, '/workspace/workers/eda')
import numpy as np
import analog_soc as A
import native, design_tools, physical_library

root=Path('/workspace/.runtime/analog-soc/probe');root.mkdir(parents=True,exist_ok=True)
for kind in sys.argv[1:] or A.CATALOG:
    folder=root/kind;folder.mkdir(exist_ok=True)
    ir=A.schematic(kind,A.DEFAULTS)
    assert native.validate(ir)['valid'], native.validate(ir)
    p=dict(cell=kind,ports=ir['ports'],design_template=dict(id=kind,parameters=A.DEFAULTS))
    net=folder/'core.spice';net.write_text(native.emit(ir,kind,ir['ports']))
    settings=native.testbench(A.SETTINGS[kind]);deck=design_tools.supported_model_deck(folder,'tt')
    tb,names,units,xunit,xlabel=A.spice_tb(p,folder,settings,net,deck,p['ports'])
    r=subprocess.run(['ngspice','-b',str(tb)],cwd=folder,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=240)
    (folder/'ngspice.log').write_text(r.stdout)
    if r.returncode: print(r.stdout[-3000:]);raise RuntimeError(kind)
    arr=np.loadtxt(folder/'waveform.dat',skiprows=1,ndmin=2)
    if arr.shape[1] != len(names)+1:print(r.stdout[-3000:]);raise RuntimeError((kind,arr.shape,names))
    run=dict(measurements={},waveforms=[dict(name=n,unit=u,x=arr[:,0].tolist(),y=arr[:,i+1].tolist()) for i,(n,u) in enumerate(zip(names,units))])
    A.measurements(p,run,settings)
    (folder/'result.json').write_text(json.dumps(run['measurements'],indent=2))
    print(json.dumps(dict(kind=kind,verification=run['reference_verification'],metrics={k:v for k,v in run['measurements'].items() if not k.endswith('_rows')})),flush=True)
