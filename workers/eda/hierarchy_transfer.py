"""Read-only native hierarchy previews; explicit approved, revision-locked commits.

Imported cell trees never overwrite existing definitions. Geometry previews use the full
native tree, not a truncated client scene. Electrical mapping is not automatic routing.
"""
import copy
import hashlib
import json
import re
import uuid
from collections import OrderedDict
import klayout.db as k
import geometry as G
import native
from geometry import EDAError

S=None
MAX_SHAPES=100000
CACHE=OrderedDict()
IDENT=re.compile(r'[A-Za-z_][A-Za-z0-9_]{0,95}$')

def configure(server):
    global S
    S=server

def digest(value):return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()

def name(value):
    if not isinstance(value,str) or not IDENT.fullmatch(value):raise EDAError('INVALID_NAME','Cell/namespace name must be a bounded identifier.')
    return value

def fingerprint(p,layout):return digest({'id':p['id'],'revision':p['revision'],'cell':p['cell'],'ports':p['ports'],'schematic':p['schematic'],'identity':G.identity_hash(layout),'dbu':layout.dbu})

def sources(params):
    if set(params)-{'query'}:raise EDAError('INVALID_PARAMETER','Sources accept a search query only.')
    query=params.get('query','')
    if not isinstance(query,str) or len(query)>128:raise EDAError('INVALID_PARAMETER','Search query is too long.')
    result=[]
    with S.LOCK:
        for row in S.DB.execute('SELECT data FROM projects ORDER BY rowid DESC'):
            p=json.loads(row[0])
            if p.get('pvt_point') or (query and query.casefold() not in (p['name']+' '+p['cell']+' '+p['id']).casefold()):continue
            result.append({'id':p['id'],'name':p['name'],'cell':p['cell'],'revision':p['revision'],'pdk_id':p.get('pdk_id'),'cells':[{'name':p['cell'],'ports':p.get('ports',[]),'root':True}]+[{'name':n,'ports':c.get('ports',[]),'root':False} for n,c in p['schematic'].get('cells',{}).items()]})
            if len(result)>=100:break
    return {'projects':result,'bounded':len(result)>=100,'scope':'local native workspace; saved circuits without waveform payloads'}

def dependencies(ir,selected):
    cells=ir.get('cells',{});done=set();active=set()
    def visit(n):
        if n in active:raise EDAError('HIERARCHY_CYCLE','Source hierarchy is recursive.')
        if n in done:return
        if n not in cells:raise EDAError('MISSING_CELL','Source child cell is missing.')
        active.add(n)
        for d in cells[n]['devices']:
            if d['kind']=='block':visit(d['cell_name'])
        active.remove(n);done.add(n)
    for d in selected['devices']:
        if d['kind']=='block':visit(d['cell_name'])
    return sorted(done)

def rename_ids(cell,prefix):
    result=copy.deepcopy(cell);result.pop('cells',None)
    for key in ('devices','wires','junctions'):
        for item in result.get(key,[]):item['id']=uuid.uuid5(uuid.NAMESPACE_URL,prefix+':'+key+':'+item['id']).hex
    return result

def shape_count(cell,active=None,memo=None):
    active=active or set();idx=cell.cell_index()
    memo={} if memo is None else memo
    if idx in active:raise EDAError('HIERARCHY_CYCLE','Physical hierarchy is recursive.')
    if idx in memo:return memo[idx]
    active=active|{idx};total=sum(1 for li in cell.layout().layer_indices() for s in cell.shapes(li).each() if not s.is_text())
    for inst in cell.each_inst():total+=shape_count(inst.cell,active,memo)*max(1,inst.cell_inst.na)*max(1,inst.cell_inst.nb)
    if total>MAX_SHAPES:raise EDAError('PREVIEW_LIMIT','Expanded preview exceeds 100000 native shapes; no partial approval is returned.')
    memo[idx]=total
    return total

