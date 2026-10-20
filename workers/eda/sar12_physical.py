"""Bounded split-CDAC mask generator; every visible capacitor is a real PCell.

Four interleaved subarrays share the same nominal centroid. Per-bit pairs are
inversion symmetric. M3 row rails reach M4 trunks in an empty center channel;
no trunk crosses a MIM electrode. These geometric checks do not imply matching,
coupling balance, DRC/LVS/PEX success or foundry approval.
"""
import copy,json,re,subprocess
from collections import Counter,defaultdict
from fractions import Fraction
from pathlib import Path
import klayout.db as k
import geometry as G
import physical_library as P
import floorplan as F
import profile
from geometry import EDAError

ROW_MAP={('P','COARSE'):[0,7,8,15,16,23,24,31],('N','COARSE'):[3,4,11,12,19,20,27,28],('P','FINE'):[1,6,9,14,17,22,25,30],('N','FINE'):[2,5,10,13,18,21,26,29]}
UNIT=re.compile(r'([PN])_(COARSE|FINE)_(B[0-5]|DUMMY)_U(\d+)\.C_UNIT(?::p0)?$')

def array_plan(devices):
    groups=defaultdict(list);rest=[]
    for d in devices:
        m=UNIT.search(d['id'])
        if m and d['kind']=='capacitor':groups[tuple(m.groups()[:3])].append((int(m[4]),d))
        else:rest.append(d)
    if sum(map(len,groups.values()))!=508:raise EDAError('SAR12_ARRAY_MISMATCH','A 6+6 differential CDAC needs exactly 508 physical unit capacitors, plus its two bridge capacitors.')
    rows=[[] for _ in range(32)];seen=set()
    for (side,bank),indices in ROW_MAP.items():
        pairs=[((r,c),(7-r,15-c)) for r in range(8) for c in range(16) if (r,c)<(7-r,15-c)]
        pairs.sort(key=lambda pair:(max(abs(pair[0][1]-7.5),abs(indices[pair[0][0]]-15.5)*.65),sum((v-v0)**2 for v,v0 in zip((pair[0][1],indices[pair[0][0]]),(7.5,15.5))),pair))
        cursor=0
        for group,count in [('DUMMY',2),*[(f'B{i}',2<<i) for i in range(6)]]:
            selected=pairs[cursor:cursor+count//2];cursor+=count//2
            units=sorted(groups.get((side,bank,group),[]))
            if bank=='COARSE' and group=='DUMMY':
                if units:raise EDAError('SAR12_ARRAY_MISMATCH','The bridge supplies the coarse dummy equivalent; do not add a physical coarse dummy.')
                continue
            if len(units)!=count:raise EDAError('SAR12_ARRAY_MISMATCH','Actual unit multiplicity differs from its bit weight.')
            positions=[p for pair in selected for p in pair]
            for (_,d),(r,c) in zip(units,positions):
                if d['id'] in seen:raise EDAError('SAR12_ARRAY_MISMATCH','Duplicate unit ID.')
                seen.add(d['id']);rows[indices[r]].append((c,d,(side,bank,group)))
    if len(seen)!=508:raise EDAError('SAR12_ARRAY_MISMATCH','Unplaced physical capacitor units remain.')
    return [sorted(row,key=lambda entry:entry[0]) for row in rows],rest

def physical(folder,ir,cell_name,ports,chip_limits):
    policy=F.policy(F.specification(chip_limits or F.policy()));folder=Path(folder);folder.mkdir(parents=True,exist_ok=True)
    devices=[copy.deepcopy(d) for d in ir['devices'] if d['kind']!='port']
    if not 1<=len(devices)<=768:raise EDAError('PHYSICAL_LIMIT','Dedicated SAR12 analog adapter permits at most 768 real primitives.')
    rows,logic=array_plan(devices);cache={};vias=[];subs=[]
    for i,row in enumerate(rows):
        units=[d for _,d,_ in row];rownets=sorted({n for d in units for n in d['pins'].values()})
        sub=P._single_row(folder/f'array-row-{i:02d}',{'devices':units},cell_name,rownets,600,primitive_cache=cache,via_cache=vias,slots={d['id']:c for c,d,_ in row})
        subs.append((sub,sub.cell(cell_name),rownets))
    edge=round(policy['edge_um']*1000);width=round(policy['width_um']*1000)
    left=min(c.bbox().left for _,c,_ in subs);right=max(c.bbox().right for _,c,_ in subs)
    bottom=min(c.bbox().bottom for _,c,_ in subs);height=max(c.bbox().top for _,c,_ in subs)-bottom
    row_pitch=height+2000;dx=edge-left;dy0=edge-bottom
    # Pack the switching/comparator primitives only into the empty right region.
    # Preliminary channel reserves all actual nets; the finalized channel drops
    # nets confined to one row, without changing their local connectivity.
    allnets={n for d in devices for n in d['pins'].values()}
    channel_start=edge+right-left+2500;channel_width=len(allnets)*3000+3000
    available=width-edge-channel_start-channel_width-5000
    if available<30000:raise EDAError('CHIP_ENVELOPE_EXCEEDED','No space remains for actual SAR switches and comparator.')
    grouped=[];by_group={}
    for d in logic:
        key=(d['model'],d['parameters']['w_um'],d['parameters']['l_um'])
        if key not in cache:cache[key]=P._base(folder/'primitives',d)
        group=d['id'].rpartition('.')[0]+'::'+d['matching_group'] if d.get('matching_group') else None
        if group is not None and group in by_group:grouped[by_group[group]].append(d)
        else:
            if group is not None:by_group[group]=len(grouped)
            grouped.append([d])
    batches=[];batch=[];used=0
    for group in grouped:
        size=sum(cache[(d['model'],d['parameters']['w_um'],d['parameters']['l_um'])][1].bbox().width()+5000 for d in group)
        if size+6000>available:raise EDAError('CHIP_ENVELOPE_EXCEEDED','An indivisible comparator matching group exceeds its real width allocation.')
        if batch and used+size+6000>available:batches.append(batch);batch=[];used=0
        batch.extend(group);used+=size
    if batch:batches.append(batch)
    logic_subs=[]
    for i,batch in enumerate(batches):
        nets=sorted({n for d in batch for n in d['pins'].values()});sub=P._single_row(folder/f'logic-row-{i:02d}',{'devices':batch},cell_name,nets,600,primitive_cache=cache,via_cache=vias,rail_pitch=4000)
        logic_subs.append((sub,sub.cell(cell_name),nets))
    counts=Counter(n for _,_,ns in subs+logic_subs for n in ns);nets=sorted(n for n in counts if counts[n]>1 or n in ports)
    if set(ports)-set(nets):raise EDAError('UNCONNECTED_PORT','ADC top port lacks a real physical connection.')
    channel_width=len(nets)*3000+3000;logic_left=channel_start+channel_width+3000
    trunk_x={n:channel_start+1500+i*3000 for i,n in enumerate(nets)}
    layout=k.Layout();layout.dbu=.001;top=layout.create_cell(cell_name);landings=defaultdict(list);extensions=[];placed_units=[];logic_reports=[];cap_transition_points=set()
    def shape(layer,p,net='',ident=None):
        s=top.shapes(layout.layer(*layer)).insert(p);s.set_property(2,net)
        if ident:s.set_property(3,ident)
    f=folder/'via4';f.mkdir(exist_ok=True);script=f/'make.tcl'
    script.write_text('load via4_core\nbox 0um 0um 1.2um 1.2um\nsky130::via4_draw\nbox -0.4um -0.4um 1.6um 1.6um\npaint m4\npaint m5\nsave via4_core\ngds write via4_core.gds\nquit -noprompt\n')
    r=subprocess.run(['magic','-dnull','-noconsole','-rcfile',str(profile.MAGIC_RC),str(script)],cwd=f,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=60)
    (f/'generator.log').write_text(r.stdout)
    if r.returncode or not (f/'via4_core.gds').exists():raise EDAError('ENGINE_FAILED','Native M4/M5 transition generator failed.')
    via4=k.Layout();via4.read(str(f/'via4_core.gds'));v4cell=via4.cell('via4_core')
    v4box=next(s.bbox() for s in v4cell.shapes(via4.find_layer(71,44)).each())
    def via(src,cell,box,x,y,net):
        tr=k.Trans(x-(box.left+box.right)//2,y-(box.bottom+box.top)//2)
        for li in src.layer_indices():
            info=src.get_info(li)
            for s in cell.shapes(li).each():
                if not s.is_text():shape((info.layer,info.datatype),G.shape_poly(s).transformed(tr),net)
    v3cell=vias[2].cell('via3_core');v3box=next(s.bbox() for s in v3cell.shapes(vias[2].find_layer(70,44)).each())
    def copy_row(src,cell,tr,is_array):
        rowpoints=[]
        for li in src.layer_indices():
            info=src.get_info(li)
            for s in cell.shapes(li).each():
                if info.layer==70 and info.datatype==5 and s.is_text():
                    p=s.text.transformed(tr);n=p.string
                    if n in trunk_x:rowpoints.append((n,p.x,p.y))
                    continue
                if info.layer==70 and info.datatype==16:continue
                p=s.text.transformed(tr) if s.is_text() else G.shape_poly(s).transformed(tr)
                shape((info.layer,info.datatype),p,s.property(2) or '',s.property(3))
        for n,x,y in rowpoints:
            # M3 rails already span the capacitor row. Extend them through its
            # own signal channel, never through a neighboring MIM electrode.
            tx=trunk_x[n]
            if is_array:
                shape((70,20),k.Path([k.Point(x,y),k.Point(tx,y)],400),n);cap_transition_points.add((n,y))
            else:
                via(vias[2],v3cell,v3box,x,y,n);via(via4,v4cell,v4box,x,y,n)
                shape((72,20),k.Path([k.Point(x,y),k.Point(tx,y)],1600),n)
                via(via4,v4cell,v4box,tx,y,n)
            extensions.append((min(x,tx),max(x,tx),y,n));landings[n].append(y)
        return rowpoints
    for i,(src,cell,_) in enumerate(subs):
        tr=k.Trans(dx,dy0+i*row_pitch);copy_row(src,cell,tr,True)
        for c,d,group in rows[i]:
            base=cache[(d['model'],d['parameters']['w_um'],d['parameters']['l_um'])][1].bbox();cx=c*(base.width()+5000)-base.left
            placed_units.append(dict(device=d['id'],group='/'.join(group),center_dbu=[dx+cx+(base.left+base.right)/2,dy0+i*row_pitch+(base.bottom+base.top)/2]))
    cursor=edge
    for i,(src,cell,_) in enumerate(logic_subs):
        bb=cell.bbox();lx=logic_left-bb.left;ly=cursor-bb.bottom
        # Native row bbox covers M3 terminals; M5 fan-out pads extend farther.
        # Reserve 6um between rows, including the 2um via landings and 1.6um
        # M5 spacing. The actual full-deck DRC remains the acceptance gate.
        copy_row(src,cell,k.Trans(lx,ly),False);cursor=ly+bb.top+6000
        report=json.loads((folder/f'logic-row-{i:02d}/routing-report.json').read_text());logic_reports.append({'row':i,'translation_dbu':[lx,ly],**report})
    via=vias[2];vc=via.cell('via3_core');vb=next(s.bbox() for s in vc.shapes(via.find_layer(70,44)).each())
    for n in nets:
        x=trunk_x[n];ys=landings[n]
        if not ys:raise EDAError('UNCONNECTED_PORT','Empty physical trunk.')
        shape((71,20),k.Box(x-300,min(ys)-300,x+300,max(ys)+300),n)
        for y in ys:
            # The M5 logic fan-out already has its M4 transition. A second
            # M3/M4 via here would short a crossing capacitor-row M3 rail.
            if (n,y) in cap_transition_points:
                tr=k.Trans(x-(vb.left+vb.right)//2,y-(vb.bottom+vb.top)//2)
                for li in via.layer_indices():
                    info=via.get_info(li)
                    for s in vc.shapes(li).each():
                        if not s.is_text():shape((info.layer,info.datatype),G.shape_poly(s).transformed(tr),n)
        if n in ports:
            y=min(ys);shape((71,5),k.Text(n,k.Trans(x,y)),n);shape((71,16),k.Box(x-300,y-300,x+300,y+300),n)
    result=F.enforce(layout,cell_name,policy);centroids={}
    for group in sorted({u['group'] for u in placed_units}):
        points=[u['center_dbu'] for u in placed_units if u['group']==group];centroids[group]=[float(sum(Fraction(p[a]) for p in points)/len(points)) for a in (0,1)]
    if len({tuple(v) for v in centroids.values()})!=1:raise EDAError('SAR12_CENTROID_MISMATCH','Actual placed unit centroids are not coincident; no geometry is committed.')
    report=dict(algorithm='sar12-interleaved-unit-pairs-m3-m4-v1',primitive_count=len(devices),unit_capacitors=len(placed_units),bridge_capacitors=2,array_grid=[16,32],unit_centroids_dbu=centroids,nominal_unit_centroids_equal=True,unit_placements=placed_units,row_pitch_dbu=row_pitch,central_trunk_count=len(nets),logic_rows=logic_reports,floorplan=result,scope='Actual dimensioned public PCells and routed masks. Nominal first moments only; extracted coupling, comparator imbalance, noise, mismatch and foundry approval are separate checks.')
    (folder/'routing-report.json').write_text(json.dumps(report,indent=2)+'\n');G.assign_ids(layout);return layout
