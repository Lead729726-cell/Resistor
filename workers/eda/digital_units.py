"""Transistor-level adders and a clocked, programmable four-bit accumulator CPU.

No behavioural arithmetic, digital ideal gates or precomputed output sources enter SPICE.
Python arithmetic is used only as an independent oracle after native waveforms exist.
"""
import bisect
import copy
import hashlib
import json
import re
import uuid
from pathlib import Path
import klayout.db as k
import native
import profile
import digital_mux
from geometry import EDAError

S = None
OPS = ['LOAD', 'ADD', 'AND', 'XOR']
DEFAULT_PROGRAM = [{'op':op,'value':value} for op,value in [('LOAD',3),('ADD',5),('ADD',9),('XOR',10),('AND',7),('LOAD',15),('ADD',1),('ADD',15),('AND',6),('XOR',15),('LOAD',0),('ADD',7),('ADD',8),('XOR',5),('AND',10),('LOAD',4)]]
ADDER_PORTS = [*[f'A{i}' for i in range(4)],*[f'B{i}' for i in range(4)],'CIN',*[f'S{i}' for i in range(4)],'COUT','VPWR','VGND']
FA_PORTS = ['A','B','CIN','SUM','COUT','VPWR','VGND']
CPU_PORTS = ['CLK','RESET',*[f'ACC{i}' for i in range(4)],*[f'PC{i}' for i in range(4)],'CARRY','ZERO','VPWR','VGND']
CATALOG = [
 {'id':'full_adder','name':'1비트 전가산기','ports':FA_PORTS,'case_count':8,'description':'9 NAND · 36 MOS · 모든 A/B/CIN 조합'},
 {'id':'adder4','name':'4비트 가산기','ports':ADDER_PORTS,'case_count':512,'description':'전가산기 4개 재사용 · A+B+CIN · carry'},
 {'id':'cpu4','name':'4비트 작은 CPU','ports':CPU_PORTS,'case_count':16,'description':'4비트 ACC/PC · 16-word ROM · LOAD/ADD/AND/XOR'}
]

def configure(server):
    global S
    S=server

def cell(ports):
    return {'schema_version':1,'connectivity_mode':'explicit','ports':ports,'devices':[],'wires':[],'junctions':[]}

