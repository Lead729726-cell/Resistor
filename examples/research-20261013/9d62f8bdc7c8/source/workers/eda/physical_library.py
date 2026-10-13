"""SKY130 PCell reference layouts; native DRC/LVS/PEX are independent gates.

Ideal R/C are explicitly replaced by dimensioned public primitive instances.
The source schematic is never modified. Wide reference routing is not an HD library.
"""
import copy, math, subprocess, heapq
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
CATALOG={key:dict(name=name+' · 직접 만든 CMOS 기본 셀',ports=ports,parameter_defaults={'drive_scale':1.,'input_slew_ns':.1},analyses=['tran'],physical_status='public-pcell-reference',scope='실제 SKY130 MOS · 진리표 및 단일 입력 sensitized arc · 독립 DRC/LVS/PEX 필요',targets=['입력 진리표','지연·에너지·전이시간','기생 성분 후 동작']) for key,(name,ports) in GATES.items()}

def parameters(values):
    scale=native.num(values.get('drive_scale',1));slew=native.num(values.get('input_slew_ns',.1))
    if scale not in (1,2,4):raise EDAError('PARAMETER_RANGE','Supported drive scales are 1, 2 and 4; arbitrary off-grid widths are rejected.')
    if not .02<=slew<=5:raise EDAError('PARAMETER_RANGE','Input full-swing slew must be 0.02..5ns.')
    return {**values,'drive_scale':scale,'input_slew_ns':slew}

def gate(kind,values=None):
    values=parameters(values or {})
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
    for node in [ir,*lib.values()]:
        for d in node['devices']:
            if d['kind'] in ('nmos','pmos'):d['parameters']['w_um']*=values['drive_scale']
    # Retain hierarchy for reusable electrical cells; layout flattens separately.
    return ir

def quantize(v):return round(v/0.005)*0.005

