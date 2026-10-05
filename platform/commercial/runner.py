"""Operator-owned recipe runner. Pure stdlib; no command text or environment values on the wire."""
from __future__ import annotations
import base64, copy, hashlib, io, json, math, os, re, signal, stat, subprocess, threading, time, zipfile
from pathlib import Path

OPERATIONS={'simulation','drc','lvs','pex','layout_export','netlist_export','implementation'}
PROGRAMS={'virtuoso':{'virtuoso','icfb','strmout'},'spectre':{'spectre'},'assura':{'assura'},'pegasus':{'pegasus'},'quantus':{'qrc','quantus'},'custom_compiler':{'custom_compiler'},'primesim':{'primesim','xa','spice'},'hspice':{'hspice'},'icv':{'icv'},'starrc':{'StarXtract','StarXtract64','starrc'},'icc':{'icc_shell'},'icc2':{'icc2_shell'},'fusion_compiler':{'fc_shell'},'calibre_drc':{'calibre'},'calibre_lvs':{'calibre'},'calibre_xact':{'calibre'},'innovus':{'innovus'},'ngspice':{'ngspice'}}
MAX_INPUT=32*1024*1024; MAX_ARTIFACT=16*1024*1024; MAX_RESOURCE_BYTES=256*1024*1024; MAX_RESOURCE_FILES=4096
IDENT=re.compile(r'[A-Za-z_][A-Za-z0-9_.:-]{0,127}')
PLACE=re.compile(r'\{([^{}]+)\}')
SYSTEM_ENV={'PATH','HOME','USER','LOGNAME','LANG','LC_ALL','TMP','TEMP','TMPDIR','SYSTEMROOT','WINDIR','COMSPEC','PATHEXT','LD_LIBRARY_PATH','PYTHONPATH'}
HASH_CACHE={};HASH_LOCK=threading.RLock()

class RunnerError(Exception):
    def __init__(self,code,message): self.code=code; super().__init__(message)
def fail(code,message):raise RunnerError(code,message)
def canonical(v):return json.dumps(v,sort_keys=True,separators=(',',':'),allow_nan=False).encode()
def digest(v):return hashlib.sha256(canonical(v)).hexdigest()
def resource_lock(path):
    p=Path(path)
    if p.is_symlink():fail('UNSAFE_RESOURCE_PATH','Opaque library snapshots cannot contain symlinks.')
    if p.is_file():
        if p.stat().st_size>MAX_RESOURCE_BYTES:fail('RESOURCE_TOO_LARGE','Resource snapshot exceeds 256 MiB.')
        return {'kind':'file','sha256':sha(p),'size_bytes':p.stat().st_size,'files':1}
    if not p.is_dir():return None
    entries={};total=0;count=0;pending=[p]
    while pending:
        directory=pending.pop()
        with os.scandir(directory) as scan:
            for entry in scan:
                count+=1
                if count>MAX_RESOURCE_FILES:fail('RESOURCE_TOO_LARGE','Opaque library snapshot is bounded to 4096 directory entries.')
                child=Path(entry.path)
                if entry.is_symlink() or not (entry.is_dir(follow_symlinks=False) or entry.is_file(follow_symlinks=False)):fail('UNSAFE_RESOURCE_PATH','Opaque library requires regular files and directories only.')
                if entry.is_dir(follow_symlinks=False):pending.append(child)
                else:
                    rel=relative(child.relative_to(p).as_posix());total+=entry.stat(follow_symlinks=False).st_size
                    if total>MAX_RESOURCE_BYTES:fail('RESOURCE_TOO_LARGE','Opaque library snapshot is bounded to 256 MiB.')
                    entries[rel]=sha(child)
    return {'kind':'opaque-directory','sha256':digest(entries),'size_bytes':total,'files':len(entries)}
