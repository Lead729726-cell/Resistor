"""KLayout is the only geometry authority; IDs and mapping travel in snapshots/sidecars."""
import hashlib
import json
import re
import uuid
import klayout.db as k

class EDAError(Exception):
    def __init__(self, code, message, details=None):
        super().__init__(message); self.code=code; self.details=details

def coord(value, grid=1):
    if not isinstance(value,str) or not re.fullmatch(r'-?(0|[1-9]\d*)',value):
        raise EDAError('INVALID_COORDINATE','Coordinates must be signed decimal integer strings.')
    n=int(value)
    if not -2147483648 <= n <= 2147483647: raise EDAError('COORDINATE_OVERFLOW','This KLayout build supports signed 32-bit coordinates.')
    if n % grid: raise EDAError('OFF_GRID',f'Coordinate must be on the {grid} DBU grid.')
    return n

def canonical_ring(points):
    values=[(p.x,p.y) for p in points]
    def minimum_rotation(v):
        n=len(v)
        if not n:return ()
        doubled=v+v;i=0;j=1;offset=0
        while i<n and j<n and offset<n:
            a=doubled[i+offset];b=doubled[j+offset]
            if a==b:offset+=1;continue
            if a>b:i+=offset+1;i+=int(i==j)
            else:j+=offset+1;j+=int(i==j)
            offset=0
        start=min(i,j);return tuple(doubled[start:start+n])
    return min(minimum_rotation(values),minimum_rotation(list(reversed(values))))

def assign_ids(layout):
    for c in layout.each_cell():
        for li in layout.layer_indices():
            for s in c.shapes(li).each():
                if not s.property(1): s.set_property(1,uuid.uuid4().hex)
        for inst in c.each_inst():
            if not inst.property(1): inst.set_property(1,uuid.uuid4().hex)

def pin_purposes(layout,cell):
    """Write public GDS pin purpose polygons underneath labels, preserving port metadata on Magic import."""
    for li in list(layout.layer_indices()):
        info=layout.get_info(li)
        if info.datatype!=5 or info.layer not in {67,68,69,70,71,72}: continue
        drawing=layout.find_layer(info.layer,20)
        if drawing is None: continue
        for label in list(cell.shapes(li).each()):
            if not label.is_text(): continue
            point=label.text.trans.disp
            candidates=[]
            for s in cell.shapes(drawing).each():
                p=shape_poly(s)
                if p is not None and p.inside(point):
                    candidates.append(p); s.set_property(2,label.text.string)
            for p in candidates: cell.shapes(layout.layer(info.layer,16)).insert(p)

def shape_poly(s):
    if s.is_box(): return k.Polygon(s.box)
    if s.is_polygon():
        p=s.polygon
        # GDSII/OASIS encode holes using contour bridges. Restore exact Region topology.
        if p.holes()==0 and p.num_points_hull()>4:
            parts=list(k.Region(p).merged().each())
            if len(parts)==1: return parts[0]
        return p
    if s.is_simple_polygon(): return k.Polygon(s.simple_polygon)
    if s.is_path(): return s.path.polygon()
    return None

def walk(layout,top,bounds=None):
    def visit(cell,trans,path):
        for li in layout.layer_indices():
            info=layout.get_info(li)
            for s in cell.shapes(li).each():
                p=shape_poly(s)
                if p is not None:
                    p=p.transformed(trans)
                    if bounds is None or p.bbox().touches(bounds): yield s,p,f'{info.layer}/{info.datatype}',path
        for inst in cell.each_inst():
            ident=inst.property(1)
            for j,t in enumerate(inst.cell_inst.each_cplx_trans()):
                combined=trans*t
                if bounds is None or inst.cell.bbox().transformed(combined).touches(bounds): yield from visit(inst.cell,combined,f'{path}/{inst.cell.name}:{ident}:{j}')
    yield from visit(top,k.ICplxTrans(),top.name)

