"""Versioned operator backends; commercial availability is never inferred from exit status."""
from __future__ import annotations
import base64, copy, hashlib, json, mimetypes, os, re, sys, time, urllib.request, urllib.parse, uuid
from pathlib import Path
from datetime import datetime, timezone
from geometry import EDAError

S=None;runner=None;reference_check=None;REMOTE_CANCEL={}
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):raise EDAError('UNSAFE_AGENT_REDIRECT','Agent redirects are forbidden; private credentials stay on the configured origin.')
def configure(server):
    global S,runner,reference_check
    S=server;sys.path.insert(0,str(S.WORKSPACE/'platform/commercial'))
    import runner as module
    from agent import safe_reference
    runner=module;reference_check=safe_reference
    S.DB.execute('CREATE TABLE IF NOT EXISTS backend_profiles(id TEXT PRIMARY KEY,data TEXT NOT NULL)');S.DB.commit()
def error(e):raise EDAError(getattr(e,'code','BACKEND_ERROR'),str(e))
def checked():return datetime.now(timezone.utc).isoformat()
def roots():return [S.WORKSPACE,Path('/foss'),Path('/opt'),Path('/usr'),Path('/tools')]
def record(pid):
    with S.LOCK:
        row=S.DB.execute('SELECT data FROM backend_profiles WHERE id=?',(pid,)).fetchone()
        if not row:raise EDAError('NOT_FOUND','Backend profile not found.')
        return json.loads(row[0])
def save(record):
    with S.LOCK:S.DB.execute('INSERT OR REPLACE INTO backend_profiles VALUES(?,?)',(record['manifest']['id'],json.dumps(record)));S.db_commit()
def catalog():
    path=S.WORKSPACE/'adapters/commercial/catalog.json'
    return {'tools':json.loads(path.read_text())['tools'],'profiles':list_profiles()}
def agent_manifest(manifest):
    if not isinstance(manifest,dict) or set(manifest)-{'schema_version','id','name','tool_id','version','runner'}:raise EDAError('INVALID_BACKEND_MANIFEST','Unknown manifest fields.')
    m=copy.deepcopy(manifest)
    if m.get('schema_version')!=1:raise EDAError('INVALID_BACKEND_MANIFEST','schema_version must be 1.')
    for name in ('id','tool_id'):runner.identifier(m.get(name))
    if m['tool_id'] not in runner.PROGRAMS:raise EDAError('UNSUPPORTED_BACKEND','Unknown native tool family.')
    if any(not isinstance(m.get(k),str) or not m[k].strip() or len(m[k])>160 for k in ('name','version')):raise EDAError('INVALID_BACKEND_MANIFEST','Name and version must be bounded text.')
    r=m.get('runner')
    if not isinstance(r,dict) or set(r)-{'kind','url','token_file','profile_id'} or r.get('kind')!='agent':raise EDAError('INVALID_BACKEND_MANIFEST','Unknown agent fields.')
    runner.identifier(r.get('profile_id'));url=r.get('url')
    if not isinstance(url,str) or len(url)>1024:raise EDAError('INVALID_BACKEND_MANIFEST','Bounded HTTPS agent URL required.')
    u=urllib.parse.urlsplit(url)
    if u.scheme not in ('http','https') or not u.hostname or u.username or u.password or u.query or u.fragment or u.path not in ('','/') or u.scheme=='http' and u.hostname not in ('127.0.0.1','localhost','::1','host.docker.internal'):raise EDAError('UNSAFE_AGENT_URL','Remote agents require HTTPS; HTTP is restricted to loopback or Docker host companion. Credentials/query/path in URL forbidden.')
    r['url']=url.rstrip('/');r['token_file']=str(runner.operator_path(r.get('token_file'),[S.WORKSPACE]))
    return m