def sha(p):
    p=Path(p);info=p.stat();stamp=(info.st_size,info.st_mtime_ns,info.st_ctime_ns)
    with HASH_LOCK:
        old=HASH_CACHE.get(str(p))
        if old and old[0]==stamp:return old[1]
    h=hashlib.sha256()
    with p.open('rb') as f:
        for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
    value=h.hexdigest()
    with HASH_LOCK:HASH_CACHE[str(p)]=(stamp,value)
    return value
def identifier(v):
    if not isinstance(v,str) or not IDENT.fullmatch(v):fail('INVALID_BACKEND_MANIFEST','Expected a bounded identifier.')
    return v
def relative(v):
    if not isinstance(v,str) or not v or len(v)>240 or any(c in v for c in '\\:{}[];$`\"\'\x00\n\r') or v.startswith('/') or any(x in ('','..','.') for x in v.split('/')):fail('UNSAFE_ARTIFACT_PATH','Expected a confined relative path.')
    return v
def operator_path(v,roots,allow_symlink=False):
    if not isinstance(v,str) or len(v)>1024 or any(ord(c)<32 for c in v) or any(c in v for c in '{}[];$`\"\''):fail('UNSAFE_RESOURCE_PATH','Resource paths must be literal absolute paths.')
    p=Path(v)
    if not p.is_absolute():fail('UNSAFE_RESOURCE_PATH','Operator resource paths must be absolute.')
    if p.is_symlink() and not allow_symlink:fail('UNSAFE_RESOURCE_PATH','Operator resource/token symlinks are unsupported.')
    p=p.resolve()
    if not any(p.is_relative_to(Path(root).resolve()) for root in roots):fail('UNSAFE_RESOURCE_PATH','Path is outside operator-approved roots.')
    return p
