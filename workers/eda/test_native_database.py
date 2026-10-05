"""Isolated real KLayout and read-only native bridge boundary regressions.

No licensed execution is simulated as vendor verification. Synthetic graph and
concurrency harness cases are named explicitly; public SKY130 geometry is real.
"""
import base64,copy,json,os,shutil,subprocess,threading,time,uuid
from pathlib import Path
import klayout.db as k

RUN=Path('/workspace/.runtime/evidence')/('native-database-'+uuid.uuid4().hex)
RUN.mkdir(parents=True)
os.environ['MOS_STATE']=str(RUN/'state');os.environ['MOS_TOKEN']='isolated-test-only'
import server as S
import native_database as N
import geometry as G

CASES=[]
def assert_(value,message='assertion failed'):
    if not value:raise AssertionError(message)
def case(name,fn):
    start=time.monotonic()
    try:
        detail=fn();CASES.append({'name':name,'result':'pass','seconds':time.monotonic()-start,'details':detail});return detail
    except Exception as e:CASES.append({'name':name,'result':'fail','seconds':time.monotonic()-start,'error':repr(e)});raise
def reject(code,fn):
    try:fn()
    except Exception as e:
        assert_(getattr(e,'code',None)==code,(getattr(e,'code',None),code,repr(e)));return {'error_code':code}
    raise AssertionError('Expected '+code)
def rpc(method,**params):return N.rpc('database.'+method,params)
def manifest(sid,path,**extra):return {'schema_version':1,'id':sid,'name':'Actual KLayout source '+sid,'adapter':'klayout-file','layout_file':str(path),'library':'CALIBRATION','view':'layout','layer_map':[],**extra}
def signature(layout,cell):
    # Layer indices are allocation order, not stream layer identity.
    rows=[]
    for _,p,li,_ in G.walk(layout,layout.cell(cell)):
        rows.append([li,G.canonical_ring(p.each_point_hull()),sorted(G.canonical_ring(p.each_point_hole(i)) for i in range(p.holes()))])
    texts=[]
    for c in layout.each_cell():
        for li in layout.layer_indices():
            info=layout.get_info(li)
            for s in c.shapes(li).each():
                if s.is_text():texts.append([c.name,info.layer,info.datatype,s.text.string,s.text.trans.to_s()])
    return N.digest({'dbu':layout.dbu,'geometry':sorted(rows),'labels':sorted(texts),'hierarchy':G.hierarchy_hash(layout)})

def fixture():
    l=k.Layout();l.dbu=.002;top=l.create_cell('TOP');leaf=l.create_cell('LEAF');li=l.layer(68,20)
    box=leaf.shapes(li).insert(k.Box(0,0,80,100));box.set_property(1,'source_box');box.set_property(2,'D');box.set_property(4,'D')
    p=k.Polygon([k.Point(100,0),k.Point(300,0),k.Point(300,200),k.Point(100,200)]);p.insert_hole([k.Point(150,50),k.Point(250,50),k.Point(250,150),k.Point(150,150)])
    leaf.shapes(li).insert(p).set_property(1,'source_hole')
    leaf.shapes(li).insert(k.Path([k.Point(0,220),k.Point(300,220)],20)).set_property(1,'source_path')
    leaf.shapes(l.layer(68,5)).insert(k.Text('D',k.Trans(0,False,80,100))).set_property(1,'source_text')
    i=top.insert(k.CellInstArray(leaf.cell_index(),k.Trans(1,True,1000,500),k.Vector(500,0),k.Vector(0,500),2,3));i.set_property(1,'source_instance');i.set_property(5,'U1');i.set_property(6,json.dumps({'D':'OUT'}))
    path=RUN/'synthetic-grammar.oas';l.write(str(path));loaded=k.Layout();loaded.read(str(path));return path,loaded

