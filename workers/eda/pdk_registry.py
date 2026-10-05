"""Confined local PDK registry. Uploaded data never enables arbitrary Tcl or shell."""
import base64
import copy
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import stat
import shutil
import uuid
import zipfile
import xml.etree.ElementTree as ET
from geometry import EDAError
import profile

S=None
MAX_ZIP=16*1024*1024
MAX_EXPANDED=96*1024*1024
FIELDS={'schema_version','id','name','version','root','magic_rc','magic_tech','netgen_setup','model_file','model_mode','corners','spice_scale','layer_file'}
IDENT=re.compile(r'[A-Za-z_][A-Za-z0-9_.-]{0,79}')
def configure(server):
    global S
    S=server
    with S.LOCK:S.DB.execute('CREATE TABLE IF NOT EXISTS pdk_profiles(id TEXT PRIMARY KEY,data TEXT NOT NULL)');S.db_commit()
def check(name,status,message):return {'name':name,'status':status,'message':message}
def builtin_manifest():
    return {'schema_version':1,'id':'sky130A','name':'Installed public SKY130A','version':'d400e26845538beaeb7cc5fdb9bfc06c30ea27cb','root':str(profile.ROOT),
        'magic_rc':str(profile.MAGIC_RC),'magic_tech':str(profile.TECH),'netgen_setup':str(profile.SETUP),'model_file':str(profile.MODEL),
        'model_mode':'sky130-subset','corners':['tt','ff','ss'],'spice_scale':1e-6,'layer_file':str(profile.ROOT/'libs.tech/klayout/tech/sky130A.lyp')}
def normalize(manifest):
    if not isinstance(manifest,dict) or set(manifest)-FIELDS:raise EDAError('INVALID_PDK_MANIFEST','Unknown PDK manifest fields.')
    m=copy.deepcopy(manifest)
    for key in ('magic_rc','magic_tech','netgen_setup','layer_file'):
        if m.get(key)=='':m.pop(key)
    if m.get('schema_version')!=1 or not isinstance(m.get('id'),str) or not IDENT.fullmatch(m['id']):raise EDAError('INVALID_PDK_MANIFEST','schema_version=1 and a bounded profile identifier are required.')
    for key in ('name','version'):
        if not isinstance(m.get(key),str) or not 1<=len(m[key])<=160:raise EDAError('INVALID_PDK_MANIFEST',f'{key} must be a bounded nonempty string.')
    if m.get('model_mode') not in ('lib','include','sky130-subset'):raise EDAError('INVALID_PDK_MANIFEST','model_mode must be lib, include or sky130-subset.')
    corners=m.get('corners')
    if not isinstance(corners,list) or not 1<=len(corners)<=32 or len(set(corners))!=len(corners) or any(not isinstance(c,str) or not IDENT.fullmatch(c) for c in corners):raise EDAError('INVALID_PDK_MANIFEST','corners must be distinct safe identifiers.')
    scale=m.get('spice_scale')
    if isinstance(scale,bool) or not isinstance(scale,(int,float)) or not 1e-12<=scale<=1:raise EDAError('INVALID_PDK_MANIFEST','spice_scale must be finite, 1e-12..1.')
    for key in FIELDS-{'schema_version','id','name','version','model_mode','corners','spice_scale'}:
        if key in m and (not isinstance(m[key],str) or not 1<=len(m[key])<=1024 or any(c in m[key] for c in '\x00{}[];$`\\"\x27') or any(ord(c)<32 for c in m[key])):raise EDAError('INVALID_PDK_PATH','Resource paths must be bounded strings without control or executable interpolation characters.')
    if not m.get('model_file'):raise EDAError('INVALID_PDK_MANIFEST','model_file is required.')
    if m['model_mode']=='sky130-subset' and m['id']!='sky130A':raise EDAError('UNSUPPORTED_MODEL_MODE','sky130-subset is reserved for the verified built-in adapter.')
    if m['model_mode']=='include' and len(corners)!=1:raise EDAError('UNSUPPORTED_CORNER_MAPPING','A plain include has one declared corner; use real .lib sections for multiple corners.')
    return m
