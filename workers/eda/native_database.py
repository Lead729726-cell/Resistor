"""Operator-bound read-only native database queries and exact geometry graphs.

No OA/NDM binary decoder is guessed. Licensed APIs run only through an existing
operator profile pinned to the shipped query. KLayout calibration is separate.
"""
from __future__ import annotations
import base64,copy,hashlib,json,math,re,threading,uuid
from pathlib import Path
import klayout.db as k
from geometry import EDAError
import commercial_backend as C
import commercial_results as R

S=None
MAX_GRAPH=16*1024*1024
MAX_OBJECTS=100000
IDENT=re.compile(r'[A-Za-z_][A-Za-z0-9_.:-]{0,127}\Z')
COMMAND_ID=re.compile(r'[A-Za-z0-9_.:-]{1,128}\Z')
ADAPTERS={'cadence-skill':('virtuoso','cadence-read.il','OA/CDBA database API; IC6/IC23 site validation required'), 'synopsys-ndm':('icc2','synopsys-read.tcl','ICC2/Fusion NDM query API; attribute/version compatibility required'), 'klayout-file':('klayout',None,'Real open-source KLayout file/database calibration; not OA/NDM decoding')}
LIMIT=threading.BoundedSemaphore(2)

def configure(server):
    global S
    S=server
    S.DB.executescript('CREATE TABLE IF NOT EXISTS database_sources(id TEXT PRIMARY KEY,data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS database_reads(id TEXT PRIMARY KEY,data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS database_receipts(source_id TEXT,command_id TEXT,payload_hash TEXT,result TEXT,PRIMARY KEY(source_id,command_id));')
    for sid,cid,raw in list(S.DB.execute('SELECT source_id,command_id,result FROM database_receipts')):
        pending=json.loads(raw)
        if pending.get('status')=='running':pending.update(status='unverified',can_import=False,diagnostics=['Interrupted native read; no automatic licensed replay.']);S.DB.execute('UPDATE database_receipts SET result=? WHERE source_id=? AND command_id=?',(json.dumps(pending),sid,cid))
    S.DB.commit()

def digest(value):return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()
def check(name,status,message):return {'name':name,'status':status,'message':message}
def identifier(value):
    if not isinstance(value,str) or not IDENT.fullmatch(value):raise EDAError('INVALID_DATABASE_IDENTIFIER','Use a bounded native identifier; code/path expressions are prohibited.')
    return value
def source_record(sid):
    with S.LOCK:row=S.DB.execute('SELECT data FROM database_sources WHERE id=?',(sid,)).fetchone()
    if not row:raise EDAError('NOT_FOUND','Registered native database source not found.')
    return json.loads(row[0])
def save(record):
    with S.LOCK:S.DB.execute('INSERT OR REPLACE INTO database_sources VALUES(?,?)',(record['manifest']['id'],json.dumps(record)));S.db_commit()
def authorize(record,params):
    access=params.get('access_project_id')
    if access is not None and (not isinstance(access,str) or access not in record['manifest'].get('shared_project_ids',[])):raise EDAError('FORBIDDEN','Native database source is not bound by its operator to this shared project.')
    return access
def public(record):return copy.deepcopy(record['public'])
def query_path(adapter):return S.WORKSPACE/'adapters/commercial/native-db'/ADAPTERS[adapter][1]

def normalize(raw):
    allowed={'schema_version','id','name','adapter','backend_profile_id','layout_file','library','view','layer_map','shared_project_ids','executable','native_db','env_names','version','tool_id'}
    if not isinstance(raw,dict) or set(raw)-allowed or raw.get('schema_version')!=1:raise EDAError('INVALID_DATABASE_MANIFEST','Only a versioned data-only native database source manifest is accepted.')
    m=copy.deepcopy(raw);identifier(m.get('id'));identifier(m.get('library'));identifier(m.setdefault('view','layout'))
    if m.get('adapter') not in ADAPTERS or not isinstance(m.get('name'),str) or not 1<=len(m['name'])<=160:raise EDAError('INVALID_DATABASE_MANIFEST','Known adapter and bounded source name required.')
    sharing=m.setdefault('shared_project_ids',[])
    if not isinstance(sharing,list) or len(sharing)>64 or any(not isinstance(v,str) or not re.fullmatch('[a-f0-9]{32}',v) for v in sharing) or len(set(sharing))!=len(sharing):raise EDAError('INVALID_DATABASE_MANIFEST','Operator sharing is a bounded list of native project IDs.')
    m['layer_map']=m.get('layer_map',[]);S.interchange.layout_map({'layer_map':m['layer_map']})
    if m['adapter']=='klayout-file':
        if m.get('backend_profile_id') or not isinstance(m.get('layout_file'),str):raise EDAError('INVALID_DATABASE_MANIFEST','KLayout calibration requires only an operator-owned layout_file.')
        path=C.runner.operator_path(m['layout_file'],[S.WORKSPACE,Path('/foss/pdks')])
        if path.suffix.lower() not in {'.gds','.oas','.oasis'}:raise EDAError('UNSUPPORTED_DATABASE_FORMAT','KLayout calibration reads actual GDS/OAS only, never OA/NDM binary guesses.')
        m['layout_file']=str(path)
    else:
        if m.get('layout_file'):raise EDAError('INVALID_DATABASE_MANIFEST','Licensed source uses pinned native_db operator resource, not browser file paths.')
        if m.get('backend_profile_id'):
            if any(key in m for key in ('executable','native_db','env_names')):raise EDAError('INVALID_DATABASE_MANIFEST','Choose existing operator profile or fixed-reader quick setup, not both.')
            identifier(m['backend_profile_id'])
        else:
            if not isinstance(m.get('executable'),str) or not isinstance(m.get('native_db'),str):raise EDAError('INVALID_DATABASE_MANIFEST','Fixed-reader quick setup requires installed executable + native_db directory.')
            adapter=m['adapter'];tool=m.get('tool_id',ADAPTERS[adapter][0])
            if tool not in ({'virtuoso'} if adapter=='cadence-skill' else {'icc2','fusion_compiler'}):raise EDAError('INVALID_DATABASE_MANIFEST','Reader executable family does not match adapter.')
            version=m.get('version','operator-version-unverified');pid='database_'+m['id']
            profile={'schema_version':1,'id':pid,'name':'Read-only native DB '+m['name'],'tool_id':tool,'version':version,'runner':{'kind':'local','executable':m['executable'],'env_names':m.get('env_names',[]),'resources':{'site_script':str(query_path(adapter)),'native_db':m['native_db']},'recipes':{'layout_export':{'argv':['-nograph','-nocdsinit','-replay','{input.site_il}'] if adapter=='cadence-skill' else ['-f','{input.site_tcl}'],'outputs':{'exchange':'native-database.json'},'timeout_s':60,'parameters':{'mode':{'type':'string','enum':['probe','list','read'],'default':'read'},'library':{'type':'string','enum':[m['library']],'default':m['library']},'view':{'type':'string','enum':[m['view']],'default':m['view']}},'result_context':{'formats':{'exchange':'native-database-graph-v1'}}}}}}
            C.register({'manifest':profile});m['backend_profile_id']=pid
            for key in ('executable','native_db','env_names','version','tool_id'):m.pop(key,None)
    return m