def actual_public():
    path=Path('/foss/pdks/sky130A/libs.ref/sky130_fd_sc_hd/gds/sky130_fd_sc_hd.gds')
    assert_(path.is_file(),'Installed public SKY130 standard-cell GDS missing')
    original=k.Layout();original.read(str(path));cell=original.cell('sky130_fd_sc_hd__inv_1');assert_(cell is not None)
    l=k.Layout();l.dbu=original.dbu;top=l.create_cell(cell.name);top.copy_tree(cell);target=RUN/'public-sky130-inverter.oas';l.write(str(target));l=k.Layout();l.read(str(target))
    public=rpc('register',manifest=manifest('public_sky130',target));assert_(public['available']);assert_(not public['vendor_execution_verified'])
    probe=rpc('probe',source_id=public['id']);assert_(probe['status']=='verified');assert_(not probe['vendor_execution_verified'])
    listing=rpc('list_cells',source_id=public['id']);assert_(any(v['cell']==cell.name for v in listing['cells']))
    read=rpc('read',source_id=public['id'],cell=cell.name,command_id=str(uuid.uuid4()));assert_(read['can_import'],read)
    back=N.graph_layout(read['graph'],N.source_record(public['id'])['manifest']);assert_(signature(l,cell.name)==signature(back,cell.name))
    assert_(read['graph']['reader']['version']==k.__version__);assert_(read['execution_evidence']['native_api_executed']);assert_(not read['execution_evidence']['vendor_identity_verified'])
    return {'source_id':public['id'],'read_id':read['id'],'original_gds_sha256':S.profile.sha(path),'subset_sha256':S.profile.sha(target),'dbu_um':l.dbu,'shape_count':S.interchange.layout_summary(back,cell.name)['stored_shape_count'],'vendor_execution_verified':False}

def real_fixture_read():
    global source,read,project,source_path,original
    source_path,original=fixture();source=rpc('register',manifest=manifest('grammar',source_path));project=S.create({'name':'Native DB regression','example':'fixture'})
    read=rpc('read',source_id=source['id'],cell='TOP',command_id='0'+str(uuid.uuid4()));assert_(read['can_import'],read)
    l=N.graph_layout(read['graph'],N.source_record(source['id'])['manifest']);assert_(l.dbu==.002);assert_(signature(l,'TOP')==signature(original,'TOP'))
    leaf=l.cell('LEAF');figures=[s for li in l.layer_indices() for s in leaf.shapes(li).each()];assert_(any(s.is_polygon() and s.polygon.holes()==1 for s in figures));assert_(any(s.is_text() and s.text.string=='D' for s in figures))
    inst=list(l.cell('TOP').each_inst())[0];assert_(inst.cell_inst.na==2 and inst.cell_inst.nb==3);assert_(json.loads(inst.property(6))=={'D':'OUT'});assert_(any(s.property(4)=='D' and s.property(2)=='D' for s in figures))
    return {'read_id':read['id'],'dbu_um':.002,'shape_count':S.interchange.layout_summary(l,'TOP')['stored_shape_count'],'array':[2,3],'pin_net':'D','geometry_source':'explicit synthetic grammar fixture read with actual KLayout'}

def actual_import():
    global project,import_params
    before=project['revision'];import_params={'project_id':project['id'],'read_id':read['id'],'expected_revision':before,'command_id':str(uuid.uuid4())}
    value=rpc('import',**import_params);project=value['project'];assert_(project['revision']>before);assert_(project['cell']=='TOP');assert_(project['schematic']['devices']==[]);assert_('analysis_setup' not in project and 'backend_setup' not in project)
    l=S.load_layout(project);assert_(signature(l,'TOP')==signature(original,'TOP'));assert_(project['native_database']['read_id']==read['id']);return {'project_id':project['id'],'revision':project['revision'],'snapshot_sha256':S.profile.sha(S.snapshot_dir(project)/'layout.oas')}

def receipt():
    r=rpc('import',**import_params);assert_(r['project']['revision']==project['revision']);a=rpc('read_artifact',read_id=read['id']);assert_(S.profile.sha(S.STATE/'database_reads'/read['id']/'graph.json')==a['sha256']);assert_(json.loads(base64.b64decode(a['base64']))==read['graph']);return {'immutable_import_revision':project['revision'],'graph_sha256':a['sha256']}

def roundtrip():
    l=S.load_layout(project)
    for fmt in ('gds','oas'):
        path=RUN/('roundtrip.'+fmt);l.write(str(path));b=k.Layout();b.read(str(path));assert_(signature(b,'TOP')==signature(l,'TOP'))
    return {'formats':['gds','oas'],'dbu_um':l.dbu}