def remote(m,method,params,timeout=10):
    r=m['runner'];p=Path(r['token_file'])
    if not p.is_file() or p.is_symlink() or p.stat().st_size>1024:raise EDAError('AGENT_UNAVAILABLE','Private operator token file unavailable.')
    if os.name!='nt' and p.stat().st_mode&0o077:raise EDAError('TOKEN_PERMISSION','Agent token file must have owner-only permissions.')
    token=p.read_text().strip()
    if not 32<=len(token)<=512:raise EDAError('AGENT_UNAVAILABLE','Private token file has invalid format.')
    req=urllib.request.Request(r['url']+'/rpc',data=runner.canonical({'method':method,'params':params}),headers={'Content-Type':'application/json','X-Register-Agent-Token':token},method='POST')
    try:
        with urllib.request.build_opener(NoRedirect).open(req,timeout=timeout) as response:
            data=response.read(24*1024*1024+1)
            if len(data)>24*1024*1024:raise EDAError('AGENT_PROTOCOL','Agent response exceeds byte bound.')
        result=json.loads(data)
        if not result.get('ok'):raise EDAError(result.get('error',{}).get('code','AGENT_ERROR'),result.get('error',{}).get('message','Agent operation failed.'))
        return result['result']
    except EDAError:raise
    except Exception:raise EDAError('AGENT_UNAVAILABLE','Authenticated agent transport is unavailable; credentials were not exported.')
def refresh(rec):
    m=rec['manifest']
    if m['runner']['kind']=='local':
        locked=runner.lock(m);public=runner.public(m,locked)
    else:
        remote_profile=remote(m,'profile.validate',{'profile_id':m['runner']['profile_id']})
        if remote_profile.get('tool_id')!=m['tool_id']:raise EDAError('AGENT_PROFILE_MISMATCH','Agent tool family does not match registered profile.')
        if not isinstance(remote_profile.get('fingerprint'),str) or not re.fullmatch(r'[a-f0-9]{64}',remote_profile['fingerprint']) or not isinstance(remote_profile.get('operations'),list) or set(remote_profile['operations'])-runner.OPERATIONS:raise EDAError('AGENT_PROTOCOL','Agent returned invalid profile evidence.')
        locked={'fingerprint':runner.digest({'manifest':m,'remote_fingerprint':remote_profile['fingerprint']}),'remote_fingerprint':remote_profile['fingerprint'],'files':{},'available':bool(remote_profile.get('available')),'checks':remote_profile.get('checks',[])}
        public={key:m[key] for key in ('id','name','tool_id','version')};public.update(runner='agent',operations=remote_profile['operations'],fingerprint=locked['fingerprint'],available=locked['available'],checks=locked['checks'],status=remote_profile.get('status','available-unverified'))
    rec.update(locked=locked,public=public,checked_at=checked());public['checked_at']=rec['checked_at'];return rec
def register(params):
    if set(params)!={'manifest'}:raise EDAError('INVALID_REQUEST','Registration accepts only an operator manifest.')
    try:
        raw=params['manifest'];m=agent_manifest(raw) if raw.get('runner',{}).get('kind')=='agent' else runner.normalize(raw,roots())
        with S.LOCK:row=S.DB.execute('SELECT data FROM backend_profiles WHERE id=?',(m['id'],)).fetchone()
        if row:
            old=json.loads(row[0])
            if old['manifest']!=m:raise EDAError('PROFILE_EXISTS','Backend profile IDs are immutable; register a new version ID.')
            return old['public']
        rec={'manifest':m}
        try:rec=refresh(rec)
        except EDAError as e:
            if m['runner']['kind']!='agent':raise
            locked={'fingerprint':runner.digest(m),'remote_fingerprint':None,'files':{},'available':False,'checks':[{'name':'agent','status':'fail','message':str(e)}]}
            rec.update(locked=locked,checked_at=checked(),public={key:m[key] for key in ('id','name','tool_id','version')});rec['public'].update(runner='agent',operations=[],fingerprint=locked['fingerprint'],available=False,checks=locked['checks'],status='unavailable',checked_at=rec['checked_at'])
        save(rec);return rec['public']
    except runner.RunnerError as e:error(e)
def list_profiles():
    with S.LOCK:return [json.loads(row[0])['public'] for row in S.DB.execute('SELECT data FROM backend_profiles ORDER BY rowid')]
