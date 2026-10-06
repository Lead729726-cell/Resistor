"""Deterministic native schematic subset and validated SPICE emission."""
import math
import re
import copy
import hashlib
import uuid
from geometry import EDAError

NET = re.compile(r'(?:0|[A-Za-z_][A-Za-z0-9_.$!:/-]*)$')
MODEL_KIND={'sky130_fd_pr__nfet_01v8':'nmos','sky130_fd_pr__pfet_01v8_hvt':'pmos'}

def num(value):
    if isinstance(value,bool): raise EDAError('INVALID_PARAMETER','Boolean is not a circuit parameter.')
    try: n=float(value)
    except (TypeError,ValueError): raise EDAError('INVALID_PARAMETER','Parameters must be finite numeric values.')
    if not math.isfinite(n): raise EDAError('INVALID_PARAMETER','Parameter is not finite.')
    return n

def validate_device(d):
    if not isinstance(d,dict):raise EDAError('INVALID_DEVICE','Device must be an object.')
    if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*',d.get('name','')): raise EDAError('INVALID_NAME','Device name must be an identifier.')
    if not isinstance(d.get('id'),str) or not re.fullmatch(r'[A-Za-z0-9_.:-]{1,128}',d['id']): raise EDAError('INVALID_DEVICE','Device ID must be a bounded stable identifier.')
    kind=d.get('kind'); pins=d.get('pins',{}); pars=d.get('parameters',{})
    if not isinstance(pins,dict) or not isinstance(pars,dict) or any(not isinstance(key,str) or not isinstance(value,str) for key,value in pins.items()):raise EDAError('INVALID_DEVICE','Pins must map string names to string nets and parameters must be an object.')
    if kind not in {'nmos','pmos','resistor','capacitor','voltage','current','ground','port','block'}: raise EDAError('UNSUPPORTED','Unsupported native device kind.')
    supported={'w_um','l_um','nf','m'} if kind in {'nmos','pmos'} else {'value'} if kind in {'resistor','capacitor'} else {'dc'} if kind in {'voltage','current'} else set()
    if set(pars)-supported:raise EDAError('UNSUPPORTED_PARAMETER','This native symbol mapping does not support the supplied parameter keys.')
    if kind in {'resistor','capacitor','voltage','current'} and not ({'+','-'}<=set(pins) or {'1','2'}<=set(pins)):raise EDAError('INVALID_DEVICE','Two-terminal elements need + and - (or 1 and 2) pin keys.')
    for net in pins.values():
        if net and (not isinstance(net,str) or not NET.fullmatch(net)): raise EDAError('INVALID_NET','Net names must use the supported SPICE identifier syntax.')
    if kind=='block':
        if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*',d.get('cell_name','')): raise EDAError('INVALID_NAME','Block target must be a schematic cell identifier.')
    elif kind in {'nmos','pmos'}:
        if MODEL_KIND.get(d.get('model')) != kind: raise EDAError('UNSUPPORTED_MODEL','This device model is not in the tested public profile.')
        for pin in ('D','G','S','B'):
            if pin not in pins: raise EDAError('INVALID_DEVICE','MOS pin order is D/G/S/B.')
        w=num(pars.get('w_um')); l=num(pars.get('l_um')); nf=num(pars.get('nf',1)); m=num(pars.get('m',1))
        if not .42<=w<=100 or not .15<=l<=20: raise EDAError('PARAMETER_RANGE','Supported app subset is W 0.42..100 um, L 0.15..20 um. This is not a claim about the entire PDK.')
        if nf<1 or nf>32 or m<1 or m>32 or nf%1 or m%1: raise EDAError('PARAMETER_RANGE','nf/m must be integers from 1 to 32.')
        if nf!=1 or m!=1: raise EDAError('UNSUPPORTED_PARAMETER','This verified MOS model/layout profile currently supports nf=1 and m=1 only; other multiplicity mappings are unverified.')
    elif kind in {'resistor','capacitor'}:
        if num(pars.get('value',0))<=0: raise EDAError('PARAMETER_RANGE','R/C value must be positive in SI units.')
    elif kind in {'voltage','current'}: num(pars.get('dc',0))
    for axis in ('x','y'):
        n=num(d.get(axis,0))
        if abs(n)>1e6: raise EDAError('PARAMETER_RANGE','Schematic position is outside the supported canvas.')
    if isinstance(d.get('rotation',0),bool) or d.get('rotation',0) not in (0,90,180,270) or not isinstance(d.get('mirror',False),bool):
        raise EDAError('INVALID_ORIENTATION','Schematic rotation must be 0/90/180/270 degrees and mirror must be boolean.')