def refresh(record):
    m=record['manifest'];adapter=m['adapter'];available=False;checks=[];tool=ADAPTERS[adapter][0];fp=digest(m)
    if adapter=='klayout-file':
        path=Path(m['layout_file']);evidence=C.runner.resource_lock(path)
        available=bool(evidence and evidence['kind']=='file' and evidence['size_bytes']<=MAX_GRAPH)
        fp=digest({'manifest':m,'file':evidence});checks.append(check('native-file','pass' if available else 'fail','Regular bounded KLayout source hashed.' if available else 'Native file is missing or exceeds16MiB.'))
    else:
        try:
            rec=C.refresh(C.record(m['backend_profile_id']));C.save(rec);tool=rec['manifest']['tool_id']
            if tool not in ({'virtuoso'} if adapter=='cadence-skill' else {'icc2','fusion_compiler'}):raise EDAError('DATABASE_PROFILE_MISMATCH','Operator profile tool family does not match native DB adapter.')
            fp=digest({'manifest':m,'backend':rec['locked']['fingerprint'],'query':S.profile.sha(query_path(adapter))});record['backend']=rec
            if rec['manifest']['runner']['kind']=='local':
                runner=rec['manifest']['runner'];recipe=runner['recipes'].get('layout_export');script=runner['resources'].get('site_script');db=runner['resources'].get('native_db')
                if not recipe or not script or S.profile.sha(script)!=S.profile.sha(query_path(adapter)) or not db:raise EDAError('UNTRUSTED_DATABASE_QUERY','Native DB source must use byte-identical shipped query + native_db resource; streamout/arbitrary site script is not direct DB reading.')
                if recipe['argv']!=(['-nograph','-nocdsinit','-replay','{input.site_il}'] if adapter=='cadence-skill' else ['-f','{input.site_tcl}']):raise EDAError('UNTRUSTED_DATABASE_QUERY','Only the fixed data-binding query entry argv is accepted.')
                if recipe['outputs']!={'exchange':'native-database.json'} or recipe['timeout_s']>60:raise EDAError('UNTRUSTED_DATABASE_QUERY','Native query needs bounded graph output and timeout<=60s.')
                if Path(runner['executable']).name.lower() not in ({'virtuoso','icfb','virtuoso.exe','icfb.exe'} if adapter=='cadence-skill' else {'icc2_shell','fc_shell','icc2_shell.exe','fc_shell.exe'}):raise EDAError('DATABASE_PROFILE_MISMATCH','Direct DB reader requires a native DB API shell, never a streamout-only executable.')
                C.runner.parameters(recipe,{'mode':'probe','library':m['library'],'view':m['view']})
            available=bool(rec['locked']['available']);checks+=rec['public'].get('checks',[])
            checks.append(check('query-code','pass' if rec['manifest']['runner']['kind']=='local' else 'warning','Shipped read-only query hash is pinned.' if rec['manifest']['runner']['kind']=='local' else 'Remote query/resource hashes must match shipped source after actual execution; no remote verification inferred.'))
        except (EDAError,C.runner.RunnerError) as e:checks.append(check('native-profile','fail',str(e)))
    record['fingerprint']=fp;record['public']={'id':m['id'],'name':m['name'],'adapter':adapter,'tool_id':tool,'library':m['library'],'view':m['view'],'fingerprint':fp,'available':available,'status':'unverified' if available else 'unavailable','vendor_execution_verified':False,'capabilities':{'list_cells':available,'read_graph':available,'import_graph':available},'checks':checks,'notes':[ADAPTERS[adapter][2],'Reader availability does not verify a commercial license or native execution.'],'checked_at':S.now(),'backend_profile_id':m.get('backend_profile_id')};return record