def validate(params):
    try:
        rec=record(params['profile_id'])
        try:rec=refresh(rec);save(rec)
        except EDAError as e:
            p=copy.deepcopy(rec['public']);p.update(available=False,status='unavailable',checks=[{'name':'agent','status':'fail','message':str(e)}]);return {'valid':False,'profile':p,'checks':p['checks'],'fingerprint':p['fingerprint'],'checked_at':checked()}
        p=rec['public'];return {'valid':p['available'],'profile':p,'checks':p['checks'],'fingerprint':p['fingerprint'],'checked_at':rec['checked_at']}
    except runner.RunnerError as e:error(e)
def signature(pid):
    # Called under native SQLite LOCK: only local hashing / cached remote evidence, NEVER transport.
    try:
        rec=record(pid);m=rec['manifest']
        return runner.lock(m)['fingerprint'] if m['runner']['kind']=='local' else rec['locked']['fingerprint']
    except Exception:return None
def settings(raw,rec,p):
    if not isinstance(raw,dict) or set(raw)-{'profile_id','profile_hash','operation','top_cell','parameters','netlist_text'}:raise EDAError('INVALID_BACKEND_SETTINGS','Only typed backend settings are accepted.')
    s=copy.deepcopy(raw);operation=s.get('operation')
    if operation not in rec['public']['operations']:raise EDAError('UNSUPPORTED_OPERATION','Registered operator profile does not implement this operation.')
    runner.identifier(s.get('top_cell'))
    if S.load_layout(p).cell(s['top_cell']) is None:raise EDAError('TOP_CELL_NOT_FOUND','Selected cell does not exist in this native layout; external OA/NDM cells require a site exporter recipe.')
    if s.get('profile_hash') and s['profile_hash']!=rec['locked']['fingerprint']:raise EDAError('BACKEND_CHANGED','Validated backend fingerprint changed.')
    if rec['manifest']['runner']['kind']=='local':s['parameters']=runner.parameters(rec['manifest']['runner']['recipes'][operation],s.get('parameters',{}))
    elif not isinstance(s.get('parameters',{}),dict) or len(s.get('parameters',{}))>32 or any(not isinstance(v,(str,int,float,bool)) for v in s.get('parameters',{}).values()):raise EDAError('INVALID_BACKEND_PARAMETERS','Remote parameters must be bounded primitive data; agent enforces its operator schema.')
    if s.get('netlist_text') is not None:s['netlist_text']=reference_check(s['netlist_text'])
    if rec['manifest']['runner']['kind']=='agent':s['parameters']=remote(rec['manifest'],'profile.check_settings',{'profile_id':rec['manifest']['runner']['profile_id'],'settings':s})['parameters']
    s.update(profile_hash=rec['locked']['fingerprint'],backend_fingerprint=rec['locked']['fingerprint']);return s
def prepare(params,for_run=False):
    try:
        p=S.get_project(params['project_id']);raw=p.get('backend_setup') if for_run else params.get('settings')
        if not raw:raise EDAError('BACKEND_NOT_CONFIGURED','Save a backend setup before execution.')
        raw={key:value for key,value in raw.items() if key in {'profile_id','profile_hash','operation','top_cell','parameters','netlist_text'}}
        if for_run and params.get('operation') is not None:raw['operation']=params['operation']
        rec=refresh(record(raw.get('profile_id')));save(rec)
        if for_run and not rec['locked']['available']:raise EDAError('BACKEND_UNAVAILABLE','Licensed native executable or authenticated operator agent is unavailable; no vendor job was launched.')
        result=settings(raw,rec,p);return {'settings':result,'record':rec,'observed_revision':p['revision']}
    except runner.RunnerError as e:error(e)
def commit_configuration(params,prepared):
    p=S.get_project(params['project_id'])
    if p['revision']!=prepared['observed_revision']:raise EDAError('REVISION_CONFLICT','Project changed during backend validation.')
    setup=prepared['settings']
    if signature(setup['profile_id'])!=setup['backend_fingerprint']:raise EDAError('BACKEND_CHANGED','Operator profile changed before setup commit.')
    old=p['revision'];p.update(backend_setup=setup,active_backend='commercial',cell=setup['top_cell'],revision=p['next_revision'],next_revision=p['next_revision']+1,undo_stack=p.get('undo_stack',[])+[old],redo_stack=[])
    return S.commit(p,S.load_layout(S.history_project(p['id'],old)),old)
