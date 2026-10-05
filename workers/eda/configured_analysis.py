"""Explicit port-biased analysis of imported geometry with confined PDK resources."""
import copy
import hashlib
import json
import math
from pathlib import Path
import re
import shutil
import subprocess
import threading
import uuid
import klayout.db as k
import current_flow
from geometry import EDAError
import pdk_registry as registry
import profile

S=None
GATE=threading.BoundedSemaphore(2)
NAME=re.compile(r'[A-Za-z_][A-Za-z0-9_]{0,127}')
SETTINGS={'profile_id','profile_hash','top_cell','corner','temperature_C','ports','analysis','sweep_port','start_V','end_V','step_V','duration_s','step_s','pex','reference_spice'}
def configure(server):
    global S
    S=server
def signature(pid):
    try:return hashlib.sha256(json.dumps({'profile':registry.lock(pid)['fingerprint'],'tools':S.tool_hashes(),'image':profile.IMAGE},sort_keys=True).encode()).hexdigest()
    except EDAError:return 'invalid-profile'
def safe_name(value,what):
    if not isinstance(value,str) or not NAME.fullmatch(value):raise EDAError('UNSUPPORTED_NAME',f'{what} must be a supported native identifier.')
    return value
def safe_port(value):
    if not isinstance(value,str) or not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]{0,126}!?',value):raise EDAError('UNSUPPORTED_PORT_NAME','Ports support native identifiers with an optional global-net ! suffix; other syntax is explicitly unsupported.')
    return value
def chosen(p,l,name=None):
    name=safe_name(name or p['cell'],'Top cell')
    if l.cell(name) is None:raise EDAError('TOP_CELL_NOT_FOUND','Selected top cell does not exist in this layout.')
    return name
def ports_from(path,top):
    text=Path(path).read_text();m=re.search(r'^\.subckt\s+'+re.escape(top)+r'(?:[ \t]+([^\n]*))?$',logical_text(text),re.M|re.I)
    if not m:raise EDAError('EXTRACTION_FAILED','Magic did not declare the selected top subcircuit.')
    ports=(m.group(1) or '').split()
    if not ports or len(ports)>32 or len(set(x.lower() for x in ports))!=len(ports):raise EDAError('PORT_DECLARATIONS','Selected cell needs 1..32 unique extracted port declarations; labels alone do not establish ports.')
    for name in ports:safe_port(name)
    return ports,text
def logical_text(text):
    lines=[]
    for line in text.splitlines():
        if line.lstrip().startswith('+') and lines:lines[-1]+=' '+line.lstrip()[1:].strip()
        else:lines.append(line)
    return '\n'.join(lines)
def validate_globals(text,biased):
    parent={};used=set();globals_=set()
    def root(node):
        node=node.lower();parent.setdefault(node,node)
        while parent[node]!=node:parent[node]=parent[parent[node]];node=parent[node]
        return node
    for line in logical_text(text).splitlines():
        fields=line.split()
        if not fields:continue
        if fields[0].lower()=='.global':globals_.update(n.lower() for n in fields[1:])
        elif not fields[0].startswith(('*','.')):
            used.update(n.lower() for n in fields[1:])
            if fields[0][0].upper()=='R' and len(fields)>=4:parent[root(fields[2])]=root(fields[1])
    driven={root(n) for n in ['0',*biased]}
    floating=[n for n in globals_ if n in used and root(n) not in driven]
    if floating:raise EDAError('UNBIASED_GLOBAL','Referenced extracted global nodes lack an explicit port bias or proven resistor connection: '+', '.join(sorted(floating)))
def resources(pid):
    p=registry.lock(pid);m,r,files,sig=registry.resolve(p['manifest'])
    if not r.get('magic_tech'):raise EDAError('UNSUPPORTED_EXTRACTION','Profile has no compatible Magic technology; geometry-only inspection is available.')
    return p,m,r