def undo():
    global project
    rev=project['revision'];project=S.rpc('layout.apply_command',{'project_id':project['id'],'command':{'type':'undo'}});assert_(project['revision']>rev);assert_(project['cell']!='TOP');project=S.rpc('layout.apply_command',{'project_id':project['id'],'command':{'type':'redo'}});assert_(project['cell']=='TOP');assert_(signature(S.load_layout(project),'TOP')==signature(original,'TOP'));return {'restored_revision':project['revision']}

def shared():
    global shared_source,shared_read,room,other
    room=S.create({'name':'Bound room','example':'fixture'});other=S.create({'name':'Other room','example':'fixture'});shared_source=rpc('register',manifest=manifest('shared_grammar',source_path,shared_project_ids=[room['id']]))
    assert_([v['id'] for v in rpc('list_sources',access_project_id=room['id'])]==['shared_grammar']);assert_(rpc('list_sources',access_project_id=other['id'])==[])
    reject('FORBIDDEN',lambda:rpc('probe',source_id=shared_source['id'],access_project_id=other['id']))
    shared_read=rpc('read',source_id=shared_source['id'],cell='TOP',access_project_id=room['id'],command_id=str(uuid.uuid4()));assert_(shared_read['can_import'])
    reject('FORBIDDEN',lambda:rpc('read_artifact',read_id=shared_read['id']));reject('FORBIDDEN',lambda:rpc('read_artifact',read_id=shared_read['id'],access_project_id=other['id']))
    reject('FORBIDDEN',lambda:rpc('import',project_id=other['id'],read_id=shared_read['id'],access_project_id=room['id']))
    r=rpc('import',project_id=room['id'],read_id=shared_read['id'],access_project_id=room['id']);assert_(r['project']['cell']=='TOP');return {'bound_project_id':room['id'],'read_id':shared_read['id'],'cross_room_denied':True}

def missing_vendors():
    results=[];db=RUN/'opaque-not-vendor-library';db.mkdir();(db/'calibration.txt').write_text('Synthetic opaque directory; no vendor database claimed.')
    for sid,adapter,tool,exe in [('missing_cadence','cadence-skill','virtuoso','virtuoso'),('missing_icc2','synopsys-ndm','icc2','icc2_shell'),('missing_fusion','synopsys-ndm','fusion_compiler','fc_shell')]:
        assert_(shutil.which(exe) is None,'Unexpected vendor binary installed')
        m={'schema_version':1,'id':sid,'name':'Install-later '+tool,'adapter':adapter,'library':'MYLIB','view':'layout','layer_map':[],'tool_id':tool,'executable':str(RUN/'absent'/exe),'native_db':str(db)}
        p=rpc('register',manifest=m);assert_(p['status']=='unavailable');assert_(not p['available']);q=rpc('probe',source_id=sid);assert_(q['status']=='unavailable');assert_(q['cells']==[]);r=rpc('read',source_id=sid,cell='TOP',command_id=str(uuid.uuid4()));assert_(r['status']=='unavailable');assert_(not r['can_import'] and not r['vendor_execution_verified']);results.append({'tool':tool,'status':r['status'],'backend_profile_id':p['backend_profile_id']})
    return {'actual_missing_binaries':results,'vendor_execution_verified':False}

def source_changed():
    saved=source_path.read_bytes();l=k.Layout();l.read(str(source_path));l.cell('LEAF').shapes(l.layer(68,20)).insert(k.Box(500,0,600,100));l.write(str(source_path))
    try:
        reject('DATABASE_CHANGED',lambda:rpc('read_artifact',read_id=read['id']));reject('DATABASE_CHANGED',lambda:rpc('import',project_id=project['id'],read_id=read['id'],command_id='source-stale-import'))
        assert_(rpc('import',**import_params)['project']['revision']==import_params['expected_revision']+1)
    finally:source_path.write_bytes(saved)
    return {'changed_source_rejected':True,'completed_receipt_still_replayed':True}

def artifact_changed():
    path=S.STATE/'database_reads'/read['id']/'graph.json';saved=path.read_bytes();path.write_bytes(saved+b' ')
    try:reject('ARTIFACT_CHANGED',lambda:rpc('read_artifact',read_id=read['id']))
    finally:path.write_bytes(saved)
    return {'immutable_graph_sha_guard':True}

