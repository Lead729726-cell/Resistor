"""Real imported-GDS PDK setup regression in isolated native state."""
import base64
import io
import json
import os
from pathlib import Path
import signal
import subprocess
import time
import urllib.request
import uuid
import zipfile
import klayout.db as k

folder=Path('/workspace/.runtime/evidence/pdk-setup-'+uuid.uuid4().hex);folder.mkdir();port=8879;token=uuid.uuid4().hex;worker=None;log=(folder/'worker.log').open('w');cases=[]
env={**os.environ,'MOS_STATE':str(folder/'state'),'MOS_PORT':str(port),'MOS_BIND':'127.0.0.1','MOS_TOKEN':token}
def call(method,params={}):
    req=urllib.request.Request(f'http://127.0.0.1:{port}/rpc',json.dumps({'method':method,'params':params}).encode(),{'Content-Type':'application/json','X-MOS-Token':token})
    with urllib.request.urlopen(req,timeout=90) as response:return json.load(response)
def rpc(method,params={}):
    value=call(method,params);assert value['ok'],value.get('error');return value['result']
def rejected(name,method,params,code=None):
    value=call(method,params);assert not value['ok'],value
    if code:assert value['error']['code']==code,value
    cases.append({'case':name,'result':'pass','error_code':value['error']['code']})
def wait(run,result='pass'):
    start=time.monotonic()
    while time.monotonic()-start<90:
        run=rpc('job.status',{'run_id':run['id']})
        if run['execution_status'] not in {'queued','running'}:
            assert run['execution_status']=='completed' and run['analysis_result']==result,(run.get('message'),run['manifest_path']);return run
        time.sleep(.1)
    raise AssertionError('Native engine job exceeds original 90-second test bound')
def record(name,run):cases.append({'case':name,'result':'pass','run_id':run['id'],'manifest_path':run['manifest_path'],'elapsed_s':run['elapsed_s'],'samples':run.get('measurements',{}).get('samples'),'parasitics':run.get('parasitics')})
def bias(p,profile='sky130A',analysis='op',pex=False,reference=None):
    s={'profile_id':profile,'top_cell':p['cell'],'corner':'tt','temperature_C':27,'ports':[{'name':'B','mode':'ground','dc_V':0},{'name':'D','mode':'voltage','dc_V':1.8},{'name':'S','mode':'ground','dc_V':0},{'name':'G','mode':'voltage','dc_V':.9}],'analysis':analysis,'pex':pex}
    if analysis=='dc':s.update(sweep_port='G',start_V=0,end_V=1.8,step_V=.01)
    if analysis=='tran':s.update(duration_s=30e-9,step_s=20e-12)
    if reference:s['reference_spice']=reference
    return s
def archive(files):
    data=io.BytesIO()
    with zipfile.ZipFile(data,'w',zipfile.ZIP_DEFLATED) as z:
        for name,text in files.items():z.writestr(name,text)
    return base64.b64encode(data.getvalue()).decode()