def inspect(params):
    if not GATE.acquire(blocking=False):raise EDAError('INSPECTION_BUSY','At most two native inspections may run simultaneously.')
    try:
        p=S.get_project(params['project_id']);l=S.load_layout(p);top=chosen(p,l,params.get('top_cell'));pid=params.get('profile_id','sky130A')
        labels=set();cell=l.cell(top)
        for li in l.layer_indices():
            it=cell.begin_shapes_rec(li)
            while not it.at_end():
                shape=it.shape()
                if shape.is_text():labels.add(shape.text.string)
                if len(labels)>10000:raise EDAError('INSPECTION_LIMIT','Too many unique labels for electrical setup.')
                it.next()
        result={'top_cells':[c.name for c in l.top_cells()],'top_cell':top,'labels':sorted(labels),'ports':[],'checks':[],'profile_id':pid,'revision':p['revision'],'layout_sha256':profile.sha(S.snapshot_dir(p)/'layout.oas')}
        folder=S.STATE/'inspections'/uuid.uuid4().hex;folder.mkdir(parents=True)
        result.update(inspection_id=folder.name,artifacts={'folder':str(folder)})
        try:
            locked,m,r=resources(pid);result['fingerprint']=locked['fingerprint'];l.write(str(folder/(top+'.gds')))
            script=folder/'inspect.tcl';dest=folder/'ports.spice'
            script.write_text(S.magic_input({'cell':top},folder,r)+'extract all\next2spice scale off\next2spice lvs\next2spice subcircuit top on\next2spice hierarchy on\n'+f'ext2spice -o {{{dest}}}\nquit -noprompt\n')
            command=S.magic_args(folder,script,r)
            with (folder/'magic-inspect.log').open('w') as log:
                proc=subprocess.run(command,cwd=folder,stdout=log,stderr=subprocess.STDOUT,timeout=60)
            if proc.returncode:raise EDAError('EXTRACTION_FAILED','Magic inspection failed; actual log retained.')
            ports,text=ports_from(dest,top);result['ports']=ports
            result['checks']=[registry.check('native port extraction','pass','Magic extracted the declared subcircuit ports in their actual order.'),registry.check('physical mapping','warning','Imported geometry has no proven device-terminal-to-polygon mapping; numerical currents remain spatially unmapped.')]
            # Hidden/global extracted nodes must never be tied to ground by guess.
            globals_=re.findall(r'^\.global\s+([^\n]+)',text,re.M|re.I)
            result['global_nodes']=sorted({n for line in globals_ for n in line.split() if n!='0'})
            if result['global_nodes']:result['checks'].append(registry.check('global nodes','warning','Extraction declares additional global nodes: '+', '.join(result['global_nodes'])+'. No automatic bias ties are inserted.'))
            result['artifacts'].update(extracted_netlist=str(dest),log=str(folder/'magic-inspect.log'))
        except (EDAError,subprocess.TimeoutExpired) as e:result['checks'].append(registry.check(getattr(e,'code','INSPECTION_TIMEOUT'),'fail',str(e)));result['artifacts']['log']=str(folder/'magic-inspect.log')
        if (folder/'magic-inspect.log').is_file():result['log_text']=(folder/'magic-inspect.log').read_text(errors='replace')[-65536:]
        S.dump(folder/'inspection.json',result);return result
    finally:GATE.release()
def number(value,name,low,high):
    if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value) or not low<=value<=high:raise EDAError('ANALYSIS_RANGE',f'{name} must be finite in {low}..{high}.')
    return float(value)
def reference(text,top,ports,root):
    if not isinstance(text,str) or not 1<=len(text.encode())<=256*1024:raise EDAError('REFERENCE_REQUIRED','LVS requires explicit bounded reference_spice text.')
    logical=[]
    for line in text.splitlines():
        line=line.strip()
        if not line or line.startswith('*'):continue
        if line.startswith('+'):
            if not logical:raise EDAError('UNSAFE_REFERENCE','Unattached reference continuation.')
            logical[-1]+=' '+line[1:].strip()
        else:logical.append(line)
    for line in logical:
        first=line.split()[0].lower()
        if first.startswith('.') and first not in {'.subckt','.ends','.model','.param','.global','.end'}:raise EDAError('UNSAFE_REFERENCE','Reference text may contain netlist data only; control/include/code/executable directives are forbidden.')
        if not first.startswith('.') and not re.match(r'^[RMXCDVLIGQrmxcdvligq][A-Za-z0-9_.$:/+-]*\s',line):raise EDAError('UNSAFE_REFERENCE','Unsupported reference device syntax.')
        if re.search(r'\b(?:d_process|osdi|pre_osdi|codemodel|shell)\b|\bfile\s*[=(]',line,re.I):raise EDAError('UNSAFE_REFERENCE','External processes and file functions are forbidden in reference netlists.')
        if first=='.model' and (len(line.split())<3 or line.split()[2].split('(')[0].lower() not in {'nmos','pmos','d','npn','pnp','r','c','l'}):raise EDAError('UNSAFE_REFERENCE','Unsupported reference model family.')
    match=re.search(r'^\.subckt\s+'+re.escape(top)+r'[ \t]+([^\n]+)',logical_text(text),re.M|re.I)
    if not match or set(match.group(1).split())!=set(ports):raise EDAError('REFERENCE_PORT_MISMATCH','Reference top name and explicit ports must match actual extracted declarations.')
    return text