def base_pin_offsets(d):
    kind=d['kind']
    if kind in ('nmos','pmos'): return {'D':(30,42 if kind=='pmos' else -42),'G':(-46,0),'S':(30,-42 if kind=='pmos' else 42),'B':(49,0)}
    if kind in ('resistor','capacitor','voltage','current'): return {'+':(0,-44),'-':(0,44),'1':(0,-44),'2':(0,44)}
    if kind=='ground': return {'G':(0,-30)}
    if kind=='port': return {'P':(-30,0)}
    keys=list(d.get('pins',{})); return {key:(-55,-(len(keys)-1)*12+i*24) for i,key in enumerate(keys)}

def pin_offsets(d):
    result={}; rotation=d.get('rotation',0)
    for pin,(x,y) in base_pin_offsets(d).items():
        if d.get('mirror',False):x=-x
        result[pin]=(-y,x) if rotation==90 else (-x,-y) if rotation==180 else (y,-x) if rotation==270 else (x,y)
    return result

def cell_ir(schematic,cell_name=None):
    if not isinstance(schematic,dict) or not isinstance(schematic.get('devices'),list) or not isinstance(schematic.get('cells',{}),dict):raise EDAError('INVALID_SCHEMATIC','Schematic requires a device list and a child-cell dictionary.')
    if cell_name is None: return schematic
    ir=schematic.get('cells',{}).get(cell_name)
    if ir is None: raise EDAError('NOT_FOUND','Schematic child cell does not exist.')
    return ir

def connectivity(ir):
    nodes=[]; wires=ir.get('wires',[]); junctions=ir.get('junctions',[]); segments=[]
    def node(x,y,**data): nodes.append({'x':num(x),'y':num(y),**data}); return len(nodes)-1
    for d in ir['devices']:
        for pin,offset in pin_offsets(d).items():
            if pin in d.get('pins',{}): node(num(d.get('x',0))+offset[0],num(d.get('y',0))+offset[1],device_id=d['id'],pin=pin,net=d['pins'][pin])
    wire_nodes=[]
    for wire in wires:
        indices=[node(p[0],p[1],wire_id=wire['id'],wire_endpoint=j in (0,len(wire['points'])-1),net=wire.get('net','')) for j,p in enumerate(wire['points'])]; wire_nodes.append(indices)
        segments.extend(zip(indices,indices[1:]))
    for j in junctions: node(j['x'],j['y'],junction_id=j['id'],net=j.get('net',''))
    parent=list(range(len(nodes)))
    def find(i):
        while parent[i]!=i: parent[i]=parent[parent[i]]; i=parent[i]
        return i
    def join(a,b): parent[find(b)]=find(a)
    for indices in wire_nodes:
        for a,b in zip(indices,indices[1:]): join(a,b)
    positions={}
    for i,n in enumerate(nodes):
        if n.get('wire_id') and not n.get('wire_endpoint'): continue
        key=(n['x'],n['y'])
        if key in positions: join(i,positions[key])
        positions[key]=i
    for i,n in enumerate(nodes):
        if n.get('wire_id') and not n.get('wire_endpoint'): continue
        for a,b in segments:
            p=nodes[a]; q=nodes[b]; dx=q['x']-p['x']; dy=q['y']-p['y']
            if abs((n['x']-p['x'])*dy-(n['y']-p['y'])*dx)<=1e-8 and min(p['x'],q['x'])<=n['x']<=max(p['x'],q['x']) and min(p['y'],q['y'])<=n['y']<=max(p['y'],q['y']): join(i,a)
    groups={}
    for i,n in enumerate(nodes): groups.setdefault(find(i),[]).append(n)
    nets=[]; conflicts=[]; unconnected=[]; derived={}
    for values in groups.values():
        names=sorted({n.get('net') for n in values if n.get('net')}); identifiers=sorted(str(n.get('device_id',''))+':'+str(n.get('pin',''))+':'+str(n.get('wire_id',''))+':'+str(n.get('junction_id','')) for n in values)
        name=names[0] if names else 'N_auto_'+hashlib.sha256('|'.join(identifiers).encode()).hexdigest()[:10]
        pins=[{'device_id':n['device_id'],'pin':n['pin']} for n in values if 'device_id' in n]
        wids=sorted({n['wire_id'] for n in values if 'wire_id' in n}); jids=sorted({n['junction_id'] for n in values if 'junction_id' in n})
        if len(names)>1: conflicts.append({'code':'NET_LABEL_CONFLICT','names':names,'pins':pins,'wire_ids':wids})
        if len(pins)<2 and not wids: unconnected.extend(pins)
        for pin in pins: derived[(pin['device_id'],pin['pin'])]=name
        nets.append({'name':name,'pins':pins,'wire_ids':wids,'junction_ids':jids})
    return {'nets':sorted(nets,key=lambda n:n['name']),'conflicts':conflicts,'unconnected_pins':unconnected},derived