def scene(layout, project, layers,options=None):
    options=options or {}; limit=options.get('max_shapes',1000000); bounds=options.get('bounds'); bounds=k.Box(*[coord(v) for v in bounds]) if bounds is not None else None
    if isinstance(limit,bool) or not isinstance(limit,int) or not 1<=limit<=1000000: raise EDAError('INVALID_REQUEST','max_shapes must be 1..1000000.')
    top=layout.cell(project['cell'])
    shapes=[]; labels=[]; instances=[]; pins=[]
    count_cache={}; text_cache={}
    def total(cell):
        key=cell.cell_index()
        if key not in count_cache:
            count_cache[key]=sum(1 for li in layout.layer_indices() for s in cell.shapes(li).each() if s.is_box() or s.is_polygon() or s.is_simple_polygon() or s.is_path())+sum(total(i.cell)*max(1,i.cell_inst.na)*max(1,i.cell_inst.nb) for i in cell.each_inst())
        return count_cache[key]
    def has_annotations(cell):
        key=cell.cell_index()
        if key not in text_cache: text_cache[key]=any(s.is_text() for li in layout.layer_indices() for s in cell.shapes(li).each()) or any(True for _ in cell.each_inst())
        return text_cache[key]
    authoritative_total=total(top)
    iterator=walk(layout,top,bounds); truncated=False
    for s,p,li,path in iterator:
        if len(shapes)>=limit: truncated=True; break
        ident=f'{path}/{s.property(1)}'
        xy=[[str(pt.x),str(pt.y)] for pt in p.each_point_hull()]
        item={'id':ident,'layer_id':li,'cell_path':path,'polygon':xy}
        if ':' in path: item['instance_id']=path.rsplit('/',1)[0]+'/@'+path.rsplit('/',1)[1].split(':')[1]
        holes=[[[str(pt.x),str(pt.y)] for pt in p.each_point_hole(i)] for i in range(p.holes())]
        if holes: item['holes']=holes
        if s.property(2): item['net']=s.property(2)
        if s.property(3): item['device_id']=s.property(3)
        shapes.append(item)
        if int(li.split('/')[1])==16 or s.property(4):
            bb=p.bbox(); pins.append({'id':ident,'name':str(s.property(4) or s.property(2) or ''),'layer_id':li,'cell_path':path,'box':[str(bb.left),str(bb.bottom),str(bb.right),str(bb.top)],'net':s.property(2)})
    def annotations(cell,trans,path):
        for li in layout.layer_indices():
            info=layout.get_info(li)
            for s in cell.shapes(li).each():
                if s.is_text():
                    if len(labels)>=limit: break
                    t=s.text.transformed(trans); item={'id':f'{path}/{s.property(1)}','layer_id':f'{info.layer}/{info.datatype}','cell_path':path,'text':t.string,'position':[str(t.trans.disp.x),str(t.trans.disp.y)]}
                    if bounds is not None and not bounds.contains(t.trans.disp): continue
                    if s.property(2): item['net']=s.property(2)
                    labels.append(item)
        for inst in cell.each_inst():
            array=inst.cell_inst; t=trans*array.cplx_trans
            item={'id':f'{path}/@{inst.property(1)}','cell_name':inst.cell.name,'cell_path':path,'parent_cell':cell.name,'position':[str(t.disp.x),str(t.disp.y)],'rotation':round(t.angle)%360,'mirror':t.is_mirror()}
            bb=inst.bbox().transformed(trans);item['bbox']=[str(bb.left),str(bb.bottom),str(bb.right),str(bb.top)]
            if array.is_regular_array(): item['array']={'columns':array.na,'rows':array.nb,'dx':str(array.a.x),'dy':str(array.b.y)}
            instances.append(item)
            if has_annotations(inst.cell):
                for j,ct in enumerate(array.each_cplx_trans()):
                    combined=trans*ct
                    if bounds is None or inst.cell.bbox().transformed(combined).touches(bounds): annotations(inst.cell,combined,f'{path}/{inst.cell.name}:{inst.property(1)}:{j}')
    annotations(top,k.ICplxTrans(),top.name)
    label_index={}
    for label in labels:
        key=(label['cell_path'],label['layer_id'].split('/')[0],int(label['position'][0])//10000,int(label['position'][1])//10000);label_index.setdefault(key,[]).append(label)
    for pin in pins:
        if not pin['name']:
            a,b,c,d=map(int,pin['box']);possible=[]
            if (c//10000-a//10000+1)*(d//10000-b//10000+1)<=256:
                for x in range(a//10000,c//10000+1):
                    for y in range(b//10000,d//10000+1):possible.extend(label_index.get((pin['cell_path'],pin['layer_id'].split('/')[0],x,y),[]))
            names={label['text'] for label in possible[:4096] if a<=int(label['position'][0])<=c and b<=int(label['position'][1])<=d} if len(possible)<=4096 else set()
            if len(names)==1:pin['name']=next(iter(names));pin['net']=pin.get('net') or pin['name']
    cells=[]
    for c in layout.each_cell():
        cb=c.bbox(); cells.append({'name':c.name,'bbox':[str(cb.left),str(cb.bottom),str(cb.right),str(cb.top)],'shape_count':sum(c.shapes(li).size() for li in layout.layer_indices()),'instance_count':sum(1 for _ in c.each_inst())})
    b=top.bbox()
    return {'project_id':project['id'],'revision':project['revision'],'dbu_um':layout.dbu,'grid_dbu':project['grid_dbu'],'source':project['source'],
            'layers':layers,'shapes':shapes,'devices':project['schematic']['devices'],'cells':cells,'instances':instances,'labels':labels,'pins':pins,
            'total_shape_count':authoritative_total,'returned_shape_count':len(shapes),'truncated':truncated,'bounds_filter':options.get('bounds'),
            'bounds':[str(b.left),str(b.bottom),str(b.right),str(b.top)]}

def semantic_hash(layout,top):
    # Geometry fingerprint intentionally excludes IDs and display metadata.
    def ring(points):
        return canonical_ring(points)
    vals=[]
    for _,p,li,path in walk(layout,top):
        vals.append([li,ring(p.each_point_hull()),sorted(ring(p.each_point_hole(i)) for i in range(p.holes()))])
    return hashlib.sha256(json.dumps({'dbu_um':layout.dbu,'polygons':sorted(vals)},sort_keys=True).encode()).hexdigest()

def hierarchy_hash(layout):
    cells=[]
    for c in layout.each_cell():
        instances=[]
        for inst in c.each_inst():
            transforms=[]
            for t in inst.cell_inst.each_cplx_trans(): transforms.append((t.angle,t.is_mirror(),t.mag,t.disp.x,t.disp.y))
            instances.append([inst.cell.name,sorted(transforms)])
        cells.append([c.name,sorted(instances)])
    return hashlib.sha256(json.dumps(sorted(cells),sort_keys=True).encode()).hexdigest()

def identity_hash(layout):
    """Immutable ID-to-geometry/annotation binding, independent of exchange ordering."""
    def ring(points):
        return canonical_ring(points)
    records=[]
    for cell in layout.each_cell():
        for li in layout.layer_indices():
            info=layout.get_info(li)
            for s in cell.shapes(li).each():
                p=shape_poly(s)
                geometry=[ring(p.each_point_hull()),sorted(ring(p.each_point_hole(i)) for i in range(p.holes()))] if p is not None else ['text',s.text.string,s.text.trans.to_s()] if s.is_text() else ['unsupported']
                records.append([cell.name,info.layer,info.datatype,str(s.property(1)),s.property(2),s.property(3),s.property(4),geometry])
        for inst in cell.each_inst():records.append([cell.name,'instance',str(inst.property(1)),inst.cell.name,inst.cell_inst.to_s()])
    return hashlib.sha256(json.dumps({'dbu_um':layout.dbu,'records':sorted(records,key=lambda r:json.dumps(r,sort_keys=True))},sort_keys=True).encode()).hexdigest()

def ring_values(values,grid):
    if not isinstance(values,list) or not 3<=len(values)<=4096: raise EDAError('INVALID_GEOMETRY','Polygon ring needs 3..4096 points.')
    pts=[(coord(p[0],grid),coord(p[1],grid)) for p in values]
    if pts[0]==pts[-1]: pts.pop()
    if len(pts)<3 or len(set(pts))!=len(pts): raise EDAError('INVALID_GEOMETRY','Repeated polygon vertices are unsupported.')
    def orient(a,b,c): return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    def intersects(a,b,c,d):
        oa,ob,oc,od=orient(a,b,c),orient(a,b,d),orient(c,d,a),orient(c,d,b)
        if oa*ob<0 and oc*od<0: return True
        def on(a,b,c): return orient(a,b,c)==0 and min(a[0],b[0])<=c[0]<=max(a[0],b[0]) and min(a[1],b[1])<=c[1]<=max(a[1],b[1])
        return on(a,b,c) or on(a,b,d) or on(c,d,a) or on(c,d,b)
    edges=list(zip(pts,pts[1:]+pts[:1]))
    for i,(a,b) in enumerate(edges):
        for j,(c,d) in enumerate(edges[i+1:],i+1):
            if j==i+1 or (i==0 and j==len(edges)-1): continue
            if intersects(a,b,c,d): raise EDAError('INVALID_GEOMETRY','Polygon ring intersects itself.')
    if sum(a[0]*b[1]-a[1]*b[0] for a,b in edges)==0: raise EDAError('INVALID_GEOMETRY','Polygon has no area.')
    return pts

def check_instance_bounds(cell,trans,columns=1,rows=1,dx=0,dy=0):
    b=cell.bbox()
    if b.empty(): return
    # Integer arithmetic validates extrema before KLayout can wrap a transformed coordinate.
    r=round(trans.angle)%360; mirror=trans.is_mirror()
    for x,y in ((b.left,b.bottom),(b.left,b.top),(b.right,b.bottom),(b.right,b.top)):
        if mirror: y=-y
        x,y={0:(x,y),90:(-y,x),180:(-x,-y),270:(y,-x)}[r]
        for ax in (0,(columns-1)*dx):
            for by in (0,(rows-1)*dy):
                coord(str(x+trans.disp.x+ax)); coord(str(y+trans.disp.y+by))

def apply(layout,project,command):
    ty=command.get('type'); top=layout.cell(project['cell']); grid=project['grid_dbu']
    target_name=command.get('target_cell_name') if ty=='add_instance' else command.get('cell_name')
    target=layout.cell(target_name) if target_name else top
    if target is None: raise EDAError('NOT_FOUND','Target cell does not exist.')
    if target!=top and target.name not in project.get('user_cells',[]): raise EDAError('GENERATED_GEOMETRY','Public PCell child geometry is read-only; create an editable cell first.')
    def layer_index():
        layer=command.get('layer_id','')
        allowed={l['id'] for l in project['layers']}
        if re.fullmatch(r'(67|68|69|70|71|72)/(5|16)',layer) and layer.split('/')[0]+'/20' in allowed: allowed.add(layer)
        if layer not in allowed: raise EDAError('UNKNOWN_LAYER',layer)
        return layout.layer(*map(int,layer.split('/')))
    def metadata(s):
        s.set_property(1,uuid.uuid4().hex)
        if command.get('net'): s.set_property(2,str(command['net'])[:128])
        return s
    if ty=='add_cell':
        name=command.get('name','')
        if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]{0,127}',name): raise EDAError('INVALID_NAME','Cell name must be an identifier.')
        if layout.cell(name): raise EDAError('DUPLICATE','Cell already exists.')
        layout.create_cell(name); project.setdefault('user_cells',[]).append(name)
    elif ty=='add_polygon':
        outer=ring_values(command.get('polygon'),grid); holes=[ring_values(v,grid) for v in command.get('holes',[])]
        p=k.Polygon([k.Point(*v) for v in outer]); hull=k.Region(p)
        used=k.Region()
        for h in holes:
            hp=k.Polygon([k.Point(*v) for v in h]); hr=k.Region(hp)
            # Hole boundary cannot touch or cross hull/other holes.
            if not (hr-hull).is_empty() or not (hr&used).is_empty() or any(not p.inside(k.Point(*v)) for v in h): raise EDAError('INVALID_GEOMETRY','Hole is outside the hull or overlaps another hole.')
            for a,b in zip(h,h[1:]+h[:1]):
                for c,d in zip(outer,outer[1:]+outer[:1]):
                    e=k.Edge(k.Point(*a),k.Point(*b)); f=k.Edge(k.Point(*c),k.Point(*d))
                    if e.intersects(f): raise EDAError('INVALID_GEOMETRY','Hole boundary touches polygon hull.')
            p.insert_hole([k.Point(*v) for v in h]); used+=hr
        metadata(target.shapes(layer_index()).insert(p))
    elif ty=='add_label':
        text=command.get('text'); pos=command.get('position',[])
        if not isinstance(text,str) or not text or len(text)>128 or any(ord(c)<32 for c in text): raise EDAError('INVALID_LABEL','Label must have 1..128 printable characters.')
        if len(pos)!=2: raise EDAError('INVALID_COMMAND','Label needs two coordinates.')
        metadata(target.shapes(layer_index()).insert(k.Text(text,k.Trans(coord(pos[0],grid),coord(pos[1],grid)))))
    elif ty=='add_pin':
        li=layer_index(); info=layout.get_info(li); name=command.get('name','')
        if info.layer not in {67,68,69,70,71,72} or info.datatype not in {16,20}: raise EDAError('UNSUPPORTED','Pin geometry requires a supported conductor drawing or pin-purpose layer.')
        if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*',name): raise EDAError('INVALID_NAME','Native pin names must be identifiers.')
        vals=[coord(v,grid) for v in command.get('box',[])]
        if len(vals)!=4 or vals[0]>=vals[2] or vals[1]>=vals[3]: raise EDAError('INVALID_GEOMETRY','Pin box needs positive area.')
        net=command.get('net') or name
        s=metadata(target.shapes(layout.layer(info.layer,16)).insert(k.Box(*vals))); s.set_property(2,net); s.set_property(4,name)
        label=metadata(target.shapes(layout.layer(info.layer,5)).insert(k.Text(name,k.Trans(vals[0],vals[1])))); label.set_property(2,net)
        if target==top and name not in project.setdefault('ports',[]): project['ports'].append(name)
    elif ty=='add_instance':
        source=layout.cell(command.get('cell_name',''))
        if source is None: raise EDAError('NOT_FOUND','Instance source cell does not exist.')
        def reaches(cell,wanted,seen):
            if cell.cell_index()==wanted: return True
            if cell.cell_index() in seen: return False
            seen.add(cell.cell_index()); return any(reaches(i.cell,wanted,seen) for i in cell.each_inst())
        if reaches(source,target.cell_index(),set()): raise EDAError('HIERARCHY_CYCLE','Instance would create recursive hierarchy.')
        pos=command.get('position',[])
        if len(pos)!=2: raise EDAError('INVALID_COMMAND','Instance needs two coordinates.')
        rotation=command.get('rotation',0); mirror=command.get('mirror',False)
        if rotation not in {0,90,180,270} or not isinstance(mirror,bool): raise EDAError('INVALID_TRANSFORM','Rotation must be 0/90/180/270 and mirror boolean.')
        t=k.Trans(rotation//90,mirror,coord(pos[0],grid),coord(pos[1],grid)); a=command.get('array') or {}; nc=a.get('columns',1); nr=a.get('rows',1)
        if any(isinstance(n,bool) or not isinstance(n,int) or n<1 for n in (nc,nr)) or nc*nr>100000: raise EDAError('ARRAY_LIMIT','Array dimensions must be positive integers with at most 100000 occurrences.')
        dx=coord(a.get('dx','0'),grid); dy=coord(a.get('dy','0'),grid)
        if (nc>1 and not dx) or (nr>1 and not dy): raise EDAError('INVALID_GEOMETRY','Array spacing must be nonzero for repeated axes.')
        check_instance_bounds(source,k.ICplxTrans(t),nc,nr,dx,dy)
        arr=k.CellInstArray(source.cell_index(),t,k.Vector(dx,0),k.Vector(0,dy),nc,nr) if a else k.CellInstArray(source.cell_index(),t)
        inst=target.insert(arr); inst.set_property(1,uuid.uuid4().hex)
    elif ty in {'transform_instance','copy_instance','delete_instance'}:
        wanted=command.get('id',''); ident=wanted.rsplit('/@',1)[-1]; inst=next((i for i in target.each_inst() if i.property(1)==ident),None)
        if inst is None: raise EDAError('NOT_FOUND','Instance is not editable in the target cell.')
        if ty=='delete_instance': inst.delete(); return
        arr=inst.cell_inst; old=arr.cplx_trans; rotation=command.get('rotation',round(old.angle)%360); mirror=command.get('mirror',old.is_mirror())
        if rotation not in {0,90,180,270} or not isinstance(mirror,bool): raise EDAError('INVALID_TRANSFORM','Unsupported instance orientation.')
        dx=coord(command.get('dx','0'),grid); dy=coord(command.get('dy','0'),grid); x=coord(str(old.disp.x+dx),grid); y=coord(str(old.disp.y+dy),grid)
        t=k.Trans(rotation//90,mirror,x,y); nc=arr.na if arr.is_regular_array() else 1; nr=arr.nb if arr.is_regular_array() else 1
        check_instance_bounds(inst.cell,k.ICplxTrans(t),nc,nr,arr.a.x,arr.b.y)
        replacement=k.CellInstArray(inst.cell_index,t,arr.a,arr.b,nc,nr) if arr.is_regular_array() else k.CellInstArray(inst.cell_index,t)
        if ty=='copy_instance': new=target.insert(replacement); new.set_property(1,uuid.uuid4().hex)
        else: inst.cell_inst=replacement
    elif ty=='add_box':
        layer=command.get('layer_id','')
        if layer not in {l['id'] for l in project['layers']}: raise EDAError('UNKNOWN_LAYER',layer)
        b=command.get('box',[])
        if len(b)!=4: raise EDAError('INVALID_COMMAND','A box has four coordinates.')
        v=[coord(x,grid) for x in b]
        if v[0]>=v[2] or v[1]>=v[3]: raise EDAError('INVALID_GEOMETRY','Box must have positive area.')
        s=target.shapes(layout.layer(*map(int,layer.split('/')))).insert(k.Box(*v))
        s.set_property(1,uuid.uuid4().hex)
        if command.get('net'): s.set_property(2,command['net'])
    elif ty in ('add_route','add_path'):
        layer=command.get('layer_id','')
        if layer not in {l['id'] for l in project['layers']}: raise EDAError('UNKNOWN_LAYER',layer)
        if ty=='add_route' and layer not in {'67/20','68/20','69/20','70/20','71/20','72/20'}: raise EDAError('UNSUPPORTED','Routes must use a supported conductor layer.')
        pts=[k.Point(coord(p[0],grid),coord(p[1],grid)) for p in command.get('points',[])]
        width=coord(command.get('width'),grid)
        if len(pts)<2 or width<=0: raise EDAError('INVALID_GEOMETRY','Route needs two points and a positive width.')
        if width%(2*grid): raise EDAError('OFF_GRID','Route width must be an even number of grid steps so both edges stay on grid.')
        half=(width+1)//2
        for point in pts:
            for value in (point.x-half,point.x+half,point.y-half,point.y+half): coord(str(value))
        if any(a.x!=b.x and a.y!=b.y for a,b in zip(pts,pts[1:])): raise EDAError('UNSUPPORTED','This route command supports Manhattan segments.')
        # Path rounding may add half a width. Validate the actual resulting box.
        path=k.Path(pts,width); b=path.bbox()
        for n in (b.left,b.right,b.top,b.bottom): coord(str(n))
        s=target.shapes(layout.layer(*map(int,layer.split('/')))).insert(path)
        s.set_property(1,uuid.uuid4().hex)
        if command.get('net'): s.set_property(2,command['net'])
    elif ty in ('move_shape','delete_shape'):
        wanted=command.get('id'); found=None
        for li in layout.layer_indices():
            for s in target.shapes(li).each():
                if s.property(1)==wanted.rsplit('/',1)[-1]: found=s; break
        for s,_,_,path in walk(layout,top):
            if found is not None: break
            if f'{path}/{s.property(1)}'==wanted: found=s; break
        if found is None: raise EDAError('NOT_FOUND','Shape no longer exists.')
        # Editing shared child geometry affects every occurrence; do not silently mutate PCells.
        if target==top and (not wanted.startswith(top.name+'/') or wanted.count('/')>1): raise EDAError('GENERATED_GEOMETRY','Child/PCell geometry is read-only; select an editable child cell explicitly.')
        if ty=='delete_shape': found.delete()
        else:
            dx=coord(command.get('dx'),grid); dy=coord(command.get('dy'),grid); b=found.bbox()
            for n in (b.left+dx,b.right+dx,b.bottom+dy,b.top+dy): coord(str(n))
            found.transform(k.Trans(dx,dy))
    else: raise EDAError('UNSUPPORTED',f'Unsupported layout command: {ty}')
