"""Actual nominal model-corner sweep; isolated files, no live DB import."""
import sys,json,subprocess,hashlib,itertools
from pathlib import Path
sys.path.insert(0,'/workspace/workers/eda')
import numpy as np
import analog_soc as A, native, design_tools
root=Path('/workspace/.runtime/analog-soc/pvt');root.mkdir(parents=True,exist_ok=True)
out=Path('/workspace/examples/analog-soc/pvt.json');rows=[]
kind='soc_sensor_afe';ir=A.schematic(kind,A.CATALOG[kind]['parameter_defaults'])
for corner,temp,supply in itertools.product(['tt','ss','ff'],[-40,27,125],[1.6,1.8]):
    folder=root/f'{corner}-{temp}-{supply}';folder.mkdir(exist_ok=True)
    settings=native.testbench({**A.SETTINGS[kind], 'corner':corner,'temperature_C':temp,'supply_V':supply})
    net=folder/'core.spice';net.write_text(native.emit(ir,kind,ir['ports']))
    p=dict(cell=kind,ports=ir['ports'],design_template=dict(id=kind,parameters=A.CATALOG[kind]['parameter_defaults']))
    tb,names,units,_,_=A.spice_tb(p,folder,settings,net,design_tools.supported_model_deck(folder,corner),p['ports'])
    r=subprocess.run(['ngspice','-b',str(tb)],cwd=folder,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=120)
    (folder/'ngspice.log').write_text(r.stdout)
    record=dict(corner=corner,temperature_C=temp,supply_V=supply,execution_status='failed',rc_corner='typical',netlist_sha256=hashlib.sha256(net.read_bytes()).hexdigest())
    try:
        if r.returncode:raise RuntimeError('ngspice failed')
        arr=np.loadtxt(folder/'waveform.dat',skiprows=1,ndmin=2)
        if arr.shape[1]!=len(names)+1:raise RuntimeError('missing vectors')
        run=dict(measurements={},waveforms=[dict(name=n,unit=u,x=arr[:,0].tolist(),y=arr[:,i+1].tolist()) for i,(n,u) in enumerate(zip(names,units))])
        A.measurements(p,run,settings)
        record.update(execution_status='completed',verification=run['reference_verification'],measurements={k:v for k,v in run['measurements'].items() if not k.endswith('_rows')},waveform_sha256=hashlib.sha256((folder/'waveform.dat').read_bytes()).hexdigest())
    except Exception as e:record['error']=str(e)
    rows.append(record)
    out.write_text(json.dumps(dict(source='actual-ngspice-nominal-MOS-corners',cases=rows,planned_cases=18,physical_pex=False,mismatch_noise_verified=False,foundry_signoff=False),indent=2)+'\n')
    print(json.dumps({k:record[k] for k in ['corner','temperature_C','supply_V','execution_status']}|dict(passed=record.get('verification',{}).get('pass'))),flush=True)