def busy():
    before=S.DB.execute('SELECT COUNT(*) FROM database_receipts').fetchone()[0];assert_(N.LIMIT.acquire(False));assert_(N.LIMIT.acquire(False))
    try:reject('DATABASE_BUSY',lambda:rpc('read',source_id=source['id'],cell='TOP',command_id='busy-retry'))
    finally:N.LIMIT.release();N.LIMIT.release()
    assert_(S.DB.execute('SELECT COUNT(*) FROM database_receipts').fetchone()[0]==before);r=rpc('read',source_id=source['id'],cell='TOP',command_id='busy-retry');assert_(r['can_import']);return {'busy_created_no_pending_receipt':True,'retry_completed':True}

def concurrent_replay():
    original_fn=N.klayout_graph;entered=threading.Event();release=threading.Event();calls=[];out=[];params={'source_id':source['id'],'cell':'TOP','command_id':'concurrent-real-read'}
    def paused(*a,**kw):calls.append(1);entered.set();assert_(release.wait(10));return original_fn(*a,**kw)
    N.klayout_graph=paused
    try:
        t=threading.Thread(target=lambda:out.append(rpc('read',**params)));t.start();assert_(entered.wait(10));pending=rpc('read',**params);assert_(pending['status']=='running');release.set();t.join(15);assert_(not t.is_alive());assert_(out[0]['can_import']);assert_(len(calls)==1);assert_(rpc('read',**params)['id']==out[0]['id'])
    finally:release.set();N.klayout_graph=original_fn
    return {'actual_klayout_queries':len(calls),'exact_once_read_id':out[0]['id']}

def interrupted():
    params={'source_id':source['id'],'cell':'TOP','command_id':'interrupted-read'};pending={'id':uuid.uuid4().hex,'status':'running','can_import':False};S.DB.execute('INSERT INTO database_receipts VALUES(?,?,?,?)',(source['id'],params['command_id'],N.digest(params),json.dumps(pending)));S.DB.commit();N.configure(S);r=rpc('read',**params);assert_(r['status']=='unverified');assert_(not r['can_import']);return {'restarted_pending_status':'unverified','automatic_replay':False}

def tcl_escaping():
    text=(S.WORKSPACE/'adapters/commercial/native-db/synopsys-read.tcl').read_text().split('foreach command')[0];script=RUN/'json-escape-test.tcl'
    script.write_text(text+'\nputs [rdb_q [format "quote%s slash%s nul%s unit%s lf%s" [format %c 34] [format %c 92] [format %c 0] [format %c 31] [format %c 10]]]\n')
    r=subprocess.run(['tclsh',str(script)],capture_output=True,text=True,timeout=10);assert_(r.returncode==0,r.stderr);value=json.loads(r.stdout);assert_(value=='quote" slash\\ nul\0 unit\x1f lf\n');return {'actual_tcl_json_escape_verified':True,'licensed_execution':False}

def graph_negative(name,change,code='INVALID_NATIVE_GRAPH'):
    graph=copy.deepcopy(read['graph']);change(graph);return reject(code,lambda:N.graph_layout(graph,N.source_record(source['id'])['manifest']))
def leaf(graph):return next(c for c in graph['cells'] if c['name']=='LEAF')
def top(graph):return next(c for c in graph['cells'] if c['name']=='TOP')
def figure(graph,sid):return next(s for s in leaf(graph)['shapes'] if s['id']==sid)
def commit_eligibility():
    item,rec=N.get_read({'read_id':read['id']});p=S.get_project(project['id']);layout=N.graph_layout(item['graph'],rec['manifest']);saved=copy.deepcopy(rec);rec['fingerprint']='changed';N.save(rec)
    try:reject('DATABASE_CHANGED',lambda:S.mutate('database.import',{'project_id':p['id'],'command_id':'eligibility-race'},lambda:N.import_read({'project_id':p['id']},(item,saved,layout,p['revision']))))
    finally:N.save(saved)
    return {'prepare_to_commit_cached_signature_change_rejected':True}