def start(params,prepared):
    p=S.get_project(params['project_id']);setup=prepared['settings'];rec=prepared['record']
    if p['revision']!=prepared['observed_revision']:raise EDAError('REVISION_CONFLICT','Project changed before backend job submission.')
    if signature(setup['profile_id'])!=setup['backend_fingerprint']:raise EDAError('BACKEND_CHANGED','Profile changed before job snapshot.')
    rid=uuid.uuid4().hex;folder=S.STATE/'runs'/rid;folder.mkdir(parents=True);l=S.load_layout(p)
    # Preserve original authoritative OAS; exchange is a separate actual KLayout export.
    inputs={'layout.oas':(S.snapshot_dir(p)/'layout.oas').read_bytes(),'project.json':runner.canonical({**p,'runs':[]}),'settings.json':runner.canonical({k:v for k,v in setup.items() if k!='backend_fingerprint'})}
    l.write(str(folder/'input.gds'));inputs['layout.gds']=(folder/'input.gds').read_bytes();(folder/'input.oas').write_bytes(inputs['layout.oas'])
    if setup.get('netlist_text'):inputs['reference.spice']=setup['netlist_text'].encode()
    if sum(map(len,inputs.values()))>runner.MAX_INPUT:raise EDAError('INPUT_TOO_LARGE','Backend immutable input export exceeds 32 MiB.')
    run={'id':rid,'project_id':p['id'],'kind':setup['operation'],'workflow':'commercial-backend','backend_profile_id':setup['profile_id'],'tool':rec['manifest']['tool_id'],'revision':p['revision'],'execution_status':'queued','analysis_result':'unknown','freshness':'current','artifacts':{},'manifest_path':str(folder/'manifest.json'),'input_signature':setup['backend_fingerprint']}
    S.put_run(run);S.POOL.submit(execute,run,p,setup,rec,inputs,folder);return run