def register(params):
    if set(params)!={'manifest'}:raise EDAError('INVALID_REQUEST','Local operator registration accepts only a data manifest.')
    m=normalize(params['manifest'])
    with S.LOCK:row=S.DB.execute('SELECT data FROM database_sources WHERE id=?',(m['id'],)).fetchone()
    if row:
        old=json.loads(row[0])
        if old['manifest']!=m:raise EDAError('SOURCE_EXISTS','Source IDs and sharing bindings are immutable; register a new version ID.')
        return public(old)
    rec=refresh({'manifest':m})
    with S.LOCK:
        row=S.DB.execute('SELECT data FROM database_sources WHERE id=?',(m['id'],)).fetchone()
        if row:
            old=json.loads(row[0])
            if old['manifest']!=m:raise EDAError('SOURCE_EXISTS','Concurrent source ID conflict.')
            return public(old)
        save(rec)
    return public(rec)

def coord(value):return S.geo.coord(value)
def token(value,name='identity'):
    if not isinstance(value,str) or not value or len(value)>256 or any(ord(c)<32 for c in value):raise EDAError('INVALID_NATIVE_GRAPH','Invalid bounded '+name)
    return value
def point(value):
    if not isinstance(value,list) or len(value)!=2:raise EDAError('INVALID_NATIVE_GRAPH','Source point must contain exactly two DBU integer strings.')
    return [coord(v) for v in value]