def normalize(manifest,roots):
    if not isinstance(manifest,dict) or set(manifest)-{'schema_version','id','name','tool_id','version','runner'}:fail('INVALID_BACKEND_MANIFEST','Unknown manifest fields.')
    if manifest.get('schema_version')!=1:fail('INVALID_BACKEND_MANIFEST','schema_version must be 1.')
    m=copy.deepcopy(manifest)
    for key in ('id','tool_id'):identifier(m.get(key))
    if m['tool_id'] not in PROGRAMS:fail('UNSUPPORTED_BACKEND','Tool is not in the supported catalogue.')
    for key in ('name','version'):
        if not isinstance(m.get(key),str) or not m[key].strip() or len(m[key])>160:fail('INVALID_BACKEND_MANIFEST','Name and version are required bounded text.')
    r=m.get('runner')
    if not isinstance(r,dict) or r.get('kind')!='local':fail('INVALID_BACKEND_MANIFEST','This host executes only operator-owned local recipes.')
    if set(r)-{'kind','executable','env_names','resources','recipes'}:fail('INVALID_BACKEND_MANIFEST','Unknown local runner fields.')
    executable=operator_path(r.get('executable'),roots,allow_symlink=True)
    if executable.name.removesuffix('.exe') not in PROGRAMS[m['tool_id']]:fail('UNSUPPORTED_EXECUTABLE','Executable basename must match the selected native tool; shells/interpreters are forbidden.')
    r['executable']=str(executable)
    env=r.get('env_names',[])
    if not isinstance(env,list) or len(env)>32 or any(not isinstance(v,str) or not re.fullmatch(r'[A-Z_][A-Z0-9_]{0,79}',v) for v in env):fail('INVALID_BACKEND_MANIFEST','env_names must name environment variables, never values.')
    r['env_names']=sorted(set(env));res=r.get('resources',{})
    if not isinstance(res,dict) or len(res)>128:fail('INVALID_BACKEND_MANIFEST','At most 128 operator resources are supported.')
    r['resources']={identifier(key):str(operator_path(value,roots)) for key,value in res.items()}
    recipes=r.get('recipes')
    if not isinstance(recipes,dict) or not recipes or set(recipes)-OPERATIONS:fail('INVALID_BACKEND_MANIFEST','At least one supported operation recipe is required.')
    for operation,recipe in recipes.items():
        if not isinstance(recipe,dict) or set(recipe)-{'argv','outputs','timeout_s','parameters','result_context','requires_netlist'}:fail('INVALID_BACKEND_MANIFEST','Unknown recipe fields.')
        timeout=recipe.get('timeout_s',600)
        if isinstance(timeout,bool) or not isinstance(timeout,int) or not 1<=timeout<=3600:fail('INVALID_BACKEND_MANIFEST','timeout_s must be 1..3600.')
        recipe['timeout_s']=timeout;schemas=recipe.setdefault('parameters',{})
        if not isinstance(schemas,dict) or len(schemas)>32:fail('INVALID_BACKEND_MANIFEST','Parameter schema is bounded to 32 fields.')
        for key,schema in schemas.items():
            identifier(key)
            if not isinstance(schema,dict) or set(schema)-{'type','min','max','enum','default'} or schema.get('type') not in ('number','boolean','string'):fail('INVALID_BACKEND_MANIFEST','Parameters need primitive typed constraints.')
            if schema['type']=='string' and (not isinstance(schema.get('enum'),list) or not schema['enum'] or any(not isinstance(v,str) or not re.fullmatch(r'[A-Za-z0-9_.:-]{1,80}',v) for v in schema['enum'])):fail('INVALID_BACKEND_MANIFEST','String parameters require an explicit safe-token enum.')
            for bound in ('min','max'):
                if bound in schema and (isinstance(schema[bound],bool) or not isinstance(schema[bound],(int,float)) or not math.isfinite(schema[bound])):fail('INVALID_BACKEND_MANIFEST','Numeric bounds must be finite.')
        argv=recipe.get('argv')
        if not isinstance(argv,list) or not argv or len(argv)>128:fail('INVALID_BACKEND_MANIFEST','Recipe argv is a bounded argument array without executable.')
        allowed={'input.gds','input.oas','input.project','input.settings','input.netlist','input.bindings_tcl','input.bindings_il','input.site_tcl','input.site_il','input.calibre_svrf','output_dir','top_cell'}|{'resource.'+key for key in res}|{'parameter.'+key for key in schemas}
        for arg in argv:
            if not isinstance(arg,str) or len(arg)>2048 or any(ord(c)<32 for c in arg):fail('INVALID_BACKEND_MANIFEST','Each argv argument is a bounded literal.')
            if any(key not in allowed for key in PLACE.findall(arg)) or '{' in PLACE.sub('',arg) or '}' in PLACE.sub('',arg):fail('INVALID_BACKEND_MANIFEST','Unknown recipe placeholder.')
        outputs=recipe.setdefault('outputs',{})
        if not isinstance(outputs,dict) or set(outputs)-{'summary','waves','currents','rc','exchange','netlist'}:fail('INVALID_BACKEND_MANIFEST','Unsupported output roles.')
        recipe['outputs']={key:relative(value) for key,value in outputs.items()}
        context=recipe.setdefault('result_context',{})
        if not isinstance(context,dict) or len(canonical(context))>32768:fail('INVALID_BACKEND_MANIFEST','Result parser context must be bounded JSON.')
        if 'requires_netlist' in recipe and not isinstance(recipe['requires_netlist'],bool):fail('INVALID_BACKEND_MANIFEST','requires_netlist is boolean.')
    return m
def parameters(recipe,values):
    if not isinstance(values,dict) or set(values)-set(recipe['parameters']):fail('INVALID_BACKEND_PARAMETERS','Unknown parameter names.')
    out={}
    for key,schema in recipe['parameters'].items():
        value=values.get(key,schema.get('default'))
        if value is None:fail('INVALID_BACKEND_PARAMETERS','Missing required parameter: '+key)
        kind=schema['type']
        valid=(isinstance(value,bool) if kind=='boolean' else isinstance(value,(int,float)) and not isinstance(value,bool) and math.isfinite(value) if kind=='number' else isinstance(value,str) and value in schema['enum'])
        if not valid or kind=='number' and (value<schema.get('min',-1e100) or value>schema.get('max',1e100)) or 'enum' in schema and value not in schema['enum']:fail('INVALID_BACKEND_PARAMETERS','Parameter violates its operator schema: '+key)
        out[key]=value
    return out
