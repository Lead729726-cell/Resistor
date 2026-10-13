"""Revision-bound, native GDS recovery and constrained PCell layout previews.

Extraction uses mask geometry and the selected Magic deck, never saved schematic
metadata. A recovered editable graph must match its extracted graph in Netgen.
Neither a generated layout nor that parser check is a DRC/LVS/signoff result.
"""
import copy
import hashlib
import json
import math
from pathlib import Path
import re
import shutil
import uuid
import klayout.db as k
import native, profile, pdk_registry, configured_analysis, physical_library, digital_units, floorplan
import geometry as G
from geometry import EDAError

S = None
IDENT = re.compile(r'[A-Za-z_][A-Za-z0-9_]{0,127}\Z')
MAX_DEVICES = 4096
LIMITS = [
    'PDK extraction recovers the transistor/passive net graph, not the original symbol placement, design intent or lost hierarchy.',
    'Unsupported models/parameters and extraction errors are retained; partial graphs cannot replace a schematic.',
    'Exact device-terminal-to-polygon mapping is unavailable in this adapter.',
    'Forward layout supports up to 512 SKY130 MOS/poly/MIM primitives; rectangular chip envelopes and four whole-layout orientations.',
    'Ideal passive replacement is an explicit nominal geometry estimate. DRC/LVS/PEX, noise/yield/STA and manufacturing approval remain independent.'
]

def configure(server):
    global S
    S = server

def keys(value, allowed):
    if not isinstance(value, dict) or set(value)-set(allowed):
        raise EDAError('INVALID_CONVERSION', 'Unsupported conversion fields.')

def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()).hexdigest()

def identifier(value, label):
    if not isinstance(value, str) or not IDENT.fullmatch(value):
        raise EDAError('UNSUPPORTED_NAME', label+' must be an explicit native identifier.')
    return value

def number(token, dimension=False):
    match = re.fullmatch(r'([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)(meg|[tgkmunpf]?)', token, re.I)
    if not match: raise EDAError('UNSUPPORTED_VALUE', 'Expressions and ambiguous numeric values are not evaluated: '+token[:80])
    suffix = match[2].lower()
    scale = {'':1, 't':1e12, 'g':1e9, 'meg':1e6, 'k':1e3, 'm':1e-3, 'u':1e-6, 'n':1e-9, 'p':1e-12, 'f':1e-15}[suffix]
    # Our controlled Magic scale-off deck emits unsuffixed W/L in micrometres.
    result = float(match[1])*scale*(1e6 if dimension and suffix else 1)
    if not math.isfinite(result) or result <= 0: raise EDAError('UNSUPPORTED_VALUE', 'Extracted dimensions and passive values must be positive finite numbers.')
    return result