def materialize(ir):
    """Return a new flat physical schematic and auditable nominal replacements."""
    flat=digital_units.flattened({**ir,'cells':ir.get('cells',{})});rows=[];result=[]
    for d in flat['devices']:
        if d['kind'] not in ('resistor','capacitor') or d.get('model'):
            if len(result)>=512:raise EDAError('PHYSICAL_LIMIT','Physical reference is limited to 512 primitives total, including MOS and pre-modeled passives.')
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
    # Physical references flatten independent cell coordinate frames. Give
    # primitives a fresh deterministic schematic grid instead of overlapping
    # each child cell at the same origin. Explicit electrical nets are retained.
    for index,d in enumerate(result):d.update(x=180+(index%5)*260,y=170+(index//5)*190)
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

def interval_tracks(spans, clearance=800):
    """Optimal interval coloring in O(n log n), retaining lowest-free track IDs.

    Track ends include routing clearance; equality is an allowed adjacent join
    in time/space. This is rail allocation, not full-chip detailed routing.
    """
    if isinstance(clearance,bool) or not isinstance(clearance,int) or clearance<0:
        raise EDAError('INVALID_GEOMETRY','Track clearance must be a non-negative integer DBU value.')
    busy=[];free=[];tracks={};count=0
    for net,(left,right) in sorted(spans.items(),key=lambda item:(item[1],item[0])):
        if not isinstance(left,int) or not isinstance(right,int) or left>right:
            raise EDAError('INVALID_GEOMETRY','Track spans must be ordered integer DBU intervals.')
        while busy and busy[0][0]<=left:
            _,track=heapq.heappop(busy);heapq.heappush(free,track)
        if free:track=heapq.heappop(free)
        else:track=count;count+=1
        tracks[net]=track;heapq.heappush(busy,(right+clearance,track))
    return tracks,count

def physical(folder,ir,cell_name,ports,chip_limits=None):
    if chip_limits is not None:return bounded_physical(folder,ir,cell_name,ports,chip_limits)
    return _single_row(folder,ir,cell_name,ports)

def _single_row(folder,ir,cell_name,ports,rail_width=400):
    folder=Path(folder);folder.mkdir(parents=True,exist_ok=True)
    ir=copy.deepcopy(ir);devices=[d for d in ir['devices'] if d['kind']!='port']
    if len(devices)>512:raise EDAError('PHYSICAL_LIMIT','Physical routing is bounded to 512 actual primitives.')
    if not devices or any(d['kind'] not in ('nmos','pmos','resistor','capacitor') or not d.get('model') for d in devices):raise EDAError('UNSUPPORTED_PHYSICAL','Physical reference requires dimensioned supported MOS/poly/MIM primitives, with sources in the testbench.')
    cache={};placed=[];cursor=0
    for d in devices:
        native.validate_device(d);key=(d['model'],d['parameters']['w_um'],d['parameters']['l_um'])
        if key not in cache:cache[key]=_base(folder,d)
        base=cache[key];bb=base[1].bbox();cx=cursor-bb.left
        placed.append((d,base,cx));cursor=cx+bb.right+5000
    ymax=max(base[1].bbox().top for _,base,_ in placed);ymin=min(base[1].bbox().bottom for _,base,_ in placed)
    nets=sorted({n for d in devices for n in d['pins'].values()});xs={n:[] for n in nets}
    if set(ports)-set(nets):raise EDAError('UNCONNECTED_PORT','Physical reference cannot route ports absent from the actual primitive graph.',sorted(set(ports)-set(nets)))
    for d,(_,_,anchors,_),cx in placed:
        for pin,(px,_) in anchors.items():
            x=cx+px
            if d['model']!=CAP:
                if pin in ('D','+'):x=cx+min(px,-800)-400
                elif pin in ('S','-'):x=cx+max(px,800)+400
                elif pin=='G':x=cx+max(a[0] for a in anchors.values())+1600
            xs[d['pins'][pin]].append(x)
    spans={n:(-1800 if n in ports else min(v)-300,max(v)+300) for n,v in xs.items()}
    tracks,track_count=interval_tracks({n:spans[n] for n in nets if n not in ('VGND','VPWR')})
    rails={net:ymax+3000+track*1200 for net,track in tracks.items()}
    rails.update({n:y for n,y in [('VGND',ymin-3000),('VPWR',ymin-4500)] if n in spans})
    # MIM terminals are on M4: supply tracks must also lie above the array,
    # otherwise an M4 descent crosses the other electrode's contact landing.
    if any(d['model']==CAP for d in devices):rails.update({n:y for n,y in [('VGND',ymax+3000+track_count*1200),('VPWR',ymax+4500+track_count*1200)] if n in spans})
    import json
    groups={}
    for d,(_,_,anchors,_),cx in placed:
        if d.get('matching_group'):
            key=d['id'].rpartition('.')[0]+'::'+d['matching_group']
            groups.setdefault(key,[]).append({'device':d['name'],'role':d.get('matching_role'),'model':d['model'],'w_um':d['parameters']['w_um'],'l_um':d['parameters']['l_um'],'gate_center_dbu':[cx+anchors['G'][0],anchors['G'][1]]})
    matching=[]
    for key,units in sorted(groups.items()):
        roles=sorted({u['role'] for u in units});centroids={role:[sum(u['gate_center_dbu'][axis] for u in units if u['role']==role)/sum(u['role']==role for u in units) for axis in (0,1)] for role in roles}
        identical=len({(u['model'],u['w_um'],u['l_um']) for u in units})==1
        delta=max((abs(a-b) for axis in (0,1) for a in [min(c[axis] for c in centroids.values())] for b in [max(c[axis] for c in centroids.values())]),default=0)
        valid_pair=roles==['A','B'] and sum(u['role']=='A' for u in units)==sum(u['role']=='B' for u in units)>=2
        matching.append({'group':key,'units':units,'centroids_dbu':centroids,'max_centroid_delta_dbu':delta,'equal_unit_geometry':identical,'nominal_centroid_match':valid_pair and identical and delta==0,'scope':'ABBA row cancels nominal first spatial moment; no dummies/guard-ring/substrate/random-yield signoff'})
    (folder/'routing-report.json').write_text(json.dumps({'algorithm':'interval-heap-v2','primitive_count':len(devices),'signal_track_count':track_count,'track_clearance_dbu':800,'tracks':tracks,'matching_groups':matching,'scope':'single-row PCell reference; no full-chip density/antenna/foundry signoff'},sort_keys=True,indent=2))
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
        route((70,20),[(spans[net][0],y),(spans[net][1],y)],rail_width,net)
        if net in ports:shape((70,5),k.Text(net,k.Trans(-1800,y)),net);box((70,16),-1800,y,400,400,net)
    G.assign_ids(layout)
    return layout

def bounded_physical(folder,ir,cell_name,ports,chip_limits):
    """Fold reference rows with M3 row rails / M4 inter-row trunks.

    Trunks lie outside every PCell, including MIM M4 electrodes. Matched units
    remain indivisible and in their source order. No shrinking or clipping.
    """
    import json
    import floorplan as F
    policy=F.policy(F.specification(chip_limits));folder=Path(folder);folder.mkdir(parents=True,exist_ok=True)
    devices=[copy.deepcopy(d) for d in ir['devices'] if d['kind']!='port']
    if not devices or len(devices)>512:raise EDAError('PHYSICAL_LIMIT','Bounded reference supports 1..512 primitives.')
    nets=sorted({n for d in devices for n in d['pins'].values()})
    if set(ports)-set(nets):raise EDAError('UNCONNECTED_PORT','Chip ports must exist in the primitive graph.')
    edge=round(policy['edge_um']*1000);width=round(policy['width_um']*1000)
    trunk_width=1200*len(nets)+3000;available=width-2*edge-trunk_width-4000
    if available<=0:raise EDAError('CHIP_ENVELOPE_EXCEEDED','Chip width cannot fit the reserved inter-row routing channel.',{'required_channel_um':(trunk_width+4000+2*edge)/1000})
    cache={};groups=[];seen={}
    for d in devices:
        native.validate_device(d)
        key=(d['model'],d['parameters']['w_um'],d['parameters']['l_um'])
        if key not in cache:cache[key]=_base(folder/'primitives',d)
        group=d['id'].rpartition('.')[0]+'::'+d['matching_group'] if d.get('matching_group') else None
        if group is not None and group in seen:groups[seen[group]].append(d)
        else:
            if group is not None:seen[group]=len(groups)
            groups.append([d])
    rows=[];row=[];used=0
    for group in groups:
        size=sum(cache[(d['model'],d['parameters']['w_um'],d['parameters']['l_um'])][1].bbox().width()+5000 for d in group)+2200
        if size>available:raise EDAError('CHIP_ENVELOPE_EXCEEDED','An indivisible matched group / primitive cannot fit the chip row.',{'devices':[d['name'] for d in group],'required_row_um':size/1000,'available_row_um':available/1000})
        if row and used+size>available:rows.append(row);row=[];used=0
        row.extend(group);used+=size
    if row:rows.append(row)
    layout=k.Layout();layout.dbu=.001;top=layout.create_cell(cell_name);landings={n:[] for n in nets};reports=[];cursor=edge
    for index,row in enumerate(rows):
        rownets=sorted({n for d in row for n in d['pins'].values()})
        subfolder=folder/f'row-{index:03d}';sub=_single_row(subfolder,{'devices':row},cell_name,rownets,600);cell=sub.cell(cell_name);bb=cell.bbox()
        dx=edge+trunk_width+2000-bb.left;dy=cursor-bb.bottom;tr=k.Trans(dx,dy)
        if bb.width()>available+4000:raise EDAError('CHIP_ENVELOPE_EXCEEDED','Actual row geometry exceeds its allocation; no layout is committed.')
        for li in sub.layer_indices():
            info=sub.get_info(li)
            for s in cell.shapes(li).each():
                if info.layer==70 and info.datatype==5 and s.is_text():
                    p=s.text.transformed(tr);landings[p.string].append((p.x,p.y));continue
                if info.layer==70 and info.datatype==16:continue
                p=s.text.transformed(tr) if s.is_text() else G.shape_poly(s).transformed(tr)
                item=top.shapes(layout.layer(info)).insert(p)
                for prop in (2,3):
                    if s.property(prop) is not None:item.set_property(prop,s.property(prop))
        report=json.loads((subfolder/'routing-report.json').read_text())
        for group in report['matching_groups']:
            for unit in group['units']:unit['gate_center_dbu']=[unit['gate_center_dbu'][0]+dx,unit['gate_center_dbu'][1]+dy]
            for role,point in group['centroids_dbu'].items():group['centroids_dbu'][role]=[point[0]+dx,point[1]+dy]
        reports.append({'row':index,'translation_dbu':[dx,dy],**report});cursor+=bb.height()+6000
    # Row generator already created the public via3 helper. Copy its native
    # polygons for each M3/M4 connection; trunks never cross a PCell electrode.
    via=k.Layout();via.read(str(folder/'row-000/via3/via3_core.gds'));vc=via.cell('via3_core')
    vb=next(s.bbox() for s in vc.shapes(via.find_layer(70,44)).each())
    def shape(layer,p,net):
        item=top.shapes(layout.layer(*layer)).insert(p);item.set_property(2,net)
    for index,net in enumerate(nets):
        x=edge+600+index*1200;points=landings[net]
        if not points:raise EDAError('UNCONNECTED_PORT','Inter-row trunk lacks a real terminal landing.')
        ys=[p[1] for p in points]
        shape((71,20),k.Box(x-250,min(ys)-300,x+250,max(ys)+300),net)
        for rx,y in points:
            shape((70,20),k.Path([k.Point(x,y),k.Point(rx,y)],400),net)
            tr=k.Trans(x-(vb.left+vb.right)//2,y-(vb.bottom+vb.top)//2)
            for li in via.layer_indices():
                info=via.get_info(li)
                for s in vc.shapes(li).each():
                    if not s.is_text():shape((info.layer,info.datatype),G.shape_poly(s).transformed(tr),net)
        if net in ports:
            y=min(ys);shape((71,5),k.Text(net,k.Trans(x,y)),net);shape((71,16),k.Box(x-250,y-250,x+250,y+250),net)
    result=F.enforce(layout,cell_name,policy)
    (folder/'routing-report.json').write_text(json.dumps({'algorithm':'bounded-rows-m3-m4-v1','primitive_count':len(devices),'row_count':len(rows),'inter_row_nets':len(nets),'floorplan':result,'rows':reports,'matching_groups':[g for r in reports for g in r['matching_groups']],'scope':'PCell reference with bounded envelope; native DRC/LVS/PEX remain independent gates.'},indent=2)+'\n')
    G.assign_ids(layout);return layout

def gate_cases(kind):
    count=len(GATES[kind][1])-3
    rows=[]
    for pattern in range(1<<count):
        bits=[(pattern>>i)&1 for i in range(count)];a=bits[0];b=bits[1] if count>1 else 0
        expected={'cell_inv':1-a,'cell_nand2':1-(a&b),'cell_nor2':1-(a|b),'cell_and2':a&b,'cell_or2':a|b,'cell_xor2':a^b,'cell_xnor2':1-(a^b),'cell_mux2':bits[1] if count==3 and bits[2] else a}[kind]
        rows.append({'index':pattern,'inputs':bits,'expected':expected})
    return rows

def gate_arcs(kind):
    """Every sensitized single-input transition, including MUX data/select arcs."""
    rows=gate_cases(kind);by_pattern={tuple(r['inputs']):r['expected'] for r in rows};arcs=[]
    for row in rows:
        for i,pin in enumerate(GATES[kind][1][:-3]):
            changed=row['inputs'].copy();changed[i]=1-changed[i]
            expected=by_pattern[tuple(changed)]
            if expected!=row['expected']:
                arcs.append(dict(input=pin,before=row['inputs'],after=changed,output_before=row['expected'],output_after=expected))
    return arcs

def stimulus_rows(kind):
    rows=copy.deepcopy(gate_cases(kind))
    for arc in gate_arcs(kind):
        rows.append(dict(index=len(rows),inputs=arc['before'],expected=arc['output_before']))
        rows.append(dict(index=len(rows),inputs=arc['after'],expected=arc['output_after'],arc=arc))
    return rows

def gate_step(slew_ns):
    # The longest 32-slot MUX fixture must remain below the public 200k nominal
    # point limit at the supported minimum slew. SPICE still refines its actual
    # time steps around PWL breakpoints; it never fabricates transition samples.
    return max(10e-12,min(100e-12,slew_ns*1e-9/10))

def spice_tb(p,folder,settings,netlist,deck,sub):
    kind=p['design_template']['id'];ports=p['ports'];inputs=ports[:-3];s=settings['supply_V'];slot=50e-9;rows=stimulus_rows(kind)
    slew=parameters(p['design_template'].get('parameters',{}))['input_slew_ns']*1e-9
    lines=['Resistor public CMOS cell actual input truth matrix',f'.include "{deck}"','.option scale=1e-6',f'.include "{netlist}"',f'.temp {settings["temperature_C"]}','VGND VGND 0 0',f'VDD VPWR VGND {s:.12g}']
    for i,pin in enumerate(inputs):
        points=[(0,rows[0]['inputs'][i]*s)]
        for row in rows[1:]:points.extend([(row['index']*slot,rows[row['index']-1]['inputs'][i]*s),(row['index']*slot+slew,row['inputs'][i]*s)])
        points.append((len(rows)*slot,rows[-1]['inputs'][i]*s))
        lines.append('V'+pin+' '+pin+' VGND PWL('+' '.join(f'{t:.12g} {v:.12g}' for t,v in points)+')')
    step=gate_step(slew*1e9)
    lines += [f'CLOAD Y VGND {settings["load_F"]:.12g}','XU '+' '.join(sub)+' '+p['cell'],'.control','set numdgt=17','set wr_singlescale','set wr_vecnames',f'tran {step:.12g} {len(rows)*slot:.12g} 0 {step:.12g}']
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
    if any(not w.get('x') or len(w['x'])!=len(w.get('y',[])) for w in waves.values()):
        run['reference_verification']=r;run['measurements'].update(truth_cases=len(checks),truth_passed=sum(c['pass'] for c in checks),timing_characterization={'pass':None,'observed_arcs':0,'reason':'Missing actual waveform samples.'})
        return r
    import research as R
    import signal_metrics as M
    arcs=[]
    for row in stimulus_rows(kind):
        if 'arc' not in row:continue
        arc=row['arc'];pin=arc['input'];edge=row['index']*50e-9;end=edge+35e-9
        rising=bool(arc['output_after']);input_rising=arc['after'][p['ports'].index(pin)]==1
        input_edges=R.crossings(waves[pin],s/2,edge,end,input_rising)
        output_edges=R.crossings(waves['Y'],s/2,edge,end,rising)
        early=R.crossings(waves['Y'],s*(.1 if rising else .9),edge,end,rising)
        late=R.crossings(waves['Y'],s*(.9 if rising else .1),edge,end,rising)
        # A single observed transition prevents selecting a convenient edge from a glitch.
        available=len(input_edges)==len(output_edges)==len(early)==len(late)==1
        delay=output_edges[0]-input_edges[0] if available else None
        transition=late[0]-early[0] if available else None
        stable=M.stable(waves['Y'],arc['output_after'],end,edge+47.5e-9,s)
        before_valid=M.stable(waves['Y'],arc['output_before'],edge-15e-9,edge-2.5e-9,s) and all(M.stable(waves[n],b,edge-15e-9,edge-2.5e-9,s) for n,b in zip(p['ports'][:-3],arc['before']))
        inputs_valid=all(M.stable(waves[n],b,end,edge+47.5e-9,s) for n,b in zip(p['ports'][:-3],arc['after'])) and all(M.stable(waves[n],b,edge,end,s) for n,b in zip(p['ports'][:-3],arc['before']) if n!=pin)
        arcs.append(dict(**arc,available=available,propagation_s=delay,transition_10_90_s=transition,
                         stable_output=stable,valid_before_state=before_valid,valid_sensitizing_inputs=inputs_valid,pass_=available and delay is not None and transition>=0 and stable and before_valid and inputs_valid,
                         source='Actual input/output half-supply crossings and output 10–90% crossings. Negative delay is retained, never clamped.'))
    normalized=[{**{k:v for k,v in a.items() if k!='pass_'},'pass':a['pass_']} for a in arcs]
    observed=[a for a in normalized if a['available']]
    run['measurements'].update(truth_cases=len(checks),truth_passed=sum(c['pass'] for c in checks),
        timing_characterization={'arcs':normalized,'expected_arcs':len(arcs),'observed_arcs':len(observed),
        'pass':all(a['pass'] for a in normalized) if observed else None,
        'max_propagation_s':max((a['propagation_s'] for a in observed),default=None),
        'max_transition_s':max((a['transition_10_90_s'] for a in observed),default=None),
        'input_slew_ns':p['design_template'].get('parameters',{}).get('input_slew_ns',.1),
        'load_F':settings.get('load_F'), 'corner':settings.get('corner'),
        'temperature_C':settings.get('temperature_C'), 'supply_V':s,
        'scope':'Combinational sensitized arcs at this load/PVT. Not complete Liberty, sequential setup/hold, STA or hidden/internal power characterization.'})
    if observed:
        r['checks'].append({'name':'Every sensitized timing arc observed and settles','pass':all(a['pass'] for a in normalized),'observed':len(observed)})
        r['pass']=all(c['pass'] for c in r['checks'])
    run['reference_verification']=r
    return r