def graph_layout(graph,m):
    if not isinstance(graph,dict) or set(graph)-{'schema_version','dbu_um','top_cell','cells','diagnostics','complete','reader'} or graph.get('schema_version')!=1:raise EDAError('INVALID_NATIVE_GRAPH','Unsupported native graph schema.')
    dbu=graph.get('dbu_um')
    if isinstance(dbu,bool) or not isinstance(dbu,(int,float)) or not math.isfinite(dbu) or not 1e-6<=dbu<=1:raise EDAError('INVALID_NATIVE_GRAPH','Actual finite DBU is required, not guessed from shape coordinates.')
    if graph.get('complete') is not True or graph.get('diagnostics'):raise EDAError('INCOMPLETE_NATIVE_GRAPH','Unsupported/missing source objects prevent authoritative import.')
    rows=graph.get('cells')
    if not isinstance(rows,list) or not 1<=len(rows)<=4096:raise EDAError('INVALID_NATIVE_GRAPH','Native graph cell bound exceeded.')
    l=k.Layout();l.dbu=dbu;mapping=S.interchange.layout_map({'layer_map':m.get('layer_map',[])});by_name={};total=0
    for row in rows:
        if not isinstance(row,dict) or set(row)-{'name','source_library','source_view','shapes','instances','pins','nets'} or any(not isinstance(row.get(key,[]),list) for key in ('shapes','instances','pins','nets')):raise EDAError('INVALID_NATIVE_GRAPH','Only bounded native cell/object arrays are accepted.')
        for value in row.get('nets',[]):token(value,'net')
        name=token(row.get('name'),'cell name')
        if name in by_name:raise EDAError('INVALID_NATIVE_GRAPH','Duplicate cell identity.')
        by_name[name]=l.create_cell(name)
    edges={row['name']:[inst.get('cell') for inst in row.get('instances',[]) if isinstance(inst,dict)] for row in rows}
    visited=set();active=set()
    def visit(name,depth=0):
        if depth>128 or name in active:raise EDAError('INVALID_NATIVE_GRAPH','Recursive/excessive native hierarchy is not importable.')
        if name in visited or name not in edges:return
        active.add(name)
        for master in edges[name]:visit(master,depth+1)
        active.remove(name);visited.add(name)
    for name in edges:visit(name)
    def layer(spec):
        if not isinstance(spec,dict):raise EDAError('INVALID_NATIVE_GRAPH','Actual layer identity required.')
        if set(spec)=={'layer','datatype'}:
            if any(isinstance(v,bool) or not isinstance(v,int) or not 0<=v<=65535 for v in spec.values()):raise EDAError('INVALID_NATIVE_GRAPH','Native numbered layers must fit GDS layer/datatype bounds.')
            return l.layer(spec['layer'],spec['datatype'])
        if set(spec)!={'name','purpose'}:raise EDAError('INVALID_NATIVE_GRAPH','Native LPP needs name + purpose.')
        purpose=spec['purpose'];name=spec['name'];suffix={'drawing':'','pin':'.PIN','label':'.LABEL','obstruction':'.OBS','routing':'.NET'}.get(purpose)
        key=name+suffix if isinstance(name,str) and suffix is not None else None
        if key not in mapping:raise EDAError('UNMAPPED_NATIVE_LAYER','Explicit operator stream map missing native LPP: '+str(spec))
        pair=mapping[key];return l.layer(k.LayerInfo(pair[0],pair[1],key))
    for row in rows:
        cell=by_name[row['name']];ids=set();figures={}
        for shape in row.get('shapes',[]):
            total+=1
            if total>MAX_OBJECTS:raise EDAError('NATIVE_GRAPH_LIMIT','Native graph exceeds100,000 objects.')
            if not isinstance(shape,dict) or set(shape)-{'id','kind','layer','box','points','holes','width','position','text','net','pin','rotation','mirror'}:raise EDAError('INVALID_NATIVE_GRAPH','Unknown native shape fields.')
            sid=token(shape.get('id'),'source object id')
            if sid in ids:raise EDAError('INVALID_NATIVE_GRAPH','Duplicate source object ID.')
            ids.add(sid);ty=shape.get('kind')
            if ty=='box':
                b=shape.get('box',[])
                if len(b)!=4:raise EDAError('INVALID_NATIVE_GRAPH','Box requires four DBU integer strings.')
                values=[coord(v) for v in b]
                if values[0]>=values[2] or values[1]>=values[3]:raise EDAError('INVALID_NATIVE_GRAPH','Box must have positive source area.')
                figure=k.Box(*values)
            elif ty in {'polygon','path'}:
                pts=shape.get('points',[])
                if not isinstance(pts,list) or not (3 if ty=='polygon' else 2)<=len(pts)<=100000:raise EDAError('INVALID_NATIVE_GRAPH','Polygon/path source vertices exceed bounds.')
                points=[k.Point(*point(pt)) for pt in pts]
                if ty=='path':
                    width=coord(shape.get('width'))
                    if width<=0:raise EDAError('INVALID_NATIVE_GRAPH','Actual positive path width is required.')
                    figure=k.Path(points,width)
                else:
                    figure=k.Polygon(points)
                    holes=shape.get('holes',[])
                    if not isinstance(holes,list) or len(holes)>10000:raise EDAError('INVALID_NATIVE_GRAPH','Bounded polygon hole arrays required.')
                    for hole in holes:
                        if not isinstance(hole,list) or not 3<=len(hole)<=100000:raise EDAError('INVALID_NATIVE_GRAPH','Invalid source polygon hole.')
                        figure.insert_hole([k.Point(*point(pt)) for pt in hole])
                    if figure.area()<=0:raise EDAError('INVALID_NATIVE_GRAPH','Native polygon has no positive area.')
            elif ty=='label':
                pos=shape.get('position',[])
                if len(pos)!=2:raise EDAError('INVALID_NATIVE_GRAPH','Label requires a source position.')
                rotation=shape.get('rotation',0);mirror=shape.get('mirror',False)
                if rotation not in {0,90,180,270} or not isinstance(mirror,bool):raise EDAError('INVALID_NATIVE_GRAPH','Unknown label transform.')
                if rotation or mirror:raise EDAError('UNSUPPORTED_NATIVE_LABEL_TRANSFORM','OASIS authoritative snapshots cannot preserve native text orientation. Original graph retained; no silent transform loss.')
                figure=k.Text(token(shape.get('text'),'label'),k.Trans(rotation//90,mirror,*[coord(v) for v in pos]))
            else:raise EDAError('UNSUPPORTED_NATIVE_OBJECT','Unsupported native shape; bounding-box substitutes are forbidden.')
            out=cell.shapes(layer(shape['layer'])).insert(figure);out.set_property(1,digest({'cell':row['name'],'source_id':sid}));out.set_property(7,sid)
            figures[sid]=out
            if shape.get('net') is not None:out.set_property(2,token(shape['net'],'net'))
            if shape.get('pin') is not None:out.set_property(4,token(shape['pin'],'pin'))
        for inst in row.get('instances',[]):
            total+=1
            if total>MAX_OBJECTS or not isinstance(inst,dict) or set(inst)-{'id','name','cell','position','rotation','mirror','array','pin_nets'}:raise EDAError('INVALID_NATIVE_GRAPH','Unknown/bounded instance data required.')
            master=by_name.get(inst.get('cell'));pos=inst.get('position',[]);rotation=inst.get('rotation');mirror=inst.get('mirror')
            if master is None or len(pos)!=2 or rotation not in {0,90,180,270} or not isinstance(mirror,bool):raise EDAError('INVALID_NATIVE_GRAPH','Exact resolved master and orthogonal source transform required.')
            iid=token(inst.get('id'))
            if iid in ids:raise EDAError('INVALID_NATIVE_GRAPH','Duplicate source object ID across figures/instances.')
            ids.add(iid);trans=k.Trans(rotation//90,mirror,*point(pos));a=inst.get('array')
            if a:
                if set(a)!={'columns','rows','a','b'} or any(isinstance(a[key],bool) or not isinstance(a[key],int) or not 1<=a[key]<=100000 for key in ('columns','rows')) or a['columns']*a['rows']>100000:raise EDAError('INVALID_NATIVE_GRAPH','Array dimensions exceed native bounds.')
                arr=k.CellInstArray(master.cell_index(),trans,k.Vector(*point(a['a'])),k.Vector(*point(a['b'])),a['columns'],a['rows'])
            else:arr=k.CellInstArray(master.cell_index(),trans)
            inserted=cell.insert(arr);inserted.set_property(1,digest({'cell':row['name'],'source_id':token(inst.get('id'))}));inserted.set_property(5,token(inst.get('name')))
            if inst.get('pin_nets') is not None:
                pin_nets=inst['pin_nets']
                if not isinstance(pin_nets,dict) or len(pin_nets)>10000:raise EDAError('INVALID_NATIVE_GRAPH','Bounded actual instance terminal/net mapping required.')
                for pin,net in pin_nets.items():token(pin,'pin');token(net,'net')
                inserted.set_property(6,json.dumps(pin_nets))
        for pin in row.get('pins',[]):
            if not isinstance(pin,dict) or set(pin)!={'name','net','shape_ids'} or not isinstance(pin['shape_ids'],list) or len(pin['shape_ids'])>MAX_OBJECTS:raise EDAError('INVALID_NATIVE_GRAPH','Actual pin identity and figure references required.')
            token(pin['name'],'pin')
            if pin['net'] is not None:token(pin['net'],'net')
            if any(sid not in figures for sid in pin['shape_ids']):raise EDAError('INVALID_NATIVE_GRAPH','Pin references a missing actual source figure.')
            for sid in pin['shape_ids']:
                figure=figures[sid]
                if figure.property(4) not in {None,pin['name']} or pin['net'] is not None and figure.property(2) not in {None,pin['net']}:raise EDAError('INVALID_NATIVE_GRAPH','Conflicting native pin/net figure identity.')
                figure.set_property(4,pin['name'])
                if pin['net'] is not None:figure.set_property(2,pin['net'])
    if graph.get('top_cell') not in by_name:raise EDAError('INVALID_NATIVE_GRAPH','Actual top is absent from native graph.')
    S.interchange.layout_summary(l,graph['top_cell']);return l

def klayout_graph(m,cell=None):
    l=k.Layout();l.read(m['layout_file']);tops=[c.name for c in l.top_cells()];top=cell or (tops[0] if len(tops)==1 else None)
    if top is None or l.cell(top) is None:raise EDAError('AMBIGUOUS_TOP','Select one actual native cell.')
    rows=[];diagnostics=[]
    for c in l.each_cell():
        row={'name':c.name,'source_library':m['library'],'source_view':m['view'],'shapes':[],'instances':[],'pins':[],'nets':[]}
        for li in l.layer_indices():
            info=l.get_info(li)
            for index,shape in enumerate(c.shapes(li).each()):
                sid=str(shape.property(1) or f'{li}:{index}');item={'id':sid,'layer':{'layer':info.layer,'datatype':info.datatype}}
                if shape.is_box():b=shape.box;item.update(kind='box',box=list(map(str,[b.left,b.bottom,b.right,b.top])))
                elif shape.is_path():
                    if shape.path.bgn_ext or shape.path.end_ext or shape.path.round:diagnostics.append('Unsupported source path extensions/round ends: '+c.name+'/'+sid)
                    item.update(kind='path',points=[[str(p.x),str(p.y)] for p in shape.path.each_point()],width=str(shape.path.width))
                elif shape.is_text():item.update(kind='label',text=shape.text.string,position=[str(shape.text.trans.disp.x),str(shape.text.trans.disp.y)],rotation=shape.text.trans.angle*90,mirror=shape.text.trans.is_mirror())
                else:
                    p=S.geo.shape_poly(shape)
                    if p is None:diagnostics.append('Unsupported KLayout object: '+c.name+'/'+sid);continue
                    item.update(kind='polygon',points=[[str(p.x),str(p.y)] for p in p.each_point_hull()],holes=[[[str(p.x),str(p.y)] for p in p.each_point_hole(i)] for i in range(p.holes())])
                if shape.property(2):item['net']=str(shape.property(2));row['nets'].append(item['net'])
                if shape.property(4):item['pin']=str(shape.property(4));row['pins'].append({'name':item['pin'],'net':item.get('net'),'shape_ids':[sid]})
                row['shapes'].append(item)
        for index,inst in enumerate(c.each_inst()):
            a=inst.cell_inst;t=a.cplx_trans
            if t.mag!=1 or round(t.angle)%90:diagnostics.append('Unsupported source magnification/non-orthogonal instance: '+c.name);continue
            item={'id':str(inst.property(1) or 'instance:'+str(index)),'name':str(inst.property(5) or 'instance_'+str(index)),'cell':inst.cell.name,'position':[str(t.disp.x),str(t.disp.y)],'rotation':round(t.angle)%360,'mirror':t.is_mirror()}
            if inst.property(6):item['pin_nets']=json.loads(inst.property(6))
            if a.is_regular_array():item['array']={'columns':a.na,'rows':a.nb,'a':[str(a.a.x),str(a.a.y)],'b':[str(a.b.x),str(a.b.y)]}
            row['instances'].append(item)
        row['nets']=sorted(set(row['nets']));rows.append(row)
    return {'schema_version':1,'dbu_um':l.dbu,'top_cell':top,'cells':rows,'diagnostics':diagnostics,'complete':not diagnostics,'reader':{'adapter':'klayout-file','tool':'klayout','version':k.__version__,'api':'klayout.db.Layout'}}

def native_query(record,mode,cell,view,folder):
    m=record['manifest'];rec=record.get('backend')
    if not rec or not record['public']['available']:raise EDAError('DATABASE_UNAVAILABLE','No licensed executable/authenticated native operator profile is available.')
    settings={'operation':'layout_export','top_cell':identifier(cell),'parameters':{'mode':mode,'library':m['library'],'view':identifier(view)}}
    inputs={'settings.json':C.runner.canonical(settings)}
    if rec['manifest']['runner']['kind']=='local':result=C.runner.execute(rec['manifest'],settings,inputs,folder,rec['locked']['fingerprint']);path=folder/'outputs'/result.get('outputs',{}).get('exchange',{}).get('path','missing')
    else:
        import time
        remote=C.remote(rec['manifest'],'job.submit',{'profile_id':rec['manifest']['runner']['profile_id'],'settings':settings,'input_package':C.runner.pack(inputs),'command_id':uuid.uuid4().hex,'pinned_fingerprint':rec['locked']['remote_fingerprint']},30);started=time.monotonic()
        while remote['execution_status'] in {'queued','running'}:
            if time.monotonic()-started>65:C.remote(rec['manifest'],'job.cancel',{'job_id':remote['id']});raise EDAError('DATABASE_TIMEOUT','Native DB query exceeded65s transport budget.')
            time.sleep(.15);remote=C.remote(rec['manifest'],'job.status',{'job_id':remote['id']})
        result=remote;data=C.remote(rec['manifest'],'job.artifact',{'job_id':remote['id'],'key':'exchange'});path=folder/'native-database.json';path.write_bytes(base64.b64decode(data['base64'],validate=True))
        logs=C.remote(rec['manifest'],'job.artifact',{'job_id':remote['id'],'key':'stdout'});(folder/'stdout.log').write_bytes(base64.b64decode(logs['base64'],validate=True))
    if result.get('error_code') or result.get('exit_code')!=0:raise EDAError('DATABASE_EXECUTION_FAILED','Native read-only query did not complete; actual redacted logs retained.')
    if result.get('resource_hashes',{}).get('resource.site_script')!=S.profile.sha(query_path(m['adapter'])) or not result.get('resource_hashes',{}).get('resource.native_db'):raise EDAError('UNTRUSTED_DATABASE_QUERY','Actual native query/resource SHA does not match the shipped direct DB reader.')
    log=(folder/'stdout.log').read_text(errors='replace')
    if R.FAILURE.search(log) or R.INCOMPLETE.search(log) or '[NATIVE_LOG_TRUNCATED]' in log or '[OVERLONG_NATIVE_LINE' in log:raise EDAError('DATABASE_EXECUTION_UNKNOWN','Actual native diagnostics are failed/incomplete; an exit-zero graph cannot establish success.')
    if not path.is_file() or path.stat().st_size>MAX_GRAPH:raise EDAError('INVALID_NATIVE_GRAPH','Expected bounded actual DB graph output is absent.')
    payload=json.loads(path.read_text());return payload,result

def query(params,mode,read_id=None):
    record=source_record(params['source_id']);authorize(record,params);record=refresh(record);save(record);m=record['manifest'];folder=S.STATE/'database_reads'/(read_id or uuid.uuid4().hex);folder.mkdir(parents=True)
    if not record['public']['available']:return {'id':folder.name,'source_id':m['id'],'fingerprint':record['fingerprint'],'status':'unavailable','available':False,'can_import':False,'vendor_execution_verified':False,'cells':[],'source':public(record),'checks':record['public']['checks'],'diagnostics':['No actual licensed/native reader execution occurred.']}
    if m['adapter']=='klayout-file':
        l=k.Layout();l.read(m['layout_file']);cells=[{'library':m['library'],'cell':c.name,'view':m['view']} for c in l.each_cell()]
        if mode!='read':return {'source_id':m['id'],'fingerprint':record['fingerprint'],'status':'verified','available':True,'source':public(record),'vendor_execution_verified':False,'cells':cells,'checks':[check('actual-native-query','pass','Actual open-source KLayout API read completed.')],'version':k.__version__}
        graph=klayout_graph(m,params.get('cell'));result={'vendor_execution_verified':False,'open_source_verified':True}
    else:
        if not record['public']['available']:
            return {'source_id':m['id'],'fingerprint':record['fingerprint'],'status':'unavailable','available':False,'vendor_execution_verified':False,'cells':[],'checks':record['public']['checks'],'diagnostics':['No actual licensed native reader execution occurred.']}
        graph,result=native_query(record,mode,params.get('cell') or 'database_probe',params.get('view') or m['view'],folder)
        if mode!='read':
            if graph.get('schema_version')!=1 or graph.get('mode')!=mode or not isinstance(graph.get('cells',[]),list):raise EDAError('INVALID_NATIVE_QUERY','Actual native listing/probe schema is invalid.')
            if graph.get('diagnostics') or len(graph['cells'])>MAX_OBJECTS:raise EDAError('INVALID_NATIVE_QUERY','Incomplete or oversized native listing cannot establish compatibility.')
            token(graph.get('version'),'actual native tool version')
            for row in graph['cells']:
                if not isinstance(row,dict) or set(row)!={'library','cell','view'} or row['library']!=m['library']:raise EDAError('INVALID_NATIVE_QUERY','Native listing must belong to the pinned single library.')
                for value in row.values():token(value,'library/cell/view')
            return {'source_id':m['id'],'fingerprint':record['fingerprint'],'status':'unverified','available':True,'source':public(record),'vendor_execution_verified':False,'cells':graph.get('cells',[]),'version':graph.get('version'),'checks':[check('native-output','pass','Actual direct API query output decoded; vendor binary identity/license attestation remains unverified.')],'diagnostics':graph.get('diagnostics',[])}
    if params.get('cell')!=graph.get('top_cell'):raise EDAError('NATIVE_CELL_MISMATCH','Native graph top does not equal the explicitly selected source cell.')
    reader=graph.get('reader',{});expected_api={'cadence-skill':'dbOpenCellViewByType-r','synopsys-ndm':'open_lib/open_block/get_shapes','klayout-file':'klayout.db.Layout'}[m['adapter']]
    if not isinstance(reader,dict) or set(reader)!={'adapter','tool','version','api'} or reader.get('adapter')!=m['adapter'] or reader.get('api')!=expected_api or reader.get('tool') not in ({'icc2','fusion_compiler'} if m['adapter']=='synopsys-ndm' else {ADAPTERS[m['adapter']][0]}):raise EDAError('INVALID_NATIVE_QUERY','Native graph reader/API identity does not match the fixed registered adapter.')
    token(reader.get('version'),'actual tool version')
    payload=C.runner.canonical(graph)
    if len(payload)>MAX_GRAPH:raise EDAError('NATIVE_GRAPH_LIMIT','Native graph exceeds16MiB.')
    valid=False;diagnostics=[]
    try:graph_layout(graph,m);valid=True
    except EDAError as e:diagnostics.append(str(e))
    latest=refresh(source_record(m['id']))
    if latest['fingerprint']!=record['fingerprint']:raise EDAError('DATABASE_CHANGED','Native source changed while reading; output cannot be pinned as current.')
    rid=folder.name;read={'id':rid,'source_id':m['id'],'cell':params.get('cell') or graph['top_cell'],'view':params.get('view') or m['view'],'library':m['library'],'fingerprint':record['fingerprint'],'source_fingerprint':record['fingerprint'],'status':'verified' if valid and m['adapter']=='klayout-file' else 'unverified','can_import':valid,'vendor_execution_verified':False,'graph':graph,'graph_sha256':hashlib.sha256(payload).hexdigest(),'checks':[check('geometry-graph','pass' if valid else 'fail','Exact source primitives/transforms validated by real KLayout.' if valid else '; '.join(diagnostics))],'diagnostics':diagnostics,'access_project_id':params.get('access_project_id'),'created_at':S.now(),'notes':['Vendor execution/SDK is not verified in this environment. No streamout or guessed binary decoding.']}
    read['execution_evidence']={'native_api_executed':True,'tool_process_completed':m['adapter']!='klayout-file','actual_tool_version':graph.get('reader',{}).get('version'),'executable_sha256':result.get('resource_hashes',{}).get('executable'),'resource_sha256':result.get('resource_hashes',{}),'stdout_sha256':result.get('stdout_sha256'),'graph_sha256':read['graph_sha256'],'read_only_source_integrity_verified':True,'geometry_validated':valid,'vendor_identity_verified':False,'reader_kind':'open-source-calibration' if m['adapter']=='klayout-file' else 'operator-installed-vendor-query'}
    (folder/'graph.json').write_bytes(payload);S.dump(folder/'receipt.json',{key:value for key,value in read.items() if key!='graph'})
    with S.LOCK:S.DB.execute('INSERT INTO database_reads VALUES(?,?)',(rid,json.dumps(read)));S.db_commit()
    return read

def read(params):
    record=source_record(params['source_id']);authorize(record,params);cid=params.get('command_id');fingerprint=digest(params)
    if cid is not None and (not isinstance(cid,str) or not COMMAND_ID.fullmatch(cid)):raise EDAError('INVALID_COMMAND_ID','Read command ID must be a bounded transaction identifier.')
    rid=uuid.uuid4().hex
    with S.LOCK:
        row=S.DB.execute('SELECT payload_hash,result FROM database_receipts WHERE source_id=? AND command_id=?',(params['source_id'],cid)).fetchone() if cid else None
        if row:
            if row[0]!=fingerprint:raise EDAError('IDEMPOTENCY_CONFLICT','Read receipt command ID was used for another source/cell/access scope.')
            return json.loads(row[1])
    if not LIMIT.acquire(blocking=False):raise EDAError('DATABASE_BUSY','At most2 actual native DB queries can run concurrently.')
    try:
        with S.LOCK:
            row=S.DB.execute('SELECT payload_hash,result FROM database_receipts WHERE source_id=? AND command_id=?',(params['source_id'],cid)).fetchone() if cid else None
            if row:
                if row[0]!=fingerprint:raise EDAError('IDEMPOTENCY_CONFLICT','Read receipt command ID was used for another source/cell/access scope.')
                return json.loads(row[1])
            if cid:
                pending={'id':rid,'source_id':params['source_id'],'status':'running','can_import':False,'vendor_execution_verified':False,'checks':[],'diagnostics':['Actual native read pending.']};S.DB.execute('INSERT INTO database_receipts VALUES(?,?,?,?)',(params['source_id'],cid,fingerprint,json.dumps(pending)));S.db_commit()
        try:
            result=query(params,'read',rid)
        except Exception as e:
            result={'id':rid,'source_id':params['source_id'],'status':'unverified','can_import':False,'vendor_execution_verified':False,'checks':[],'diagnostics':[str(e)[:1024]],'error_code':getattr(e,'code','DATABASE_EXECUTION_UNKNOWN')}
    finally:LIMIT.release()
    if cid:
        with S.LOCK:
            row=S.DB.execute('SELECT payload_hash,result FROM database_receipts WHERE source_id=? AND command_id=?',(params['source_id'],cid)).fetchone()
            if row and row[0]!=fingerprint:raise EDAError('IDEMPOTENCY_CONFLICT','Concurrent read receipt payload conflict.')
            S.DB.execute('UPDATE database_receipts SET result=? WHERE source_id=? AND command_id=?',(json.dumps(result),params['source_id'],cid));S.db_commit()
    return result

def get_read(params):
    with S.LOCK:row=S.DB.execute('SELECT data FROM database_reads WHERE id=?',(params.get('read_id'),)).fetchone()
    if not row:raise EDAError('NOT_FOUND','Immutable native read receipt not found.')
    read=json.loads(row[0]);record=source_record(read['source_id']);authorize(record,params)
    if read.get('access_project_id')!=params.get('access_project_id'):raise EDAError('FORBIDDEN','Read receipt belongs to another local/shared project access scope.')
    fresh=refresh(record);save(fresh)
    if fresh['fingerprint']!=read['source_fingerprint']:raise EDAError('DATABASE_CHANGED','Native source resource hash changed after read receipt.')
    path=S.STATE/'database_reads'/read['id']/'graph.json'
    if not path.is_file() or path.is_symlink() or path.stat().st_size>MAX_GRAPH or S.profile.sha(path)!=read['graph_sha256'] or hashlib.sha256(C.runner.canonical(read['graph'])).hexdigest()!=read['graph_sha256']:raise EDAError('ARTIFACT_CHANGED','Native graph bytes differ from immutable read receipt.')
    return read,fresh
def import_read(params,prepared):
    read,record,layout,observed=prepared;p=S.get_project(params['project_id'])
    if p['revision']!=observed:raise EDAError('REVISION_CONFLICT','Project changed during native graph validation.')
    current=source_record(read['source_id']);authorize(current,params)
    if current['fingerprint']!=read['source_fingerprint'] or current['manifest']!=record['manifest']:raise EDAError('DATABASE_CHANGED','Source eligibility changed between validation and commit.')
    if params.get('access_project_id') is not None and params['access_project_id']!=p['id']:raise EDAError('FORBIDDEN','Shared native graph import requires the exact bound room project.')
    old=p['revision'];p.update(cell=read['graph']['top_cell'],revision=p['next_revision'],next_revision=p['next_revision']+1,undo_stack=p.get('undo_stack',[])+[old],redo_stack=[],source='fixture',example='fixture',schematic={'devices':[],'wires':[],'junctions':[]},ports=[],grid_dbu=1,interchange_layout={'reader':'native-database','source_id':read['source_id'],'read_id':read['id'],'graph_sha256':read['graph_sha256'],'geometry_binding':'unverified'},native_database={'source_id':read['source_id'],'read_id':read['id'],'fingerprint':read['fingerprint'],'vendor_execution_verified':read['vendor_execution_verified']})
    for key in ('analysis_setup','backend_setup','active_backend','testbench','interchange_netlist','interchange_report','design_template','pvt_point'):p.pop(key,None)
    return {'project':S.commit(p,layout,old),'report':{'reader':'native-database','read_id':read['id'],'graph_sha256':read['graph_sha256'],'vendor_execution_verified':read['vendor_execution_verified'],'checks':read['checks'],'warnings':read['notes']}}

def rpc(method,params):
    common={'project_id','access_project_id'}
    allowed={'database.catalog':common,'database.list_sources':common,'database.register':{'manifest'},'database.probe':common|{'source_id'},'database.list_cells':common|{'source_id'},'database.read':common|{'source_id','cell','view','command_id'},'database.read_artifact':common|{'read_id'},'database.import':common|{'read_id','expected_revision','command_id'}}
    if method not in allowed or set(params)-allowed[method]:raise EDAError('INVALID_REQUEST','Only data-only native database parameters are accepted.')
    if method=='database.catalog':return {'adapters':[{'id':key,'name':key,'tool_id':value[0],'formats':['GDS','OAS'] if key=='klayout-file' else ['OA','CDBA'] if key=='cadence-skill' else ['NDM'],'status':'unverified','notes':[value[2]]} for key,value in ADAPTERS.items()]}
    if method=='database.register':return register(params)
    if method=='database.list_sources':
        with S.LOCK:records=[json.loads(r[0]) for r in S.DB.execute('SELECT data FROM database_sources ORDER BY rowid')]
        return [public(r) for r in records if params.get('access_project_id') is None or params['access_project_id'] in r['manifest']['shared_project_ids']]
    if method in {'database.probe','database.list_cells'}:
        if not LIMIT.acquire(blocking=False):raise EDAError('DATABASE_BUSY','At most2 actual native DB queries can run concurrently.')
        try:return query(params,'probe' if method=='database.probe' else 'list')
        finally:LIMIT.release()
    if method=='database.read':
        identifier(params.get('cell'))
        record=source_record(params.get('source_id'))
        if params.get('view',record['manifest']['view'])!=record['manifest']['view']:raise EDAError('INVALID_DATABASE_VIEW','Read must select the registered immutable source view.')
        return read(params)
    if method=='database.read_artifact':
        item,_=get_read(params);value=C.runner.canonical(item['graph']);return {'name':'native-database-graph.json','base64':base64.b64encode(value).decode(),'mime':'application/json','sha256':item['graph_sha256']}
    if method=='database.import':
        replay=S.completed_receipt(method,params)
        if replay is not None:return replay
        p=S.get_project(params['project_id']);item,record=get_read(params)
        if not item['can_import']:raise EDAError('INCOMPLETE_NATIVE_GRAPH','This read receipt cannot be imported as authoritative geometry.')
        layout=graph_layout(item['graph'],record['manifest']);prepared=(item,record,layout,p['revision'])
        return S.mutate(method,params,lambda:import_read(params,prepared))
    raise EDAError('UNSUPPORTED','Unsupported native database method.')