def parse_extracted(text, top):
    """Only controlled flat Magic output. No executable directives or guessing."""
    if len(text.encode()) > 8*1024*1024: raise EDAError('RECOVERY_LIMIT', 'Editable recovery is limited to 8 MiB of extracted SPICE.')
    rows = configured_analysis.logical_text(text).splitlines()
    active = False; found = False; ports = []; devices = []; losses = []; issues = []; globals_ = []
    for line_number, row in enumerate(rows, 1):
        fields = row.split()
        if not fields or fields[0].startswith('*'): continue
        command = fields[0].lower()
        if command == '.subckt':
            if len(fields)<2 or fields[1].lower()!=top.lower() or found:
                raise EDAError('EXTRACTED_HIERARCHY', 'Expected exactly one flattened selected subcircuit.')
            found = active = True; ports = fields[2:]; continue
        if command == '.ends': active = False; continue
        if command == '.global': globals_.extend(fields[1:]); continue
        if command.startswith('.'):
            issues.append({'line':line_number, 'code':'UNSUPPORTED_DIRECTIVE', 'message':row[:200]}); continue
        if not active: issues.append({'line':line_number,'code':'OUTSIDE_TOP','message':row[:200]}); continue
        if len(devices)+len(issues)>=MAX_DEVICES: raise EDAError('RECOVERY_LIMIT','Recovery is limited to 4096 extracted device records.')
        try:
            head = fields[0][0].upper(); raw_name = fields[0]
            d = {'id':'extract:'+str(line_number), 'name':'E_'+str(line_number), 'x':180+(len(devices)%5)*260, 'y':150+(len(devices)//5)*190, 'pins':{}, 'parameters':{}}
            if head == 'X':
                split = next((i for i,f in enumerate(fields[1:],1) if '=' in f), len(fields))
                if split<3: raise EDAError('UNSUPPORTED_DEVICE','Missing extracted model.')
                model = fields[split-1]; nodes = fields[1:split-1]; pars = {}
                for field in fields[split:]:
                    if field.count('=')!=1: raise EDAError('UNSUPPORTED_PARAMETER','Malformed extracted parameter.')
                    key,value=field.split('=');key=key.lower()
                    if key in pars: raise EDAError('UNSUPPORTED_PARAMETER','Duplicate extracted parameter.')
                    pars[key]=value
                kind = native.MODEL_KIND.get(model) or native.PASSIVE_MODELS.get(model)
                if not kind: raise EDAError('UNSUPPORTED_MODEL','No verified editable symbol/model mapping: '+model)
                expected = 4 if kind in ('nmos','pmos') else 3 if kind=='resistor' else 2
                if len(nodes)!=expected: raise EDAError('EXTRACTED_PIN_ORDER','Unexpected primitive terminal count.')
                d.update(kind=kind, model=model)
                if kind in ('nmos','pmos'):
                    d['pins']=dict(zip(('D','G','S','B'),nodes));d['parameters']={'w_um':number(pars['w'],True),'l_um':number(pars['l'],True),'nf':number(pars.get('nf','1')),'m':number(pars.get('m','1'))}
                    omitted=set(pars)-{'w','l','nf','m'}
                    if omitted-{'ad','as','pd','ps','nrd','nrs'}:raise EDAError('UNSUPPORTED_PARAMETER','Unverified extracted MOS parameters: '+', '.join(sorted(omitted)))
                    if omitted: losses.append({'device':raw_name,'parameters':sorted(omitted),'scope':'Native extracted SPICE retains junction geometry. Editable symbol retains W/L/nf/m; no exact simulation equivalence claim.'})
                else:
                    if model=='sky130_fd_pr__res_high_po_0p35':raise EDAError('UNSUPPORTED_PASSIVE_CALIBRATION','Raw high-poly model is retained; editable nominal value calibration is not implemented for this variant.')
                    if set(pars)-{'w','l','m'} or number(pars.get('m','1'))!=1:raise EDAError('UNSUPPORTED_PARAMETER','Unsupported passive multiplicity/parameters.')
                    length=number(pars['l'],True)
                    width=number(pars.get('w','1.41' if model==physical_library.RES else '.35'),True)
                    value=(2*width*length+.38*(width+length))*1e-15 if kind=='capacitor' else (physical_library.RES_CONTACT+physical_library.RES_SLOPE*length if model==physical_library.RES else 1000/width*length)
                    d['pins']=dict(zip(('+','-','B') if kind=='resistor' else ('+','-'),nodes));d['parameters']={'w_um':width,'l_um':length,'value':value}
            elif head in ('R','C') and len(fields)==4:
                d.update(kind='resistor' if head=='R' else 'capacitor',pins={'+':fields[1],'-':fields[2]},parameters={'value':number(fields[3])})
            else: raise EDAError('UNSUPPORTED_DEVICE','Unsupported extracted device record.')
            native.validate_device(d);devices.append(d)
        except (EDAError,KeyError) as error:
            issues.append({'line':line_number,'code':getattr(error,'code','MISSING_PARAMETER'),'message':str(error),'record':row[:400]})
    if not found or active: raise EDAError('EXTRACTION_FAILED','Selected flattened subcircuit is missing or incomplete.')
    if len(set(p.lower() for p in ports))!=len(ports) or any(not IDENT.fullmatch(p) for p in ports):
        issues.append({'code':'UNSUPPORTED_PORT','message':'Editable ports require unique native identifiers; raw extracted declarations remain in the SPICE artifact.'})
    ir={'ports':ports,'devices':devices,'wires':[],'junctions':[],'cells':{},'connectivity_mode':'explicit'}
    validation=native.validate(ir)
    issues.extend(validation['issues'])
    if not devices:issues.append({'code':'NO_RECOGNIZED_DEVICES','message':'The selected geometry produced no recognized editable devices.'})
    return {'schematic':ir,'ports':ports,'global_nodes':sorted(set(globals_)),'issues':issues,'losses':losses,'ready':not issues,'device_count':len(devices),'raw_device_names':{d['id']:rows[int(d['id'].split(':')[1])-1].split()[0] for d in devices}}

def resolved(ir):
    ir=copy.deepcopy(ir)
    for node in [ir,*ir.get('cells',{}).values()]:
        if node.get('connectivity_mode')=='geometric':
            graph,pins=native.connectivity(node)
            if graph['conflicts'] or graph['unconnected_pins']:raise EDAError('SCHEMATIC_INVALID','Resolve geometric wire conflicts and floating terminals first.',graph)
            for d in node['devices']:d['pins']={pin:pins[(d['id'],pin)] for pin in d['pins']}
        node.update(connectivity_mode='explicit',wires=[],junctions=[])
    valid=native.validate(ir)
    if not valid['valid']:raise EDAError('SCHEMATIC_INVALID','Schematic cannot be converted.',valid)
    return ir

def forward_input(p, settings):
    keys(settings,('chip_limits','pin_side','order','body_net'))
    policy=floorplan.policy(settings.get('chip_limits'));side=settings.get('pin_side','left');order=settings.get('order','source');body=settings.get('body_net','VGND')
    if side not in ('left','right','top','bottom') or order not in ('source','schematic','kind'):raise EDAError('INVALID_LAYOUT_SPEC','Select a supported pin side and placement order.')
    if not isinstance(body,str) or not native.NET.fullmatch(body):raise EDAError('INVALID_BODY_NET','Passive body must use an explicit actual circuit net.')
    if p.get('pdk_id')!='sky130A':raise EDAError('UNSUPPORTED_PDK','The forward PCell adapter supports the installed SKY130A profile.')
    ir=resolved({**p['schematic'],'ports':p.get('ports',p['schematic'].get('ports',[]))})
    # A child-local global 0 must not silently become a hierarchical net.
    if any('0' in d['pins'].values() for c in ir.get('cells',{}).values() for d in c['devices']):raise EDAError('GLOBAL_MAPPING_REQUIRED','Child-cell global 0 requires an explicit hierarchical ground port before placement.')
    flat=digital_units.flattened(ir)
    excluded=[{'name':d['name'],'kind':d['kind'],'pins':d['pins'],'parameters':d['parameters']} for d in flat['devices'] if d['kind'] in ('voltage','current')]
    flat['devices']=[d for d in flat['devices'] if d['kind'] not in ('voltage','current','ground','port')]
    nets={n for d in flat['devices'] for n in d['pins'].values()}
    # User-defined internal sources become explicitly recorded external ports,
    # so their original DC biases can be replayed without addressing guessed
    # hidden hierarchy nodes. This is disclosed in the preview interface.
    flat['ports']=list(dict.fromkeys([*flat['ports'],*[n for d in excluded if d['kind'] in ('voltage','current') for n in d['pins'].values() if n in nets and n!='0']]))
    if any(d['kind']=='resistor' and not d.get('model') for d in flat['devices']) and body not in nets:raise EDAError('INVALID_BODY_NET','The declared passive body net is absent from this actual circuit.')
    for d in flat['devices']:
        if d['kind'] in ('resistor','capacitor'):d['pins']={'+':d['pins'].get('+',d['pins'].get('1')),'-':d['pins'].get('-',d['pins'].get('2')),**({'B':d['pins']['B']} if 'B' in d['pins'] else {})}
    positions={d['id']:(d.get('y',0),d.get('x',0)) for d in flat['devices']}
    result,replacements=physical_library.materialize(flat,body_net=body)
    # Sort indivisible matched groups, never their internal ABBA order.
    groups=[];seen={}
    for d in result['devices']:
        group=d['id'].rpartition('.')[0]+'::'+d['matching_group'] if d.get('matching_group') else None
        if group in seen:groups[seen[group]].append(d)
        else:
            if group is not None:seen[group]=len(groups)
            groups.append([d])
    if order!='source':groups.sort(key=lambda g:(*positions.get(g[0]['id'].split(':p')[0],(g[0]['y'],g[0]['x'])),g[0]['name']) if order=='schematic' else (g[0]['kind'],g[0]['name']))
    result['devices']=[d for group in groups for d in group]
    if not result['devices']:raise EDAError('NO_PHYSICAL_DEVICES','The schematic contains no supported physical primitives.')
    for port in result['ports']:identifier(port,'Physical port')
    return result,{'chip_limits':floorplan.specification(policy),'pin_side':side,'order':order,'body_net':body},replacements,excluded

def start(params, direction):
    keys(params,('project_id','expected_revision','command_id','profile_id','top_cell','settings'))
    if 'expected_revision' not in params or not params.get('command_id'):raise EDAError('INVALID_COMMAND','Preview generation requires a revision and command ID.')
    def action():
        p=S.get_project(params['project_id']);layout=S.load_layout(p)
        settings=params.get('settings',{})
        if direction=='reverse':
            if settings:raise EDAError('INVALID_CONVERSION','Reverse recovery does not accept forward settings.')
            top=identifier(params.get('top_cell',p['cell']),'Selected top cell')
            if layout.cell(top) is None or layout.cell(top).is_empty():raise EDAError('NO_PHYSICAL_LAYOUT','Select a nonempty actual layout cell.')
            pid=params.get('profile_id','sky130A');locked,_,resources=configured_analysis.resources(pid)
        else:
            if set(params)&{'profile_id','top_cell'}:raise EDAError('INVALID_CONVERSION','Forward placement uses the source project SKY130A profile/root.')
            _,settings,_,_=forward_input(p,settings);top=identifier(p['cell'],'Root cell');pid='sky130A';locked=pdk_registry.lock(pid)
        rid=uuid.uuid4().hex;folder=S.STATE/'runs'/rid;folder.mkdir(parents=True)
        shutil.copyfile(S.snapshot_dir(p)/'layout.oas',folder/'input.oas');layout.write(str(folder/(top+'.gds')));S.dump(folder/'project.json',p)
        run={'id':rid,'project_id':p['id'],'kind':'schematic-recovery' if direction=='reverse' else 'layout-generation','revision':p['revision'],'execution_status':'queued','analysis_result':'unknown','freshness':'current','artifacts':{},'manifest_path':str(folder/'manifest.json'),'input_signature':S.input_signature()}
        request={'direction':direction,'top_cell':top,'profile_id':pid,'profile_hash':locked['fingerprint'],'settings':settings}
        S.put_run(run);S.POOL.submit(S.execute_job,run,p,{'_conversion':request},folder);return run
    return S.mutate('conversion.'+direction,params,action)

def execute(run,p,folder,manifest,request):
    direction=request['direction'];top=request['top_cell'];pid=request['profile_id'];locked,_,resources=configured_analysis.resources(pid)
    if locked['fingerprint']!=request['profile_hash']:raise EDAError('STALE_PDK','PDK changed after conversion was requested.')
    report={'schema_version':1,'direction':direction,'project_id':p['id'],'revision':p['revision'],'run_id':run['id'],'source_layout_sha256':profile.sha(folder/'input.oas'),'source_schematic_sha256':digest(p['schematic']),'profile_id':pid,'profile_hash':locked['fingerprint'],'settings':request['settings'],'limits':LIMITS,'verification':{'drc':'not-run','lvs':'not-run','pex':'not-run'},'foundry_signoff':False}
    preview=S.load_layout(p)
    if direction=='reverse':
        run['tool']='Magic + Netgen';script=folder/'recover.tcl';dest=folder/'extracted.spice'
        script.write_text(S.magic_input({'cell':top},folder,resources)+'extract all\next2spice lvs\next2spice scale off\next2spice format ngspice\next2spice subcircuit on\next2spice subcircuit top on\next2spice hierarchy off\next2spice merge none\n'+f'ext2spice -o {{{dest}}}\nquit -noprompt\n')
        S.process(run,folder,S.magic_args(folder,script,resources),'magic-recovery',manifest,timeout=300)
        if not dest.is_file():raise EDAError('EXTRACTION_FAILED','Native extractor returned no SPICE file.')
        recovered=parse_extracted(dest.read_text(),top);report.update(recovered);report['cell']=top;report['source']='actual-mask-geometry-and-Magic-PDK';report['parser_equivalence']='not-run'
        run['artifacts']['extracted_netlist']=str(dest)
        if recovered['ready'] and pid=='sky130A':
            typed=folder/'editable.spice';typed.write_text(native.emit(recovered['schematic'],top,recovered['ports']));log=folder/'parser-equivalence.log'
            S.process(run,folder,['netgen','-batch','lvs',f'{dest} {top}',f'{typed} {top}',str(resources['netgen_setup']),str(log),'-json'],'netgen-recovery',manifest,timeout=120)
            content=log.read_text(errors='replace');same='Circuits match uniquely.' in content and 'Property errors were found.' not in content
            report.update(ready=same,parser_equivalence='pass' if same else 'fail');run['artifacts'].update(editable_netlist=str(typed),parser_equivalence_log=str(log))
        else:report['ready']=False
        report['device_polygon_mapping']='unavailable; native netlist only'
    else:
        run['tool']='Magic PCells + KLayout';ir,spec,replacements,excluded=forward_input(p,request['settings'])
        limits=spec['chip_limits'];rotation={'left':0,'bottom':1,'right':2,'top':3}[spec['pin_side']]
        generator_limits={**limits}
        if rotation%2:generator_limits.update(width_um=limits['height_um'],height_um=limits['width_um'])
        preview=physical_library.physical(folder/'generator',ir,top,ir['ports'],generator_limits)
        preview.transform(k.Trans(rotation,False,0,0));bb=preview.cell(top).bbox();edge=round(limits['edge_um']/preview.dbu)
        preview.transform(k.Trans(edge-bb.left,edge-bb.bottom));envelope=floorplan.enforce(preview,top,floorplan.policy(limits))
        report.update(schematic=ir,ports=ir['ports'],cell=top,ready=True,device_count=len(ir['devices']),passive_replacements=replacements,external_sources=excluded,envelope=envelope,placement_order=[d['name'] for d in ir['devices']],source='actual-SKY130-PCells-and-bounded-routing',hierarchy='flattened physical graph; original source remains in project history',issues=[],losses=[])
        route=folder/'generator/routing-report.json';report['routing']=json.loads(route.read_text());run['artifacts']['routing_report']=str(route)
    if S.get_run(run['id'])['execution_status']=='canceled':raise EDAError('CANCELED','Conversion was canceled; preview was not applied.')
    G.assign_ids(preview);preview.write(str(folder/'preview.oas'))
    report['preview_layout_sha256']=profile.sha(folder/'preview.oas');S.dump(folder/'schematic.json',report['schematic'])
    report['schematic_sha256']=profile.sha(folder/'schematic.json');report['preview_hash']=digest(report)
    S.dump(folder/'conversion.json',report);run['artifacts'].update(conversion_report=str(folder/'conversion.json'),preview_layout=str(folder/'preview.oas'),recovered_schematic=str(folder/'schematic.json'))
    run.update(analysis_result='unknown',measurements={'direction':direction,'device_count':report['device_count'],'ready':report['ready'],'parser_equivalence':report.get('parser_equivalence','not-applicable'),'drc':'not-run','lvs':'not-run','pex':'not-run'},message=('Preview ready' if report['ready'] else 'Recovery incomplete; inspect unsupported records')+'; source project unchanged; physical verification not run.')

def result(params):
    keys(params,('project_id','run_id'))
    run=S.get_run(params['run_id'])
    if run['project_id']!=params['project_id'] or run['kind'] not in ('schematic-recovery','layout-generation'):raise EDAError('PROJECT_MISMATCH','Conversion belongs to a different source.')
    if run['execution_status']!='completed':raise EDAError('CONVERSION_NOT_COMPLETE','Read the actual job state/logs; conversion is not complete.')
    folder=S.STATE/'runs'/run['id'];report=json.loads((folder/'conversion.json').read_text())
    if report['preview_layout_sha256']!=profile.sha(folder/'preview.oas') or report['schematic_sha256']!=profile.sha(folder/'schematic.json'):raise EDAError('ARTIFACT_CHANGED','Conversion artifacts no longer match their hashes.')
    check={k:v for k,v in report.items() if k!='preview_hash'}
    if digest(check)!=report['preview_hash']:raise EDAError('ARTIFACT_CHANGED','Conversion report no longer matches its hash.')
    layout=k.Layout();layout.read(str(folder/'preview.oas'));p=S.get_project(run['project_id']);view={**p,'revision':run['revision'],'cell':report['cell'],'schematic':report['schematic'],'ports':report['ports'],'layers':pdk_registry.layers(layout,report['profile_id'])}
    return {'report':report,'run':run,'scene':G.scene(layout,view,view['layers'],{'max_shapes':2000})}

def apply(params):
    keys(params,('project_id','expected_revision','command_id','run_id','preview_hash','approved'))
    if params.get('approved') is not True or not params.get('command_id') or 'expected_revision' not in params:raise EDAError('APPROVAL_REQUIRED','Review the exact preview before applying this undoable revision.')
    def action():
        value=result({'project_id':params['project_id'],'run_id':params['run_id']});report=value['report'];run=value['run'];p=S.get_project(params['project_id'])
        if not report['ready'] or run['freshness']!='current' or report['revision']!=p['revision'] or report['preview_hash']!=params.get('preview_hash'):raise EDAError('STALE_PREVIEW','Conversion is incomplete, changed or stale; generate and review a new preview.')
        if pdk_registry.lock(report['profile_id'])['fingerprint']!=report['profile_hash']:raise EDAError('STALE_PDK','PDK resources changed after preview.')
        if digest(p['schematic'])!=report['source_schematic_sha256'] or profile.sha(S.snapshot_dir(p)/'layout.oas')!=report['source_layout_sha256']:raise EDAError('STALE_PREVIEW','Source geometry or schematic changed.')
        layout=k.Layout();layout.read(str(S.STATE/'runs'/run['id']/'preview.oas'));old=p['revision']
        p.update(revision=p['next_revision'],next_revision=p['next_revision']+1,undo_stack=p.get('undo_stack',[])+[old],redo_stack=[],schematic=report['schematic'],ports=report['ports'],cell=report['cell'],pdk_id=report['profile_id'],source='pdk',layout_parameter_policy='reference-layout-independent-edit',conversion={'direction':report['direction'],'run_id':run['id'],'source_revision':old,'preview_hash':report['preview_hash'],'parser_equivalence':report.get('parser_equivalence'),'physical_verification':'not-run','external_sources':report.get('external_sources',[])})
        for key in ('analysis_setup','interchange_netlist','interchange_layout','interchange_report','backend_setup','active_backend'):p.pop(key,None)
        if report['direction']=='forward':
            p['chip_limits']=floorplan.policy(report['settings']['chip_limits'])
            if report['external_sources']:
                # Internal source symbols have become explicit external bias
                # ports. An old template stimulus must not override them.
                for key in ('design_template','digital_unit','semiconductor_starter'):p.pop(key,None)
                p['example']='converted'
            elif p.get('design_template'):p['design_template'].update(layout_status='generated-public-core',physical_adapter='sky130-pcell-library-v1',passive_replacements=report['passive_replacements'],physical_verification='not-run')
            elif not p.get('digital_unit'):p['example']='converted'
        else:
            for key in ('design_template','digital_unit','semiconductor_starter','testbench'):p.pop(key,None)
            p['example']='converted'
        return S.commit(p,layout,parent=old)
    return S.mutate('conversion.apply',params,action)

def rpc(method,params):
    if method=='conversion.catalog':keys(params,());return {'profiles':pdk_registry.list_profiles(),'forward_pdk':'sky130A','supported_models':{**native.MODEL_KIND,**native.PASSIVE_MODELS},'limits':LIMITS}
    if method=='conversion.reverse':return start(params,'reverse')
    if method=='conversion.forward':return start(params,'forward')
    if method=='conversion.result':return result(params)
    if method=='conversion.apply':return apply(params)
    raise EDAError('UNKNOWN_METHOD','Unknown conversion method.')