def validate(schematic,cell_name=None):
    ir=cell_ir(schematic,cell_name)
    issues=[]; ids=set(); names=set()
    graph=None
    if ir.get('connectivity_mode','explicit')=='geometric' and all(isinstance(d,dict) and isinstance(d.get('pins'),dict) and d.get('kind') for d in ir['devices']):
        graph,_=connectivity(ir)
        issues.extend({'code':c['code'],'message':'Geometric wire component has contradictory explicit net labels.','details':c} for c in graph['conflicts'])
        issues.extend({**pin,'code':'FLOATING_PIN','message':'Geometric pin is not connected to a wire or another pin.'} for pin in graph['unconnected_pins'])
    for d in ir['devices']:
        if not isinstance(d,dict):issues.append({'code':'INVALID_DEVICE','message':'Device must be an object.'});continue
        try: validate_device(d)
        except EDAError as e: issues.append({'device_id':d.get('id'),'code':e.code,'message':str(e)});continue
        if d['id'] in ids or d['name'].lower() in names: issues.append({'device_id':d['id'],'code':'DUPLICATE','message':'Duplicate ID or name.'})
        ids.add(d['id']); names.add(d['name'].lower())
        if ir.get('connectivity_mode','explicit')=='explicit':
            for pin,net in d.get('pins',{}).items():
                if not net: issues.append({'device_id':d['id'],'pin':pin,'code':'FLOATING_PIN','message':'Pin has no explicit net.'})
        if d['kind']=='block':
            child=schematic.get('cells',{}).get(d.get('cell_name'))
            if child is None: issues.append({'device_id':d['id'],'code':'MISSING_CELL','message':'Block target is missing.'})
            elif list(d['pins'])!=child.get('ports',[]): issues.append({'device_id':d['id'],'code':'PORT_MISMATCH','message':'Block pin order must match the child cell port declaration.'})
    def visit(name,stack):
        if name in stack: issues.append({'code':'HIERARCHY_CYCLE','message':'Schematic hierarchy is recursive.','cell_name':name}); return
        target=ir if name is None else schematic.get('cells',{}).get(name)
        if target:
            for d in target['devices']:
                if isinstance(d,dict) and d.get('kind')=='block': visit(d.get('cell_name'),stack+[name])
    visit(cell_name,[])
    if not any(issue.get('code')=='HIERARCHY_CYCLE' for issue in issues):
        for name in sorted({d['cell_name'] for d in ir['devices'] if isinstance(d,dict) and d.get('kind')=='block' and d.get('cell_name') in schematic.get('cells',{})}):
            child=validate(schematic,name)
            issues.extend({**issue,'cell_name':issue.get('cell_name',name)} for issue in child['issues'])
    return {'valid':not issues,'issues':issues,'connectivity_source':'geometric_graph' if graph else 'explicit_pin_net_ir','connectivity':graph,'limits':[]}