def main():
    case('public installed SKY130 inverter actual KLayout native DB read',actual_public)
    case('actual KLayout synthetic grammar read DBU hierarchy holes paths labels pins arrays',real_fixture_read)
    case('actual graph import creates immutable revision and clears old electrical setup',actual_import)
    case('exact import replay and graph artifact SHA receipt',receipt)
    case('real GDS OAS roundtrip preserves DBU hierarchy exact geometry',roundtrip)
    case('native import undo redo preserves original snapshot',undo)
    case('shared binding local default import and cross-room read receipts',shared)
    case('real missing Virtuoso ICC2 Fusion probes never vendor PASS',missing_vendors)
    case('resource path outside operator roots rejected',lambda:reject('UNSAFE_RESOURCE_PATH',lambda:rpc('register',manifest=manifest('outside','/etc/passwd'))))
    case('source registration accepts no arbitrary argv',lambda:reject('INVALID_DATABASE_MANIFEST',lambda:rpc('register',manifest={**manifest('code',source_path),'argv':['sh','-c','x']})))
    case('source registration accepts env names no secret values',lambda:reject('INVALID_DATABASE_MANIFEST',lambda:rpc('register',manifest={**manifest('secret',source_path),'env':{'LICENSE':'synthetic'}})))
    case('source registration sharing is local-only immutable',lambda:reject('SOURCE_EXISTS',lambda:rpc('register',manifest=manifest('grammar',source_path,shared_project_ids=[room['id']]))))
    case('read command accepts digit-prefixed UUID and replays exactly',lambda:assert_(rpc('read',source_id=source['id'],cell='TOP',command_id='0-uuid-replay')['id']==rpc('read',source_id=source['id'],cell='TOP',command_id='0-uuid-replay')['id']))
    case('read receipt payload mismatch rejected',lambda:reject('IDEMPOTENCY_CONFLICT',lambda:rpc('read',source_id=source['id'],cell='LEAF',command_id='0-uuid-replay')))
    case('read native view cannot drift from registered source',lambda:reject('INVALID_DATABASE_VIEW',lambda:rpc('read',source_id=source['id'],cell='TOP',view='schematic')))
    case('read RPC rejects client script fields',lambda:reject('INVALID_REQUEST',lambda:rpc('read',source_id=source['id'],cell='TOP',script='malicious')))
    case('busy read creates no pending receipt and retry completes',busy)
    case('concurrent actual KLayout read exact-once receipt',concurrent_replay)
    case('restart pending receipt remains unverified no automatic vendor replay',interrupted)
    case('native resource mutation rejects old receipt artifact and import',source_changed)
    case('immutable graph tampering rejected',artifact_changed)
    case('source eligibility checked again in short commit',commit_eligibility)
    case('actual Tcl JSON escapes every control character',tcl_escaping)
    case('graph unknown shape cannot be replaced by bbox',lambda:graph_negative('shape',lambda g:leaf(g)['shapes'][0].update(kind='ellipse'),'UNSUPPORTED_NATIVE_OBJECT'))
    case('graph incomplete native objects cannot import',lambda:graph_negative('complete',lambda g:g.update(complete=False),'INCOMPLETE_NATIVE_GRAPH'))
    case('graph explicit native diagnostics cannot import',lambda:graph_negative('diagnostic',lambda g:g.update(diagnostics=['unresolved master']),'INCOMPLETE_NATIVE_GRAPH'))
    case('graph absent actual DBU rejected',lambda:graph_negative('dbu',lambda g:g.update(dbu_um=0)))
    case('rotated text OASIS limitation blocks silent orientation loss',lambda:graph_negative('text',lambda g:figure(g,'source_text').update(rotation=90),'UNSUPPORTED_NATIVE_LABEL_TRANSFORM'))
    case('graph noninteger coordinate rejected',lambda:graph_negative('coordinate',lambda g:figure(g,'source_box').update(box=['0','0','1.5','10']),'INVALID_COORDINATE'))
    case('graph missing master rejected',lambda:graph_negative('master',lambda g:top(g)['instances'][0].update(cell='MISSING')))
    case('graph recursive master rejected',lambda:graph_negative('cycle',lambda g:top(g)['instances'][0].update(cell='TOP')))
    case('graph duplicate native source IDs rejected',lambda:graph_negative('id',lambda g:leaf(g)['shapes'][1].update(id=leaf(g)['shapes'][0]['id'])))
    case('graph unknown native layer purpose rejected',lambda:graph_negative('lpp',lambda g:leaf(g)['shapes'][0].update(layer={'name':'M1','purpose':'guess'}),'UNMAPPED_NATIVE_LAYER'))
    case('graph actual named LPP mapped with explicit operator stream map',named_map)
    case('graph excessive expanded array rejected',lambda:graph_negative('array',lambda g:top(g)['instances'][0]['array'].update(columns=100000,rows=2)))
    case('graph control characters in identity rejected',lambda:graph_negative('control',lambda g:leaf(g)['shapes'][0].update(net='bad\0name')))
    case('native wrong selected top cannot be silently read',wrong_top)
    case('native malformed reader header cannot be accepted',wrong_reader)
    case('byte-changed shipped query blocks direct DB adapter',changed_query)
    case('native source symlink rejected',symlink_source)
    case('unsupported real KLayout path ends stay nonimportable',path_ends)