def roots():return (Path('/foss/pdks'),S.STATE/'pdks')
def safe_file(value,root,required=True):
    raw=Path(value);p=raw if raw.is_absolute() else root/raw
    if any(c in str(p) for c in '\x00{}[];$`\\"\x27') or any(ord(c)<32 for c in str(p)):raise EDAError('INVALID_PDK_PATH','Native resource paths cannot contain executable interpolation or quote characters.')
    # Reject symlinks before resolution, including every parent directory.
    for part in (p,*p.parents):
        if part.is_symlink() and not (part.is_relative_to(Path('/foss/pdks')) and part.resolve().is_relative_to(Path('/foss/pdks'))):raise EDAError('INVALID_PDK_PATH','Managed symlinks and installed aliases escaping /foss/pdks are forbidden.')
    p=p.resolve()
    if not any(p.is_relative_to(base.resolve()) for base in roots()):raise EDAError('INVALID_PDK_PATH','PDK resources must stay in installed /foss/pdks or the managed PDK directory.')
    if required and not p.is_file():raise EDAError('PDK_FILE_MISSING',f'Required PDK resource is missing: {p.name}')
    if p.is_file() and p.stat().st_size>MAX_EXPANDED:raise EDAError('PDK_FILE_TOO_LARGE','Individual PDK resource exceeds the bounded package size.')
    return p
def trusted_script(path,role):
    if path.is_relative_to(Path('/foss/pdks')):return path
    # Do not execute arbitrary uploaded Tcl. Matching installed decks may be
    # packaged for portability, but arbitrary customization remains unsupported.
    pattern='*.magicrc' if role=='magic_rc' else '*setup*.tcl'
    digest=S.cached_sha(path)
    canonical=next((p for p in Path('/foss/pdks').rglob(pattern) if p.is_file() and not p.is_symlink() and S.cached_sha(p)==digest),None)
    if canonical is None:raise EDAError('UNTRUSTED_EXECUTABLE_DECK',f'Uploaded {role} must exactly match a trusted installed deck; arbitrary Tcl is not executed.')
    return canonical
def spice_files(path,root):
    """Validate every dependency before ngspice sees an uploaded model tree."""
    visited={}
    directives={'.include','.inc','.lib','.endl','.subckt','.ends','.model','.param','.func','.global','.option','.options','.temp','.end'}
    def visit(p,depth):
        if depth>32 or len(visited)>2048:raise EDAError('PDK_DEPENDENCY_LIMIT','Model dependency tree exceeds its bound.')
        p=safe_file(str(p),root)
        if str(p) in visited:return
        visited[str(p)]=S.cached_sha(p)
        if p.stat().st_size>8*1024*1024:raise EDAError('PDK_FILE_TOO_LARGE','Model text exceeds 8 MiB per dependency.')
        try:text=p.read_text(encoding='utf-8')
        except UnicodeError:raise EDAError('INVALID_MODEL','SPICE model resources must be UTF-8 text.')
        logical=[]
        for line in text.splitlines():
            line=line.strip()
            if not line or line.startswith('*'):continue
            if line.startswith('+'):
                if not logical:raise EDAError('INVALID_MODEL','SPICE continuation has no preceding statement.')
                logical[-1]+=' '+line[1:].strip()
            else:logical.append(line)
        for line in logical:
            fields=line.split();first=fields[0].lower()
            if re.search(r'\b(?:d_process|pre_osdi|osdi|codemodel|pwlfile|tablefile)\b|\bfile\s*[=(]',line,re.I):raise EDAError('UNSAFE_MODEL','External-process, dynamic-code and external-file model features are forbidden.')
            if first.startswith('.'):
                if first not in directives:raise EDAError('UNSAFE_SPICE_DIRECTIVE',f'Unsupported executable or non-model directive {first}.')
                if first=='.model' and (len(fields)<3 or fields[2].split('(')[0].lower() not in {'nmos','pmos','d','npn','pnp','njf','pjf','nmf','pmf','r','c','l','sw','csw','urc','ltra'}):raise EDAError('UNSAFE_MODEL','Only classic SPICE model families are supported; XSPICE process/code models are forbidden.')
                if first=='.lib' and len(fields)==2 and not IDENT.fullmatch(fields[1]):raise EDAError('INVALID_MODEL','A library section must be an identifier; a file import requires a section argument.')
                if first in ('.include','.inc') or (first=='.lib' and len(fields)>=3):
                    match=re.match(r'^\S+\s+(?:"([^"]+)"|\x27([^\x27]+)\x27|(\S+))',line)
                    if not match:raise EDAError('INVALID_MODEL','Malformed model dependency directive.')
                    target=next(v for v in match.groups() if v is not None)
                    candidate=Path(target) if Path(target).is_absolute() else p.parent/target
                    dep=safe_file(str(candidate),root)
                    if not dep.is_relative_to(root):raise EDAError('INVALID_PDK_PATH','Model includes must remain within the declared profile root.')
                    visit(dep,depth+1)
            elif not re.match(r'^[RCLVIDQMXBEFGHKJSUZONPTrclvidqmxbe fghkjsuzonpt][A-Za-z0-9_.$:/+-]*\s',line):
                raise EDAError('INVALID_MODEL','Only SPICE model/subcircuit data is accepted; command text is forbidden.')
    visit(path,0);return visited
