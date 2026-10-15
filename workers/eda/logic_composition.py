"""Compose the existing public CMOS reference cells, never ideal output sources."""
import copy
import hashlib
import json
import native
from geometry import EDAError

GATES=('INV','NAND2','NOR2','AND2','OR2','XOR2','XNOR2','MUX2')
VERSION='resistor-logic-reference-v1'

def transient(schematic):
    import source_stimulus
    meta=schematic.get('logic_practice',{});kind=meta.get('kind')
    if kind not in ('nand-chain','half-adder','mux-chain'):raise EDAError('LOGIC_PRACTICE_REQUIRED','The clock preset requires a supported logic composition practice.')
    candidate=copy.deepcopy(schematic)
    def source(name,net):
        d=next((d for d in candidate['devices'] if d['id']==name),None)
        if not d or d['kind']!='voltage' or d['pins']!={'+':net,'-':'0'}:raise EDAError('LOGIC_SOURCE_CHANGED','Preset input sources were changed; configure each actual source manually.')
        return d
    supply=source('source_vpwr','VPWR');high=native.num(supply['parameters']['dc'])
    if supply.get('stimulus') or not .1<=high<=1.8:raise EDAError('LOGIC_SUPPLY_REQUIRED','The preset requires an explicit DC supply of 0.1..1.8 V.')
    a=source('source_a','A');b=source('source_b','B')
    a['parameters']['dc']=0;a['stimulus']=source_stimulus.validate({'kind':'pulse','low':0,'high':high,'delay_s':2e-9,'rise_s':100e-12,'fall_s':100e-12,'width_s':4.9e-9,'period_s':10e-9})
    b.pop('stimulus',None);b['parameters']['dc']=0 if kind=='half-adder' else high
    if kind=='mux-chain':
        s=source('source_sel','SEL');s.pop('stimulus',None);s['parameters']['dc']=high
    candidate['timing_check']=source_stimulus.timing_recipe({'schema_version':1,'input':'A','output':'SUM' if kind=='half-adder' else 'Y','polarity':'inverting' if kind=='nand-chain' else 'same','low_V':0,'high_V':high,'start_s':0,'end_s':40e-9,'settle_s':1e-9,'max_delay_s':1e-9,'max_rise_s':1e-9,'max_fall_s':1e-9,'minimum_cycles':2})
    candidate['logic_practice']['transient_preset']='single-input-clock-v1'
    schematic.clear();schematic.update(candidate)
def digest(value):return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':')).encode()).hexdigest()

def library(gate):
    import physical_library
    key=next((key for key,(name,_) in physical_library.GATES.items() if name==gate),None)
    if not key:raise EDAError('UNSUPPORTED_LOGIC','Select an existing INV/NAND/NOR/AND/OR/XOR/XNOR/MUX2 reference.')
    return physical_library.gate(key,{'drive_scale':1,'input_slew_ns':.1})

def definitions(gate,factory=library):
    if gate not in GATES:raise EDAError('UNSUPPORTED_LOGIC','Unknown reference logic gate.')
    source=factory(gate);originals={gate:{k:v for k,v in source.items() if k!='cells'},**source.get('cells',{})}
    # The reference may contain unrelated digital cells. Import only reachable definitions.
    found={};active=set()
    def visit(name):
        if name in active:raise EDAError('HIERARCHY_CYCLE','Reference library is recursive.')
        if name in found:return
        if name not in originals:raise EDAError('MISSING_CELL','Reference child is missing.')
        active.add(name);node=copy.deepcopy(originals[name]);node.pop('cells',None)
        for d in node['devices']:
            if d['kind']=='block':visit(d['cell_name']);d['cell_name']='RES_LOGIC_'+d['cell_name']+'_v1'
        active.remove(name);found[name]=node
    visit(gate)
    return {'RES_LOGIC_'+name+'_v1':node for name,node in found.items()}

def place(schematic,command,cell_name=None,factory=library):
    allowed={'type','gate','id','name','x','y','rotation','mirror','power_nets'}
    if set(command)-allowed:raise EDAError('INVALID_COMMAND','Unsupported logic placement fields.')
    gate=command.get('gate');defs=definitions(gate,factory);next_=copy.deepcopy(schematic);ir=native.cell_ir(next_,cell_name)
    if len(ir['devices'])>=256:raise EDAError('LOGIC_LIMIT','This workbench supports at most 256 top-level devices.')
    cells=next_.setdefault('cells',{})
    for name,definition in defs.items():
        collision=next((n for n in cells if n.lower()==name.lower()),None)
        if name.lower()==(cell_name or '').lower() or collision is not None and (collision!=name or digest(cells[collision])!=digest(definition)):raise EDAError('LOGIC_CELL_CONFLICT','A reference cell was edited or its name already belongs to another definition. Preserve it and use a new project.')
    cells.update(defs);ports=defs['RES_LOGIC_'+gate+'_v1']['ports'];power=command.get('power_nets',{'VPWR':'VPWR','VGND':'0'})
    if not isinstance(power,dict) or set(power)!={'VPWR','VGND'} or any(not isinstance(v,str) or not native.NET.fullmatch(v) for v in power.values()):raise EDAError('INVALID_NET','Power pin net names must be explicit valid VPWR/VGND mappings.')
    device={'id':command.get('id'),'name':command.get('name'),'kind':'block','cell_name':'RES_LOGIC_'+gate+'_v1',
      'pins':{p:power[p] if p in power else '' for p in ports},'pin_roles':{p:'power' if p in power else 'output' if p=='Y' else 'input' for p in ports},
      'parameters':{},'x':command.get('x'),'y':command.get('y'),'rotation':command.get('rotation',0),'mirror':command.get('mirror',False)}
    native.apply(next_,{'type':'add_device','device':device},cell_name)
    schematic.clear();schematic.update(next_)