def execute(run,p,setup,rec,inputs,folder):
    begin=time.monotonic();m=rec['manifest'];manifest={'schema_version':1,'workflow':'commercial-backend','run_id':run['id'],'project_id':p['id'],'revision':p['revision'],'backend_profile_id':m['id'],'tool_id':m['tool_id'],'version':m['version'],'runner':m['runner']['kind'],'input_signature':run['input_signature'],'settings':{key:value for key,value in setup.items() if key!='netlist_text'},'input_hashes':{n:hashlib.sha256(d).hexdigest() for n,d in inputs.items()},'verification':'open-source-calibration' if m['tool_id']=='ngspice' else 'unverified','commands':[]}
    with S.LOCK:
        if S.get_run(run['id'])['execution_status']=='canceled':S.dump(folder/'manifest.json',{**manifest,'execution_status':'canceled','analysis_result':'unknown','message':'Canceled while queued; no native launch.'});return
        run.update(execution_status='running',started_at=S.now());S.put_run(run)
    try:
        canceled=lambda:S.get_run(run['id'])['execution_status']=='canceled'
        if m['runner']['kind']=='local':
            def on_process(proc):
                with S.LOCK:
                    if proc is None:S.PROCESSES.pop(run['id'],None)
                    else:S.PROCESSES[run['id']]=proc
            result=runner.execute(m,setup,inputs,folder,run['input_signature'],canceled,on_process);outputs=result['outputs'];output_paths={role:value['path'] for role,value in outputs.items()};context=m['runner']['recipes'][setup['operation']]['result_context']
        else:
            fresh=refresh(rec)
            if fresh['locked']['fingerprint']!=run['input_signature']:raise EDAError('BACKEND_CHANGED','Remote profile changed before execution.')
            public_settings={key:value for key,value in setup.items() if key in {'profile_id','profile_hash','operation','top_cell','parameters','netlist_text'}}
            remote_run=remote(m,'job.submit',{'profile_id':m['runner']['profile_id'],'settings':public_settings,'input_package':runner.pack(inputs),'command_id':run['id'],'pinned_fingerprint':rec['locked']['remote_fingerprint']},30);run['remote_job_id']=remote_run['id'];S.put_run(run)
            while remote_run['execution_status'] in ('queued','running'):
                if canceled():remote(m,'job.cancel',{'job_id':remote_run['id']});raise EDAError('CANCELED','Remote job canceled.')
                if time.monotonic()-begin>3660:remote(m,'job.cancel',{'job_id':remote_run['id']});raise EDAError('TIMEOUT','Remote job exceeded transport wall budget.')
                time.sleep(.15);remote_run=remote(m,'job.status',{'job_id':remote_run['id']})
            result=remote_run;outputs=result.get('outputs',{});output_paths={};out=folder/'outputs';out.mkdir(exist_ok=True)
            for role,value in outputs.items():
                if role not in {'summary','waves','currents','rc','exchange','netlist'}:raise EDAError('AGENT_PROTOCOL','Unknown returned output role.')
                data=remote(m,'job.artifact',{'job_id':remote_run['id'],'key':role},30);name=runner.relative(value['path']);payload=base64.b64decode(data['base64'],validate=True)
                if len(payload)>runner.MAX_ARTIFACT or hashlib.sha256(payload).hexdigest()!=value['sha256']:raise EDAError('ARTIFACT_CHANGED','Remote artifact content differs from pinned hash.')
                dest=out/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(payload);output_paths[role]=name
            logs=remote(m,'job.artifact',{'job_id':remote_run['id'],'key':'stdout'});(folder/'stdout.log').write_bytes(base64.b64decode(logs['base64'],validate=True));context=result.get('result_context',{})
            manifest['remote_job_id']=remote_run['id']
            # Fresh remote validation happens here, outside all native DB locks.
            final=refresh(rec);save(final)
            if final['locked']['fingerprint']!=run['input_signature']:raise EDAError('BACKEND_CHANGED','Remote resources changed during execution.')
        manifest['execution']=result
        for role,name in output_paths.items():run['artifacts'][role]=str(folder/'outputs'/name)
        run['artifacts']['stdout']=str(folder/'stdout.log')
        if result.get('error_code'):raise EDAError(result['error_code'],'Native backend execution did not complete successfully; redacted logs retained.')
        from commercial_results import parse_results
        origin=result.get('input_origin','operator-recipe');geometry_binding=False
        context={**context,'project_id':p['id'],'revision':p['revision'],'run_id':run['id'],'tool_id':m['tool_id'],'backend_profile_id':m['id'],'input_origin':origin,'geometry_binding':geometry_binding,'geometry_linkage':'unverified','execution_status':'completed','execution_log':(folder/'stdout.log').read_text(errors='replace')}
        if geometry_binding:context['layout_sha256']=manifest['input_hashes']['layout.oas']
        manifest['input_origin']=origin;manifest['geometry_binding']=geometry_binding
        binary_exchange=output_paths.get('exchange') and Path(output_paths['exchange']).suffix.lower() in ('.gds','.oas')
        parsed=parse_results(setup['operation'],folder/'outputs',{key:value for key,value in output_paths.items() if key!='netlist' and not (key=='exchange' and binary_exchange)},context)
        if binary_exchange:
            layout=S.k.Layout();layout.read(str(folder/'outputs'/output_paths['exchange']));tops=list(layout.top_cells())
            if not tops:raise EDAError('INVALID_EXCHANGE','Native GDS/OAS output contains no top cells.')
            manifest['layout_exchange']={'format':Path(output_paths['exchange']).suffix[1:],'top_cells':[cell.name for cell in tops],'sha256':runner.sha(folder/'outputs'/output_paths['exchange']),'origin':origin,'authoritative_imported':False,'physical_signoff_verified':False}
            if setup['operation']=='layout_export':parsed.update(analysis_result='pass',message='Actual GDSII/OASIS output decoded by KLayout. Vendor/database compatibility and signoff remain unverified; explicit import is required.')
        if setup['operation']=='netlist_export' and output_paths.get('netlist'):
            text=(folder/'outputs'/output_paths['netlist']).read_text();reference_check(text)
            if not re.search(r'(?im)^\s*\.subckt\s+\S+',text):raise EDAError('UNSUPPORTED_FORMAT','Native netlist export has no supported explicit SPICE subcircuit; raw artifact retained.')
            parsed.update(analysis_result='pass',message='Actual native SPICE subcircuit export validated as data-only text; no LVS or model correctness inferred.')
        for key in ('analysis_result','message','waveforms','measurements','parasitics','current_flow','parser_provenance'):
            if key in parsed:run[key]=parsed[key]
        if parsed.get('analysis_result') not in ('pass','fail','unknown','unsupported'):raise EDAError('PARSER_FAILED','Result adapter returned unsupported result state.')
        manifest['parser_provenance']=parsed.get('parser_provenance');run['execution_status']='completed'
    except Exception as e:
        run.update(execution_status='canceled' if getattr(e,'code','')=='CANCELED' else 'failed',analysis_result='unknown',message=str(e));manifest['error']={'code':getattr(e,'code','BACKEND_ERROR'),'message':str(e)}
    run.update(ended_at=S.now(),elapsed_s=time.monotonic()-begin)
    if (folder/'stdout.log').is_file():run['artifacts']['stdout']=str(folder/'stdout.log')
    with S.LOCK:
        if S.get_run(run['id'])['execution_status']=='canceled':run.update(execution_status='canceled',analysis_result='unknown')
        if run['execution_status'] in ('failed','canceled'):run.pop('current_flow',None)
        manifest.update(execution_status=run['execution_status'],analysis_result=run['analysis_result'],ended_at=run['ended_at']);S.dump(folder/'manifest.json',manifest);S.put_run(run)