def settings(raw,p):
    if not isinstance(raw,dict) or set(raw)-SETTINGS:raise EDAError('INVALID_ANALYSIS_SETTINGS','Unknown configured-analysis settings.')
    s=copy.deepcopy(raw);pid=s.get('profile_id');locked,m,r=resources(pid)
    if s.get('profile_hash') and s['profile_hash']!=locked['fingerprint']:raise EDAError('PROFILE_CHANGED','Profile fingerprint differs from the configuration precondition.')
    s['profile_hash']=locked['fingerprint']
    top=chosen(p,S.load_layout(p),s.get('top_cell'));s['top_cell']=top
    if s.get('corner') not in m['corners']:raise EDAError('UNSUPPORTED_CORNER','Corner is not declared in the selected profile.')
    s['temperature_C']=number(s.get('temperature_C',27),'temperature_C',-100,300)
    if s.get('analysis') not in {'op','dc','tran'}:raise EDAError('UNSUPPORTED_ANALYSIS','Configured imported-GDS analysis supports actual OP/DC/transient; AC phasor arrows are unsupported.')
    if not isinstance(s.get('pex',False),bool):raise EDAError('INVALID_ANALYSIS_SETTINGS','pex must be boolean.')
    s.setdefault('pex',False)
    inspection=inspect({'project_id':p['id'],'profile_id':pid,'top_cell':top})
    if any(c['status']=='fail' for c in inspection['checks']):raise EDAError('ANALYSIS_INSPECTION_FAILED','Resolve native port extraction errors before configuration.',inspection)
    expected=inspection['ports'];ports=s.get('ports')
    if not isinstance(ports,list) or len(ports)!=len(expected):raise EDAError('PORT_BIAS_REQUIRED','Explicit bias rows must cover every actual extracted port exactly once.')
    names=[]
    for row in ports:
        if not isinstance(row,dict) or set(row)-{'name','mode','dc_V'}:raise EDAError('INVALID_PORT_BIAS','Port rows accept name/mode/dc_V only.')
        names.append(safe_port(row.get('name')))
        if row.get('mode') not in {'ground','voltage','floating'}:raise EDAError('INVALID_PORT_BIAS','Port mode must be ground, voltage or floating.')
        row['dc_V']=number(row.get('dc_V',0),'dc_V',-100,100)
        if row['mode']=='ground' and row['dc_V']!=0:raise EDAError('INVALID_PORT_BIAS','Explicit ground must have dc_V=0.')
    if len(set(names))!=len(names) or set(names)!=set(expected):raise EDAError('PORT_BIAS_REQUIRED','Bias names must exactly match actual extracted declarations; labels are not guessed ports.')
    if not any(row['mode']=='ground' for row in ports):raise EDAError('GROUND_REQUIRED','Select at least one declared port as explicit ground; no automatic ground is inferred.')
    validate_globals(Path(inspection['artifacts']['extracted_netlist']).read_text(),[row['name'] for row in ports if row['mode']!='floating'])
    if s['analysis']=='dc':
        if s.get('sweep_port') not in names or next(row for row in ports if row['name']==s['sweep_port'])['mode']!='voltage':raise EDAError('INVALID_SWEEP','DC sweep requires a declared voltage-biased port.')
        s['start_V']=number(s.get('start_V',0),'start_V',-100,100);s['end_V']=number(s.get('end_V',1.8),'end_V',-100,100);s['step_V']=number(s.get('step_V',.01),'step_V',-100,100)
        if s['step_V']==0 or (s['end_V']-s['start_V'])*s['step_V']<=0 or abs((s['end_V']-s['start_V'])/s['step_V'])>200000:raise EDAError('INVALID_SWEEP','DC step must advance from start to end with at most 200000 nominal points.')
    if s['analysis']=='tran':
        s['duration_s']=number(s.get('duration_s',30e-9),'duration_s',1e-12,1e-3);s['step_s']=number(s.get('step_s',20e-12),'step_s',1e-12,s['duration_s'])
        if s['duration_s']/s['step_s']>200000:raise EDAError('ANALYSIS_RANGE','Transient permits at most 200000 nominal points.')
    if s.get('reference_spice'):s['reference_spice']=reference(s['reference_spice'],top,expected,Path(m['root']))
    return s,locked,inspection