def mask_impact(before_layout,before_top,after_layout,after_top,mode):
    def regions(layout,top,old_ids=None):
        result={}
        for s,poly,layer,path in G.walk(layout,top):
            if layer.endswith('/16'):continue
            if old_ids is not None and f'{path}/{s.property(1)}' in old_ids:continue
            result.setdefault(layer,k.Region()).insert(poly)
        return {li:r.merged() for li,r in result.items()}
    old=regions(before_layout,before_top);new=regions(after_layout,after_top)
    old_ids={f'{path}/{s.property(1)}' for s,_,_,path in G.walk(before_layout,before_top)}
    inserted=regions(after_layout,after_top,old_ids) if mode=='place' else {}
    changes=[];overlaps=[];count=0
    for li in sorted(set(old)|set(new)):
        a=old.get(li,k.Region());b=new.get(li,k.Region());added=b-a;removed=a-b
        changes.append({'layer_id':li,'added_area_dbu2':str(round(added.area())),'removed_area_dbu2':str(round(removed.area()))})
        overlap=(a & inserted.get(li,k.Region())).merged()
        for poly in overlap.each():
            count+=1
            if len(overlaps)<256:
                bb=poly.bbox();overlaps.append({'layer_id':li,'bbox':[str(bb.left),str(bb.bottom),str(bb.right),str(bb.top)],'area_dbu2':str(round(poly.area()))})
    return {'layers':changes,'mask_changed':any(x['added_area_dbu2']!='0' or x['removed_area_dbu2']!='0' for x in changes),'overlap_count':count,'overlaps':overlaps,'overlap_display_truncated':count>len(overlaps),'scope':'Exact same-layer native polygon intersections; pin annotations excluded. Overlap is not a DRC or short-circuit verdict.'}

def copy_tree(source,source_cell,target,mapping,seed):
    visited=set()
    def visit(cell):
        if cell.name in visited:return
        visited.add(cell.name)
        for inst in cell.each_inst():visit(inst.cell)
        dest=target.create_cell(mapping[cell.name])
        for li in source.layer_indices():
            index=target.layer(source.get_info(li))
            for s in cell.shapes(li).each():
                primitive=s.text if s.is_text() else G.shape_poly(s)
                if primitive is None:raise EDAError('UNSUPPORTED_GEOMETRY','Source contains unsupported native shapes.')
                new=dest.shapes(index).insert(primitive)
                for prop in (2,3,4):
                    if s.property(prop) is not None:new.set_property(prop,s.property(prop))
                new.set_property(1,uuid.uuid5(uuid.NAMESPACE_URL,seed+cell.name+':'+str(s.property(1))).hex)
        for inst in cell.each_inst():
            array=inst.cell_inst.dup();array.cell_index=target.cell(mapping[inst.cell.name]).cell_index();new=dest.insert(array)
            new.set_property(1,uuid.uuid5(uuid.NAMESPACE_URL,seed+cell.name+':'+str(inst.property(1))).hex)
    visit(source_cell)

