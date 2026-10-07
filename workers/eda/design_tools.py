"""Bounded actual-PDK routing assistance and native schematic templates.

Preview checks geometry; it does not certify DRC/LVS, net connectivity or signoff.
Only the installed, hashed SKY130 Magic resources are accepted by this adapter.
"""
import copy
from decimal import Decimal
import hashlib
import json
import math
from pathlib import Path
import re
import uuid
import klayout.db as k
import geometry as G
from geometry import EDAError
import native
import profile
import templates as physical_templates
import digital_mux

S = None
VERSION = 'register-design-tools-2'
MAX_SHAPES = 100000
LIMITS = [
    'Single metal1 (68/20) Manhattan path; no new vias or contacts.',
    'Conservative 0.28um spacing applies to all other or unknown-net metal, including wide-metal halos.',
    'New path width must be below 3um; metal area is checked using actual integer polygon geometry.',
    'Contacts/vias intersecting the new path are rejected; no inferred electrical connection is certified.',
    'Density, antenna, slots, metal-hole, contact enclosure and full-chip checks require separate actual DRC.',
    'A valid preview is not a DRC/LVS/signoff pass. Net properties are explicit annotations, not extraction proof.'
]

def configure(server):
    global S
    S = server

def digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()

def require_keys(params, allowed):
    if not isinstance(params,dict) or set(params)-set(allowed):
        raise EDAError('UNSUPPORTED_PARAMETER','Unsupported design-tool fields.')

def model_resources(corner):
    if corner not in ('tt','ss','ff','sf','fs'):raise EDAError('INVALID_CORNER','Supported public corners: tt/ss/ff/sf/fs.')
    root=profile.ROOT/'libs.tech/ngspice'
    files=[root/'all.spice',root/'parameters/lod.spice']
    for model in ('nfet_01v8','pfet_01v8_hvt'):
        base=profile.ROOT/'libs.ref/sky130_fd_pr/spice'
        files += [base/f'sky130_fd_pr__{model}__{corner}.pm3.spice',base/f'sky130_fd_pr__{model}__mismatch.corner.spice']
    if not all(p.is_file() for p in files):raise EDAError('PDK_MISSING','Required actual supported SKY130 model resources are missing.')
    return [{'path':str(p),'sha256':profile.sha(p)} for p in files]

def supported_model_deck(folder,corner):
    resources=model_resources(corner);folder=Path(folder);folder.mkdir(parents=True,exist_ok=True)
    all_file=Path(resources[0]['path']);text=all_file.read_text()
    marker='* include all individual diode models'
    if marker not in text:raise EDAError('PDK_RULE_UNSUPPORTED','Installed model preamble is outside the verified adapter grammar.')
    header=text.split(marker)[0].replace('.include "parameters/lod.spice"',f'.include "{resources[1]["path"]}"')
    # No arbitrary uploaded include, source or private control content enters this file.
    deck=folder/f'supported-{corner}.spice'
    deck.write_text('.param mc_mm_switch=0 mc_pr_switch=0\n'+header+'\n'+'\n'.join(f'.include "{r["path"]}"' for r in resources[2:])+'\n')
    return deck

def _rule_values(tech,rc):
    def field(pattern):
        matches=re.findall(pattern,tech,re.M)
        if len(matches)!=1:raise EDAError('PDK_RULE_UNSUPPORTED','Actual technology rules do not match the verified metal1 adapter grammar.')
        return int(matches[0])
    width=field(r'^\s*width \*m1,rm1 (\d+) "Metal1 width .*\(met1\.1\)"')
    spacing=field(r'^\s*spacing allm1,m1fill allm1,\*obsm1,m1fill (\d+) touching_ok "Metal1 spacing .*\(met1\.2\)"')
    area=field(r'^\s*area allm1,\*obsm1 (\d+) \d+ "Metal1 minimum area .*\(met1\.6\)"')
    wide=field(r'^\s*widespacing allm1 3005 allm1,\*obsm1,m1fill (\d+) touching_ok')
    halo=field(r'^\s*cifspacing m1_large_halo m1_large_halo (\d+) touching_ok')
    # This exact installed Magic adapter uses nanometre rule values and 5nm startup grid.
    if not re.search(r'cifoutput\s+.*?style gdsii variants.*?scalefactor 10\s+nanometers\s+options calma-permissive-labels\s+gridlimit 5',tech,re.S):raise EDAError('PDK_RULE_UNSUPPORTED','Unverified technology units/grid.')
    if not re.search(r'Put grid on 0\.005 pitch',rc) or 'scalegrid 1 2' not in rc:raise EDAError('PDK_RULE_UNSUPPORTED','Actual Magic startup does not declare the verified 5nm grid.')
    if not re.search(r'calma\s+68\s+20',tech):raise EDAError('PDK_RULE_UNSUPPORTED','Actual metal1 GDS stream mapping is missing.')
    if min(width,spacing,area,wide,halo)<=0 or wide<spacing or halo<spacing:raise EDAError('PDK_RULE_UNSUPPORTED','Invalid actual metal1 rules.')
    return width,spacing,area,max(wide,halo),5