def prepare_configuration(params):
    p=S.get_project(params['project_id']);s,locked,inspection=settings(params.get('settings'),p)
    if inspection['revision']!=p['revision']:raise EDAError('REVISION_CONFLICT','Geometry changed while validating the setup; inspect the new revision.')
    return p,s,locked,inspection
def configure_project(params,prepared):
    observed,s,locked,inspection=prepared;p=S.get_project(params['project_id'])
    if p['revision']!=observed['revision']:raise EDAError('REVISION_CONFLICT','Project changed while validating the setup; no configuration was committed.')
    if registry.lock(s['profile_id'])['fingerprint']!=locked['fingerprint']:raise EDAError('PROFILE_CHANGED','Profile changed during setup validation.')
    l=S.load_layout(p);old=p['revision'];p['cell']=s['top_cell']
    p.update(revision=p['next_revision'],next_revision=p['next_revision']+1,undo_stack=p.get('undo_stack',[])+[old],redo_stack=[])
    p['analysis_setup']={**s,'pdk_fingerprint':locked['fingerprint'],'profile_lock':locked['lock'],'layout_sha256':inspection['layout_sha256'],'extracted_ports':inspection['ports'],'inspection_id':inspection['inspection_id']};p['active_backend']='open-source'
    p['pdk_id']=s['profile_id']
    return S.commit(p,l,old,analysis_configuration=True)
def start(params,kind):
    if kind not in {'simulation','drc','lvs','pex'}:raise EDAError('UNSUPPORTED','Verification kind must be drc, lvs or pex.')
    p=S.get_project(params['project_id']);setup=p.get('analysis_setup')
    if not isinstance(setup,dict):raise EDAError('ANALYSIS_NOT_CONFIGURED','Inspect and configure this geometry before analysis.')
    locked=registry.lock(setup['profile_id'])
    if locked['fingerprint']!=setup['pdk_fingerprint']:raise EDAError('PROFILE_CHANGED','PDK resources changed since configuration; validate and configure again.')
    if profile.sha(S.snapshot_dir(p)/'layout.oas')!=setup['layout_sha256']:raise EDAError('LAYOUT_CHANGED','Geometry changed since inspection; inspect and configure again.')
    if not locked['capabilities'][kind]:raise EDAError('UNSUPPORTED_PROFILE','Selected profile lacks the required native resources.')
    if kind=='lvs':reference(setup.get('reference_spice'),setup['top_cell'],setup['extracted_ports'],Path(locked['manifest']['root']))
    rid=uuid.uuid4().hex;folder=S.STATE/'runs'/rid;folder.mkdir(parents=True);shutil.copyfile(S.snapshot_dir(p)/'layout.oas',folder/'input.oas')
    l=S.load_layout(p);l.write(str(folder/(setup['top_cell']+'.gds')));S.dump(folder/'project.json',p);S.dump(folder/'profile-lock.json',locked)
    run={'id':rid,'project_id':p['id'],'kind':kind,'workflow':'configured-layout','profile_id':setup['profile_id'],'revision':p['revision'],'execution_status':'queued','analysis_result':'unknown','freshness':'current','artifacts':{},'manifest_path':str(folder/'manifest.json'),'input_signature':signature(setup['profile_id'])}
    S.put_run(run);S.POOL.submit(S.execute_job,run,p,{'_configured':True,**copy.deepcopy(setup)},folder);return run