def tech_files(path,root):
    files={}
    def visit(p,depth):
        p=safe_file(str(p),root)
        if not p.is_relative_to(root):raise EDAError('INVALID_PDK_PATH','Technology includes must remain inside the declared root.')
        if str(p) in files:return
        if depth>16 or len(files)>256:raise EDAError('PDK_DEPENDENCY_LIMIT','Technology include tree exceeds its bound.')
        files[str(p)]=S.cached_sha(p)
        text=p.read_text(encoding='utf-8')
        for line in text.splitlines():
            line=line.strip()
            if not line or line.startswith('#'):continue
            first=line.split()[0].lower()
            static=line.replace('$SUB','VSUBS').replace('$VDD','VPWR').replace('$GND','VGND')
            if not p.is_relative_to(Path('/foss/pdks')) and (first in {'source','exec','shell','system','load','tcl','proc','eval','uplevel','interp','file','open'} or any(c in static for c in '$[]`')):
                raise EDAError('UNSAFE_TECHNOLOGY','Uploaded technology supports static data only; Tcl interpolation/executable commands are forbidden.')
            if first=='include':
                fields=line.split()
                if len(fields)!=2:raise EDAError('INVALID_TECHNOLOGY','Technology include must name one confined file.')
                name=fields[1].strip('"');dep=safe_file(str(p.parent/name),root)
                if dep.suffix!=p.suffix:raise EDAError('INVALID_TECHNOLOGY','Technology fragments must retain the .tech suffix.')
                visit(dep,depth+1)
    visit(path,0);return files
def technology_name(path):
    match=re.search(r'^tech\s*\n(.*?)^end\s*$',Path(path).read_text(),re.M|re.S)
    if not match:raise EDAError('INVALID_TECHNOLOGY','A top-level static tech section is required.')
    names=[line.strip() for line in match.group(1).splitlines() if line.strip() and not line.strip().startswith(('#','format '))]
    if len(names)!=1 or not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_.-]{0,127}',names[0]):raise EDAError('INVALID_TECHNOLOGY','Technology declares an unsupported native name.')
    return names[0]
def drc_style(path):
    text=Path(path).read_text();section=re.search(r'^drc\s*\n(.*?)^end\s*$',text,re.M|re.S)
    if not section:raise EDAError('UNSUPPORTED_DRC_STYLE','Technology has no supported static DRC section.')
    match=re.search(r'^\s*style\s+(\S+)(?:\s+variants\s+(\S+))?',section.group(1),re.M)
    if not match:raise EDAError('UNSUPPORTED_DRC_STYLE','Technology has no directly declared static DRC style; include-only style declarations require a dedicated adapter.')
    style=match.group(1);variants=match.group(2)
    if variants:style+= '(full)' if '(full)' in variants.split(',') else variants.split(',')[0]
    if not re.fullmatch(r'[A-Za-z0-9_.()/+-]{1,128}',style):raise EDAError('UNSUPPORTED_DRC_STYLE','Unsupported native DRC style identifier.')
    return style
def resolve(manifest):
    m=normalize(manifest);root=Path(m.get('root',''))
    if not root.is_absolute():raise EDAError('INVALID_PDK_PATH','An installed manifest root must be an absolute allowed directory.')
    root=safe_file(str(root),root,False)
    if not root.is_dir():raise EDAError('PDK_FILE_MISSING','Declared profile root does not exist.')
    resources={key:safe_file(m[key],root) for key in ('model_file','magic_rc','magic_tech','netgen_setup','layer_file') if m.get(key)}
    for key,p in resources.items():
        if not p.is_relative_to(root) and not (key in {'magic_rc','magic_tech','netgen_setup'} and p.is_relative_to(Path('/foss/pdks'))):raise EDAError('INVALID_PDK_PATH','Model and display resources must remain inside the declared root; trusted installed native decks may be selected explicitly.')
    supplied={str(p):S.cached_sha(p) for p in resources.values()}
    for role in ('magic_rc','netgen_setup'):
        if role in resources:resources[role]=trusted_script(resources[role],role)
    if m['model_mode']=='sky130-subset':files=dict(S.initial_models())
    else:
        files=spice_files(resources['model_file'],root)
        if m['model_mode']=='lib':
            declared={name.lower() for name in re.findall(r'^\s*\.lib\s+([A-Za-z_][A-Za-z0-9_.-]*)\s*$',resources['model_file'].read_text(),re.M|re.I)}
            if any(c.lower() not in declared for c in m['corners']):raise EDAError('UNSUPPORTED_CORNER_MAPPING','Each declared library corner must be an actual section in model_file.')
    files.update({str(p):S.cached_sha(p) for p in resources.values()})
    files.update(supplied)
    if 'magic_tech' in resources and resources['magic_tech'].is_relative_to(root):files.update(tech_files(resources['magic_tech'],root))
    # Trusted RC/setup dependencies remain mutable files and must invalidate runs.
    for key in ('magic_rc','netgen_setup'):
        if key in resources:
            for p in resources[key].parent.glob('*.tcl'):
                if p.is_file():files[str(p)]=S.cached_sha(p)
    signature=hashlib.sha256(json.dumps({'manifest':m,'files':files},sort_keys=True).encode()).hexdigest()
    return m,resources,files,signature