def artifact(params):
    run=S.get_run(params['run_id'])
    if run.get('workflow')!='commercial-backend':raise EDAError('NOT_FOUND','Artifact is not a commercial-backend job output.')
    key=params.get('key');path=run.get('artifacts',{}).get(key)
    if key not in {'summary','waves','currents','rc','exchange','netlist','stdout'} or not path:raise EDAError('NOT_FOUND','Only declared native output artifacts can be read.')
    p=Path(path);folder=S.STATE/'runs'/run['id']
    if not p.is_file() or p.is_symlink() or not p.resolve().is_relative_to(folder.resolve()) or p.stat().st_size>runner.MAX_ARTIFACT:raise EDAError('UNSAFE_ARTIFACT_PATH','Bounded immutable artifact is unavailable.')
    if key!='stdout':
        manifest=json.loads((folder/'manifest.json').read_text());expected=manifest.get('execution',{}).get('outputs',{}).get(key,{}).get('sha256')
        if expected!=runner.sha(p):raise EDAError('ARTIFACT_CHANGED','Immutable native artifact changed.')
    return {'name':p.name,'base64':base64.b64encode(p.read_bytes()).decode(),'mime':'application/octet-stream' if key=='exchange' else mimetypes.guess_type(p.name)[0] or 'text/plain'}
def import_output(params):
    p=S.get_project(params['project_id']);run=S.get_run(params['run_id'])
    if run['project_id']!=p['id'] or run['revision']!=p['revision'] or run['freshness']!='current':raise EDAError('REVISION_CONFLICT','Explicit layout import requires a current run from this exact project revision.')
    if run['execution_status']!='completed' or params.get('key')!='exchange':raise EDAError('UNSUPPORTED_ARTIFACT','Only a completed actual GDS/OAS exchange output can be imported.')
    artifact(params);path=Path(run['artifacts']['exchange'])
    if path.suffix.lower() not in ('.gds','.oas'):raise EDAError('UNSUPPORTED_FORMAT','OA/Milkyway/NDM require vendor native export; only actual GDSII/OASIS can be imported.')
    return S.import_layout({'project_id':p['id'],'path':str(path),**({'top_cell':params['top_cell']} if params.get('top_cell') else {})})
def rpc(method,params):
    if method=='backend.catalog':return catalog()
    if method=='backend.list_profiles':return list_profiles()
    if method=='backend.register':return register(params)
    if method=='backend.validate':return validate(params)
    if method in ('backend.configure','backend.run'):
        replay=S.completed_receipt(method,params)
        if replay is not None:return replay
        prepared=prepare(params,method=='backend.run')
        return S.mutate(method,params,lambda:commit_configuration(params,prepared) if method=='backend.configure' else start(params,prepared))
    if method=='backend.read_artifact':return artifact(params)
    if method=='backend.import_layout':return S.mutate(method,params,lambda:import_output(params))
    raise EDAError('UNSUPPORTED','Unsupported backend method.')