def apply(schematic,c,cell_name=None):
    ir=cell_ir(schematic,cell_name)
    ty=c.get('type'); devices=ir['devices']; d=next((d for d in devices if d['id']==c.get('id')),None)
    if ty=='add_device':
        d=c.get('device'); validate_device(d)
        if any(x['id']==d['id'] or x['name'].lower()==d['name'].lower() for x in devices): raise EDAError('DUPLICATE','Device ID or name already exists.')
        devices.append(d)
    elif ty=='copy_device':
        if not d: raise EDAError('NOT_FOUND','No such schematic device.')
        new=copy.deepcopy(d); new['id']=uuid.uuid4().hex; new['x']=num(d.get('x',0))+num(c.get('dx')); new['y']=num(d.get('y',0))+num(c.get('dy'))
        name=c.get('name') or d['name']+'_copy'; suffix=2
        while any(x['name'].lower()==name.lower() for x in devices): name=d['name']+'_copy'+str(suffix); suffix+=1
        new['name']=name; validate_device(new); devices.append(new)
    elif ty=='delete_device':
        if not d: raise EDAError('NOT_FOUND','No such schematic device.')
        devices.remove(d)
    elif ty=='update_device':
        if not d: raise EDAError('NOT_FOUND','No such schematic device.')
        d['parameters'].update(c.get('parameters',{})); validate_device(d)
    elif ty=='move_device':
        if not d: raise EDAError('NOT_FOUND','No such schematic device.')
        d['x']=num(c.get('x')); d['y']=num(c.get('y')); validate_device(d)
    elif ty=='transform_device':
        if not d: raise EDAError('NOT_FOUND','No such schematic device.')
        new=copy.deepcopy(d)
        for key in ('rotation','mirror'):
            if key in c:new[key]=c[key]
        validate_device(new);d.update(new)
    elif ty=='set_pin':
        if not d or c.get('pin') not in d['pins']: raise EDAError('NOT_FOUND','No such device pin.')
        d['pins'][c['pin']]=c.get('net',''); validate_device(d)
    elif ty=='set_connectivity_mode':
        if c.get('mode') not in {'explicit','geometric'}: raise EDAError('INVALID_COMMAND','Connectivity mode must be explicit or geometric.')
        ir['connectivity_mode']=c['mode']
    elif ty=='add_cell':
        name=c.get('name',''); ports=c.get('ports',[])
        if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*',name) or not isinstance(ports,list) or len(ports)!=len(set(ports)) or any(not isinstance(p,str) or not NET.fullmatch(p) for p in ports): raise EDAError('INVALID_NAME','Child cell and ports must be unique supported identifiers.')
        if name in schematic.setdefault('cells',{}): raise EDAError('DUPLICATE','Schematic child cell already exists.')
        schematic['cells'][name]={'ports':ports,'devices':[],'wires':[],'junctions':[],'connectivity_mode':'explicit'}
    elif ty in {'add_wire','add_junction'}:
        key='wires' if ty=='add_wire' else 'junctions'; item=c.get('wire' if ty=='add_wire' else 'junction'); values=ir.setdefault(key,[])
        if not isinstance(item,dict) or not isinstance(item.get('id'),str) or not 1<=len(item['id'])<=128 or any(v['id']==item['id'] for v in values): raise EDAError('INVALID_COMMAND','Wire/junction ID must be unique.')
        if ty=='add_wire':
            points=item.get('points',[])
            if not isinstance(points,list) or not 2<=len(points)<=1024: raise EDAError('INVALID_GEOMETRY','Wire needs 2..1024 points.')
            item['points']=[[num(p[0]),num(p[1])] for p in points]
            if any(abs(v)>1e6 for point in item['points'] for v in point) or any(a==b for a,b in zip(item['points'],item['points'][1:])): raise EDAError('INVALID_GEOMETRY','Wire position or zero-length segment is invalid.')
        else:
            item['x']=num(item.get('x')); item['y']=num(item.get('y'))
            if abs(item['x'])>1e6 or abs(item['y'])>1e6: raise EDAError('PARAMETER_RANGE','Junction is outside canvas.')
        if item.get('net') and not NET.fullmatch(item['net']): raise EDAError('INVALID_NET','Invalid wire/junction net label.')
        values.append(item)
    elif ty in {'delete_wire','move_wire','copy_wire','delete_junction','move_junction'}:
        key='wires' if 'wire' in ty else 'junctions'; values=ir.setdefault(key,[]); item=next((v for v in values if v['id']==c.get('id')),None)
        if item is None: raise EDAError('NOT_FOUND','Wire/junction does not exist.')
        if ty.startswith('delete'): values.remove(item)
        else:
            dx=num(c.get('dx')); dy=num(c.get('dy'))
            if ty=='copy_wire': item=copy.deepcopy(item); item['id']=uuid.uuid4().hex; values.append(item)
            if key=='wires': item['points']=[[x+dx,y+dy] for x,y in item['points']]
            else: item['x']+=dx; item['y']+=dy
            coordinates=[v for point in item['points'] for v in point] if key=='wires' else [item['x'],item['y']]
            if any(abs(v)>1e6 for v in coordinates): raise EDAError('PARAMETER_RANGE','Move leaves supported canvas.')
    else: raise EDAError('UNSUPPORTED',f'Unsupported schematic command: {ty}')