def validation(manifest):
    try:
        m,r,files,sig=resolve(manifest)
        checks=[check('resource confinement','pass','All resources are regular files in allowed PDK roots; dependencies are hash-locked.'),check('SPICE model','pass','Model file and recursively included resources validated.')]
        for cap,keys in [('DRC',('magic_tech',)),('LVS',('magic_tech','netgen_setup')),('PEX',('magic_tech',))]:
            good=all(key in r for key in keys);checks.append(check(cap,'pass' if good else 'warning','Required resources are present; actual engine compatibility is tested per run.' if good else 'Required native deck resources are absent.'))
        return {'valid':True,'checks':checks,'fingerprint':sig,'signature':sig,'files':files}
    except EDAError as e:return {'valid':False,'checks':[check(e.code,'fail',str(e))]}
def record(manifest,source):
    v=validation(manifest);r={'id':manifest['id'],'name':manifest['name'],'version':manifest['version'],'manifest':manifest,'source':source,'built_in':manifest['id']=='sky130A','available':v['valid'],'fingerprint':v.get('fingerprint',''),'checks':v['checks'],'validation':v,'lock':{'signature':v.get('fingerprint',''),'files':v.get('files',{})}}
    r['capabilities']={name:v['valid'] and all(manifest.get(key) for key in keys) for name,keys in [('simulation',('model_file','magic_tech')),('drc',('magic_tech',)),('lvs',('magic_tech','netgen_setup')),('pex',('magic_tech',))]}
    return r
def get(pid):
    if pid=='sky130A':return record(builtin_manifest(),'installed')
    if not isinstance(pid,str) or not IDENT.fullmatch(pid):raise EDAError('INVALID_PDK_ID','Invalid profile identifier.')
    with S.LOCK:row=S.DB.execute('SELECT data FROM pdk_profiles WHERE id=?',(pid,)).fetchone()
    if not row:raise EDAError('PDK_NOT_FOUND','Registered PDK profile not found.')
    stored=json.loads(row[0]);fresh=record(stored['manifest'],stored['source']);fresh['registered_fingerprint']=stored['fingerprint'];return fresh
def list_profiles():
    with S.LOCK:ids=[r[0] for r in S.DB.execute('SELECT id FROM pdk_profiles ORDER BY id')]
    return [get('sky130A'),*[get(pid) for pid in ids]]
def validate(params):
    if params.get('profile_id'):p=get(params['profile_id']);return {**p['validation'],'profile':p}
    if params.get('manifest'):return validation(params['manifest'])
    p=get('sky130A');return {**p['validation'],'profile':p}
def unpack(encoded,destination):
    if not isinstance(encoded,str) or len(encoded)>MAX_ZIP*4//3+8:raise EDAError('PDK_PACKAGE_TOO_LARGE','PDK ZIP upload limit is 16 MiB.')
    try:payload=base64.b64decode(encoded,validate=True);archive=zipfile.ZipFile(io.BytesIO(payload))
    except Exception:raise EDAError('INVALID_PDK_PACKAGE','Expected a base64 ZIP package.')
    total=0;members=[];seen=set()
    for item in archive.infolist():
        path=PurePosixPath(item.filename);mode=item.external_attr>>16
        if item.filename.startswith(('/','\\')) or any(c in item.filename for c in '\\:{}[];$`"\x27') or '..' in path.parts or any(ord(c)<32 for c in item.filename) or stat.S_ISLNK(mode) or (stat.S_IFMT(mode) not in (0,stat.S_IFDIR,stat.S_IFREG)):
            raise EDAError('INVALID_PDK_PACKAGE','ZIP traversal, symlink and special-file entries are forbidden.')
        if not path.parts or len(item.filename)>512 or item.filename.casefold() in seen:raise EDAError('INVALID_PDK_PACKAGE','Duplicate or invalid ZIP entry.')
        seen.add(item.filename.casefold());total+=item.file_size
        if len(seen)>4096 or total>MAX_EXPANDED or item.file_size>16*1024*1024 or (item.compress_size and item.file_size/item.compress_size>1000):raise EDAError('PDK_PACKAGE_TOO_LARGE','Expanded PDK package exceeds bounded extraction limits.')
        members.append(item)
    destination.mkdir(parents=True)
    for item in members:
        target=destination.joinpath(*PurePosixPath(item.filename).parts)
        if item.is_dir():target.mkdir(parents=True,exist_ok=True)
        else:target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(archive.read(item))