def routing_rules(p):
    if p.get('pdk_id')!='sky130A' or p.get('analysis_setup') or p.get('native_database') or p.get('active_backend') or p.get('interchange_layout',{}).get('reader')=='native-database':
        raise EDAError('PDK_RULE_UNSUPPORTED','Routing assistance currently accepts the built-in installed SKY130A profile only; registered/native-database decks need an explicit adapter.')
    resources=[profile.TECH,profile.MAGIC_RC,profile.ROOT/'libs.tech/magic/sky130A.tcl']
    if not all(path.is_file() for path in resources):raise EDAError('PDK_MISSING','Actual Magic tech/startup/via helper resources are missing.')
    blobs=[path.read_bytes() for path in resources]
    tech=blobs[0].decode('utf-8');rc=blobs[1].decode('utf-8');width,spacing,area,wide,grid=_rule_values(tech,rc)
    dbu=Decimal(str(p['dbu_um']))
    if not dbu.is_finite() or dbu<=0:raise EDAError('INVALID_DBU','Layout DBU must be a positive finite micrometre value.')
    def dbu_nm(n,area_unit=False):
        result=Decimal(n)/(Decimal(1000000)*dbu*dbu if area_unit else Decimal(1000)*dbu)
        if result!=result.to_integral_value():raise EDAError('PDK_GRID_UNREPRESENTABLE','Layout DBU cannot exactly represent actual PDK rules/grid.')
        return str(int(result))
    layer={'layer_id':'68/20','name':'metal1','min_width_dbu':dbu_nm(width),'min_spacing_dbu':dbu_nm(spacing),'min_area_dbu2':dbu_nm(area,True),'grid_dbu':dbu_nm(grid),'conservative_spacing_dbu':dbu_nm(wide),'max_supported_width_exclusive_dbu':dbu_nm(3000),'source_rules':['met1.1','met1.2','met1.6','met1.3a','met1.3b']}
    hashes=[hashlib.sha256(blob).hexdigest() for blob in blobs]
    record={'schema_version':1,'adapter':VERSION,'profile_id':'sky130A','dbu_um':str(dbu),'resources':[{'path':str(path),'sha256':sha} for path,sha in zip(resources,hashes)],'layers':[layer],'supported_scope':'single-layer Manhattan; no via creation','via_resources':[{'path':str(resources[2]),'sha256':hashes[2],'helper':'sky130::via1_draw','execution':'not used by routing'}],'limits':LIMITS}
    record['fingerprint']=digest(record);return record

def _route(p,params,_context=None):
    require_keys(params,('project_id','layer_id','start','end','width','net','order','points','rule_fingerprint'))
    rules=_context['rules'] if _context else routing_rules(p);rule=rules['layers'][0]
    if params.get('rule_fingerprint') is not None and params['rule_fingerprint']!=rules['fingerprint']:raise EDAError('STALE_RULES','PDK rule fingerprint changed; reload rules and preview.')
    if params.get('layer_id')!='68/20':raise EDAError('UNSUPPORTED_LAYER','Only actual SKY130 metal1 68/20 is supported.')
    project_grid=p.get('grid_dbu')
    if isinstance(project_grid,bool) or not isinstance(project_grid,int) or project_grid<1:raise EDAError('INVALID_GRID','Project edit grid must be a positive integer DBU value.')
    grid=math.lcm(int(rule['grid_dbu']),project_grid)
    def point(name):
        v=params.get(name)
        if not isinstance(v,list) or len(v)!=2:raise EDAError('INVALID_GEOMETRY','Start/end must be two canonical decimal DBU coordinates.')
        return [G.coord(x,grid) for x in v]
    start,end=point('start'),point('end')
    if start==end:raise EDAError('INVALID_GEOMETRY','Route endpoints must differ.')
    width=G.coord(params.get('width',rule['min_width_dbu']),grid)
    if width<int(rule['min_width_dbu']) or width%(2*grid) or width>=int(rule['max_supported_width_exclusive_dbu']):raise EDAError('ROUTE_WIDTH','Width must satisfy actual minimum, have on-grid edges, and be below 3um.')
    net=params.get('net')
    if net is not None and (not isinstance(net,str) or len(net)>128 or not native.NET.fullmatch(net)):raise EDAError('INVALID_NET','Explicit annotation must be a bounded supported net name.')
    order=params.get('order','x-first')
    if order not in ('x-first','y-first'):raise EDAError('INVALID_GEOMETRY','Route order must be x-first/y-first.')
    corner=[end[0],start[1]] if order=='x-first' else [start[0],end[1]]
    points=[start]+([corner] if corner not in (start,end) else [])+[end]
    if 'points' in params:
        raw=params['points']
        if not isinstance(raw,list) or not 2<=len(raw)<=16 or any(not isinstance(v,list) or len(v)!=2 for v in raw):raise EDAError('INVALID_GEOMETRY','Custom route needs 2..16 canonical on-grid points.')
        points=[[G.coord(v,grid) for v in xy] for xy in raw]
        if points[0]!=start or points[-1]!=end:raise EDAError('INVALID_GEOMETRY','Custom path endpoints must match start/end.')
        segments=list(zip(points,points[1:]))
        for i,(a,b) in enumerate(segments):
            if a==b or (a[0]!=b[0] and a[1]!=b[1]):raise EDAError('INVALID_GEOMETRY','Custom path segments must be nonzero Manhattan segments.')
            for j,(c,d) in enumerate(segments[:i]):
                intersection=k.Edge(k.Point(*a),k.Point(*b)).intersects(k.Edge(k.Point(*c),k.Point(*d)))
                if intersection and j!=i-1:raise EDAError('INVALID_GEOMETRY','Custom path cannot cross or revisit itself.')
                if j==i-1 and a[0]==b[0]==c[0]==d[0] and (b[1]-a[1])*(d[1]-c[1])<0 or j==i-1 and a[1]==b[1]==c[1]==d[1] and (b[0]-a[0])*(d[0]-c[0])<0:raise EDAError('INVALID_GEOMETRY','Custom path cannot reverse over an adjacent segment.')
    path=k.Path([k.Point(*xy) for xy in points],width)
    box=path.bbox()
    spacing=int(rule['conservative_spacing_dbu'])
    for value in (box.left-spacing,box.bottom-spacing,box.right+spacing,box.top+spacing):G.coord(str(value))
    region=k.Region(path.polygon());area=int(region.area())
    if area<int(rule['min_area_dbu2']):raise EDAError('ROUTE_AREA','Actual proposed polygon area is below the PDK metal1 minimum area.')
    layout=_context['layout'] if _context else S.load_layout(p);top=layout.cell(p['cell']);collisions=[];checked=0;max_collision=128
    # Whole native hierarchy, independent of any truncated client scene or ROI.
    for shape,polygon,layer_id,occurrence in (_context['shapes'] if _context else G.walk(layout,top)):
        checked+=1
        if checked>MAX_SHAPES:raise EDAError('DESIGN_TOO_LARGE','Whole-layout route validation exceeds 100000 shapes; no partial-scene pass is returned.')
        if layer_id not in ('68/20','68/44','67/44'):continue
        reason=None;obstacle=k.Region(polygon)
        if layer_id=='68/20':
            same_annotation=bool(net is not None and shape.property(2)==net)
            # Annotation is not a physical connectivity proof. Only an actual
            # positive-area join avoids spacing; separate same-name metal remains an obstacle.
            if same_annotation and not (region & obstacle).is_empty():continue
            if not (region & obstacle.sized(spacing-1)).is_empty():reason='other/unknown net metal violates conservative spacing'
        elif not (region & obstacle).is_empty():reason='existing contact/via intersection has no verified electrical terminal mapping'
        if reason and len(collisions)<max_collision:collisions.append({'shape_id':f'{occurrence}/{shape.property(1)}','layer_id':layer_id,'reason':reason})
    payload={'project_id':p['id'],'revision':p['revision'],'rule_fingerprint':rules['fingerprint'],'layer_id':'68/20','points':[[str(x),str(y)] for x,y in points],'width':str(width),'net':net,'order':order,'geometry_hash':_context['geometry_hash'] if _context else G.semantic_hash(layout,top)}
    result={**payload,'preview_hash':digest(payload),'valid':not collisions,'length_dbu':str(sum(abs(a[0]-b[0])+abs(a[1]-b[1]) for a,b in zip(points,points[1:]))),'area_dbu2':str(area),'collisions':collisions,'checked_shape_count':checked,'scope':'whole native hierarchy','collision_list_bounded':len(collisions)>=max_collision,'limits':LIMITS}
    return result