def model_deck(p,folder,params,m,r):
    if m['model_mode']=='sky130-subset':
        # Reuse the verified public subset builder only to write its model file.
        extracted=folder/('pex.spice' if params['pex'] else 'layout.spice')
        S.spice_tb({'cell':p['cell'],'example':'inverter','ports':params['extracted_ports']},folder,params,extracted)
        return f'.include "{folder/("supported-"+params["corner"]+".spice")}"'
    _,_,files,_=registry.resolve(m);root=Path(m['root']).resolve();models=folder/'models';models.mkdir()
    model_files=registry.spice_files(r['model_file'],root)
    # Preserve relative dependency structure, replacing validated absolute paths
    # with their immutable per-run copies before the simulator reads them.
    for filename in model_files:
        path=Path(filename);dest=models/path.relative_to(root);dest.parent.mkdir(parents=True,exist_ok=True);text=path.read_text()
        for dependency in model_files:text=text.replace(dependency,str(models/Path(dependency).relative_to(root)))
        dest.write_text(text)
    selected=models/r['model_file'].relative_to(root)
    return f'.lib "{selected}" {params["corner"]}' if m['model_mode']=='lib' else f'.include "{selected}"'
def simulate(run,p,folder,manifest,params,m,r):
    netlist=S.extract(run,p,folder,manifest,pex=params['pex'],resources=r);actual,text=ports_from(netlist,p['cell'])
    validate_globals(text,[row['name'] for row in params['ports'] if row['mode']!='floating'])
    if set(actual)!=set(params['extracted_ports']):raise EDAError('PORT_DECLARATIONS_CHANGED','Actual execution extraction differs from configured port names; reinspection required.')
    manifest['settings']['execution_port_order']=actual
    # No retained schematic/device identity can establish imported-GDS anchors.
    unlinked={**p,'schematic':{'devices':[],'wires':[]},'example':'imported','import_metadata':{'explicit_analysis':True}}
    probe,branches,warnings=current_flow.prepare(unlinked,netlist,folder,params['pex'])
    warnings.append('Eligible native M MOS and verified SKY130 wrapper terminal currents are measured. Other custom subcircuit/device terminal mappings are unsupported; explicit testbench bias-source currents are still measured by ngspice.')
    if params['pex']:warnings.append('Distributed R/C branch currents are omitted; exact spatial correspondence is unknown.')
    lines=['Register explicit imported-GDS port testbench',model_deck(p,folder,params,m,r),f'.option scale={m["spice_scale"]:.12g}',f'.include "{probe}"',f'.temp {params["temperature_C"]:.12g}']
    sources={}
    for index,row in enumerate(params['ports']):
        if row['mode']=='floating':continue
        name='VREGISTER_PORT_'+str(index);sources[row['name']]=name;lines.append(f'{name} {row["name"]} 0 {row["dc_V"]:.12g}')
    lines.append('XU '+' '.join(actual)+' '+p['cell']);current_flow.add_testbench_voltage_branches(lines,branches)
    if not branches:raise EDAError('CURRENT_UNSUPPORTED','No actual measurable branch currents are available for this configured cell.')
    lines+=['.control','set num_threads=1','set noaskquit','set wr_singlescale','set wr_vecnames']
    analysis=params['analysis'];xunit='point' if analysis=='op' else 'V' if analysis=='dc' else 's'
    if analysis=='op':lines+=['op']
    elif analysis=='dc':lines += [f'dc {sources[params["sweep_port"]]} {params["start_V"]:.12g} {params["end_V"]:.12g} {params["step_V"]:.12g}']
    else:lines += [f'tran {params["step_s"]:.12g} {params["duration_s"]:.12g}']
    lines += [f'let register_port_{i} = v({name})' for i,name in enumerate(actual)];lines+=['wrdata waveform.dat '+' '.join(f'register_port_{i}' for i in range(len(actual))),'write waveform.raw','quit','.endc','.end']
    probes=current_flow.voltage_probes(branches,folder)
    deck=folder/'testbench.spice';deck.write_text(current_flow.instrument_control('\n'.join(lines)+'\n',branches,voltage_probes=probes));log=S.process(run,folder,['ngspice','-b',str(deck)],'ngspice',manifest)
    if any(t in log.lower() for t in ('fatal error','timestep too small','unknown subckt','singular matrix','error on line','simulation interrupted')):raise EDAError('SIMULATION_FAILED','Configured ngspice analysis failed; original native log retained.')
    data=folder/'waveform.dat'
    if not data.is_file():raise EDAError('SIMULATION_FAILED','Configured ngspice produced no actual waveform.')
    values=[]
    for line in data.read_text().splitlines()[1:]:
        nums=[float(v) for v in line.split()]
        if len(nums)!=len(actual)+1 or any(not math.isfinite(v) for v in nums):raise EDAError('PARSER_FAILED','Configured waveform has invalid columns.')
        values.append(nums)
    if not values:raise EDAError('PARSER_FAILED','Configured waveform contains no actual samples.')
    run['waveforms']=[{'name':name,'unit':'V','x':[v[0] for v in values],'y':[v[i+1] for v in values]} for i,name in enumerate(actual)]
    flow=current_flow.read(folder,unlinked,analysis,xunit,branches,S.load_layout(p));flow.update(project_id=p['id'],run_id=run['id'],layout_sha256=profile.sha(folder/'input.oas'),notes=[current_flow.METHOD,'All imported-GDS current branches are spatially unmapped; no current streamline is reconstructed.',*warnings]);run['current_flow']=flow
    run.update(analysis_result='pass',message=f'Actual configured ngspice {analysis}: {len(values)} samples; no inferred physical current path.',measurements={'analysis':analysis,'x_unit':xunit,'x_label':params.get('sweep_port','OP' if analysis=='op' else 'time'),'samples':len(values),'corner':params['corner'],'temperature_C':params['temperature_C'],'profile_id':params['profile_id'],'current_flow_status':'available_partial','post_layout':str(params['pex']).lower()})
    run['artifacts'].update(testbench=str(deck),waveform_data=str(data),waveform_raw=str(folder/'waveform.raw'),current_flow_data=str(folder/'current-flow.dat'),current_probe_netlist=str(probe))
    if flow.get('node_voltages'):run['artifacts'].update(node_voltage_data=str(folder/'node-voltages.dat'),node_voltage_probes=str(folder/'voltage-probes.json'))
    manifest['current_flow']={'status':'available_partial','method':current_flow.METHOD,'mapping':'unmapped','warnings':warnings,'branches':[dict(b,values_A=None) for b in branches]}