try:
    worker=subprocess.Popen(['python3','/workspace/workers/eda/server.py'],env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
    for _ in range(300):
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{port}/health',timeout=1) as response:
                if response.status==200:break
        except OSError:time.sleep(.1)
    builtin=rpc('pdk.list_profiles');assert builtin[0]['id']=='sky130A' and builtin[0]['available'],builtin
    assert rpc('pdk.validate')['valid'];cases.append({'case':'Installed SKY130 registry/hash validation and legacy no-argument validate','result':'pass','fingerprint':builtin[0]['fingerprint']})
    original=rpc('project.create',{'example':'mosfet','name':'Source real MOS PCell'})
    reference=rpc('schematic.export_spice',{'project_id':original['id']})['text']
    exported=rpc('layout.export',{'project_id':original['id']})
    naked=folder/'naked-mos.gds';naked.write_bytes(Path(exported['path']).read_bytes())
    p=rpc('project.create',{'example':'inverter','name':'Imported MOS without sidecar'})
    p=rpc('layout.import',{'project_id':p['id'],'path':str(naked)})
    assert p['source']=='fixture' and p['ports']==[] and p['schematic']['devices']==[] and 'analysis_setup' not in p
    inspected=rpc('analysis.inspect',{'project_id':p['id'],'profile_id':'sky130A'});assert set(inspected['ports'])=={'B','D','S','G'} and all(c['status']!='fail' for c in inspected['checks']),inspected
    cases.append({'case':'Naked GDS actual Magic inspection discovers declared B/D/S/G ports without inherited schematic','result':'pass','inspection_id':inspected['inspection_id'],'ports':inspected['ports']})
    setup=bias(p,reference=reference)
    invalid={**setup,'ports':setup['ports'][:-1]};rejected('Missing bias prevents invented port ties','analysis.configure',{'project_id':p['id'],'settings':invalid},'PORT_BIAS_REQUIRED')
    invalid={**setup,'ports':[dict(row,mode='voltage') for row in setup['ports']]};rejected('Missing explicit ground rejected','analysis.configure',{'project_id':p['id'],'settings':invalid},'GROUND_REQUIRED')
    rejected('Unsafe reference control rejected','analysis.configure',{'project_id':p['id'],'settings':{**setup,'reference_spice':reference+'\n.control\nshell touch /tmp/invalid\n.endc\n'}},'UNSAFE_REFERENCE')
    rejected('Out-of-range temperature rejected','analysis.configure',{'project_id':p['id'],'settings':{**setup,'temperature_C':float('inf')}},'ANALYSIS_RANGE')
    p=rpc('analysis.configure',{'project_id':p['id'],'settings':setup,'expected_revision':p['revision'],'command_id':'configure-op'})
    assert p['analysis_setup']['profile_hash']==p['analysis_setup']['pdk_fingerprint'] and p['analysis_setup']['extracted_ports']==inspected['ports']
    replay=rpc('analysis.configure',{'project_id':p['id'],'settings':setup,'expected_revision':p['revision']-1,'command_id':'configure-op'});assert replay['revision']==p['revision']
    cases.append({'case':'Configuration persisted with fingerprint and exact-once revision receipt','result':'pass','revision':p['revision']})
    for analysis,pex in [('op',False),('dc',False),('tran',False),('op',True),('dc',True)]:
        p=rpc('analysis.configure',{'project_id':p['id'],'settings':bias(p,analysis=analysis,pex=pex,reference=reference)})
        run=wait(rpc('analysis.run',{'project_id':p['id']}));flow=run['current_flow'];assert flow['source']=='ngspice' and all(b['mapping']=='unmapped' and 'path_dbu' not in b for b in flow['branches'])
        assert any(max(abs(v) for v in b['values_A'])>1e-7 for b in flow['branches'] if b['id'].startswith('XU/')) and any(min(b['values_A'])<-1e-7 for b in flow['branches'] if b['id'].startswith('testbench/'))
        assert run['workflow']=='configured-layout';record(f'Imported SKY130 MOS {analysis} pex={pex}: actual signed terminal/bias currents',run)
    for kind in ('drc','lvs','pex'):record('Imported SKY130 actual '+kind,wait(rpc('analysis.verify',{'project_id':p['id'],'kind':kind})))
    # Real user-uploaded model resources, static compatible technology and
    # palette; model is explicitly a simple test approximation, never BSIM/PDK.
    tech=Path('/foss/pdks/sky130A/libs.tech/magic/sky130A.tech').read_text().replace('description "SkyWater SKY130: Open Source rules and DRC"','description "Uploaded compatible technology regression"')
    tiny='''* Uploaded classic level-1 approximation, not a foundry model.
.subckt sky130_fd_pr__nfet_01v8 d g s b params: w=0.65 l=0.15 nf=1 m=1
MCORE d g s b TINY_N w={w} l={l}
.ends
.model TINY_N NMOS level=1 vto=0.45 kp=0.0001 gamma=0.4 phi=0.7 lambda=0.02
'''
    palette='<layer-properties><properties><name>User metal</name><source>68/20@1</source><fill-color>#123456</fill-color></properties></layer-properties>'
    manifest={'schema_version':1,'id':'uploaded_tiny','name':'Uploaded model and compatible tech','version':'test-1','model_mode':'include','model_file':'models/tiny.spice','magic_tech':'tech/custom.tech','netgen_setup':'/foss/pdks/sky130A/libs.tech/netgen/sky130A_setup.tcl','layer_file':'display.lyp','corners':['tt'],'spice_scale':1e-6}
    uploaded_package=archive({'models/tiny.spice':tiny,'tech/custom.tech':tech,'display.lyp':palette})
    registered=rpc('pdk.register',{'manifest':manifest,'package_base64':uploaded_package});assert registered['available'] and registered['source']=='uploaded'
    assert rpc('pdk.register',{'manifest':manifest,'package_base64':uploaded_package})['fingerprint']==registered['fingerprint'];cases.append({'case':'Exact uploaded package registration retry returns the same immutable profile','result':'pass'})
    cases.append({'case':'Actual uploaded classic model, custom static technology and palette registered with recursive SHA locks','result':'pass','profile_id':registered['id'],'fingerprint':registered['fingerprint']})
    custom_config={'project_id':p['id'],'settings':bias(p,'uploaded_tiny',reference=reference),'command_id':'uploaded-configure','expected_revision':p['revision']}
    p=rpc('analysis.configure',custom_config)
    assert next(layer for layer in p['layers'] if layer['id']=='68/20')['name']=='User metal'
    assert all(layer['name'].startswith('GDS ') for layer in p['layers'] if layer['id']!='68/20')
    run=wait(rpc('analysis.run',{'project_id':p['id']}));assert run['measurements']['profile_id']=='uploaded_tiny';record('Uploaded tiny model and actual custom technology execute real ngspice OP',run)
    record('Uploaded custom static technology executes real full DRC',wait(rpc('analysis.verify',{'project_id':p['id'],'kind':'drc'})))
    root=Path(registered['manifest']['root']);model=root/'models/tiny.spice';model.write_text(tiny.replace('kp=0.0001','kp=0.0002'))
    assert rpc('job.status',{'run_id':run['id']})['freshness']=='stale'
    assert rpc('analysis.configure',custom_config)['revision']==p['revision'];cases.append({'case':'Successful configure receipt replays after model change without reextracting or recommitting','result':'pass'})
    rejected('Mutable profile invalidates configured submission','analysis.run',{'project_id':p['id']},'PROFILE_CHANGED');cases.append({'case':'Actual changed model content marks stored run stale','result':'pass','run_id':run['id']})
    # Lib mode uses a genuine .lib corner and nested dependency, not a label.
    lib_manifest={**manifest,'id':'uploaded_lib','name':'Uploaded corner library','model_mode':'lib','model_file':'library.spice','layer_file':''}
    lib=rpc('pdk.register',{'manifest':lib_manifest,'package_base64':archive({'library.spice':'.lib tt\n.include "models/tiny.spice"\n.endl tt\n','models/tiny.spice':tiny,'tech/custom.tech':tech})})
    p=rpc('analysis.configure',{'project_id':p['id'],'settings':bias(p,'uploaded_lib')});record('Uploaded .lib corner with nested actual model executes ngspice OP',wait(rpc('analysis.run',{'project_id':p['id']})))
    transient={**bias(p,'uploaded_lib',analysis='tran'),'duration_s':2e-7,'step_s':1e-12}
    p=rpc('analysis.configure',{'project_id':p['id'],'settings':transient})
    job_request={'project_id':p['id'],'command_id':'cancelled-analysis-once','expected_revision':p['revision']}
    q=rpc('analysis.run',job_request);assert rpc('analysis.run',job_request)['id']==q['id'];rpc('job.cancel',{'run_id':q['id']})
    for _ in range(100):
        canceled=rpc('job.status',{'run_id':q['id']})
        if canceled['execution_status']=='canceled':break
        time.sleep(.05)
    assert canceled['execution_status']=='canceled' and canceled['analysis_result']=='unknown';cases.append({'case':'Configured native submission receipt and cancellation retain one canceled unknown job','result':'pass','run_id':q['id']})
    rejected('ZIP traversal rejected','pdk.register',{'manifest':dict(manifest,id='bad_zip'),'package_base64':archive({'../outside.spice':tiny})},'INVALID_PDK_PACKAGE')
    rejected('Secret/outside root path rejected','pdk.register',{'manifest':{**manifest,'id':'bad_path','root':'/etc','model_file':'passwd'}},'INVALID_PDK_PROFILE')
    rejected('Control code in uploaded model rejected','pdk.register',{'manifest':dict(manifest,id='bad_model'),'package_base64':archive({'models/tiny.spice':tiny+'\n.control\nshell touch /tmp/invalid\n.endc','tech/custom.tech':tech,'display.lyp':palette})},'INVALID_PDK_PROFILE')
    rejected('External-process XSPICE model rejected','pdk.register',{'manifest':dict(manifest,id='bad_process'),'package_base64':archive({'models/tiny.spice':'.model EVIL d_process(command="/bin/sh")\n','tech/custom.tech':tech,'display.lyp':palette})},'INVALID_PDK_PROFILE')
    rejected('Native Tcl/SPICE interpolation filename rejected','pdk.register',{'manifest':dict(manifest,id='bad_filename'),'package_base64':archive({'x};exec touch invalid;#.tech':tech})},'INVALID_PDK_PACKAGE')
    p=rpc('layout.import',{'project_id':p['id'],'path':str(naked)});assert 'analysis_setup' not in p;rejected('Import clears old electrical configuration','analysis.run',{'project_id':p['id']},'ANALYSIS_NOT_CONFIGURED')
    multiple=k.Layout();multiple.read(str(naked));first=multiple.cell(p['cell']);second=multiple.create_cell('selected_mos');second.copy_tree(first)
    for li in multiple.layer_indices():
        for shape in second.shapes(li).each():shape.transform(k.Trans(50000,0))
    multi_file=folder/'multi-top.gds';multiple.write(str(multi_file));assert len(list(multiple.top_cells()))==2
    rejected('Multiple actual GDS roots require explicit top choice','layout.import',{'project_id':p['id'],'path':str(multi_file)},'AMBIGUOUS_TOP')
    p=rpc('layout.import',{'project_id':p['id'],'path':str(multi_file),'top_cell':'selected_mos'});assert p['cell']=='selected_mos'
    assert int(rpc('view.get_scene',{'project_id':p['id']})['bounds'][0])>40000
    configuration=bias(p,'uploaded_lib');configuration['top_cell']='mosfet'
    p=rpc('analysis.configure',{'project_id':p['id'],'settings':configuration});assert p['cell']=='mosfet' and p['analysis_setup']['top_cell']=='mosfet'
    assert int(rpc('view.get_scene',{'project_id':p['id']})['bounds'][0])<40000
    record('Actual multi-top selection/configuration switches authoritative scene and simulation cell consistently',wait(rpc('analysis.run',{'project_id':p['id']})))
    result={'schema_version':1,'source_state':str(folder),'cases':cases,'scope':'Actual isolated Magic/Netgen/ngspice and confined uploaded resources; custom tiny model is an explicit test approximation.'}
    dest=Path('/workspace/.runtime/evidence/pdk-setup.json')
    if dest.exists():dest.with_name('pdk-setup-'+uuid.uuid4().hex[:8]+'.json').write_bytes(dest.read_bytes())
    dest.write_text(json.dumps(result,indent=2));print(json.dumps({'passed':len(cases),'source_state':str(folder)}),flush=True)
finally:
    if worker and worker.poll() is None:os.killpg(worker.pid,signal.SIGTERM);worker.wait(timeout=10)
    log.close()