def register(params):
    m=normalize(params.get('manifest'));uploaded=params.get('package_base64') is not None
    if m['id']=='sky130A':raise EDAError('RESERVED_PDK_ID','The installed verified SKY130A profile cannot be replaced.')
    request_hash=hashlib.sha256(json.dumps({'manifest':m,'package_base64':params.get('package_base64')},sort_keys=True,separators=(',',':')).encode()).hexdigest()
    with S.LOCK:
        old=S.DB.execute('SELECT data FROM pdk_profiles WHERE id=?',(m['id'],)).fetchone()
        if old:
            if json.loads(old[0]).get('registration_request_hash')==request_hash:return get(m['id'])
            raise EDAError('PDK_EXISTS','Profile IDs are immutable; register a new ID for a different version.')
    staging=None
    if uploaded:
        staging=S.STATE/'pdks'/('package-'+uuid.uuid4().hex);unpack(params['package_base64'],staging)
        relative=m.get('root','.')
        if Path(relative).is_absolute() or '\\' in relative or ':' in relative or '..' in PurePosixPath(relative).parts:raise EDAError('INVALID_PDK_PATH','Uploaded root must be a relative package directory.')
        m['root']=str(staging/relative)
    committed=False
    try:
        p=record(m,'uploaded' if uploaded else 'installed');p['registration_request_hash']=request_hash
        if not p['available']:raise EDAError('INVALID_PDK_PROFILE','PDK validation failed.',p['checks'])
        with S.LOCK:
            old=S.DB.execute('SELECT data FROM pdk_profiles WHERE id=?',(m['id'],)).fetchone()
            if old:
                if json.loads(old[0]).get('registration_request_hash')==request_hash:return get(m['id'])
                raise EDAError('PDK_EXISTS','Profile IDs are immutable; register a new ID for a different version.')
            S.DB.execute('INSERT INTO pdk_profiles VALUES(?,?)',(m['id'],json.dumps(p)));S.db_commit();committed=True
        return p
    finally:
        if staging and not committed:
            resolved=staging.resolve();managed=(S.STATE/'pdks').resolve()
            if resolved.is_relative_to(managed) and resolved!=managed:shutil.rmtree(resolved)
def lock(pid):
    p=get(pid)
    if not p['available']:raise EDAError('INVALID_PDK_PROFILE','Current registered resources are invalid.',p['checks'])
    return p
def layers(layout,pid):
    if pid=='sky130A':return profile.layers(layout)
    p=lock(pid);m,r,_,_=resolve(p['manifest']);styles={}
    if r.get('layer_file'):
        path=r['layer_file']
        if path.stat().st_size>8*1024*1024:raise EDAError('PDK_FILE_TOO_LARGE','Layer palette XML exceeds 8 MiB.')
        try:
            for item in ET.parse(path).getroot().iter('properties'):
                match=re.fullmatch(r'(\d+)/(\d+)(?:@.*)?',item.findtext('source',''))
                if match:
                    color=item.findtext('fill-color','#8999b0');styles[tuple(map(int,match.groups()))]=(item.findtext('name','')[:160],color if re.fullmatch(r'#[0-9a-fA-F]{6}',color) else '#8999b0')
        except ET.ParseError:raise EDAError('INVALID_LAYER_PALETTE','layer_file must be a valid KLayout layer-properties XML file.')
    result=[]
    for index in layout.layer_indices():
        info=layout.get_info(index);key=(info.layer,info.datatype);name,color=styles.get(key,(f'GDS {info.layer}/{info.datatype}','#8999b0'))
        result.append({'id':f'{info.layer}/{info.datatype}','name':name,'gds':list(key),'color':color,'opacity':.65,'z_display_um':1.0,'thickness_display_um':.12,'source':'illustrative','physical_z_um':None,'physical_thickness_um':None,'material':'mask','style_source':'pdk' if key in styles else 'illustrative'})
    return result
