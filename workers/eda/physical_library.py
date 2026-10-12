"""SKY130 PCell reference layouts; native DRC/LVS/PEX are independent gates.

Ideal R/C are explicitly replaced by dimensioned public primitive instances.
The source schematic is never modified. Wide reference routing is not an HD library.
"""
import copy, math, subprocess
from pathlib import Path
import klayout.db as k
import geometry as G
from geometry import EDAError
import native, profile, templates, digital_units

RES='sky130_fd_pr__res_xhigh_po_1p41'
RES_WIDTH=1.41
RES_SLOPE=2000/RES_WIDTH
RES_CONTACT=-46.62/(RES_WIDTH**2)+331.73/RES_WIDTH+20.576
CAP='sky130_fd_pr__cap_mim_m3_1'
GATES={'cell_inv':('INV',['A','Y','VPWR','VGND']),
 'cell_nand2':('NAND2',['A0','A1','Y','VPWR','VGND']),
 'cell_nor2':('NOR2',['A','B','Y','VPWR','VGND']),
 'cell_and2':('AND2',['A','B','Y','VPWR','VGND']),
 'cell_or2':('OR2',['A','B','Y','VPWR','VGND']),
 'cell_xor2':('XOR2',['A','B','Y','VPWR','VGND']),
 'cell_xnor2':('XNOR2',['A','B','Y','VPWR','VGND']),
 'cell_mux2':('MUX2',['A','B','S','Y','VPWR','VGND'])}
CATALOG={key:dict(name=name+' · 직접 만든 CMOS 기본 셀',ports=ports,parameter_defaults={},analyses=['tran'],physical_status='public-pcell-reference',scope='실제 SKY130 MOS · 모든 논리 입력 조합 · 독립 DRC/LVS/PEX 필요',targets=['입력 진리표','물리 연결','기생 성분 후 동작']) for key,(name,ports) in GATES.items()}

def gate(kind):
    lib=digital_units.make_library(1)
    nor=digital_units.cell(['A','B','Y','VPWR','VGND'])
    for name,kind_,d,g,s in [('MP0','pmos','N','A','VPWR'),('MP1','pmos','Y','B','N'),('MN0','nmos','Y','A','VGND'),('MN1','nmos','Y','B','VGND')]:
        digital_units.transistor(nor,kind_,name,d,g,s)
    lib['NOR2']=nor
    for name,base in [('OR2','NOR2'),('XNOR2','XOR2')]:
        ir=digital_units.cell(['A','B','Y','VPWR','VGND'])
        digital_units.block(ir,lib,base,'CORE',{'A':'A','B':'B','Y':'N'})
        digital_units.block(ir,lib,'INV','BUF',{'A':'N','Y':'Y'});lib[name]=ir
    ir=copy.deepcopy(lib[GATES[kind][0]]);ir['cells']=lib
    # Retain hierarchy for reusable electrical cells; layout flattens separately.
    return ir

def quantize(v):return round(v/0.005)*0.005