def named_map():
    graph=copy.deepcopy(read['graph']);leaf(graph)['shapes'][0]['layer']={'name':'M1','purpose':'pin'};m=N.source_record(source['id'])['manifest'];m['layer_map']=[{'name':'M1','purpose':'pin','layer':68,'datatype':16}];l=N.graph_layout(graph,m);assert_(l.cell('LEAF').shapes(l.layer(68,16)).size()==1);return {'explicit_lpp':'M1 pin ->68/16'}
def wrong_top():
    original_fn=N.klayout_graph
    def wrong(m,cell):g=original_fn(m,cell);g['top_cell']='LEAF';return g
    N.klayout_graph=wrong
    try:r=rpc('read',source_id=source['id'],cell='TOP',command_id='wrong-top');assert_(r['error_code']=='NATIVE_CELL_MISMATCH' and not r['can_import']);return {'error_code':r['error_code']}
    finally:N.klayout_graph=original_fn
def wrong_reader():
    original_fn=N.klayout_graph
    def wrong(m,cell):g=original_fn(m,cell);g['reader']['api']='streamout-guess';return g
    N.klayout_graph=wrong
    try:r=rpc('read',source_id=source['id'],cell='TOP',command_id='wrong-reader');assert_(r['error_code']=='INVALID_NATIVE_QUERY' and not r['can_import']);return {'error_code':r['error_code']}
    finally:N.klayout_graph=original_fn
def changed_query():
    rec=N.source_record('missing_cadence');backend=N.C.record(rec['manifest']['backend_profile_id']);fake=RUN/'changed-reader.il';fake.write_text('Untrusted synthetic script; never executed.');backend['manifest']['runner']['resources']['site_script']=str(fake);N.C.save(backend);r=rpc('probe',source_id='missing_cadence');assert_(not r['available']);assert_(any('byte-identical' in v['message'] for v in r['checks']));return {'modified_query_unavailable':True}
def symlink_source():
    path=RUN/'linked.oas';path.symlink_to(source_path);return reject('UNSAFE_RESOURCE_PATH',lambda:rpc('register',manifest=manifest('linked',path)))
def path_ends():
    l=k.Layout();l.dbu=.001;c=l.create_cell('ENDS');c.shapes(l.layer(1,0)).insert(k.Path([k.Point(0,0),k.Point(100,100)],10,5,5,True));path=RUN/'path-ends.oas';l.write(str(path));rpc('register',manifest=manifest('ends',path));r=rpc('read',source_id='ends',cell='ENDS',command_id='ends-read');assert_(not r['can_import']);assert_(r['graph']['complete'] is False);return {'unsupported_exact_path_semantics_retained':True}

if __name__=='__main__':
    try:main()
    finally:
        report={'schema_version':1,'case_count':len(CASES),'passed':sum(v['result']=='pass' for v in CASES),'cases':CASES,'raw_folder':str(RUN),'vendor_execution_verified':False,'source_sha256':{n:S.profile.sha(S.WORKSPACE/n) for n in ['workers/eda/native_database.py','workers/eda/test_native_database.py','workers/eda/server.py','adapters/commercial/native-db/cadence-read.il','adapters/commercial/native-db/synopsys-read.tcl']}}
        (RUN/'evidence.json').write_text(json.dumps(report,indent=2,default=str));(RUN.parent/'native-database.json').write_text(json.dumps(report,indent=2,default=str));print(json.dumps({'cases':report['case_count'],'passed':report['passed'],'raw_folder':str(RUN)}))