def demo(schematic,kind,factory=library):
    if kind not in ('nand-chain','half-adder','mux-chain'):raise EDAError('UNSUPPORTED_LOGIC','Unknown composition practice.')
    if schematic['devices'] or schematic.get('cells') or schematic.get('wires') or schematic.get('junctions'):raise EDAError('NONEMPTY_PROJECT','Start a new empty schematic; existing circuits are never overwritten.')
    ir={'schema_version':1,'ports':[],'connectivity_mode':'explicit','devices':[],'wires':[],'junctions':[],'cells':{}}
    specs=[('AND2','U1',{'A':'A','B':'B','Y':'MID'},420,260),('INV','U2',{'A':'MID','Y':'Y'},720,260)] if kind=='nand-chain' else [('XOR2','U1',{'A':'A','B':'B','Y':'SUM'},420,260),('AND2','U2',{'A':'A','B':'B','Y':'COUT'},720,380)] if kind=='half-adder' else [('AND2','U1',{'A':'A','B':'B','Y':'MID'},420,260),('MUX2','U2',{'A':'A','B':'MID','S':'SEL','Y':'Y'},720,300)]
    for gate,name,pins,x,y in specs:
        place(ir,{'type':'place_logic_gate','gate':gate,'id':name.lower(),'name':name,'x':x,'y':y},factory=factory)
        d=ir['devices'][-1];d['pins'].update(pins)
    inputs=['A','B',*(['SEL'] if kind=='mux-chain' else [])];outputs=['SUM','COUT'] if kind=='half-adder' else ['Y']
    for i,name in enumerate(['VPWR',*inputs]):
        ir['devices'].append({'id':'source_'+name.lower(),'name':'VDD' if name=='VPWR' else 'VIN_'+name,'kind':'voltage','pins':{'+':name,'-':'0'},'parameters':{'dc':1.8 if name=='VPWR' else 0},'x':140,'y':120+i*140})
    ir['devices'].append({'id':'gnd','name':'GND','kind':'ground','pins':{'G':'0'},'parameters':{},'x':40,'y':560})
    for i,name in enumerate(outputs):
        ir['devices'].append({'id':'out_'+name.lower(),'name':'PORT_'+name,'kind':'port','pins':{'P':name},'parameters':{},'x':980,'y':260+i*150})
        ir['devices'].append({'id':'load_'+name.lower(),'name':'CLOAD_'+name,'kind':'capacitor','pins':{'+':name,'-':'0'},'parameters':{'value':5e-15},'x':1120,'y':260+i*150})
    ir['ports']=outputs
    # Exact symbol terminals and explicit net labels drive the drawing. No inferred crossing junctions.
    nets={}
    for d in ir['devices']:
        for pin,net in d['pins'].items():
            dx,dy=native.pin_offsets(d)[pin];nets.setdefault(net,[]).append([d['x']+dx,d['y']+dy])
    for net,points in nets.items():
        # Explicit power labels are authoritative. Do not create crossing power
        # guide wires that would contradict the geometry of subsequent edits.
        if net in ('0','VPWR'):continue
        if net in inputs:
            source=next(d for d in ir['devices'] if d['id']=='source_'+net.lower())
            dx,dy=native.pin_offsets(source)['+'];start=[source['x']+dx,source['y']+dy];rail=240+inputs.index(net)*30
        else:start=points[0]
        for end in (p for p in points if p!=start):
            route=[start,[rail,start[1]],[rail,end[1]],end] if net in inputs else [start,[start[0],end[1]],end]
            clean=[p for i,p in enumerate(route) if i==0 or p!=route[i-1]]
            if len(clean)>1:ir['wires'].append({'id':'demo_wire_'+str(len(ir['wires'])),'net':net,'points':clean})
    ir['logic_practice']={'schema_version':1,'reference_version':VERSION,'kind':kind,'input_sources':['source_'+n.lower() for n in inputs],'outputs':outputs,'source':'existing-public-CMOS-reference','layout_generated':False,'verification':'not_run'}
    if not native.validate(ir)['valid']:raise EDAError('SCHEMATIC_INVALID','Logic practice did not produce a valid circuit.')
    schematic.clear();schematic.update(ir)