def plan(params):
    allowed={'project_id','mode','source_project_id','source_cell','target_cell','namespace','pins','position','rotation','mirror','schematic_position','scope','parent_name'}
    if not isinstance(params,dict) or set(params)-allowed:raise EDAError('INVALID_PARAMETER','Unsupported hierarchy preview fields.')
    p=copy.deepcopy(S.get_project(params['project_id']));layout=S.load_layout(p);before=fingerprint(p,layout);original=copy.deepcopy(p);mode=params.get('mode','place')
    if p.get('analysis_setup') or p.get('active_backend') or p.get('native_database'):raise EDAError('UNSUPPORTED_PROJECT','Hierarchy editing requires the native circuit/layout workspace.')
    if mode not in ('place','wrap'):raise EDAError('INVALID_PARAMETER','Hierarchy mode is place or wrap.')
    warnings=['Pin mapping creates explicit schematic connections. Physical inter-cell wiring is not created automatically.','All prior runs become stale on approval; DRC/LVS/PEX must be rerun.']
    source_hash=None;source_revision=None;imported={};pin_map={};block_name=None
    if mode=='wrap':
        if any(key in params for key in ('source_project_id','source_cell','pins','scope','target_cell')):raise EDAError('INVALID_PARAMETER','Wrap preserves the current root and its ports; source fields are not accepted.')
        parent=name(params.get('parent_name','CHIP_TOP'))
        if layout.cell(parent) is not None or parent.casefold() in {n.casefold() for n in [p['cell'],*p['schematic'].get('cells',{})]}:raise EDAError('NAME_COLLISION','Parent name already exists.')
        old=p['cell'];child=copy.deepcopy(p['schematic']);child.pop('cells',None);child['ports']=p['ports']
        old_cells=copy.deepcopy(p['schematic'].get('cells',{}));old_cells[old]=child
        block_name='MAIN';pins={port:port for port in p['ports']}
        p['schematic']={'schema_version':1,'connectivity_mode':'explicit','devices':[{'id':uuid.uuid5(uuid.NAMESPACE_URL,p['id']+parent).hex,'name':block_name,'kind':'block','cell_name':old,'pins':pins,'parameters':{},'x':400,'y':250}],'wires':[],'junctions':[],'cells':old_cells}
        top=layout.create_cell(parent);instance=top.insert(k.CellInstArray(layout.cell(old).cell_index(),k.Trans()));instance.set_property(1,uuid.uuid5(uuid.NAMESPACE_URL,p['id']+parent+'physical').hex)
        # Copy the actual top-level port declarations onto the parent. Mask geometry stays in the child.
        for li in layout.layer_indices():
            info=layout.get_info(li)
            for s in layout.cell(old).shapes(li).each():
                if (s.is_text() and s.text.string in p['ports']) or (info.datatype==16 and s.property(2) in p['ports']):
                    new=top.shapes(li).insert(s.text if s.is_text() else G.shape_poly(s))
                    for prop in (2,3,4):
                        if s.property(prop) is not None:new.set_property(prop,s.property(prop))
                    new.set_property(1,uuid.uuid5(uuid.NAMESPACE_URL,p['id']+parent+str(s.property(1))).hex)
        p['cell']=parent;pin_map=pins;imported={old:old}
        if p.get('digital_unit',{}).get('kind')=='cpu4':p['digital_unit']['internal_probe_prefix']='xu.xMAIN.'+p['digital_unit'].get('internal_probe_prefix','xu.')[3:]
        warnings[0]='Current root becomes the MAIN child at the same position. Mask geometry is retained; parent port declarations are added.'
    else:
        src=S.get_project(params['source_project_id']);src_layout=S.load_layout(src);source_hash=fingerprint(src,src_layout);source_revision=src['revision']
        if src.get('pdk_id')!=p.get('pdk_id') or src_layout.dbu!=layout.dbu:raise EDAError('PDK_DBU_MISMATCH','Source and destination PDK/DBU must match exactly.')
        selected=params.get('source_cell',src['cell']);scope=params.get('scope','both');target_cell=params.get('target_cell',p['cell']);namespace=name(params.get('namespace','COPY'))
        if scope not in ('both','schematic','layout'):raise EDAError('INVALID_PARAMETER','Scope must be both, schematic or layout.')
        target_ir=native.cell_ir(p['schematic'],None if target_cell==p['cell'] else target_cell) if scope!='layout' else None
        physical_src=src_layout.cell(selected);physical_dst=layout.cell(target_cell)
        if scope!='schematic' and (physical_src is None or physical_dst is None):raise EDAError('NO_PHYSICAL_CELL','Selected source or target cell has no physical counterpart. Select schematic-only explicitly.')
        selected_ir=src['schematic'] if selected==src['cell'] else src['schematic'].get('cells',{}).get(selected)
        if scope!='layout' and selected_ir is None:raise EDAError('NO_SCHEMATIC_CELL','Selected source has no schematic counterpart.')
        schematic_names=[selected]+dependencies(src['schematic'],selected_ir) if scope!='layout' else []
        physical_names=[]
        if scope!='schematic':
            def walk(c):
                if c.name in physical_names:return
                physical_names.append(c.name)
                for inst in c.each_inst():walk(inst.cell)
            walk(physical_src)
        for n in sorted(set(schematic_names+physical_names)):imported[n]=name(namespace+'_'+n)
        occupied={c.name.casefold() for c in layout.each_cell()}|{n.casefold() for n in [p['cell'],*p['schematic'].get('cells',{})]}
        if any(n.casefold() in occupied for n in imported.values()):raise EDAError('NAME_COLLISION','Imported namespace already exists. Choose another copy name.')
        block_name=namespace
        if scope!='layout':
            if any(d['name'].casefold()==block_name.casefold() for d in target_ir['devices']):raise EDAError('NAME_COLLISION','Instance name already exists in destination.')
            ports=src['ports'] if selected==src['cell'] else selected_ir.get('ports',[]);pin_map=params.get('pins',{})
            if not isinstance(pin_map,dict) or set(pin_map)!=set(ports) or any(not isinstance(v,str) or not native.NET.fullmatch(v) for v in pin_map.values()):raise EDAError('PORT_MAPPING_REQUIRED','Map every source port to an explicit destination net.')
            for n in schematic_names:
                item=rename_ids(selected_ir if n==selected else src['schematic']['cells'][n],p['id']+namespace+n)
                item['ports']=ports if n==selected else src['schematic']['cells'][n].get('ports',[])
                for d in item['devices']:
                    if d['kind']=='block':d['cell_name']=imported[d['cell_name']]
                p['schematic'].setdefault('cells',{})[imported[n]]=item
            xy=params.get('schematic_position',[400,250])
            if not isinstance(xy,list) or len(xy)!=2:raise EDAError('INVALID_PARAMETER','Schematic position needs x/y.')
            device={'id':uuid.uuid5(uuid.NAMESPACE_URL,p['id']+namespace+'block').hex,'name':block_name,'kind':'block','cell_name':imported[selected],'pins':{port:pin_map[port] for port in ports},'parameters':{},'x':native.num(xy[0]),'y':native.num(xy[1])}
            native.validate_device(device);target_ir['devices'].append(device)
        if scope!='schematic':
            shape_count(physical_src);copy_tree(src_layout,physical_src,layout,imported,p['id']+namespace)
            xy=params.get('position',['0','0']);rotation=params.get('rotation',0);mirror=params.get('mirror',False)
            if not isinstance(xy,list) or len(xy)!=2 or rotation not in (0,90,180,270) or isinstance(rotation,bool) or not isinstance(mirror,bool):raise EDAError('INVALID_PARAMETER','Physical transform is invalid.')
            x,y=[G.coord(value,p['grid_dbu']) for value in xy]
            placed=physical_dst.insert(k.CellInstArray(layout.cell(imported[selected]).cell_index(),k.Trans(rotation//90,mirror,x,y)));placed.set_property(1,uuid.uuid5(uuid.NAMESPACE_URL,p['id']+namespace+'instance').hex)
            bb=placed.bbox()
            for value in (bb.left,bb.bottom,bb.right,bb.top):G.coord(str(value))
        if scope=='schematic':warnings.append('Schematic-only copy: current physical layout is unchanged and has no new block geometry.')
        if scope=='layout':warnings.append('Layout-only copy: no schematic block or electrical connections are added.')
    check=native.validate(p['schematic'])
    if not check['valid']:raise EDAError('SCHEMATIC_INVALID','Proposed hierarchy is invalid; nothing was changed.',check)
    shape_count(layout.cell(p['cell']))
    # Every parent occurrence is included, so edits in a reused child show their full top-level effect.
    after=fingerprint(p,layout);key=digest({'request':params,'target_hash':before,'source_hash':source_hash,'after_hash':after})
    record={'schema_version':1,'request':copy.deepcopy(params),'preview_hash':key,'target_revision':original['revision'],'source_revision':source_revision,'target_hash':before,'source_hash':source_hash,'after_hash':after,'cell_mapping':imported,'pin_mapping':pin_map,'instance_name':block_name,'valid':True,'warnings':warnings,'scope':'whole expanded native layout up to 100000 shapes; selected schematic tree; no DRC/LVS approval'}
    return original,p,layout,record

def preview(params):
    with S.LOCK:
        original,p,layout,record=plan(params);before_layout=S.load_layout(original)
        before=G.scene(before_layout,original,original['layers'],{'max_shapes':MAX_SHAPES});after=G.scene(layout,p,S.profile.layers(layout),{'max_shapes':MAX_SHAPES})
        if before['truncated'] or after['truncated']:raise EDAError('PREVIEW_LIMIT','Whole-layout preview cannot be truncated.')
        before_ids={s['id'] for s in before['shapes']};after_ids={s['id'] for s in after['shapes']}
        record.update(before=before,after=after,impact={'before_shapes':before['total_shape_count'],'after_shapes':after['total_shape_count'],'added_shapes':len(after_ids-before_ids),'removed_shapes':len(before_ids-after_ids),'before_bounds':before['bounds'],'after_bounds':after['bounds'],'imported_cells':len(record['cell_mapping']),'invalidated_runs':len(original.get('runs',[])),'layout_changed':G.semantic_hash(before_layout,before_layout.cell(original['cell']))!=G.semantic_hash(layout,layout.cell(p['cell']))})
        record['impact']['mask']=mask_impact(before_layout,before_layout.cell(original['cell']),layout,layout.cell(p['cell']),params.get('mode','place'))
        CACHE[record['preview_hash']]={key:value for key,value in record.items() if key not in ('before','after')}
        while len(CACHE)>8:CACHE.popitem(last=False)
        return record

def apply(params):
    if set(params)-{'project_id','request','preview_hash','approved','expected_revision','command_id'} or params.get('approved') is not True:raise EDAError('APPROVAL_REQUIRED','Explicit approval of a displayed preview is required.')
    if not params.get('command_id') or not isinstance(params.get('expected_revision'),int) or isinstance(params.get('expected_revision'),bool):raise EDAError('MUTATION_REQUIRED','Approved hierarchy transfer requires a command ID and target revision.')
    request=params.get('request')
    if not isinstance(request,dict) or request.get('project_id')!=params['project_id']:raise EDAError('PROJECT_MISMATCH','Preview and target project disagree.')
    def action():
        original,p,layout,record=plan(request)
        cached=CACHE.get(params.get('preview_hash'))
        if not cached or record['preview_hash']!=params.get('preview_hash'):raise EDAError('STALE_PREVIEW','Source, destination, mapping or transform changed. Preview again before approval.')
        old=p['revision'];p.update(revision=p['next_revision'],next_revision=p['next_revision']+1,undo_stack=p.get('undo_stack',[])+[old],redo_stack=[])
        receipt={key:value for key,value in record.items() if key not in ('before','after')};receipt.update(approved=True,source_revision=record['source_revision'],applied_from_revision=old)
        p['hierarchy_changes']=(p.get('hierarchy_changes',[])+[receipt])[-32:]
        return S.commit(p,layout,parent=old)
    return S.mutate('hierarchy.apply',params,action)

def rpc(method,params):
    if method=='hierarchy.sources':return sources(params)
    if method=='hierarchy.preview':return preview(params)
    if method=='hierarchy.apply':return apply(params)
    raise EDAError('UNKNOWN_METHOD','Unknown hierarchy transfer method.')