def materialize(ir):
    """Return a new flat physical schematic and auditable nominal replacements."""
    flat=digital_units.flattened({**ir,'cells':ir.get('cells',{})});rows=[];result=[]
    for d in flat['devices']:
        if d['kind'] not in ('resistor','capacitor') or d.get('model'):
            result.append(d);continue
        value=native.num(d['parameters']['value']);a=d['pins']['+'];b=d['pins']['-']
        if d['kind']=='capacitor':
            count=max(1,math.ceil(value/1.8e-12));ff=value/count*1e15
            side=quantize((-0.76+math.sqrt(0.76**2+8*ff))/4)
            if not 2<=side<=30:raise EDAError('PASSIVE_RANGE','MIM conversion supports dimensions 2..30um and parallel arrays.')
            pieces=[(a,b,side,side) for _ in range(count)]
            nominal=count*(2*side*side+.76*side)*1e-15
        else:
            parallel=max(1,math.ceil((RES_CONTACT+.5*RES_SLOPE)/value));series=max(1,math.ceil(value*parallel/42000))
            length=quantize((value*parallel/series-RES_CONTACT)/RES_SLOPE)
            if not .5<=length<=30:raise EDAError('PASSIVE_RANGE','Precision poly conversion supports 0.5..30um segments.')
            pieces=[]
            for row in range(parallel):
                chain=[a]+[d['name']+f'_R{row}_N{i}' for i in range(series-1)]+[b]
                pieces.extend((chain[i],chain[i+1],RES_WIDTH,length) for i in range(series))
            nominal=series*(RES_CONTACT+RES_SLOPE*length)/parallel
        if len(pieces)>256 or len(result)+len(pieces)>512:raise EDAError('PHYSICAL_LIMIT','Physical reference is limited to 256 instances per passive and 512 primitives total; use a separate bounded custom implementation.')
        for i,(p,n,w,l) in enumerate(pieces):
            target=value/len(pieces) if d['kind']=='capacitor' else value*parallel/series
            item=copy.deepcopy(d);item.update(id=d['id']+f':p{i}',name=d['name']+f'_P{i}',model=CAP if d['kind']=='capacitor' else RES,pins={'+':p,'-':n,**({'B':'VGND'} if d['kind']=='resistor' else {})},parameters={'value':target,'w_um':w,'l_um':l},x=d.get('x',0)+(i%4)*170,y=d.get('y',0)+(i//4)*160)
            result.append(item)
        rows.append({'source_device':d['name'],'kind':d['kind'],'requested_SI':value,'nominal_geometry_SI':nominal,'instances':len(pieces),'model':CAP if d['kind']=='capacitor' else RES,'w_um':w,'l_um':l,'value_scope':'PCell nominal sizing estimate; voltage/temperature/process-dependent model is authoritative.'})
    flat['devices']=result
    return flat,rows

def _base(folder,d):
    model=d['model'];w=d['parameters']['w_um'];l=d['parameters']['l_um']
    key=f'{model}_{w:.6g}_{l:.6g}';f=folder/key;f.mkdir(parents=True,exist_ok=True)
    script=f/'generate.tcl';script.write_text(f'load primitive\nbox 0 0 0 0\nset pars [sky130::{model}_defaults]\ndict set pars w {w:.12g}\ndict set pars l {l:.12g}\ndict set pars viagate 0\ndict set pars doports 1\n'+('dict set pars stack 0\n' if model==CAP else '')+f'sky130::{model}_draw $pars\nsave primitive\ngds write primitive.gds\nquit -noprompt\n')
    r=subprocess.run(['magic','-dnull','-noconsole','-rcfile',str(profile.MAGIC_RC),str(script)],cwd=f,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=60)
    (f/'generator.log').write_text(r.stdout)
    if r.returncode or not (f/'primitive.gds').exists():raise EDAError('ENGINE_FAILED','Public PCell generation failed; native log retained.')
    src=k.Layout();src.read(str(f/'primitive.gds'));cell=src.cell('primitive')
    labels={s.text.string:(s.text.x,s.text.y) for li in src.layer_indices() for s in cell.shapes(li).each() if s.is_text()}
    mapping={'C1':'+','C2':'-'} if model==CAP else {'R1':'+','R2':'-','B':'B'} if model==RES else {p:p for p in 'DGSB'}
    if src.dbu!=.001 or not set(mapping)<=set(labels):raise EDAError('PDK_MAPPING_FAILED','Public PCell terminal labels or DBU changed.')
    return src,cell,{mapping[p]:labels[p] for p in mapping},mapping

def physical(folder,ir,cell_name,ports):
    folder=Path(folder);folder.mkdir(parents=True,exist_ok=True)
    ir=copy.deepcopy(ir);devices=[d for d in ir['devices'] if d['kind']!='port']
    if not devices or any(d['kind'] not in ('nmos','pmos','resistor','capacitor') or not d.get('model') for d in devices):raise EDAError('UNSUPPORTED_PHYSICAL','Physical reference requires dimensioned supported MOS/poly/MIM primitives, with sources in the testbench.')
    cache={};placed=[];cursor=0
    for d in devices:
        native.validate_device(d);key=(d['model'],d['parameters']['w_um'],d['parameters']['l_um'])
        if key not in cache:cache[key]=_base(folder,d)
        base=cache[key];bb=base[1].bbox();cx=cursor-bb.left
        placed.append((d,base,cx));cursor=cx+bb.right+5000
    ymax=max(base[1].bbox().top for _,base,_ in placed);ymin=min(base[1].bbox().bottom for _,base,_ in placed)
    nets=sorted({n for d in devices for n in d['pins'].values()});xs={n:[] for n in nets}
    for d,(_,_,anchors,_),cx in placed:
        for pin,(px,_) in anchors.items():
            x=cx+px
            if d['model']!=CAP:
                if pin in ('D','+'):x=cx+min(px,-800)-400
                elif pin in ('S','-'):x=cx+max(px,800)+400
                elif pin=='G':x=cx+max(a[0] for a in anchors.values())+1600
            xs[d['pins'][pin]].append(x)
    spans={n:(-1800 if n in ports else min(v)-300,max(v)+300) for n,v in xs.items()}
    ends=[];rails={}
    for net in sorted((n for n in nets if n not in ('VGND','VPWR')),key=lambda n:spans[n]):
        left,right=spans[net];track=next((i for i,end in enumerate(ends) if end+800<=left),len(ends))
        if track==len(ends):ends.append(right)
        else:ends[track]=right
        rails[net]=ymax+3000+track*1200
    rails.update(VGND=ymin-3000,VPWR=ymin-4500)
    # MIM terminals are on M4: supply tracks must also lie above the array,
    # otherwise an M4 descent crosses the other electrode's contact landing.
    if any(d['model']==CAP for d in devices):rails.update(VGND=ymax+3000+len(ends)*1200,VPWR=ymax+4500+len(ends)*1200)
    v1=templates.via(folder/'via1','via1_core','via1');v2=templates.via(folder/'via2','via2_core','via2',280,280)
    # Installed via3 helper, with explicit M3/M4 area-compliant landings.
    f=folder/'via3';f.mkdir(exist_ok=True);t=f/'make.tcl';t.write_text('load via3_core\nbox 0um 0um 0.32um 0.32um\nsky130::via3_draw\nbox -0.14um -0.14um 0.46um 0.46um\npaint m3\npaint m4\nsave via3_core\ngds write via3_core.gds\nquit -noprompt\n')
    r=subprocess.run(['magic','-dnull','-noconsole','-rcfile',str(profile.MAGIC_RC),str(t)],cwd=f,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=60)
    (f/'generator.log').write_text(r.stdout)
    if r.returncode or not (f/'via3_core.gds').exists():raise EDAError('ENGINE_FAILED','Public via3 helper failed.')
    v3=k.Layout();v3.read(str(f/'via3_core.gds'))
    layout=k.Layout();layout.dbu=.001;top=layout.create_cell(cell_name)
    def shape(layer,p,net='',ident=None):
        s=top.shapes(layout.layer(*layer)).insert(p);s.set_property(2,net)
        if ident:s.set_property(3,ident)
    def box(layer,x,y,w,h,net):shape(layer,k.Box(x-w//2,y-h//2,x+w//2,y+h//2),net)
    def route(layer,points,width,net):shape(layer,k.Path([k.Point(*p) for p in points],width),net)
    def via(src,number,x,y,net):
        cell=src.cell(f'via{number}_core');bb=next(s.bbox() for s in cell.shapes(src.find_layer(67+number,44)).each())
        tr=k.Trans(x-(bb.left+bb.right)//2,y-(bb.bottom+bb.top)//2)
        for li in src.layer_indices():
            info=src.get_info(li)
            for s in cell.shapes(li).each():shape((info.layer,info.datatype),s.text.transformed(tr) if s.is_text() else G.shape_poly(s).transformed(tr),net)
    for d,(src,cell,anchors,mapping),cx in placed:
        pins=d['pins'];tr=k.Trans(cx,0)
        for li in src.layer_indices():
            info=src.get_info(li)
            if info.datatype==16:continue
            for s in cell.shapes(li).each():
                p=s.text.transformed(tr) if s.is_text() else G.shape_poly(s).transformed(tr)
                if s.is_text():p.string=pins.get(mapping.get(p.string,p.string),p.string)
                shape((info.layer,info.datatype),p,p.string if s.is_text() else '',d['id'])
        for pin,(px,py) in anchors.items():
            net=pins[pin];x=cx+px;y=py
            if d['model']==CAP:
                route((71,20),[(x,y),(x,rails[net])],500,net);via(v3,3,x,rails[net],net);continue
            if pin in ('G','B') or d['model']==RES:
                if pin=='G':
                    y+=170;box((67,20),x,(py+y)//2,170,y-py+170,net)
                box((67,44),x,y,170,170,net);box((68,20),x,y,400,400,net)
            # Separate terminal escape columns keep the body's vertical route
            # clear even when a gate or passive terminal uses a power net.
            if pin in ('D','+'):
                end=cx+min(px,-800)-400
            elif pin in ('S','-'):
                end=cx+max(px,800)+400
            elif pin=='G':end=cx+max(a[0] for a in anchors.values())+1600
            else:end=x
            route((68,20),[(x,y),(end,y)],170,net);via(v1,1,end,y,net)
            route((69,20),[(end,y),(end,rails[net])],360,net);via(v2,2,end,rails[net],net)
    for net,y in rails.items():
        route((70,20),[(spans[net][0],y),(spans[net][1],y)],400,net)
        if net in ports:shape((70,5),k.Text(net,k.Trans(-1800,y)),net);box((70,16),-1800,y,400,400,net)
    G.assign_ids(layout)
    return layout

def gate_cases(kind):
    count=len(GATES[kind][1])-3
    rows=[]
    for pattern in range(1<<count):
        bits=[(pattern>>i)&1 for i in range(count)];a=bits[0];b=bits[1] if count>1 else 0
        expected={'cell_inv':1-a,'cell_nand2':1-(a&b),'cell_nor2':1-(a|b),'cell_and2':a&b,'cell_or2':a|b,'cell_xor2':a^b,'cell_xnor2':1-(a^b),'cell_mux2':bits[1] if count==3 and bits[2] else a}[kind]
        rows.append({'index':pattern,'inputs':bits,'expected':expected})
    return rows

def spice_tb(p,folder,settings,netlist,deck,sub):
    kind=p['design_template']['id'];ports=p['ports'];inputs=ports[:-3];s=settings['supply_V'];slot=50e-9;rows=gate_cases(kind)
    lines=['Resistor public CMOS cell actual input truth matrix',f'.include "{deck}"','.option scale=1e-6',f'.include "{netlist}"',f'.temp {settings["temperature_C"]}','VGND VGND 0 0',f'VDD VPWR VGND {s:.12g}']
    for i,pin in enumerate(inputs):
        points=[(0,rows[0]['inputs'][i]*s)]
        for row in rows[1:]:points.extend([(row['index']*slot,rows[row['index']-1]['inputs'][i]*s),(row['index']*slot+100e-12,row['inputs'][i]*s)])
        points.append((len(rows)*slot,rows[-1]['inputs'][i]*s))
        lines.append('V'+pin+' '+pin+' VGND PWL('+' '.join(f'{t:.12g} {v:.12g}' for t,v in points)+')')
    lines += [f'CLOAD Y VGND {settings["load_F"]:.12g}','XU '+' '.join(sub)+' '+p['cell'],'.control','set numdgt=17','set wr_singlescale','set wr_vecnames',f'tran 100p {len(rows)*slot:.12g}']
    names=[*inputs,'Y','supply_current'];vectors=[f'v({n})' for n in names[:-1]]+['-i(VDD)']
    for i,v in enumerate(vectors):lines.append(f'let mos_wave_{i} = {v}')
    lines += ['wrdata waveform.dat '+' '.join(f'mos_wave_{i}' for i in range(len(names))),'write waveform.raw all','quit','.endc','.end']
    dest=Path(folder)/'testbench.spice';dest.write_text('\n'.join(lines)+'\n');return dest,names,['V']*(len(names)-1)+['A'],'s','time'

def measurements(p,run,settings):
    waves={w['name']:w for w in run['waveforms']};checks=[];s=settings['supply_V'];kind=p['design_template']['id']
    for row in gate_cases(kind):
        lo=(row['index']+.7)*50e-9;hi=(row['index']+.95)*50e-9
        def valid(name,expected):
            values=[v for t,v in zip(waves[name]['x'],waves[name]['y']) if lo<=t<=hi]
            return bool(values) and all(v>=.7*s if expected else v<=.3*s for v in values)
        passed=all(valid(pin,b) for pin,b in zip(p['ports'][:-3],row['inputs'])) and valid('Y',row['expected'])
        out=[v for t,v in zip(waves['Y']['x'],waves['Y']['y']) if lo<=t<=hi]
        checks.append({'name':'input '+str(row['inputs'])+' → '+str(row['expected']),'pass':passed,'observed':[min(out),max(out)] if out else None})
    r={'schema_version':1,'kind':kind,'source':'actual-ngspice-input-and-output-samples','pass':all(c['pass'] for c in checks),'checks':checks,'scope':'Exhaustive input combinations at configured load/PVT; not Liberty/STA characterization.'}
    run['reference_verification']=r;run['measurements'].update(truth_cases=len(checks),truth_passed=sum(c['pass'] for c in checks));return r