def execute(run,p,folder,manifest,params):
    locked,m,r=resources(params['profile_id'])
    if locked['fingerprint']!=params['pdk_fingerprint']:raise EDAError('PROFILE_CHANGED','PDK resources changed after job submission.')
    p={**p,'cell':params['top_cell'],'ports':params['extracted_ports']}
    manifest.update(pdk=locked,model_files=locked['lock']['files'],configured_analysis=True);manifest['settings']['ngspice_num_threads']=1
    if run['kind']=='simulation':run['tool']='Magic + ngspice';simulate(run,p,folder,manifest,params,m,r)
    elif run['kind']=='drc':run['tool']='Magic';S.drc(run,p,folder,manifest,r)
    elif run['kind']=='pex':run['tool']='Magic';S.extract(run,p,folder,manifest,pex=True,resources=r)
    elif run['kind']=='lvs':
        run['tool']='Magic + Netgen';layout=S.extract(run,p,folder,manifest,resources=r);ref=folder/'reference.spice';ref.write_text(reference(params.get('reference_spice'),p['cell'],p['ports'],Path(m['root'])));report=folder/'lvs.log'
        S.process(run,folder,['netgen','-batch','lvs',f'{layout} {p["cell"]}',f'{ref} {p["cell"]}',str(r['netgen_setup']),str(report),'-json'],'netgen-lvs',manifest)
        if not report.is_file():raise EDAError('PARSER_FAILED','Configured Netgen produced no report.')
        text=report.read_text()
        if 'Circuits match uniquely.' in text and 'Property errors were found.' not in text:result='pass'
        elif any(t in text for t in ('Circuits do not match.','Property errors were found.','Netlists do not match.','Circuits match with','failed pin matching')):result='fail'
        else:raise EDAError('PARSER_FAILED','Configured native LVS result is unrecognized; report preserved.')
        run.update(analysis_result=result,message='Actual configured Netgen: '+result);run['artifacts'].update(reference_netlist=str(ref),lvs_report=str(report))
    if registry.lock(params['profile_id'])['fingerprint']!=locked['fingerprint']:raise EDAError('PROFILE_CHANGED','Native profile changed during execution; result cannot be certified as current.')