def defaults(example):
    def mos(id,name,kind,model,pins,w,x,y): return {'id':id,'name':name,'kind':kind,'model':model,'pins':dict(zip(('D','G','S','B'),pins)),'parameters':{'w_um':w,'l_um':.15,'nf':1,'m':1},'x':x,'y':y}
    if example=='inverter':
        return {'devices':[mos('mn1','MN1','nmos','sky130_fd_pr__nfet_01v8',['Y','A','VGND','VNB'],.65,400,360),mos('mp1','MP1','pmos','sky130_fd_pr__pfet_01v8_hvt',['Y','A','VPWR','VPB'],1,400,180)],'wires':[]}
    if example=='mosfet': return {'devices':[mos('mn1','MN1','nmos','sky130_fd_pr__nfet_01v8',['D','G','S','B'],.65,400,240)],'wires':[]}
    return {'devices':[],'wires':[]}

def emit(schematic,cell,ports):
    if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*',cell) or any(not isinstance(port,str) or not NET.fullmatch(port) for port in ports): raise EDAError('UNSUPPORTED_NAME','Cell or port name is outside the supported SPICE subset.')
    out=[]; done=set(); active=set()
    def emit_cell(name,ir,portlist,key):
        if name in done: return
        if name in active: raise EDAError('HIERARCHY_CYCLE','Schematic hierarchy is recursive.')
        active.add(name); check=validate(schematic,key)
        if not check['valid']: raise EDAError('SCHEMATIC_INVALID','Fix schematic issues before netlisting.',check)
        for d in ir['devices']:
            if d['kind']=='block':
                child=schematic.get('cells',{}).get(d['cell_name'])
                if child is None: raise EDAError('SCHEMATIC_INVALID','Missing hierarchical child cell.')
                emit_cell(d['cell_name'],child,child['ports'],d['cell_name'])
        graph,derived=connectivity(ir) if ir.get('connectivity_mode')=='geometric' else (None,{})
        out.append(f'.subckt {name} '+' '.join(portlist))
        for d in sorted(ir['devices'],key=lambda d:d['id']): emit_device(d,derived)
        out.append(f'.ends {name}'); active.remove(name); done.add(name)
    def emit_device(d,derived):
        kind=d['kind']; p=d['parameters']; nets=d['pins']; name=d['name']
        if derived: nets={pin:derived[(d['id'],pin)] for pin in nets}
        if kind in ('nmos','pmos'):
            out.append('X'+name+' '+' '.join(nets[n] for n in ('D','G','S','B'))+f" {d['model']} w={num(p['w_um']):.12g} l={num(p['l_um']):.12g} nf={int(num(p.get('nf',1)))} m={int(num(p.get('m',1)))}")
        elif kind in ('resistor','capacitor','voltage','current'):
            prefix={'resistor':'R','capacitor':'C','voltage':'V','current':'I'}[kind]
            a=nets.get('+',nets.get('1','')); b=nets.get('-',nets.get('2',''))
            if not a or not b: raise EDAError('SCHEMATIC_INVALID','Two terminal element needs + and - pin nets.')
            value=num(p.get('value' if kind in ('resistor','capacitor') else 'dc',0))
            out.append(f'{prefix}{name} {a} {b} {value:.12g}')
        elif kind=='block': out.append('X'+name+' '+' '.join(nets[pin] for pin in schematic['cells'][d['cell_name']]['ports'])+' '+d['cell_name'])
    emit_cell(cell,schematic,ports,None)
    return '\n'.join(out)+'\n'

TESTBENCH={'analysis':'tran','corner':'tt','temperature_C':27,'supply_V':1.8,'duration_s':30e-9,'step_s':20e-12,'load_F':5e-15,'vds_V':1.8,'vbs_V':0}
def testbench(settings):
    result={**TESTBENCH,**settings}
    if set(settings)-set(TESTBENCH): raise EDAError('INVALID_PARAMETER','Unknown testbench setting.')
    if result['analysis'] not in {'tran','dc','ac','op'} or result['corner'] not in {'tt','ff','ss'}: raise EDAError('UNSUPPORTED','Unsupported analysis or process corner.')
    bounds={'temperature_C':(-40,125),'supply_V':(.1,1.8),'duration_s':(1e-12,.001),'step_s':(1e-12,.001),'load_F':(1e-18,1e-9),'vds_V':(0,1.8),'vbs_V':(-1.8,0)}
    for key,(lo,hi) in bounds.items():
        value=num(result[key])
        if not lo<=value<=hi: raise EDAError('PARAMETER_RANGE',f'{key} is outside the verified app testbench bounds {lo}..{hi}.')
        result[key]=value
    if result['step_s']>result['duration_s'] or result['duration_s']/result['step_s']>200000: raise EDAError('PARAMETER_RANGE','Transient step/duration permits at most 200000 nominal samples.')
    return result