def lock(manifest):
    r=manifest['runner'];files={};resource_evidence={};checks=[];available=True;total=0
    for key,path in {'executable':r['executable'],**{'resource.'+k:v for k,v in r['resources'].items()}}.items():
        p=Path(path)
        try:evidence=resource_lock(p)
        except RunnerError as e:evidence=None;checks.append({'name':key,'status':'fail','message':str(e)})
        if evidence is None or key=='executable' and evidence['kind']!='file':available=False;files[key]=None;checks.append({'name':key,'status':'fail','message':'Operator resource is unavailable or outside snapshot bounds.'})
        else:
            files[key]=evidence['sha256'];resource_evidence[key]=evidence
            if key!='executable':total+=evidence['size_bytes']
            checks.append({'name':key,'status':'pass','message':'Opaque directory tree SHA-256 recorded; proprietary database decoding is unsupported.' if evidence['kind']=='opaque-directory' else 'Regular resource SHA-256 recorded.'})
    if total>MAX_RESOURCE_BYTES:available=False;checks.append({'name':'resource-total','status':'fail','message':'Aggregate resource snapshots exceed 256 MiB.'})
    if available and os.name!='nt' and not os.access(r['executable'],os.X_OK):available=False;checks.append({'name':'executable-permission','status':'fail','message':'Native executable is not executable by this operator.'})
    checks.append({'name':'license','status':'warning','message':'License availability and site flow have not been verified by a vendor execution.'})
    return {'fingerprint':digest({'manifest':manifest,'files':files}),'files':files,'resource_evidence':resource_evidence,'available':available,'checks':checks}
def public(manifest,locked):
    return {'id':manifest['id'],'name':manifest['name'],'tool_id':manifest['tool_id'],'version':manifest['version'],'runner':'local','operations':list(manifest['runner']['recipes']),'fingerprint':locked['fingerprint'],'available':locked['available'],'checks':locked['checks'],'status':'available-unverified' if locked['available'] else 'unavailable'}
def scrub(text,env_names):
    for name in env_names:
        value=os.environ.get(name)
        if value:text=text.replace(value,'[REDACTED_ENV:'+name+']')
    text=re.sub(r'(?i)((?:LM_LICENSE_FILE|CDS_LIC_FILE|SNPSLMD_LICENSE_FILE|MGLS_LICENSE_FILE|license[_ ](?:server|file)|token|password|secret)\s*[:=]\s*)\S+',r'\1[REDACTED]',text)
    return text
def write_redacted_stream(stream,destination,env_names):
    """Never persist a partial sensitive line; overlong native lines are explicitly discarded."""
    partial=b'';discarding=False;written=0;truncated=False
    with Path(destination).open('w',encoding='utf-8',newline='\n') as f:
        def emit(safe):
            nonlocal written,truncated
            size=len(safe.encode('utf-8'))
            if truncated:return
            if written+size>4*1024*1024:
                f.write('[NATIVE_LOG_TRUNCATED]\n');f.flush();truncated=True;return
            f.write(safe);f.flush();written+=size
        while True:
            chunk=stream.read1(65536) if hasattr(stream,'read1') else stream.read(65536)
            if not chunk:break
            parts=chunk.split(b'\n')
            for index,part in enumerate(parts):
                final=index<len(parts)-1
                if not discarding:
                    partial+=part
                    if len(partial)>65536:
                        partial=b'';discarding=True
                        emit('[OVERLONG_NATIVE_LINE_DISCARDED_FOR_REDACTION]\n')
                if final:
                    if not discarding:emit(scrub(partial.decode('utf-8',errors='replace'),env_names)+'\n')
                    partial=b'';discarding=False
        if partial and not discarding:emit(scrub(partial.decode('utf-8',errors='replace'),env_names))
