// Independent, isolated parser/resource audit. No RPC or native analysis job is launched.
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';

const source = String.raw`
import base64, hashlib, io, json, math, stat, subprocess, sys, types, uuid, zipfile
from pathlib import Path
sys.path.insert(0, '/workspace/workers/eda')
import pdk_registry as registry
from geometry import EDAError
state=Path('/workspace/.runtime/pdk-setup-audit')/uuid.uuid4().hex
root=state/'pdks'/'profile';root.mkdir(parents=True)
registry.S=types.SimpleNamespace(STATE=state,cached_sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest(),initial_models=lambda:{})
cases=[]
def case(name,work):
    try:work();cases.append({'case':name,'result':'pass'})
    except Exception as e:cases.append({'case':name,'result':'fail','error':str(e),'type':type(e).__name__})
def rejected(work,codes):
    try:work()
    except EDAError as e:
        assert e.code in codes,(e.code,str(e));return
    raise AssertionError('Unsafe input was accepted')
def model(text,name='main.spice'):
    path=root/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_text(text);return path
def zipdata(entries):
    out=io.BytesIO()
    with zipfile.ZipFile(out,'w') as z:
        for item,data in entries:z.writestr(item,data)
    return base64.b64encode(out.getvalue()).decode()
def closure():
    leaf=model('.model checked D\n','nested/leaf.spice')
    top=model('.include "nested/leaf.spice"\n')
    result=registry.spice_files(top,root)
    assert set(result)=={str(top),str(leaf)},result
    previous=result[str(leaf)];leaf.write_text('.model checked D (is=2e-14)\n')
    assert registry.spice_files(top,root)[str(leaf)]!=previous
case('Confined nested model resources are all hashed and changed bytes alter the lock',closure)
def continued_library():
    leaf=model('.lib tt\n.model checked D\n.endl tt\n','library.spice')
    top=model('.lib "library.spice"\n+ tt\n')
    result=registry.spice_files(top,root)
    assert str(leaf) in result,'Continuation .lib dependency omitted from hash closure'
case('Continued .lib dependency is rejected or included in the resource hash closure',lambda:continued_library())
def outside_library():
    outside=state/'pdks'/'other'/'unsafe.spice';outside.parent.mkdir();outside.write_text('.lib tt\n.model hidden D\n.endl tt\n')
    top=model('.lib "../other/unsafe.spice"\n+ tt\n')
    rejected(lambda:registry.spice_files(top,root),{'INVALID_PDK_PATH'})
case('Continuation .lib cannot read another profile outside its declared root',outside_library)
for directive in ('.control\nshell echo FORBIDDEN\n.endc\n','.pre_osdi "anything.so"\n','.csparam malicious=1\n'):
    case('Executable/non-model directive rejected: '+directive.splitlines()[0],lambda text=directive:rejected(lambda:registry.spice_files(model(text),root),{'UNSAFE_SPICE_DIRECTIVE','UNSAFE_MODEL'}))
def root_escape():
    outside=state/'pdks'/'other'/'main.spice';outside.parent.mkdir(exist_ok=True);outside.write_text('.model outside D\n')
    manifest={'schema_version':1,'id':'audit','name':'Audit','version':'1','root':str(root),'model_file':str(outside),'model_mode':'include','corners':['tt'],'spice_scale':1e-6}
    rejected(lambda:registry.resolve(manifest),{'INVALID_PDK_PATH'})
case('Primary model resource cannot escape the declared profile root',root_escape)
case('Orphan SPICE continuation rejected',lambda:rejected(lambda:registry.spice_files(model('+ tt\n'),root),{'INVALID_MODEL'}))
case('Ambiguous quoted one-argument library import rejected',lambda:rejected(lambda:registry.spice_files(model('.lib "library.spice"\n'),root),{'INVALID_MODEL'}))
for payload in ('a} ; exec forbidden ; {.tech','[exec forbidden].tech','$env(HOME).tech','a"quoted.spice',"a'quoted.spice",'a;exec.tech','a'+chr(96)+'exec.tech'):
    def bad_manifest_path(value=payload):
        manifest={'schema_version':1,'id':'audit','name':'Audit','version':'1','root':str(root),'model_file':value,'model_mode':'include','corners':['tt'],'spice_scale':1e-6}
        rejected(lambda:registry.normalize(manifest),{'INVALID_PDK_PATH'})
    case('Tcl/SPICE metacharacter resource path rejected: '+payload,bad_manifest_path)
def technology_closure():
    fragment=root/'fragment.tech';fragment.write_text('types\nend\n')
    top=root/'audit.tech';top.write_text('include fragment.tech\n')
    assert set(registry.tech_files(top,root))=={str(top),str(fragment)}
    outside=state/'pdks'/'other'/'outside.tech';outside.write_text('types\nend\n')
    top.write_text('include ../other/outside.tech\n')
    rejected(lambda:registry.tech_files(top,root),{'INVALID_PDK_PATH'})
case('Static technology fragments are hashed and cannot escape their profile root',technology_closure)
for payload in ('source evil.tcl\n','exec touch SHOULD_NOT_RUN\n','types [exec touch SHOULD_NOT_RUN]\n'):
    case('Executable/interpolated technology rejected: '+payload.split()[0],lambda text=payload:rejected(lambda:registry.tech_files(model(text,'unsafe.tech'),root),{'UNSAFE_TECHNOLOGY'}))
def canonical_script():
    import profile
    uploaded=root/'matching.magicrc';uploaded.write_bytes(profile.MAGIC_RC.read_bytes())
    sibling=root/'sky130A.tcl';sibling.write_text('exec touch SHOULD_NOT_RUN\n')
    top=model('.model checked D\n')
    manifest={'schema_version':1,'id':'audit','name':'Audit','version':'1','root':str(root),'model_file':str(top),'magic_rc':str(uploaded),'model_mode':'include','corners':['tt'],'spice_scale':1e-6}
    _,resources,files,_=registry.resolve(manifest)
    assert resources['magic_rc'].is_relative_to(Path('/foss/pdks')) and resources['magic_rc']!=uploaded,resources['magic_rc']
    assert str(sibling) not in files,'Uploaded sibling was treated as an executed dependency'
    assert str(uploaded) in files and str(resources['magic_rc']) in files
case('Uploaded matching startup deck resolves execution to canonical installed Tcl, not uploaded siblings',canonical_script)
import configured_analysis as analysis
def extracted_order():
    deck=model('.subckt CELL Y VPWR A VGND\n.ends CELL\n','ports.spice')
    assert analysis.ports_from(deck,'CELL')[0]==['Y','VPWR','A','VGND']
case('Extracted subcircuit port order is preserved rather than reordered by bias input',extracted_order)
def wrapped_ports():
    deck=model('.subckt CELL Y VPWR\n+ A VGND\n.ends CELL\n','ports.spice')
    assert analysis.ports_from(deck,'CELL')[0]==['Y','VPWR','A','VGND'],'Wrapped port declaration was truncated'
case('SPICE continuation preserves every extracted top-level port in its actual order',wrapped_ports)
for command in ('.control\nshell echo FORBIDDEN\n.endc\n','.include "outside.spice"\n'):
    case('Reference external execution/file directives rejected: '+command.splitlines()[0],lambda text=command:rejected(lambda:analysis.reference('.subckt CELL A GND\n'+text+'.ends CELL\n','CELL',['A','GND'],root),{'UNSAFE_REFERENCE'}))
def settings_guards():
    import copy, klayout.db as k
    layout=k.Layout();layout.create_cell('CELL')
    old_server,old_resources,old_inspect=analysis.S,analysis.resources,analysis.inspect
    locked={'fingerprint':'explicit-hash'};manifest={'corners':['tt'],'root':str(root)}
    try:
        analysis.S=types.SimpleNamespace(load_layout=lambda p:layout)
        analysis.resources=lambda pid:(locked,manifest,{})
        extracted=model('.subckt CELL Y VPWR A VGND\n.ends CELL\n','settings-ports.spice')
        analysis.inspect=lambda params:{'ports':['Y','VPWR','A','VGND'],'checks':[],'artifacts':{'extracted_netlist':str(extracted)}}
        raw={'profile_id':'audit','profile_hash':'explicit-hash','top_cell':'CELL','corner':'tt','analysis':'op','temperature_C':27,'pex':False,'ports':[{'name':'VGND','mode':'ground','dc_V':0},{'name':'VPWR','mode':'voltage','dc_V':1.8},{'name':'A','mode':'voltage','dc_V':.9},{'name':'Y','mode':'floating','dc_V':0}]}
        checked,_,_=analysis.settings(raw,{'id':'audit-project','cell':'CELL'})
        assert checked['profile_hash']=='explicit-hash' and checked['ports']==raw['ports']
        rejected(lambda:analysis.settings({**raw,'profile_hash':'older-hash'},{'id':'audit-project','cell':'CELL'}),{'PROFILE_CHANGED'})
        changed=copy.deepcopy(raw);changed['ports'][0]['mode']='floating'
        rejected(lambda:analysis.settings(changed,{'id':'audit-project','cell':'CELL'}),{'GROUND_REQUIRED'})
        changed=copy.deepcopy(raw);changed['ports'][0]['dc_V']=.2
        rejected(lambda:analysis.settings(changed,{'id':'audit-project','cell':'CELL'}),{'INVALID_PORT_BIAS'})
        changed=copy.deepcopy(raw);changed['ports'][0]['name']='GUESSED_GROUND'
        rejected(lambda:analysis.settings(changed,{'id':'audit-project','cell':'CELL'}),{'PORT_BIAS_REQUIRED'})
    finally:analysis.S,analysis.resources,analysis.inspect=old_server,old_resources,old_inspect
case('Explicit settings retain profile hash and biased rows; stale profile, guessed ports and absent/nonzero ground reject',settings_guards)
def commit_guards():
    import copy, klayout.db as k
    old_server,old_lock,old_inspect=analysis.S,registry.lock,analysis.inspect
    layout=k.Layout();layout.create_cell('TOP_A');layout.create_cell('TOP_B')
    current={'id':'audit-project','cell':'TOP_A','revision':2,'next_revision':3,'undo_stack':[]}
    locked={'fingerprint':'current-hash','lock':{}}
    setup={'profile_id':'audit','profile_hash':'current-hash','top_cell':'TOP_B'}
    inspection={'layout_sha256':'explicit-input-hash','ports':['D','S'],'inspection_id':'prior-inspection'}
    prepared=(copy.deepcopy(current),setup,locked,inspection)
    def no_native_inspection(*args):raise AssertionError('Native inspection ran inside the commit phase')
    try:
        analysis.S=types.SimpleNamespace(get_project=lambda pid:copy.deepcopy(current),load_layout=lambda p:layout,commit=lambda p,l,parent,**kwargs:p)
        registry.lock=lambda pid:locked
        analysis.inspect=no_native_inspection
        committed=analysis.configure_project({'project_id':current['id']},prepared)
        assert committed['cell']=='TOP_B' and committed['revision']==3 and committed['analysis_setup']['top_cell']=='TOP_B'
        current['revision']=3
        rejected(lambda:analysis.configure_project({'project_id':current['id']},prepared),{'REVISION_CONFLICT'})
        current['revision']=2;registry.lock=lambda pid:{'fingerprint':'changed-hash'}
        rejected(lambda:analysis.configure_project({'project_id':current['id']},prepared),{'PROFILE_CHANGED'})
    finally:analysis.S,registry.lock,analysis.inspect=old_server,old_lock,old_inspect
case('Short configuration commit binds selected top cell and rejects intervening revision/profile changes without native inspection',commit_guards)
for name in ('../escape.spice','/absolute.spice','dir\\escape.spice','C:drive.spice','a} ;exec forbidden; {.tech','a[exec forbidden].tech','a$env(HOME).tech','a"quoted.spice',"a'quoted.spice"):
    case('ZIP path rejected: '+name,lambda entry=name:rejected(lambda:registry.unpack(zipdata([(entry,b'not extracted')]),state/('zip-'+uuid.uuid4().hex)),{'INVALID_PDK_PACKAGE'}))
def zip_link():
    link=zipfile.ZipInfo('link.spice');link.create_system=3;link.external_attr=(stat.S_IFLNK|0o777)<<16
    rejected(lambda:registry.unpack(zipdata([(link,b'../outside')]),state/'zip-link'),{'INVALID_PDK_PACKAGE'})
case('ZIP symlink rejected before extraction',zip_link)
case('Case-colliding ZIP entries rejected',lambda:rejected(lambda:registry.unpack(zipdata([('models/a.spice',b'a'),('models/A.spice',b'b')]),state/'zip-duplicate'),{'INVALID_PDK_PACKAGE'}))
native=[]
if sys.argv[-1]=='native':
    import current_flow, klayout.db as k
    def native_mos():
        circuit=model('.subckt CELL S B\n+ G D\nMNM D G S B audit_n\n+ W=2u L=1u\n.ends CELL\n','native-mos.spice')
        project={'cell':'CELL','revision':7,'source':'fixture','example':'imported','import_metadata':{'explicit_analysis':True},'schematic':{'devices':[],'wires':[]}}
        for direction,drain,source_bias in (('forward',1.8,0),('reverse',0,1.8)):
            folder=state/('native-'+direction);folder.mkdir()
            probe,branches,warnings=current_flow.prepare(project,circuit,folder,False)
            mos=next(b for b in branches if b.get('_model')=='audit_n')
            assert mos['from_net']=='D' and mos['to_net']=='S' and mos['mapping']=='unmapped'
            fields=next(line.split() for line in probe.read_text().splitlines() if line.startswith('MNM '))
            assert fields[-2:]==['W=2u','L=1u'],fields
            actual=analysis.ports_from(circuit,'CELL')[0];assert actual==['S','B','G','D']
            voltage=[f'VD D 0 {drain}',f'VS S 0 {source_bias}','VG G 0 .9','VB B 0 0']
            vectors=['v(D)','v(G)','v(S)','v(B)','i(VD)','i(VS)']
            def deck(netlist):
                lines=['Explicit synthetic generic-M sign/continuation calibration; no physical GDS/PDK claims','.model audit_n NMOS (level=1 vto=.5 kp=1e-4 lambda=.02)',f'.include "{netlist}"',*voltage,'XU '+' '.join(actual)+' CELL','.control','set num_threads=1','set noaskquit','set wr_singlescale','set wr_vecnames','op']
                lines += [f'let calibration_{i} = {v}' for i,v in enumerate(vectors)]
                lines += ['wrdata waveform.dat '+' '.join(f'calibration_{i}' for i in range(len(vectors))),'quit','.endc','.end']
                return '\n'.join(lines)+'\n'
            baseline=folder/'baseline';baseline.mkdir();(baseline/'testbench.spice').write_text(deck(circuit))
            current_flow.add_testbench_voltage_branches(voltage,branches)
            (folder/'testbench.spice').write_text(current_flow.instrument_control(deck(probe),branches))
            for runfolder in (baseline,folder):
                with (runfolder/'ngspice.log').open('w') as log:
                    completed=subprocess.run(['/foss/tools/ngspice/bin/ngspice','-b',str(runfolder/'testbench.spice')],cwd=runfolder,stdout=log,stderr=subprocess.STDOUT,timeout=10)
                assert completed.returncode==0,(completed.returncode,(runfolder/'ngspice.log').read_text())
            def numbers(runfolder):
                rows=[[float(x) for x in line.split()] for line in (runfolder/'waveform.dat').read_text().splitlines()[1:]]
                assert len(rows)==1 and len(rows[0])==7 and all(math.isfinite(x) for x in rows[0]);return rows[0]
            before,after=numbers(baseline),numbers(folder)
            assert all(math.isclose(a,b,rel_tol=1e-8,abs_tol=1e-12) for a,b in zip(before,after)),(before,after)
            layout=k.Layout();layout.create_cell('CELL')
            flow=current_flow.read(folder,project,'op','point',branches,layout)
            measured=next(b for b in flow['branches'] if b['id']==mos['id'])['values_A'][0]
            assert math.isclose(measured,-after[5],rel_tol=1e-8,abs_tol=1e-12),(measured,after[5])
            assert measured>1e-7 if direction=='forward' else measured < -1e-7
            assert all(b['mapping']=='unmapped' and 'path_dbu' not in b for b in flow['branches'])
            native.append({'direction':direction,'actual_port_order':actual,'drain_current_A':measured,'supply_source_current_A':after[5],'baseline':before,'instrumented':after,'probe_netlist':str(probe),'testbench':str(folder/'testbench.spice'),'flow':flow})
    case('Actual ngspice generic-M forward/reverse series-sense signs preserve multiline W/L and baseline voltages/currents',native_mos)
report={'schema_version':1,'scope':'Independent pure PDK/setup validators; optional actual synthetic generic-M ngspice calibration; no RPC jobs','cases':cases,'case_count':len(cases),'passed':sum(c['result']=='pass' for c in cases),'failed':sum(c['result']=='fail' for c in cases),'isolated_state':str(state),'native_calibration':native}
print(json.dumps(report));sys.exit(1 if report['failed'] else 0)
`;

const result = await new Promise((resolve, reject) => {
  const child = spawn('docker', ['exec', '-i', 'mos-studio-eda', 'python3', '-', process.argv.includes('--native') ? 'native' : 'validators'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', data => { stdout += data; });
  child.stderr.on('data', data => { stderr += data; });
  const timeout = setTimeout(() => child.kill(), 30_000);
  child.on('error', error => { clearTimeout(timeout); reject(error); });
  child.on('close', code => { clearTimeout(timeout); resolve({ code, stdout, stderr }); });
  child.stdin.end(source);
});
await mkdir('.runtime/evidence', { recursive: true });
let report;
try { report = JSON.parse(result.stdout.trim()); } catch { throw new Error(`PDK audit did not produce JSON: ${result.stderr}`); }
await writeFile('.runtime/evidence/pdk-setup-audit.json', JSON.stringify(report, null, 2));
for (const row of report.cases) console.log(`${row.result.toUpperCase()}: ${row.case}${row.error ? ` — ${row.error}` : ''}`);
console.log(`Independent PDK/setup audit: ${report.passed}/${report.case_count}; ${report.native_calibration.length} isolated native calibration cases; no RPC jobs.`);
process.exitCode = result.code || report.failed ? 1 : 0;