def route_search(params):
    """Finite, deterministic single-layer detours; every candidate uses native checks."""
    require_keys(params,('project_id','layer_id','start','end','width','net','order','rule_fingerprint'))
    p=S.get_project(params['project_id']);rules=routing_rules(p);layout=S.load_layout(p);top=layout.cell(p['cell'])
    shapes=[]
    for item in G.walk(layout,top):
        shapes.append(item)
        if len(shapes)>MAX_SHAPES:raise EDAError('DESIGN_TOO_LARGE','Whole-layout route search limit exceeded; no partial inspection is accepted.')
    context={'rules':rules,'layout':layout,'shapes':shapes,'geometry_hash':G.semantic_hash(layout,top)}
    base=_route(p,params,context);rule=rules['layers'][0];grid=math.lcm(int(rule['grid_dbu']),p['grid_dbu']);width=int(base['width']);gap=width//2+int(rule['conservative_spacing_dbu'])+grid
    start=[int(v) for v in params['start']];end=[int(v) for v in params['end']];tracks=set()
    for shape,poly,layer,occurrence in shapes:
        if layer not in ('68/20','68/44','67/44'):continue
        box=poly.bbox()
        for axis,lower,upper in ((0,box.left,box.right),(1,box.bottom,box.top)):
            tracks.add((axis,((lower-gap)//grid)*grid));tracks.add((axis,-(-(upper+gap)//grid)*grid))
    tracks=sorted(tracks,key=lambda v:(abs(v[1]-start[v[0]])+abs(v[1]-end[v[0]]),v))
    inputs=[{**params,'order':'x-first'},{**params,'order':'y-first'}]
    for axis,value in tracks:
        raw=[start,[value,start[1]],[value,end[1]],end] if axis==0 else [start,[start[0],value],[end[0],value],end]
        points=[]
        for xy in raw:
            if not points or xy!=points[-1]:points.append(xy)
        # Endpoints on a track may reduce the path to an ordinary L route.
        inputs.append({**params,'points':[[str(v) for v in xy] for xy in points]})
    budget=min(32,max(2,1000000//max(1,len(shapes))));candidates=[];seen=set()
    for candidate in inputs[:budget]:
        try:preview=_route(p,candidate,context)
        except EDAError as e:
            if e.code in ('INVALID_GEOMETRY','ROUTE_AREA','COORDINATE_RANGE'):continue
            raise
        if preview['preview_hash'] in seen:continue
        seen.add(preview['preview_hash']);candidates.append((preview,candidate))
    candidates.sort(key=lambda item:(not item[0]['valid'],len(item[0]['collisions']),int(item[0]['length_dbu']),item[0]['points']))
    if not candidates:raise EDAError('NO_ROUTE_CANDIDATE','No valid candidate geometry could be inspected.')
    preview,selected=candidates[0]
    return {'schema_version':1,'project_id':p['id'],'revision':p['revision'],'preview':preview,'input':selected,'searched_candidates':len(candidates),'candidate_budget':budget,'search_exhaustive':False,'algorithm':'bounded bbox-track detours, ranked by collision then Manhattan length','scope':'single metal1; at most two bends; no vias/global optimization','status':'candidate-found' if preview['valid'] else 'blocked','limits':LIMITS+['A blocked finite search does not prove that no other route exists.']}

def route_apply(params):
    require_keys(params,('project_id','expected_revision','command_id','preview','preview_hash','rule_fingerprint'))
    if not params.get('command_id') or isinstance(params.get('expected_revision'),bool) or not isinstance(params.get('expected_revision'),int):raise EDAError('MUTATION_REQUIRED','Apply requires command_id and expected_revision.')
    def action():
        p=S.get_project(params['project_id']);preview=params.get('preview')
        if not isinstance(preview,dict) or preview.get('project_id',p['id'])!=p['id']:raise EDAError('PROJECT_MISMATCH','Preview must belong to this project.')
        computed=_route(p,{**preview,'project_id':p['id'],'rule_fingerprint':params.get('rule_fingerprint')})
        if computed['preview_hash']!=params.get('preview_hash'):raise EDAError('STALE_PREVIEW','Route inputs/geometry/revision differ from the preview hash.')
        if not computed['valid']:raise EDAError('ROUTE_COLLISION','Actual native geometry blocks the proposed route.',computed['collisions'])
        command={'type':'add_route','layer_id':computed['layer_id'],'points':computed['points'],'width':computed['width']}
        if computed.get('net') is not None:command['net']=computed['net']
        # Create an actual layer definition when it is absent from an empty
        # schematic-only layout. No placeholder geometry is inserted.
        layout=S.load_layout(p);layout.layer(68,20);p['layers']=profile.layers(layout)
        G.apply(layout,p,command)
        old=p['revision'];p.update(revision=p['next_revision'],next_revision=p['next_revision']+1,redo_stack=[],undo_stack=p.get('undo_stack',[])+[old])
        return S.commit(p,layout,parent=old)
    return S.mutate('design.route_apply',params,action)

CATALOG = {
    'mux4':{'name':'4:1 MUX · 20 MOS 전송 게이트 + 출력 버퍼','parameter_defaults':{'w_um':.65,'l_um':.15,'slot_ns':5.0,'rise_ns':.1},'ports':digital_mux.PORTS,'analyses':['tran'],'physical_status':'optional-fixed-public-core'},
    'rc_lowpass':{'name':'RC 저역통과 필터','parameter_defaults':{'resistance_Ohm':10000.0,'capacitance_F':1e-12},'ports':['IN','OUT','VGND'],'analyses':['tran','ac','op'],'physical_status':'not-generated'},
    'common_source':{'name':'MOS 공통 소스 · 명시적 게이트 바이어스','parameter_defaults':{'w_um':.65,'l_um':.15,'drain_resistance_Ohm':10000.0,'gate_bias_V':.7},'ports':['IN','OUT','VPWR','VGND'],'analyses':['op','ac','tran','dc'],'physical_status':'not-generated'},
    'common_source_bias':{'name':'MOS 공통 소스 · 저항 분압 바이어스','parameter_defaults':{'w_um':.65,'l_um':.15,'drain_resistance_Ohm':10000.0,'bias_top_Ohm':100000.0,'bias_bottom_Ohm':60000.0,'coupling_F':1e-12},'ports':['IN','OUT','VPWR','VGND'],'analyses':['op','ac','tran','dc'],'physical_status':'not-generated'},
    'current_mirror':{'name':'NMOS 전류 미러','parameter_defaults':{'w_um':.65,'l_um':.15,'reference_current_A':100e-6},'ports':['REF','OUT','VGND'],'analyses':['op','dc','tran'],'physical_status':'optional-fixed-public-core'},
    'differential_pair':{'name':'NMOS 차동 쌍','parameter_defaults':{'w_um':.65,'l_um':.15,'common_mode_V':.9,'tail_bias_V':.7,'differential_V':.01},'ports':['INP','INN','OUTP','OUTN','BIAS','VGND'],'analyses':['op','dc','tran'],'physical_status':'optional-fixed-public-core'}
}

def catalog():
    return {'schema_version':1,'templates':[{'id':key,**copy.deepcopy(value),'limits':['Actual native schematic and public ngspice models; no commercial execution claim.','Empty layout is not generated or physically verified.','Optional mirror/differential/MUX4 cores support only fixed W=0.65um L=0.15um nf=m=1; independent DRC/LVS required.']} for key,value in CATALOG.items()]}

def _parameters(template,raw):
    if not isinstance(raw,dict) or set(raw)-set(CATALOG[template]['parameter_defaults']):raise EDAError('UNSUPPORTED_PARAMETER','Unknown template parameter.')
    values={**CATALOG[template]['parameter_defaults'],**raw}
    for key,value in values.items():
        n=native.num(value)
        if key.endswith('_Ohm') and not 1<=n<=1e9:raise EDAError('PARAMETER_RANGE','Resistance must be 1..1e9 ohm.')
        if key.endswith('_F') and not 1e-18<=n<=1e-6:raise EDAError('PARAMETER_RANGE','Capacitance must be 1e-18..1e-6 F.')
        if key.endswith('_V') and not 0<=n<=1.8:raise EDAError('PARAMETER_RANGE','Voltage must be within 0..1.8V.')
        if key.endswith('_A') and not 1e-9<=n<=1e-3:raise EDAError('PARAMETER_RANGE','Reference current must be 1nA..1mA.')
        values[key]=n
    if template=='mux4':
        if not .5<=values['slot_ns']<=1000 or not .01<=values['rise_ns']<=values['slot_ns']*.1:raise EDAError('PARAMETER_RANGE','MUX slot must be 0.5..1000ns and rise 0.01ns..10% of slot.')
    if 'w_um' in values:native.validate_device({'id':'probe','name':'N','kind':'nmos','model':'sky130_fd_pr__nfet_01v8','pins':dict.fromkeys(('D','G','S','B'),'0'),'parameters':{'w_um':values['w_um'],'l_um':values['l_um'],'nf':1,'m':1}})
    return values

def _schematic(template,params):
    if template=='mux4':return digital_mux.schematic(params['w_um'],params['l_um'])
    devices=[]
    def device(id,name,kind,pins,parameters,**extra):
        devices.append({'id':id,'name':name,'kind':kind,'pins':pins,'parameters':parameters,'x':180+(len(devices)%3)*220,'y':180+(len(devices)//3)*200,**extra})
    def mos(id,name,pins):device(id,name,'nmos',pins,{'w_um':params['w_um'],'l_um':params['l_um'],'nf':1,'m':1},model='sky130_fd_pr__nfet_01v8')
    if template=='rc_lowpass':
        device('r1','R1','resistor',{'+':'IN','-':'OUT'},{'value':params['resistance_Ohm']})
        device('c1','C1','capacitor',{'+':'OUT','-':'VGND'},{'value':params['capacitance_F']})
    elif template in ('common_source','common_source_bias'):
        mos('mn1','MN1',{'D':'OUT','G':'IN' if template=='common_source' else 'GATE','S':'VGND','B':'VGND'})
        device('rd','RD','resistor',{'+':'VPWR','-':'OUT'},{'value':params['drain_resistance_Ohm']})
        if template=='common_source_bias':
            device('rb1','RB1','resistor',{'+':'VPWR','-':'GATE'},{'value':params['bias_top_Ohm']})
            device('rb2','RB2','resistor',{'+':'GATE','-':'VGND'},{'value':params['bias_bottom_Ohm']})
            device('cin','CIN','capacitor',{'+':'IN','-':'GATE'},{'value':params['coupling_F']})
    elif template=='current_mirror':
        mos('mn1','MN1',{'D':'REF','G':'REF','S':'VGND','B':'VGND'});mos('mn2','MN2',{'D':'OUT','G':'REF','S':'VGND','B':'VGND'})
    else:
        mos('mn1','MN1',{'D':'OUTP','G':'INP','S':'TAIL','B':'VGND'});mos('mn2','MN2',{'D':'OUTN','G':'INN','S':'TAIL','B':'VGND'});mos('mn3','MN3',{'D':'TAIL','G':'BIAS','S':'VGND','B':'VGND'})
    for port in CATALOG[template]['ports']:device('port_'+port,'PORT_'+port,'port',{'P':port},{})
    return {'schema_version':1,'connectivity_mode':'explicit','devices':devices,'wires':[],'junctions':[],'cells':{}}

def validate_template_project(p):
    meta=p.get('design_template')
    if not isinstance(meta,dict) or meta.get('schema_version')!=1 or meta.get('id') not in CATALOG or p.get('pdk_id')!='sky130A':raise EDAError('INVALID_TEMPLATE','Project has no supported explicit design template.')
    if p.get('ports')!=CATALOG[meta['id']]['ports'] or meta.get('layout_status') not in ('not-generated','generated-public-core'):raise EDAError('INVALID_TEMPLATE','Template ports or physical status do not match the declared contract.')
    _parameters(meta['id'],meta.get('parameters',{}))
    validation=native.validate(p['schematic'])
    if not validation['valid']:raise EDAError('INVALID_SCHEMATIC','Template native schematic has validation errors.',validation['issues'])
    return meta

def create_template(params):
    require_keys(params,('template_id','name','parameters','physical_core','command_id','starter_id','starter_mode'))
    template=params.get('template_id')
    if template not in CATALOG:raise EDAError('UNSUPPORTED_TEMPLATE','Unknown supported template.')
    starter=None
    if params.get('starter_id') is not None:
        from semiconductor_starters import configuration
        starter=configuration(params['starter_id'],params.get('starter_mode','nominal'))
        if starter.get('template_id')!=template or starter['parameters']!=params.get('parameters',{}) or starter['physical_core']!=params.get('physical_core',False):
            raise EDAError('STARTER_MISMATCH','Circuit/parameters/layout differ from the selected starter.')
    elif 'starter_mode' in params:raise EDAError('INVALID_PARAMETER','starter_mode requires starter_id.')
    cid=params.get('command_id')
    if not isinstance(cid,str) or not re.fullmatch(r'[A-Za-z0-9_.:-]{1,160}',cid):raise EDAError('INVALID_COMMAND_ID','Template creation requires a bounded command identifier.')
    payload=digest({'method':'design.create_template','params':params})
    # New-project commands have no project ID yet. Resolve their receipt before creating anything.
    with S.LOCK:
        rows=S.DB.execute('SELECT payload_hash,result FROM receipts WHERE command_id=?',(cid,)).fetchall()
        if rows:
            if len(rows)!=1 or rows[0][0]!=payload:raise EDAError('COMMAND_ID_CONFLICT','Command identifier was already used for different inputs.')
            return json.loads(rows[0][1])
        def action():
            values=_parameters(template,params.get('parameters',{}));physical=params.get('physical_core',False)
            if not isinstance(physical,bool):raise EDAError('INVALID_PARAMETER','physical_core must be boolean.')
            if physical and template not in ('current_mirror','differential_pair','mux4'):raise EDAError('UNSUPPORTED_PHYSICAL','Only the fixed public mirror/differential/MUX4 core is supported.')
            if physical and (values['w_um']!=.65 or values['l_um']!=.15):raise EDAError('UNSUPPORTED_PHYSICAL','Physical core requires exact fixed W=0.65um L=0.15um; custom schematic parameters have no layout binding.')
            model_resources('tt')
            name=params.get('name',CATALOG[template]['name'])
            if not isinstance(name,str) or not 1<=len(name)<=160 or any(ord(c)<32 for c in name):raise EDAError('INVALID_NAME','Project name must be a bounded plain string.')
            pid=uuid.uuid4().hex;cell=template;layout=k.Layout();layout.dbu=.001;layout.create_cell(cell);layout.layer(68,20)
            schematic=_schematic(template,values)
            if physical:
                layout,core,ports=digital_mux.physical(S.STATE/'projects'/pid/'generator') if template=='mux4' else physical_templates.analog(S,S.STATE/'projects'/pid/'generator',template)
                # Exact core graph is retained; visual port symbols are data-only schematic markers.
                schematic['devices']=[*core['devices'],*[d for d in schematic['devices'] if d['kind']=='port']]
            validation=native.validate(schematic)
            if not validation['valid']:raise EDAError('INVALID_SCHEMATIC','Generated template is invalid; project is not committed.',validation['issues'])
            duration=64*values['slot_ns']*1e-9 if template=='mux4' else 200e-9 if template=='rc_lowpass' else 100e-9
            meta={'schema_version':1,'id':template,'parameters':values,'layout_status':'generated-public-core' if physical else 'not-generated','physical_verification':'not-run','stimulus_source':'owned-template','ground_port':'VGND','generated_by':VERSION}
            p={'schema_version':1,'id':pid,'name':name,'cell':cell,'pdk_id':'sky130A','revision':1,'dbu_um':layout.dbu,'grid_dbu':5,'source':'pdk' if physical else 'fixture','example':template,'layers':[],'schematic':schematic,'testbench':native.testbench({'duration_s':duration,'step_s':100e-12,'analysis':'tran' if template in ('rc_lowpass','mux4') else 'op'}),'runs':[],'ports':list(CATALOG[template]['ports']),'redo_stack':[],'undo_stack':[],'next_revision':2,'design_template':meta,'layout_parameter_policy':'fixed_public_analog_core' if physical else 'schematic-only-no-generated-layout'}
            if starter:
                p.update(testbench=copy.deepcopy(starter['testbench']),semiconductor_starter=copy.deepcopy(starter['metadata']))
            return S.commit(p,layout)
        return S.mutate('design.create_template',params,action)

def _stimuli(p,settings):
    meta=validate_template_project(p);kind=meta['id'];v=meta['parameters'];supply=native.num(settings['supply_V']);sources=['VGND VGND 0 0'];vectors=[];names=[];units=[];sweep=None
    def voltage(name,pos,dc,ac=False,pulse=None):
        if not 0<=dc<=1.8:raise EDAError('STIMULUS_RANGE','Template voltage exceeds actual supported 1.8V model range.')
        line=f'{name} {pos} VGND {dc:.12g}'
        if ac:line+=' AC 1'
        if pulse:line+=' '+pulse
        sources.append(line)
    def output(name,vector,unit='V'):names.append(name);vectors.append(vector);units.append(unit)
    if kind=='mux4':
        extra,names,vectors,units,sweep=digital_mux.stimuli(settings,v)
        return sources+extra,names,vectors,units,sweep
    if kind=='rc_lowpass':
        tau=v['resistance_Ohm']*v['capacitance_F'];delay=1e-9
        voltage('VIN','IN',0,True,f'PULSE(0 {supply:.12g} {delay:.12g} 1e-12 1e-12 1 2)')
        output('IN','v(IN)');output('OUT','v(OUT)')
    elif kind in ('common_source','common_source_bias'):
        voltage('VDD','VPWR',supply);bias=v.get('gate_bias_V',0)
        delta=min(.01,max(.001,(1.8-bias)/2))
        voltage('VIN','IN',bias,True,f'PULSE({bias:.12g} {bias+delta:.12g} 10e-9 1e-12 1e-12 20e-9 40e-9)')
        output('IN','v(IN)');output('OUT','v(OUT)');output('supply_current','-i(VDD)','A')
        if kind=='common_source_bias':output('GATE','v(xu.GATE)')
        sweep=('VIN',0,1.8,.01)
    elif kind=='current_mirror':
        ref=v['reference_current_A'];sources.append(f'IREF 0 REF {ref:.12g}'+(f' PULSE({ref/2:.12g} {ref:.12g} 10e-9 1e-12 1e-12 20e-9 40e-9)' if settings['analysis']=='tran' else ''))
        voltage('VDOUT','OUT',supply);output('REF','v(REF)');output('OUT','v(OUT)');output('reference_current','i(VGND)','A');output('output_current','-i(VDOUT)','A')
        sweep=('VDOUT',0,supply,.01)
    else:
        common=v['common_mode_V'];delta=v['differential_V'];bias=v['tail_bias_V']
        if common+delta/2>1.8 or common-delta/2<0:raise EDAError('STIMULUS_RANGE','Differential source exceeds supported input rails.')
        voltage('VINP','INP',common+delta/2,pulse=f'PULSE({common-delta/2:.12g} {common+delta/2:.12g} 10e-9 1e-12 1e-12 20e-9 40e-9)' if settings['analysis']=='tran' else None)
        voltage('VINN','INN',common-delta/2);voltage('VBIAS','BIAS',bias);voltage('VOP','OUTP',supply);voltage('VON','OUTN',supply)
        output('INP','v(INP)');output('INN','v(INN)');output('output_current_P','-i(VOP)','A');output('output_current_N','-i(VON)','A');output('TAIL','v(xu.TAIL)')
        sweep=('VINP',max(0,common-.1),min(1.8,common+.1),.002)
    return sources,names,vectors,units,sweep

def pvt_sources(p):
    meta=validate_template_project(p);kind=meta['id']
    sources,analyses={
        'mux4':(['VDD'],['tran']),
        'rc_lowpass':(['VIN'],['tran']),
        'common_source':(['VDD'],['op','dc','ac','tran']),
        'common_source_bias':(['VDD'],['op','dc','ac','tran']),
        'current_mirror':(['VDOUT'],['op','tran']),
        'differential_pair':(['VOP','VON'],['op','dc','tran'])
    }[kind]
    return {'bindings':[{'kind':'testbench','source_names':sources}],'analyses':analyses,'source':'owned-template-stimuli','limits':['Supply changes only actual declared owned sources.','An analysis whose supply source is unused or swept cannot be declared a fixed-supply PVT point.']}

def spice_tb(p,folder,params,netlist):
    meta=validate_template_project(p);settings=native.testbench({**p.get('testbench',{}),**{key:params[key] for key in native.TESTBENCH if key in params}})
    analysis=settings['analysis']
    if analysis not in CATALOG[meta['id']]['analyses']:raise EDAError('UNSUPPORTED_ANALYSIS','This template has no verified stimulus for this analysis.')
    netlist=Path(netlist);sub=None
    for line in netlist.read_text().splitlines():
        fields=line.split()
        if len(fields)>=2 and fields[0].lower()=='.subckt' and fields[1].lower()==p['cell'].lower():sub=fields[2:];break
    if sub is None or len(sub)!=len(p['ports']) or len(set(sub))!=len(sub) or set(sub)!=set(p['ports']):raise EDAError('PORT_MISMATCH','Actual emitted/extracted subcircuit ports differ from explicit template declarations.')
    sources,names,vectors,units,sweep=_stimuli(p,settings);deck=supported_model_deck(folder,settings['corner'])
    lines=['Register actual native '+meta['id'],f'.include "{deck}"','.option scale=1e-6',f'.include "{netlist}"',f'.temp {settings["temperature_C"]}',*sources,'XU '+' '.join(sub)+' '+p['cell'],'.control','set num_threads=1','set noaskquit','set wr_singlescale','set wr_vecnames']
    if meta['id']=='mux4':lines.insert(1,'.options method=gear maxord=2')
    if analysis=='tran':lines.append(f'tran {settings["step_s"]:.12g} {settings["duration_s"]:.12g}');xunit='s';xlabel='time'
    elif analysis=='op':lines+=['op','let mos_sample_index=0','setscale mos_sample_index'];xunit='point';xlabel='operating point'
    elif analysis=='dc':
        if not sweep:raise EDAError('UNSUPPORTED_ANALYSIS','No declared DC source sweep.')
        lines.append(f'dc {sweep[0]} {sweep[1]:.12g} {sweep[2]:.12g} {sweep[3]:.12g}');xunit='V';xlabel=sweep[0]
    else:
        lines.append('ac dec 40 10 1e10');xunit='Hz';xlabel='frequency'
        # Output transfer relative to the actual AC 1V VIN, magnitude/phase only.
        names=['OUT_gain','OUT_phase'];vectors=['mag(v(OUT))','180/3.141592653589793*ph(v(OUT))'];units=['V/V','deg']
    for i,vector in enumerate(vectors):lines.append(f'let mos_wave_{i} = {vector}')
    lines += ['wrdata waveform.dat '+' '.join(f'mos_wave_{i}' for i in range(len(vectors))),'write waveform.raw all','quit','.endc','.end']
    dest=Path(folder)/'testbench.spice';dest.write_text('\n'.join(lines)+'\n')
    return dest,names,units,xunit,xlabel

def measurements(p,run,params):
    """Metrics computed only from actual parsed ngspice waveform samples."""
    if not p.get('design_template'):return
    meta=validate_template_project(p);waves={w['name']:w for w in run.get('waveforms',[])};m=run.setdefault('measurements',{});m['template_id']=meta['id'];m['layout_status']=meta['layout_status'];m['metric_source']='actual-ngspice-samples'
    analysis=params.get('analysis',p['testbench']['analysis']);kind=meta['id']
    if kind=='mux4':digital_mux.verify(run,native.testbench({**p.get('testbench',{}),**{key:params[key] for key in native.TESTBENCH if key in params}}),meta['parameters'])
    if kind=='rc_lowpass' and analysis=='tran' and 'OUT' in waves:
        wave=waves['OUT'];x,y=wave['x'],wave['y'];supply=native.num(params.get('supply_V',p['testbench']['supply_V']));target=supply*(1-math.exp(-1));cross=None
        for i in range(1,len(x)):
            if x[i]>=1e-9 and y[i-1]<=target<=y[i] and y[i]!=y[i-1]:cross=x[i-1]+(target-y[i-1])*(x[i]-x[i-1])/(y[i]-y[i-1]);break
        if cross is not None:m['measured_tau_s']=cross-1e-9;m['tau_target_fraction']=1-math.exp(-1)
    if analysis=='ac' and 'OUT_gain' in waves:
        wave=waves['OUT_gain'];x,y=wave['x'],wave['y']
        if y:m['measured_low_frequency_gain']=y[0]
        if kind=='rc_lowpass' and y:
            target=y[0]/math.sqrt(2)
            for i in range(1,len(x)):
                if y[i]<=target<=y[i-1] and y[i]!=y[i-1]:m['measured_3db_frequency_Hz']=math.exp(math.log(x[i-1])+(target-y[i-1])*(math.log(x[i])-math.log(x[i-1]))/(y[i]-y[i-1]));break
    if kind=='current_mirror' and analysis=='op' and 'output_current' in waves:
        actual=waves['output_current']['y'][0];m['measured_output_current_A']=actual;m['mirror_ratio']=actual/meta['parameters']['reference_current_A']
    if kind=='differential_pair' and analysis=='op' and all(n in waves for n in ('output_current_P','output_current_N')):
        a=waves['output_current_P']['y'][0];b=waves['output_current_N']['y'][0];m['measured_differential_current_A']=a-b;m['measured_tail_current_A']=a+b

def connectivity(params):
    require_keys(params,('project_id','cell_name'))
    p=S.get_project(params['project_id']);ir=native.cell_ir(p['schematic'],params.get('cell_name'));validation=native.validate(p['schematic'],params.get('cell_name'));devices=copy.deepcopy(ir['devices']);issues=list(validation.get('issues',[]));mode=ir.get('connectivity_mode','explicit')
    if mode=='geometric':graph,_=native.connectivity(ir);nets=graph['nets'];source='native-resolved-schematic-wires'
    else:
        bynet={}
        for device in devices:
            for pin,name in device.get('pins',{}).items():
                if name:bynet.setdefault(name,[]).append({'device_id':device['id'],'device_name':device['name'],'pin':pin})
        nets=[{'name':name,'pins':pins} for name,pins in sorted(bynet.items())];source='native-explicit-schematic-pins'
    names={d['id']:d['name'] for d in devices}
    for net in nets:
        for pin in net['pins']:pin['device_name']=names.get(pin['device_id'],pin['device_id'])
    ports=list(p.get('ports',[])) if not params.get('cell_name') else list(ir.get('ports',[]))
    for net in nets:
        pins=[pin for pin in net['pins'] if next((d['kind'] for d in devices if d['id']==pin['device_id']),None) not in ('port','ground')]
        if len(pins)==1 and net['name'] not in ports and net['name']!='0':issues.append({'code':'ADVISORY_SINGLE_TERMINAL_NET','severity':'advisory','net':net['name'],'message':'One native device terminal and no declared top port; inspect intentionally floating nodes.'})
    grounded='0' in {n['name'] for n in nets} or bool(not params.get('cell_name') and p.get('design_template',{}).get('ground_port') in ports)
    if not grounded:issues.append({'code':'ADVISORY_NO_DECLARED_GROUND','severity':'advisory','message':'No explicit zero node or owned template ground declaration; ground is not inferred from a net name.'})
    layout=S.load_layout(p);top=layout.cell(p['cell']);bindings=[];checked=0;nonempty=False
    for shape,polygon,layer,path in G.walk(layout,top):
        checked+=1;nonempty=True
        if checked>MAX_SHAPES:raise EDAError('DESIGN_TOO_LARGE','Binding report exceeds bounded whole-layout geometry inspection.')
        device_id=shape.property(3)
        if device_id is not None and device_id in names:bindings.append({'shape_id':f'{path}/{shape.property(1)}','device_id':device_id,'layer_id':layer,'net':shape.property(2),'source':'actual-shape-property','electrical_verified':False})
    status='not-generated' if not nonempty else 'explicit-device-metadata' if bindings else 'unmapped'
    return {'schema_version':1,'project_id':p['id'],'revision':p['revision'],'cell_name':params.get('cell_name',p['cell']),'source':source,'nets':nets,'devices':devices,'ports':ports,'issues':issues,'ground_status':'owned-testbench-ground-declaration' if p.get('design_template') and not params.get('cell_name') else 'explicit-zero-node' if grounded else 'undeclared','layout_binding':{'status':status,'mappings':bindings,'reason':'Actual shape properties only; no geometric nearest-net inference or LVS proof.'},'scope':'selected schematic cell; layout metadata inspected over native hierarchy','limits':['Graph is the selected/root cell, not a flattened electrical graph of all child cells.','Advisory connectivity is not ERC/signoff.','Layout net/device annotations do not prove electrical extraction or physical validity.']}

def rpc(method,params):
    if method=='design.catalog':require_keys(params,());return catalog()
    if method=='design.create_template':return create_template(params)
    if method in ('design.connectivity','design.check'):return connectivity(params)
    if method=='design.routing_rules':require_keys(params,('project_id',));return routing_rules(S.get_project(params['project_id']))
    if method=='design.route_preview':return _route(S.get_project(params['project_id']),params)
    if method=='design.route_search':return route_search(params)
    if method=='design.route_apply':return route_apply(params)
    raise EDAError('UNKNOWN_METHOD','Unknown design-tool method.')