def terminated(proc):
    if proc.poll() is not None:return
    if os.name=='nt':
        subprocess.run(['taskkill','/PID',str(proc.pid),'/T','/F'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=10)
    else:
        try:os.killpg(proc.pid,signal.SIGKILL)
        except ProcessLookupError:pass
    proc.wait(timeout=10)
def process_identity(pid):
    """Stable creation identity prevents a restarted agent from killing a reused PID."""
    try:
        if os.name=='nt':
            import ctypes
            from ctypes import wintypes
            api=ctypes.WinDLL('kernel32',use_last_error=True);api.OpenProcess.argtypes=[wintypes.DWORD,wintypes.BOOL,wintypes.DWORD];api.OpenProcess.restype=wintypes.HANDLE;api.GetProcessTimes.argtypes=[wintypes.HANDLE]+[ctypes.POINTER(wintypes.FILETIME)]*4;api.GetProcessTimes.restype=wintypes.BOOL;api.CloseHandle.argtypes=[wintypes.HANDLE]
            handle=api.OpenProcess(0x1000,False,int(pid))
            if not handle:return None
            values=[wintypes.FILETIME() for _ in range(4)]
            try:
                if not api.GetProcessTimes(handle,*[ctypes.byref(v) for v in values]):return None
                return str((values[0].dwHighDateTime<<32)|values[0].dwLowDateTime)
            finally:api.CloseHandle(handle)
        text=Path('/proc')/str(int(pid))/'stat';return text.read_text().rsplit(')',1)[1].split()[19]
    except (OSError,ValueError,IndexError):return None
def stop_interrupted(pid,identity):
    if not identity or process_identity(pid)!=identity:return False
    if os.name=='nt':subprocess.run(['taskkill','/PID',str(int(pid)),'/T','/F'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=10)
    else:
        try:os.killpg(int(pid),signal.SIGKILL)
        except ProcessLookupError:pass
    return True
def execute(manifest,settings,inputs,folder,pinned,canceled=lambda:False,on_process=lambda p:None):
    """Immutable resource copies, bounded outputs and no shell; return execution evidence only."""
    locked=lock(manifest)
    if locked['fingerprint']!=pinned:fail('BACKEND_CHANGED','Operator resources changed after configuration/submission.')
    if not locked['available']:fail('BACKEND_UNAVAILABLE','Native executable or required operator resources are unavailable.')
    operation=settings['operation'];recipe=manifest['runner']['recipes'].get(operation)
    if recipe is None:fail('UNSUPPORTED_OPERATION','Operator profile has no recipe for this operation.')
    values=parameters(recipe,settings.get('parameters',{}));top=identifier(settings['top_cell'])
    if canceled():fail('CANCELED','Canceled before native launch.')
    folder=Path(folder).resolve()
    if any(c in str(folder) for c in '{}[];$`\"\'') or any(ord(c)<32 for c in str(folder)):fail('UNSAFE_STATE_PATH','Generated Tcl/SKILL bindings require a literal safe operator state path.')
    folder.mkdir(parents=True,exist_ok=True);incoming=folder/'inputs';incoming.mkdir(exist_ok=True);out=folder/'outputs';out.mkdir(exist_ok=True);resource=folder/'resources';resource.mkdir(exist_ok=True)
    substitutions={'top_cell':top,'output_dir':str(out.resolve())};input_hashes={}
    for name,data in inputs.items():
        if name not in {'layout.gds','layout.oas','project.json','settings.json','reference.spice'}:fail('INVALID_INPUT','Unknown input file.')
        if not isinstance(data,bytes) or len(data)>MAX_INPUT:fail('INPUT_TOO_LARGE','Input exceeds bounded byte limit.')
        (incoming/name).write_bytes(data);input_hashes[name]=hashlib.sha256(data).hexdigest()
    for key,name in {'gds':'layout.gds','oas':'layout.oas','project':'project.json','settings':'settings.json','netlist':'reference.spice'}.items():substitutions['input.'+key]=str((incoming/name).resolve())
    if recipe.get('requires_netlist') or any('{input.netlist}' in arg for arg in recipe['argv']):
        if not inputs.get('reference.spice'):fail('MISSING_REFERENCE','This operation needs an explicit electrical reference; GDS geometry is not a netlist.')
    for key,path in manifest['runner']['resources'].items():
        original=Path(path);dest=resource/(key+'-'+original.name)
        if original.is_dir():
            import shutil
            if dest.exists():fail('IMMUTABLE_INPUT','Resource snapshot path already exists.')
            shutil.copytree(original,dest,symlinks=False)
        else:dest.write_bytes(original.read_bytes())
        if resource_lock(dest)['sha256']!=locked['files']['resource.'+key]:fail('BACKEND_CHANGED','Resource changed while snapshotting.')
        substitutions['resource.'+key]=str(dest.resolve())
    for key,value in values.items():substitutions['parameter.'+key]=str(value).lower() if isinstance(value,bool) else str(value)
    # Fixed bindings carry data into operator Tcl/SKILL scripts; client strings are never script fragments.
    substitutions['input.bindings_tcl']=str((incoming/'bindings.tcl').resolve());substitutions['input.bindings_il']=str((incoming/'bindings.il').resolve())
    bindings={re.sub(r'[^A-Za-z0-9_]','_',key):value for key,value in substitutions.items()}
    (incoming/'bindings.tcl').write_text('\n'.join('set REGISTER_'+key+' {'+value.replace('\\','/')+'}' for key,value in bindings.items())+'\n')
    (incoming/'bindings.il').write_text('\n'.join('REGISTER_'+key+' = '+json.dumps(value.replace('\\','/')) for key,value in bindings.items())+'\n')
    for key,name in [('site_tcl','site-entry.tcl'),('site_il','site-entry.il'),('calibre_svrf','layout-input.svrf')]:substitutions['input.'+key]=str((incoming/name).resolve())
    if 'site_script' in manifest['runner']['resources']:
        site=substitutions['resource.site_script'].replace('\\','/')
        (incoming/'site-entry.tcl').write_text('source {'+substitutions['input.bindings_tcl'].replace('\\','/')+'}\nsource {'+site+'}\nexit\n')
        (incoming/'site-entry.il').write_text('load('+json.dumps(substitutions['input.bindings_il'].replace('\\','/'))+')\nload('+json.dumps(site)+')\nexit()\n')
    if 'deck' in manifest['runner']['resources'] and manifest['tool_id'].startswith('calibre_'):
        lines=['LAYOUT PATH '+json.dumps(substitutions['input.gds'].replace('\\','/')),'LAYOUT PRIMARY '+top,'LAYOUT SYSTEM GDSII']
        if operation=='drc':lines+=['DRC RESULTS DATABASE "drc-results.db"','DRC SUMMARY REPORT "drc-summary.txt"']
        elif operation=='lvs':lines+=['SOURCE PATH '+json.dumps(substitutions['input.netlist'].replace('\\','/')),'SOURCE PRIMARY '+top,'SOURCE SYSTEM SPICE','LVS REPORT "lvs-summary.txt"']
        lines+=['INCLUDE '+json.dumps(substitutions['resource.deck'].replace('\\','/'))];(incoming/'layout-input.svrf').write_text('\n'.join(lines)+'\n')
    argv=[manifest['runner']['executable']]+[PLACE.sub(lambda m:substitutions[m.group(1)],arg) for arg in recipe['argv']]
    env={name:value for name,value in os.environ.items() if name in SYSTEM_ENV or name in manifest['runner']['env_names']}
    begin=time.monotonic();flags={'creationflags':subprocess.CREATE_NEW_PROCESS_GROUP} if os.name=='nt' else {'start_new_session':True}
    proc=subprocess.Popen(argv,cwd=out,env=env,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,shell=False,**flags);on_process(proc)
    # Stream through a redactor before persistence. Limit disk logs; still drain native stdout.
    log=folder/'stdout.log'
    def drain():
        write_redacted_stream(proc.stdout,log,manifest['runner']['env_names'])
    thread=threading.Thread(target=drain,daemon=True);thread.start();reason=None
    try:
        while proc.poll() is None:
            if canceled():reason='CANCELED';terminated(proc);break
            if time.monotonic()-begin>recipe['timeout_s']:reason='TIMEOUT';terminated(proc);break
            time.sleep(.05)
    finally:
        if proc.poll() is None:terminated(proc)
        thread.join(timeout=3);on_process(None)
    result={'exit_code':proc.returncode,'elapsed_s':time.monotonic()-begin,'input_hashes':input_hashes,'resource_hashes':locked['files'],'resource_evidence':locked['resource_evidence'],'input_origin':'external-native-database' if any(v['kind']=='opaque-directory' for v in locked['resource_evidence'].values()) else 'operator-recipe','fingerprint':pinned,'outputs':{},'logs_redacted':True,'stdout_sha256':sha(log),'shell':False}
    private_hashes=set(locked['files'].values())
    for copied in resource.rglob('*'):
        if copied.is_file():private_hashes.add(sha(copied))
    for role,name in recipe['outputs'].items():
        path=out/name
        if path.is_symlink() or not path.resolve().is_relative_to(out.resolve()):fail('UNSAFE_ARTIFACT_PATH','Native output is not a confined regular file.')
        if path.is_file():
            if path.stat().st_size>MAX_ARTIFACT:fail('ARTIFACT_TOO_LARGE','Declared native artifact exceeds 16 MiB.')
            if sha(path) in private_hashes:fail('PRIVATE_RESOURCE_OUTPUT','Native output is an exact copy of a private executable/site resource; it cannot be exported as a result.')
            original_data=path.read_bytes()
            if any(os.environ.get(name) and os.environ[name].encode() in original_data for name in manifest['runner']['env_names']):
                try:original_data.decode('utf-8')
                except UnicodeDecodeError:fail('SENSITIVE_BINARY_OUTPUT','Opaque output contains a private environment value and cannot be exported.')
            if path.suffix.lower() not in {'.gds','.oas','.oasis'}:
                data=path.read_bytes()
                try:path.write_text(scrub(data.decode('utf-8'),manifest['runner']['env_names']),encoding='utf-8')
                except UnicodeDecodeError:pass
            result['outputs'][role]={'path':name,'sha256':sha(path),'size_bytes':path.stat().st_size}
    if reason:result['error_code']=reason
    elif proc.returncode:result['error_code']='ENGINE_EXIT'
    if lock(manifest)['fingerprint']!=pinned:result['error_code']='BACKEND_CHANGED'
    for key,path in manifest['runner']['resources'].items():
        if resource_lock(resource/(key+'-'+Path(path).name))['sha256']!=locked['files']['resource.'+key]:result['error_code']='IMMUTABLE_INPUT_CHANGED'
    return result
def pack(inputs):
    b=io.BytesIO()
    with zipfile.ZipFile(b,'w',zipfile.ZIP_DEFLATED) as z:
        for name,data in sorted(inputs.items()):
            info=zipfile.ZipInfo(name,(2025,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,data)
    if len(b.getvalue())>MAX_INPUT:fail('INPUT_TOO_LARGE','Input package exceeds 32 MiB.')
    return base64.b64encode(b.getvalue()).decode()
def unpack(encoded):
    try:data=base64.b64decode(encoded,validate=True)
    except Exception:fail('INVALID_INPUT','Malformed input package.')
    if len(data)>MAX_INPUT:fail('INPUT_TOO_LARGE','Input package exceeds 32 MiB.')
    inputs={};total=0
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            for info in z.infolist():
                mode=info.external_attr>>16;total+=info.file_size
                if info.filename not in {'layout.gds','layout.oas','project.json','settings.json','reference.spice'} or info.filename in inputs or total>MAX_INPUT or stat.S_ISLNK(mode):fail('INVALID_INPUT','Package must contain bounded regular input files only.')
                inputs[info.filename]=z.read(info)
    except (zipfile.BadZipFile,OSError):fail('INVALID_INPUT','Invalid ZIP input package.')
    return inputs