def transistor(ir,kind,name,d,g,s):
    ir['devices'].append({'id':name,'name':name,'kind':kind,'model':'sky130_fd_pr__'+('nfet_01v8' if kind=='nmos' else 'pfet_01v8_hvt'),
      'pins':{'D':d,'G':g,'S':s,'B':'VGND' if kind=='nmos' else 'VPWR'},'parameters':{'w_um':.65,'l_um':.15,'nf':1,'m':1},'x':180+(len(ir['devices'])%4)*190,'y':160+(len(ir['devices'])//4)*160})

def inverter():
    ir=cell(['A','Y','VPWR','VGND']);transistor(ir,'pmos','MP','Y','A','VPWR');transistor(ir,'nmos','MN','Y','A','VGND');return ir

def nand(count):
    ports=[f'A{i}' for i in range(count)]+['Y','VPWR','VGND'];ir=cell(ports)
    for i in range(count):
        transistor(ir,'pmos','MP'+str(i),'Y','A'+str(i),'VPWR')
        transistor(ir,'nmos','MN'+str(i),'Y' if i==0 else 'N'+str(i),'A'+str(i),'VGND' if i==count-1 else 'N'+str(i+1))
    return ir

def block(ir,cells,kind,name,connections):
    ports=cells[kind]['ports'];mapping={**connections,'VPWR':'VPWR','VGND':'VGND'}
    ir['devices'].append({'id':name,'name':name,'kind':'block','cell_name':kind,'pins':{port:mapping[port] for port in ports},'parameters':{},'x':170+(len(ir['devices'])%4)*230,'y':170+(len(ir['devices'])//4)*250})

def make_library():
    cells={'INV':inverter(),'NAND2':nand(2)}
    def ng(ir,name,a,b,y):block(ir,cells,'NAND2',name,{'A0':a,'A1':b,'Y':y})
    xor=cell(['A','B','Y','VPWR','VGND']);ng(xor,'N1','A','B','N1');ng(xor,'N2','A','N1','N2');ng(xor,'N3','B','N1','N3');ng(xor,'N4','N2','N3','Y');cells['XOR2']=xor
    aand=cell(['A','B','Y','VPWR','VGND']);ng(aand,'N1','A','B','N');block(aand,cells,'INV','I1',{'A':'N','Y':'Y'});cells['AND2']=aand
    mux=cell(['A','B','S','Y','VPWR','VGND']);block(mux,cells,'INV','IS',{'A':'S','Y':'SB'})
    for name,src,en,dis in [('A','A','SB','S'),('B','B','S','SB')]:
        transistor(mux,'nmos','MN'+name,'Y',en,src);transistor(mux,'pmos','MP'+name,'Y',dis,src)
    cells['MUX2']=mux
    fa=cell(FA_PORTS)
    # Share the NAND terms of both XORs with carry: nine NAND gates, rather than eleven.
    for name,a,b,y in [('N1','A','B','N1'),('N2','A','N1','N2'),('N3','B','N1','N3'),('N4','N2','N3','P'),('N5','P','CIN','N5'),('N6','P','N5','N6'),('N7','CIN','N5','N7'),('N8','N6','N7','SUM'),('N9','N1','N5','COUT')]:ng(fa,name,a,b,y)
    cells['FA']=fa
    adder=cell(ADDER_PORTS)
    for i in range(4):block(adder,cells,'FA','BIT'+str(i),{'A':'A'+str(i),'B':'B'+str(i),'CIN':'CIN' if i==0 else 'C'+str(i),'SUM':'S'+str(i),'COUT':'COUT' if i==3 else 'C'+str(i+1)})
    cells['ADD4']=adder
    dff=cell(['D','CLK','Q','VPWR','VGND']);block(dff,cells,'INV','ICLK',{'A':'CLK','Y':'CLKB'})
    # Negative-level master and positive-level slave with complementary transmission gates.
    for tag,src,dst,en,dis in [('IN','D','M','CLKB','CLK'),('MF','MF','M','CLK','CLKB'),('OUT','MF','T','CLK','CLKB'),('SF','Q','T','CLKB','CLK')]:
        transistor(dff,'nmos','MN'+tag,dst,en,src);transistor(dff,'pmos','MP'+tag,dst,dis,src)
    for tag,a,y in [('M1','M','MB'),('M2','MB','MF'),('S1','T','TB'),('S2','TB','Q')]:block(dff,cells,'INV',tag,{'A':a,'Y':y})
    cells['DFF']=dff;return cells

def program_input(value):
    if not isinstance(value,list) or len(value)!=16:raise EDAError('INVALID_PROGRAM','CPU ROM requires exactly 16 instructions.')
    for item in value:
        if not isinstance(item,dict) or set(item)!={'op','value'} or item['op'] not in OPS or isinstance(item['value'],bool) or not isinstance(item['value'],int) or not 0<=item['value']<=15:raise EDAError('INVALID_PROGRAM','Instructions are LOAD/ADD/AND/XOR with a 0..15 immediate.')
    return copy.deepcopy(value)

def schematic(kind,program=None):
    cells=make_library()
    if kind in ('full_adder','adder4'):
        ir=copy.deepcopy(cells['FA' if kind=='full_adder' else 'ADD4'])
    elif kind=='cpu4':
        program=program_input(program or DEFAULT_PROGRAM);ir=cell(CPU_PORTS)
        rom=cell([*[f'P{i}' for i in range(4)],*[f'I{i}' for i in range(4)],'O0','O1','VPWR','VGND'])
        cells['NAND4']=nand(4)
        for i in range(4):block(rom,cells,'INV','IP'+str(i),{'A':'P'+str(i),'Y':'PB'+str(i)})
        for address in range(16):block(rom,cells,'NAND4','DEC'+str(address),{**{f'A{i}':('P' if (address>>i)&1 else 'PB')+str(i) for i in range(4)},'Y':'D'+str(address)})
        for bit in range(6):
            active=[j for j,v in enumerate(program) if (((OPS.index(v['op'])<<4)|v['value'])>>bit)&1];out='I'+str(bit) if bit<4 else 'O'+str(bit-4)
            if len(active)<2:block(rom,cells,'INV','ROM'+str(bit),{'A':'D'+str(active[0]) if active else 'VPWR','Y':out})
            else:
                key='NAND'+str(len(active));cells.setdefault(key,nand(len(active)));block(rom,cells,key,'ROM'+str(bit),{**{f'A{i}':'D'+str(a) for i,a in enumerate(active)},'Y':out})
        cells['ROM16']=rom
        block(ir,cells,'ROM16','ROM',{**{f'P{i}':f'PC{i}' for i in range(4)},**{f'I{i}':f'IMM{i}' for i in range(4)},'O0':'OP0','O1':'OP1'})
        block(ir,cells,'ADD4','ALU_ADD',{**{f'A{i}':f'ACC{i}' for i in range(4)},**{f'B{i}':f'IMM{i}' for i in range(4)},'CIN':'VGND',**{f'S{i}':f'ADD{i}' for i in range(4)},'COUT':'ADD_CARRY'})
        block(ir,cells,'INV','IR',{'A':'RESET','Y':'RESETB'})
        for i in range(4):
            block(ir,cells,'AND2','ALU_AND'+str(i),{'A':f'ACC{i}','B':f'IMM{i}','Y':f'AND{i}'})
            block(ir,cells,'XOR2','ALU_XOR'+str(i),{'A':f'ACC{i}','B':f'IMM{i}','Y':f'XOR{i}'})
            block(ir,cells,'MUX2','LOW'+str(i),{'A':f'IMM{i}','B':f'ADD{i}','S':'OP0','Y':f'L{i}'})
            block(ir,cells,'MUX2','HIGH'+str(i),{'A':f'AND{i}','B':f'XOR{i}','S':'OP0','Y':f'H{i}'})
            block(ir,cells,'MUX2','RESULT'+str(i),{'A':f'L{i}','B':f'H{i}','S':'OP1','Y':f'RES{i}'})
            block(ir,cells,'AND2','RESET_ACC'+str(i),{'A':f'RES{i}','B':'RESETB','Y':f'NEXT_ACC{i}'})
            block(ir,cells,'DFF','ACC_REG'+str(i),{'D':f'NEXT_ACC{i}','CLK':'CLK','Q':f'ACC{i}'})
            if i==0:block(ir,cells,'INV','PC_PLUS0',{'A':'PC0','Y':'PC_NEXT0'})
            else:
                enable='PC0'
                if i>1:
                    key='NAND'+str(i);cells.setdefault(key,nand(i));block(ir,cells,key,'PCC'+str(i),{**{f'A{j}':f'PC{j}' for j in range(i)},'Y':f'PC_CB{i}'})
                    block(ir,cells,'INV','PCCI'+str(i),{'A':f'PC_CB{i}','Y':f'PC_C{i}'});enable=f'PC_C{i}'
                block(ir,cells,'XOR2','PC_PLUS'+str(i),{'A':f'PC{i}','B':enable,'Y':f'PC_NEXT{i}'})
            block(ir,cells,'AND2','RESET_PC'+str(i),{'A':f'PC_NEXT{i}','B':'RESETB','Y':f'PC_D{i}'})
            block(ir,cells,'DFF','PC_REG'+str(i),{'D':f'PC_D{i}','CLK':'CLK','Q':f'PC{i}'})
        block(ir,cells,'INV','IOP1',{'A':'OP1','Y':'OP1B'});block(ir,cells,'AND2','ADD_ENABLE',{'A':'OP0','B':'OP1B','Y':'IS_ADD'})
        block(ir,cells,'AND2','CARRY_VALUE',{'A':'ADD_CARRY','B':'IS_ADD','Y':'CV'})
        block(ir,cells,'AND2','CARRY_RESET',{'A':'CV','B':'RESETB','Y':'CD'})
        block(ir,cells,'DFF','CARRY_REG',{'D':'CD','CLK':'CLK','Q':'CARRY'})
        for i in range(4):block(ir,cells,'INV','ZI'+str(i),{'A':f'ACC{i}','Y':f'ACC_B{i}'})
        block(ir,cells,'NAND4','ZN',{'A0':'ACC_B0','A1':'ACC_B1','A2':'ACC_B2','A3':'ACC_B3','Y':'ZERO_B'});block(ir,cells,'INV','ZI',{'A':'ZERO_B','Y':'ZERO'})
    else:raise EDAError('UNSUPPORTED_DIGITAL','Unknown digital unit.')
    ir['cells']=cells
    for i,port in enumerate(ir['ports']):ir['devices'].append({'id':'port_'+port,'name':'PORT_'+port,'kind':'port','pins':{'P':port},'parameters':{},'x':180+i*150,'y':100+250*((len(ir['devices'])//4)+1)})
    return ir

def flattened(ir):
    devices=[];cells=ir['cells']
    def visit(node,mapping,prefix):
        for d in node['devices']:
            if d['kind']=='port':continue
            pins={p:mapping.get(v,prefix+v) for p,v in d['pins'].items()}
            if d['kind']=='block':visit(cells[d['cell_name']],{port:pins[port] for port in cells[d['cell_name']]['ports']},prefix+d['name']+'.')
            else:
                # Magic's distributed RC node syntax uses periods for its own
                # hierarchy. Keep physical flat nets unambiguous; device IDs
                # retain their logical path for cross-probing.
                item=copy.deepcopy(d);item.update(id=prefix+d['id'],name=(prefix+d['name']).replace('.','_'),pins={port:net.replace('.','__') for port,net in pins.items()});devices.append(item)
    visit(ir,{p:p for p in ir['ports']},'');return {**cell(ir['ports']),'devices':devices,'cells':{}}

def cpu_trace(program,cycles=16):
    acc=0;rows=[]
    for i in range(cycles):
        pc=i%16;op=program[pc]['op'];value=program[pc]['value'];before=acc;carry=0
        if op=='LOAD':acc=value
        elif op=='ADD':carry=int(acc+value>15);acc=(acc+value)&15
        elif op=='AND':acc&=value
        else:acc^=value
        rows.append({'index':i,'pc_before':pc,'pc_after':(pc+1)%16,'op':op,'immediate':value,'acc_before':before,'expected':acc,'carry_expected':carry,'zero_expected':int(acc==0)})
    return rows

def catalog():
    return {'schema_version':1,'units':CATALOG,'default_program':DEFAULT_PROGRAM,'operations':OPS,'execution_available':profile.capabilities()['available']}

def validate_project(p):
    meta=p.get('digital_unit');spec=next((v for v in CATALOG if isinstance(meta,dict) and v['id']==meta.get('kind')),None)
    if not spec or p.get('pdk_id')!='sky130A' or p.get('ports')!=spec['ports'] or meta.get('schema_version')!=1:raise EDAError('INVALID_DIGITAL_UNIT','Digital project metadata/PDK/ports disagree.')
    if not 20<=native.num(meta.get('period_ns'))<=1000:raise EDAError('PARAMETER_RANGE','Digital period is invalid.')
    if meta['kind']=='cpu4':program_input(meta.get('program'))
    check=native.validate(p['schematic'])
    if not check['valid']:raise EDAError('SCHEMATIC_INVALID','Digital hierarchy needs repair.',check)
    return meta

def create(params):
    if set(params)-{'kind','name','physical','program','period_ns','corner','temperature_C','supply_V','command_id'}:raise EDAError('INVALID_PARAMETER','Unsupported digital unit fields.')
    kind=params.get('kind');spec=next((v for v in CATALOG if v['id']==kind),None)
    if not spec:raise EDAError('UNSUPPORTED_DIGITAL','Select a supported digital unit.')
    cid=params.get('command_id')
    if not isinstance(cid,str) or not re.fullmatch(r'[A-Za-z0-9_.:-]{1,160}',cid):raise EDAError('INVALID_COMMAND_ID','Creation requires a command identifier.')
    name=params.get('name',spec['name']);physical=params.get('physical',True)
    if not isinstance(name,str) or not name.strip() or len(name)>128 or not isinstance(physical,bool):raise EDAError('INVALID_PARAMETER','Name/physical setting is invalid.')
    period=native.num(params.get('period_ns',50))
    if not 20<=period<=1000:raise EDAError('PARAMETER_RANGE','Period must be 20..1000ns.')
    program=program_input(params.get('program',DEFAULT_PROGRAM)) if kind=='cpu4' else None
    if kind!='cpu4' and 'program' in params:raise EDAError('INVALID_PROGRAM','Adder has no program memory.')
    settings=native.testbench({'analysis':'tran','corner':params.get('corner','tt'),'temperature_C':params.get('temperature_C',27),'supply_V':params.get('supply_V',1.8),'duration_s':period*1e-9*(19 if kind=='cpu4' else spec['case_count']),'step_s':period*1e-9/100,'load_F':5e-15})
    fingerprint=hashlib.sha256(json.dumps({'method':'digital.create','params':params},sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()
    with S.LOCK:
        rows=S.DB.execute('SELECT payload_hash,result FROM receipts WHERE command_id=?',(cid,)).fetchall()
        if rows:
            if len(rows)!=1 or rows[0][0]!=fingerprint:raise EDAError('COMMAND_ID_CONFLICT','Creation identifier already used with different inputs.')
            return json.loads(rows[0][1])
        def action():
            ir=schematic(kind,program);check=native.validate(ir)
            if not check['valid']:raise EDAError('SCHEMATIC_INVALID','Generated hierarchy failed validation.',check)
            pid=uuid.uuid4().hex;layout=k.Layout();layout.dbu=.001;layout.create_cell(kind)
            if physical:layout,_,_=digital_mux.physical(S.STATE/'projects'/pid/'generator',flattened(ir),kind,spec['ports'])
            meta={'schema_version':1,'kind':kind,'period_ns':period,'program':program,'protocol':'digital-native-v1','physical':'generated-reference' if physical else 'not-generated','electrical_hierarchy':'native-subcircuits','physical_hierarchy':'flat-transistor-reference' if physical else 'not-generated'}
            p={'schema_version':1,'id':pid,'name':name,'cell':kind,'pdk_id':'sky130A','revision':1,'dbu_um':.001,'grid_dbu':5,'source':'pdk' if physical else 'fixture','example':kind,'schematic':ir,'testbench':settings,'runs':[],'ports':spec['ports'],'layers':[],'undo_stack':[],'redo_stack':[],'next_revision':2,'digital_unit':meta,'layout_parameter_policy':'reference-layout-independent-edit'}
            return S.commit(p,layout)
        return S.mutate('digital.create',params,action)

def stimuli(p,settings):
    meta=p['digital_unit'];kind=meta['kind'];period=meta['period_ns']*1e-9;v=settings['supply_V'];lines=['VGND VGND 0 0',f'VDD VPWR VGND {v:.12g}']
    if kind=='cpu4':
        lines += [f'VCLK CLK VGND PULSE(0 {v:.12g} {period*.25:.12g} 1e-10 1e-10 {period*.49:.12g} {period:.12g})',f'VRST RESET VGND PWL(0 {v:.12g} {period*1.8:.12g} {v:.12g} {period*1.8+1e-10:.12g} 0)']
        names=['CLK','RESET',*[f'ACC{i}' for i in range(4)],*[f'PC{i}' for i in range(4)],'CARRY','ZERO','OP0','OP1',*[f'IMM{i}' for i in range(4)],'supply_current']
        prefix=meta.get('internal_probe_prefix','xu.')
        if not isinstance(prefix,str) or not re.fullmatch(r'xu\.(?:x[A-Za-z_][A-Za-z0-9_]*\.)*',prefix):raise EDAError('INVALID_PROBE_PATH','CPU internal probe path is invalid.')
        vectors=['v('+n+')' if n not in ('OP0','OP1',*[f'IMM{i}' for i in range(4)]) else 'v('+prefix+n+')' for n in names[:-1]]+['-i(VDD)']
        for n in [*[f'ACC{i}' for i in range(4)],*[f'PC{i}' for i in range(4)],'CARRY','ZERO']:lines.append(f'CLOAD_{n} {n} VGND {settings["load_F"]:.12g}')
    else:
        if kind=='full_adder':rows=[{'A':a,'B':b,'CIN':c} for a in range(2) for b in range(2) for c in range(2)];inputs=['A','B','CIN'];outputs=['SUM','COUT']
        else:rows=[{**{f'A{i}':(a>>i)&1 for i in range(4)},**{f'B{i}':(b>>i)&1 for i in range(4)},'CIN':c} for a in range(16) for b in range(16) for c in range(2)];inputs=[*[f'A{i}' for i in range(4)],*[f'B{i}' for i in range(4)],'CIN'];outputs=[*[f'S{i}' for i in range(4)],'COUT']
        for n in inputs:
            last=rows[0][n]*v;points=[(0,last)]
            for i,row in enumerate(rows[1:],1):
                new=row[n]*v
                if new!=last:points.extend([(i*period,last),(i*period+1e-10,new)]);last=new
            points.append((len(rows)*period,last));lines.append(f'V{n} {n} VGND PWL('+ ' '.join(f'{t:.12g} {value:.12g}' for t,value in points)+')')
        names=inputs+outputs+['supply_current'];vectors=['v('+n+')' for n in names[:-1]]+['-i(VDD)']
        for n in outputs:lines.append(f'CLOAD_{n} {n} VGND {settings["load_F"]:.12g}')
    return lines,names,vectors,['V']*(len(names)-1)+['A']

def spice_tb(p,folder,params,netlist):
    import design_tools
    settings=native.testbench({**p['testbench'],**{key:params[key] for key in native.TESTBENCH if key in params}})
    if settings['analysis']!='tran':raise EDAError('UNSUPPORTED_ANALYSIS','Digital units require actual transient analysis.')
    lines,names,vectors,units=stimuli(p,settings);deck=design_tools.supported_model_deck(folder,settings['corner'])
    # Extracted netlists may permute top ports. Use the actual declaration, reject missing ports.
    top=next((row.split()[2:] for row in Path(netlist).read_text().splitlines() if row.lower().startswith('.subckt '+p['cell'].lower()+' ')),None)
    if top is None or len(top)!=len(p['ports']) or set(top)!=set(p['ports']):raise EDAError('PORT_MISMATCH','Digital native/extracted top ports disagree.')
    cpu=p['digital_unit']['kind']=='cpu4';post_cpu=cpu and bool(params.get('post_layout'))
    # Preserve the proven hierarchical CPU solver/initialization. KLU/optran
    # addresses the large extracted flat RC circuit; applying optran to the
    # hierarchical sense-source network caused an actual timestep failure.
    options='.options noinit method=gear maxord=2' if cpu and not post_cpu else '.options klu noinit method=gear maxord=2'
    text=['Register actual transistor digital '+p['digital_unit']['kind'],options,f'.include "{deck}"','.option scale=1e-6',f'.include "{netlist}"',f'.temp {settings["temperature_C"]}',*lines,'XU '+' '.join(top)+' '+p['cell'],'.control','set num_threads=1','set noaskquit','set wr_singlescale','set wr_vecnames']
    if post_cpu:text+=['optran 0 0 0 40p 2n 0']
    text += [f'tran {settings["step_s"]:.12g} {settings["duration_s"]:.12g}']
    text += [f'let mos_wave_{i} = {vector}' for i,vector in enumerate(vectors)]
    text += ['wrdata waveform.dat '+' '.join(f'mos_wave_{i}' for i in range(len(vectors))),'write waveform.raw all','quit','.endc','.end']
    return '\n'.join(text)+'\n',names,units,'s','time'

def verify(p,run,params):
    settings=native.testbench({**p['testbench'],**{key:params[key] for key in native.TESTBENCH if key in params}});waves={w['name']:w for w in run.get('waveforms',[])};v=settings['supply_V'];meta=p['digital_unit'];kind=meta['kind'];period=meta['period_ns']*1e-9
    def voltage(n,t):
        if n not in waves:raise EDAError('MISSING_WAVEFORM','Actual digital input/output traces are required.')
        x,y=waves[n]['x'],waves[n]['y'];j=bisect.bisect_left(x,t)
        if j>=len(x) or t<x[0]:return None
        return y[j] if not j or x[j]==t else y[j-1]+(y[j]-y[j-1])*(t-x[j-1])/(x[j]-x[j-1])
    def bit(n,t):
        value=voltage(n,t);return 0 if value is not None and value<=.3*v else 1 if value is not None and value>=.7*v else None
    def word(prefix,count,t):
        values=[bit(prefix+str(i),t) for i in range(count)];return None if None in values else sum(b<<i for i,b in enumerate(values))
    def stable(n,wanted,a,b):
        if n not in waves:raise EDAError('MISSING_WAVEFORM','Actual trace missing.')
        w=waves[n];start=bisect.bisect_left(w['x'],a);end=bisect.bisect_right(w['x'],b);window=w['y'][start:end]
        return bool(window) and all((value<=.3*v if wanted==0 else value>=.7*v) for value in window)
    rows=[]
    if kind=='cpu4':
        for row in cpu_trace(meta['program']):
            edge=(row['index']+2.25)*period;t=edge+.2*period;pre=edge-.1*period;actual=word('ACC',4,t);pc=word('PC',4,t)
            inputs={'pc_before':word('PC',4,pre),'op':word('OP',2,pre),'immediate':word('IMM',4,pre),'clock':bit('CLK',t),'reset':bit('RESET',t)}
            passed=inputs=={'pc_before':row['pc_before'],'op':OPS.index(row['op']),'immediate':row['immediate'],'clock':1,'reset':0} and actual==row['expected'] and pc==row['pc_after'] and bit('CARRY',t)==row['carry_expected'] and bit('ZERO',t)==row['zero_expected']
            passed=passed and all(stable(f'ACC{i}',(row['expected']>>i)&1,edge+.15*period,edge+.3*period) for i in range(4))
            rows.append({**row,'actual':actual,'pc_actual':pc,'carry_actual':bit('CARRY',t),'zero_actual':bit('ZERO',t),'observed_inputs':inputs,'sample_time_s':t,'pass':passed})
    else:
        operands=[(a,b,c) for a in range(2 if kind=='full_adder' else 16) for b in range(2 if kind=='full_adder' else 16) for c in range(2)];bits=1 if kind=='full_adder' else 4
        for index,(a,b,c) in enumerate(operands):
            t=(index+.85)*period;total=a+b+c;want=total&((1<<bits)-1);carry=total>>bits;actual=bit('SUM',t) if bits==1 else word('S',4,t)
            inputs=(bit('A',t),bit('B',t),bit('CIN',t)) if bits==1 else (word('A',4,t),word('B',4,t),bit('CIN',t))
            output_names=['SUM'] if bits==1 else [f'S{i}' for i in range(4)]
            passed=inputs==(a,b,c) and actual==want and bit('COUT',t)==carry and all(stable(n,(want>>i)&1,(index+.7)*period,(index+.95)*period) for i,n in enumerate(output_names)) and stable('COUT',carry,(index+.7)*period,(index+.95)*period)
            rows.append({'index':index,'a':a,'b':b,'cin':c,'expected':want,'carry_expected':carry,'actual':actual,'carry_actual':bit('COUT',t),'sample_time_s':t,'pass':passed})
    result={'schema_version':1,'kind':kind,'source':'actual-ngspice-input-and-output-samples','expected_cases':len(rows),'passed_cases':sum(r['pass'] for r in rows),'pass':all(r['pass'] for r in rows),'rows':rows,'logic_low_max_V':.3*v,'logic_high_min_V':.7*v,'scope':'Native transistor transient samples, stable windows and actual input/PC/ROM checks. Not STA, timing closure or manufacturing signoff.'}
    run['unit_verification']=result;run['measurements'].update(unit_kind=kind,truth_cases=len(rows),truth_passed=result['passed_cases'],truth_status='pass' if result['pass'] else 'fail',metric_source=result['source'])
    return result

def rpc(method,params):
    if method=='digital.catalog':
        if params:raise EDAError('INVALID_PARAMETER','Catalog has no parameters.')
        return catalog()
    if method=='digital.create':return create(params)
    raise EDAError('UNKNOWN_METHOD','Unknown digital unit method.')
