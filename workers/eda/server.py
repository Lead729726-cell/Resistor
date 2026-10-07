"""Authenticated local EDA RPC. Native engines own analysis; no generated success data."""
from __future__ import annotations
import concurrent.futures
import base64
import io
import copy
import hashlib
import hmac
import json
import math
import os
from pathlib import Path
import re
import shutil
import signal
import sqlite3
import sys
import subprocess
import threading
import time
import uuid
import zipfile
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import klayout.db as k
import geometry as geo
from geometry import EDAError
import native
import profile
import xschem_bridge
import experiments
import templates
import current_flow
import pdk_registry
import configured_analysis
import commercial_backend
import interchange
import native_database
import pvt
import design_tools
import semiconductor_starters
import digital_units
import hierarchy_transfer
import project_index
from toolchain_diagnostics import ToolchainDiagnostics
from job_evidence import write_job_evidence

WORKSPACE=Path(os.environ.get('MOS_WORKSPACE','/workspace')).resolve()
STATE=Path(os.environ.get('MOS_STATE',str(WORKSPACE/'.runtime/eda'))).resolve()
STATE.mkdir(parents=True,exist_ok=True)
TOKEN=os.environ.get('MOS_TOKEN','')
LOCK=threading.RLock()
DB=sqlite3.connect(STATE/'projects.sqlite3',check_same_thread=False)
DB.execute('PRAGMA busy_timeout=30000')
DB.executescript('''CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS history(project_id TEXT, revision INTEGER, parent_revision INTEGER, data TEXT, path TEXT, PRIMARY KEY(project_id,revision));
CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS receipts(project_id TEXT, command_id TEXT, payload_hash TEXT, result TEXT, revision INTEGER, PRIMARY KEY(project_id,command_id));''')
DB.execute("CREATE INDEX IF NOT EXISTS runs_project_index ON runs(json_extract(data,'$.project_id'))")
DB.execute("CREATE INDEX IF NOT EXISTS runs_execution_index ON runs(json_extract(data,'$.execution_status'))")
DB.commit()
POOL=concurrent.futures.ThreadPoolExecutor(max_workers=2)
PROCESSES={}
TOOLS=None
TOOL_DIAGNOSTICS=ToolchainDiagnostics()
MODEL_HASHES=None
FILE_CACHE={}
MUTATION_DEPTH=0
PORTS={'inverter':['A','VGND','VPWR','Y'],'mosfet':['B','D','S','G'],'wire':['IN','OUT'],'fixture':[],'performance':[],'current_mirror':['REF','OUT','VGND'],'differential_pair':['INP','INN','OUTP','OUTN','BIAS','VGND']}

def now(): return datetime.now(timezone.utc).isoformat()
def dump(path,value): Path(path).write_text(json.dumps(value,indent=2,ensure_ascii=False)+'\n')
def trusted(path):
    p=Path(path).resolve()
    if not p.is_relative_to(WORKSPACE): raise EDAError('UNTRUSTED_PATH','File access is restricted to the workspace.')
    return p
def get_project(pid):
    with LOCK:
        row=DB.execute('SELECT data FROM projects WHERE id=?',(pid,)).fetchone()
        if not row: raise EDAError('NOT_FOUND','Project not found.')
        p=json.loads(row[0]); p['runs']=runs_for(pid,p['revision']); return p
def put_project(p):
    p=copy.deepcopy(p); p['runs']=[]
    DB.execute('INSERT OR REPLACE INTO projects VALUES(?,?)',(p['id'],json.dumps(p))); db_commit()

def db_commit():
    if MUTATION_DEPTH==0: DB.commit()
def runs_for(pid,rev):
    results=[]; signature=input_signature(); configured_signatures={};backend_signatures={}
    for row in DB.execute("SELECT data FROM runs WHERE json_extract(data,'$.project_id')=? ORDER BY rowid ASC",(pid,)):
        r=json.loads(row[0])
        if r.get('backend_profile_id') and r['backend_profile_id'] not in backend_signatures:backend_signatures[r['backend_profile_id']]=commercial_backend.signature(r['backend_profile_id'])
        if r.get('profile_id') and r['profile_id'] not in configured_signatures:configured_signatures[r['profile_id']]=configured_analysis.signature(r['profile_id'])
        r['freshness']='current' if r['revision']==rev and r.get('input_signature')==(r.get('input_signature') if r.get('workflow')=='imported-results' else backend_signatures[r['backend_profile_id']] if r.get('backend_profile_id') else configured_signatures[r['profile_id']] if r.get('profile_id') else signature) else 'stale'; results.append(r)
    return results
def get_run(rid):
    with LOCK:
        row=DB.execute('SELECT data FROM runs WHERE id=?',(rid,)).fetchone()
        if not row: raise EDAError('NOT_FOUND','Run not found.')
        r=json.loads(row[0]); row=DB.execute('SELECT data FROM projects WHERE id=?',(r['project_id'],)).fetchone(); p=json.loads(row[0]); r['freshness']='current' if r['revision']==p['revision'] and r.get('input_signature')==(r.get('input_signature') if r.get('workflow')=='imported-results' else commercial_backend.signature(r['backend_profile_id']) if r.get('backend_profile_id') else configured_analysis.signature(r['profile_id']) if r.get('profile_id') else input_signature()) else 'stale'; return r
def put_run(r):
    with LOCK: DB.execute('INSERT OR REPLACE INTO runs VALUES(?,?)',(r['id'],json.dumps(r))); db_commit()
def snapshot_dir(p,revision=None): return STATE/'projects'/p['id']/'snapshots'/str(p['revision'] if revision is None else revision)
def load_layout(p):
    l=k.Layout(); l.read(str(snapshot_dir(p)/'layout.oas')); return l
def commit(p,l,parent=None,analysis_configuration=False):
    d=snapshot_dir(p)
    if DB.execute('SELECT 1 FROM history WHERE project_id=? AND revision=?',(p['id'],p['revision'])).fetchone(): raise EDAError('HISTORY_DIVERGENCE','An immutable revision already exists.')
    d.mkdir(parents=True,exist_ok=True)
    geo.assign_ids(l); p['dbu_um']=l.dbu; p['layers']=pdk_registry.layers(l,p['analysis_setup']['profile_id']) if p.get('analysis_setup') else interchange.layer_palette(l,p) if p.get('interchange_layout') else profile.layers(l)
    l.write(str(d/'layout.oas'))
    if analysis_configuration:p['analysis_setup']['layout_sha256']=profile.sha(d/'layout.oas')
    saved=copy.deepcopy(p); saved['runs']=[]
    dump(d/'project.json',saved); dump(d/'pdk-lock.json',profile.provenance())
    with LOCK:
        DB.execute('INSERT INTO history VALUES(?,?,?,?,?)',(p['id'],p['revision'],parent,json.dumps(saved),str(d/'layout.oas')))
        put_project(saved)
    return get_project(p['id'])

def mutate(method,params,action):
    """Serializable command receipt and state change in one SQLite transaction."""
    global MUTATION_DEPTH
    with LOCK:
        pid=params.get('project_id')
        if pid is None and params.get('experiment_id'):
            row=DB.execute('SELECT data FROM experiments WHERE id=?',(params['experiment_id'],)).fetchone()
            if row: pid=json.loads(row[0])['project_id']
        cid=params.get('command_id')
        if cid is not None and (not isinstance(cid,str) or not re.fullmatch(r'[A-Za-z0-9_.:-]{1,160}',cid)): raise EDAError('INVALID_COMMAND_ID','command_id must be a bounded identifier.')
        fingerprint=hashlib.sha256(json.dumps({'method':method,'params':params},sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()
        if cid and pid:
            row=DB.execute('SELECT payload_hash,result FROM receipts WHERE project_id=? AND command_id=?',(pid,cid)).fetchone()
            if row:
                if row[0]!=fingerprint: raise EDAError('IDEMPOTENCY_CONFLICT','This command_id was already used for another payload.')
                return json.loads(row[1])
        if 'expected_revision' in params:
            expected=params['expected_revision']
            if isinstance(expected,bool) or not isinstance(expected,int) or expected<1: raise EDAError('INVALID_REVISION','expected_revision must be a positive integer.')
            current=get_project(pid)['revision']
            if current!=expected: raise EDAError('REVISION_CONFLICT','Project changed before this command.',{'expected_revision':expected,'current_revision':current})
        DB.execute('BEGIN IMMEDIATE'); MUTATION_DEPTH+=1
        try:
            result=action()
            if cid:
                result_pid=pid or result.get('id') or result.get('project_id')
                rev=result.get('revision')
                DB.execute('INSERT INTO receipts VALUES(?,?,?,?,?)',(result_pid,cid,fingerprint,json.dumps(result),rev))
            DB.commit(); return result
        except Exception:
            DB.rollback(); raise
        finally: MUTATION_DEPTH-=1
def completed_receipt(method,params):
    cid=params.get('command_id')
    if cid is None:return None
    if not isinstance(cid,str) or not re.fullmatch(r'[A-Za-z0-9_.:-]{1,160}',cid):raise EDAError('INVALID_COMMAND_ID','command_id must be a bounded identifier.')
    fingerprint=hashlib.sha256(json.dumps({'method':method,'params':params},sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()
    with LOCK:
        row=DB.execute('SELECT payload_hash,result FROM receipts WHERE project_id=? AND command_id=?',(params.get('project_id'),cid)).fetchone()
        if not row:return None
        if row[0]!=fingerprint:raise EDAError('IDEMPOTENCY_CONFLICT','This command_id was already used for another payload.')
        return json.loads(row[1])
def initial_models():
    global MODEL_HASHES
    # Includes can resolve through multiple PDK primitive directories. Refresh on file metadata change.
    files=list((profile.ROOT/'libs.ref/sky130_fd_pr/spice').rglob('*.spice'))+list((profile.ROOT/'libs.tech/ngspice').rglob('*.spice'))
    MODEL_HASHES={str(p):cached_sha(p) for p in sorted(files)}
    return MODEL_HASHES

def history_project(pid,revision=None):
    if revision is None: return get_project(pid)
    if isinstance(revision,bool) or not isinstance(revision,int): raise EDAError('INVALID_REVISION','Revision must be an integer.')
    row=DB.execute('SELECT data FROM history WHERE project_id=? AND revision=?',(pid,revision)).fetchone()
    if not row: raise EDAError('NOT_FOUND','Immutable project revision not found.')
    return json.loads(row[0])

def export_bundle(params):
    with LOCK:
        p=history_project(params['project_id'],params.get('revision')); p=copy.deepcopy(p); p['runs']=[]
        d=snapshot_dir(p); entries={'project.json':json.dumps(p,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode(),'layout.oas':(d/'layout.oas').read_bytes(),'pdk-lock.json':(d/'pdk-lock.json').read_bytes()}
        l=load_layout(p)
        manifest={'format':'register-project-v1','project_id':p['id'],'revision':p['revision'],'files':{name:hashlib.sha256(value).hexdigest() for name,value in entries.items()},'geometry_hash':geo.semantic_hash(l,l.cell(p['cell']))}
        entries['manifest.json']=json.dumps(manifest,sort_keys=True,separators=(',',':')).encode()
        buffer=io.BytesIO()
        with zipfile.ZipFile(buffer,'w',compression=zipfile.ZIP_DEFLATED) as z:
            for name,value in entries.items():
                zi=zipfile.ZipInfo(name,(2025,1,1,0,0,0)); zi.compress_type=zipfile.ZIP_DEFLATED; z.writestr(zi,value)
        payload=buffer.getvalue(); sha=hashlib.sha256(payload).hexdigest()
        dest=STATE/'projects'/p['id']/'exports'/f"{p['id']}-r{p['revision']}-{sha[:16]}.register.zip"; dest.parent.mkdir(exist_ok=True)
        if dest.exists() and profile.sha(dest)!=sha: raise EDAError('HISTORY_DIVERGENCE','Immutable bundle path has changed.')
        if not dest.exists(): dest.write_bytes(payload)
        result={'format':'register-project-v1','path':str(dest),'sha256':sha,'project_id':p['id'],'revision':p['revision'],'geometry_hash':manifest['geometry_hash'],'size_bytes':len(payload)}
        if params.get('inline'):
            if len(payload)>24*1024*1024: raise EDAError('FILE_TOO_LARGE','Inline bundles are limited to 24 MiB; use a workspace file.')
            result['bundle_base64']=base64.b64encode(payload).decode()
        return result

def import_bundle(params):
    if bool(params.get('path'))==bool(params.get('bundle_base64')): raise EDAError('INVALID_REQUEST','Provide exactly one bundle path or bundle_base64.')
    if params.get('path'):
        src=trusted(params['path'])
        if src.stat().st_size>32*1024*1024: raise EDAError('FILE_TOO_LARGE','Bundle is larger than 32 MiB.')
        payload=src.read_bytes()
    else:
        try: payload=base64.b64decode(params['bundle_base64'],validate=True)
        except Exception: raise EDAError('INVALID_BUNDLE','Bundle is not valid base64.')
    if len(payload)>32*1024*1024: raise EDAError('FILE_TOO_LARGE','Bundle is larger than 32 MiB.')
    try:
        with zipfile.ZipFile(io.BytesIO(payload)) as z:
            infos=z.infolist(); names=[i.filename for i in infos]
            if len(names)!=4 or set(names)!={'project.json','layout.oas','pdk-lock.json','manifest.json'}: raise EDAError('INVALID_BUNDLE','Bundle entries must match the exact format allowlist.')
            if sum(i.file_size for i in infos)>256*1024*1024 or any(i.flag_bits&1 for i in infos): raise EDAError('FILE_TOO_LARGE','Encrypted or oversized archive entries are unsupported.')
            entries={name:z.read(name) for name in names}
        if len(entries['project.json'])>8*1024*1024 or len(entries['manifest.json'])>65536 or len(entries['pdk-lock.json'])>2*1024*1024: raise EDAError('FILE_TOO_LARGE','Bundle metadata is oversized.')
        manifest=json.loads(entries['manifest.json']); incoming=json.loads(entries['project.json']); json.loads(entries['pdk-lock.json'])
        if manifest.get('format')!='register-project-v1': raise EDAError('INVALID_BUNDLE','Unsupported bundle version.')
        for name in ('project.json','layout.oas','pdk-lock.json'):
            if manifest.get('files',{}).get(name)!=hashlib.sha256(entries[name]).hexdigest(): raise EDAError('HASH_MISMATCH',f'Bundle checksum does not match: {name}.')
        if not re.fullmatch(r'[a-f0-9]{32}',incoming.get('id','')) or incoming.get('schema_version')!=1 or isinstance(incoming.get('revision'),bool) or not isinstance(incoming.get('revision'),int) or not 1<=incoming['revision']<=2147483647: raise EDAError('INVALID_BUNDLE','Invalid project identity or schema.')
        if isinstance(incoming.get('next_revision'),bool) or not isinstance(incoming.get('next_revision'),int) or not incoming['revision']<incoming['next_revision']<=2147483647: raise EDAError('INVALID_BUNDLE','Invalid monotonic next_revision metadata.')
        if manifest.get('project_id')!=incoming['id'] or manifest.get('revision')!=incoming['revision']: raise EDAError('INVALID_BUNDLE','Manifest identity disagrees with metadata.')
        if not isinstance(incoming.get('schematic'),dict) or not isinstance(incoming['schematic'].get('devices'),list): raise EDAError('INVALID_BUNDLE','Native schematic structure is missing.')
        # No archive entries are extracted. KLayout reads only the hash-verified OASIS payload.
        staging=STATE/'imports'/uuid.uuid4().hex; staging.mkdir(parents=True); (staging/'layout.oas').write_bytes(entries['layout.oas'])
        l=k.Layout(); l.read(str(staging/'layout.oas')); tops=list(l.top_cells())
        if len(tops)!=1 or tops[0].name!=incoming.get('cell'): raise EDAError('INVALID_BUNDLE','OASIS top cell does not match metadata.')
        if geo.semantic_hash(l,tops[0])!=manifest.get('geometry_hash'): raise EDAError('HASH_MISMATCH','Bundle geometry fingerprint does not match.')
    except EDAError: raise
    except Exception as e: raise EDAError('INVALID_BUNDLE',str(e))
    mode=params.get('mode','new'); p=copy.deepcopy(incoming); parent=None
    if mode=='new': p.update(id=uuid.uuid4().hex,revision=1,next_revision=2,undo_stack=[],redo_stack=[])
    elif mode=='replace':
        if 'expected_revision' not in params: raise EDAError('REVISION_REQUIRED','Replacing an authoritative snapshot requires expected_revision.')
        existing=get_project(params['project_id']); parent=existing['revision']; p.update(id=existing['id'],revision=existing['next_revision'],next_revision=existing['next_revision']+1,undo_stack=existing.get('undo_stack',[])+[parent],redo_stack=[])
    elif mode=='restore':
        pid=params.get('project_id',p['id'])
        if pid!=p['id']: raise EDAError('INVALID_BUNDLE','Restore must preserve the authority project ID.')
        row=DB.execute('SELECT data FROM history WHERE project_id=? AND revision=?',(pid,p['revision'])).fetchone()
        if row:
            if 'expected_revision' not in params: raise EDAError('REVISION_REQUIRED','Restoring existing immutable history requires expected_revision.')
            previous=json.loads(row[0])
            previous_layout=load_layout(previous)
            if geo.identity_hash(previous_layout)!=geo.identity_hash(l): raise EDAError('HISTORY_DIVERGENCE','Incoming geometry or stable IDs conflict with immutable revision history.')
            for candidate in (previous,p):
                for key in ('runs','next_revision','undo_stack','redo_stack'): candidate.pop(key,None)
            if previous!=p: raise EDAError('HISTORY_DIVERGENCE','Incoming revision conflicts with immutable local history.')
            current=get_project(pid)
            if current['revision']>incoming['revision']: raise EDAError('REVISION_CONFLICT','Restore cannot rewind a newer authority revision.',{'current_revision':current['revision']})
            p=copy.deepcopy(incoming); put_project(p); return get_project(pid)
        exists=DB.execute('SELECT data FROM projects WHERE id=?',(pid,)).fetchone()
        if exists:
            if 'expected_revision' not in params: raise EDAError('REVISION_REQUIRED','Restoring an existing authority project requires expected_revision.')
            existing=json.loads(exists[0]); parent=existing['revision']
            if incoming['revision']<=parent: raise EDAError('REVISION_CONFLICT','Restore must advance authority revision.',{'current_revision':parent})
        p.update(next_revision=max(incoming.get('next_revision',incoming['revision']+1),incoming['revision']+1))
    else: raise EDAError('UNSUPPORTED','Bundle modes are new, replace, and restore.')
    p['runs']=[]; p['grid_dbu']=max(1,int(p.get('grid_dbu',1))); result=commit(p,l,parent)
    # Preserve original locked source provenance; local available PDK remains separately diagnosed.
    (snapshot_dir(p)/'pdk-lock.json').write_bytes(entries['pdk-lock.json'])
    return result

def rename_project(params):
    p=get_project(params['project_id']); name=params.get('name')
    if not isinstance(name,str) or not name.strip() or len(name)>128: raise EDAError('INVALID_NAME','Project name must have 1..128 characters.')
    old=p['revision']; p.update(name=name.strip(),revision=p['next_revision'],next_revision=p['next_revision']+1,undo_stack=p.get('undo_stack',[])+[old],redo_stack=[])
    return commit(p,load_layout(history_project(p['id'],old)),old)

def clone_project(params):
    source=get_project(params['project_id']); l=load_layout(source); p=copy.deepcopy(source)
    p.update(id=uuid.uuid4().hex,name=str(params.get('name') or source['name']+' copy')[:128],revision=1,next_revision=2,runs=[],undo_stack=[],redo_stack=[])
    return commit(p,l)
def cached_sha(path):
    p=Path(path)
    if not p.is_file(): return None
    stat=p.stat(); stamp=(stat.st_size,stat.st_mtime_ns,stat.st_ctime_ns)
    old=FILE_CACHE.get(str(p))
    if old is None or old[0]!=stamp: FILE_CACHE[str(p)]=(stamp,profile.sha(p))
    return FILE_CACHE[str(p)][1]
def input_signature():
    models=initial_models()
    decks={str(p):cached_sha(p) for p in (profile.TECH,profile.MAGIC_RC,profile.SETUP,profile.ROOT/'libs.tech/magic/sky130A.tcl',profile.ROOT/'.config/nodeinfo.json')}
    bins=tool_hashes()
    return hashlib.sha256(json.dumps({'models':models,'decks':decks,'tools':bins,'image':profile.IMAGE},sort_keys=True).encode()).hexdigest()
def tool_hashes():
    paths=[Path(shutil.which(name)) for name in ('magic','ngspice','netgen','python3') if shutil.which(name)]
    paths += [Path('/foss/tools/magic/lib/magic/tcl/magicdnull'),Path('/foss/tools/magic/lib/magic/tcl/tclmagic.so'),Path('/foss/tools/netgen/lib/netgen/tcl/netgenexec'),Path('/foss/tools/netgen/lib/netgen/tcl/tclnetgen.so')]
    for pattern in ('dbcore*.so','tlcore*.so','libcore*.so'): paths+=list(Path('/foss/tools/klayout/pymod/klayout').glob(pattern))
    return {str(p):cached_sha(p) for p in paths if p.is_file()}
def doctor(refresh=False):
    global TOOLS
    TOOLS=TOOL_DIAGNOSTICS.inspect(refresh=refresh)
    return {'protocol_version':1,'runner':'linux-docker','tools':TOOLS,'pdk':profile.capabilities(),'geometry':{'engine':'KLayout','coordinate_bits':32,'dbu_um':.001,'grid_dbu':5},'runtime_image':profile.IMAGE}

def magic_generate(folder,cell,w=.65,l=.15):
    folder.mkdir(parents=True,exist_ok=True)
    script=folder/'generate.tcl'
    script.write_text(f'''load {cell}
box 0 0 0 0
set pars [sky130::sky130_fd_pr__nfet_01v8_defaults]
dict set pars w {w:.12g}
dict set pars l {l:.12g}
dict set pars viagate 0
sky130::sky130_fd_pr__nfet_01v8_draw $pars
save {cell}
gds write {cell}.gds
quit -noprompt
''')
    cmd=['magic','-dnull','-noconsole','-rcfile',str(profile.MAGIC_RC),str(script)]
    out=subprocess.run(cmd,cwd=folder,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=60)
    (folder/'generator.log').write_text(out.stdout)
    if out.returncode or not (folder/f'{cell}.gds').is_file(): raise EDAError('ENGINE_FAILED','Public SKY130 Magic PCell failed. See generator log.')
    g=k.Layout(); g.read(str(folder/f'{cell}.gds'))
    # Preserve source cell hierarchy while translating to a fixed 1nm DBU when needed.
    if g.cell(cell) is None: raise EDAError('ENGINE_FAILED','PCell top cell missing.')
    geo.pin_purposes(g,g.cell(cell))
    for li in g.layer_indices():
        for s in g.cell(cell).shapes(li).each(): s.set_property(3,'mn1')
    return g

def create(params,starter=None):
    example=params.get('example','inverter')
    if example not in PORTS: raise EDAError('UNSUPPORTED','Unknown example.')
    fixture=example in {'fixture','performance'}
    if not fixture and not profile.capabilities()['available']: raise EDAError('PDK_MISSING','Install the locked public SKY130A profile or open fixture geometry.')
    pid=uuid.uuid4().hex; cell=example
    p={'schema_version':1,'id':pid,'name':str(params.get('name') or f'SKY130 {example}')[:128], 'pdk_id':'fixture' if fixture else 'sky130A', 'revision':1,'cell':cell,'dbu_um':.001,'grid_dbu':5,
       'source':'fixture' if fixture else 'pdk','example':example,'layers':[],'schematic':native.defaults(example),'testbench':native.testbench({}),'runs':[], 'ports':PORTS[example], 'redo_stack':[],'undo_stack':[],'next_revision':2}
    l=k.Layout(); l.dbu=.001; top=l.create_cell(cell)
    if example in {'current_mirror','differential_pair'}:
        l,schematic,ports=templates.analog(sys.modules[__name__],STATE/'projects'/pid/'generator',example);p.update(schematic=schematic,ports=ports,layout_parameter_policy='verified_analog_core_fixed_routing')
    elif example=='performance':
        count=params.get('count',100000)
        if isinstance(count,bool) or not isinstance(count,int) or not 1<=count<=100000: raise EDAError('ARRAY_LIMIT','Performance fixture count is 1..100000.')
        primitive=l.create_cell('performance_tile'); primitive.shapes(l.layer(68,20)).insert(k.Box(0,0,500,500))
        columns=min(1000,count); rows=count//columns; remainder=count%columns
        if rows: top.insert(k.CellInstArray(primitive.cell_index(),k.Trans(),k.Vector(1000,0),k.Vector(0,1000),columns,rows))
        if remainder: top.insert(k.CellInstArray(primitive.cell_index(),k.Trans(0,rows*1000),k.Vector(1000,0),k.Vector(0,1000),remainder,1))
        p['performance_shape_count']=count; p['user_cells']=['performance_tile']
    elif example=='inverter':
        src=k.Layout(); src.read(str(profile.ROOT/'libs.ref/sky130_fd_sc_hd/gds/sky130_fd_sc_hd.gds'))
        l.dbu=src.dbu; top.copy_tree(src.cell(profile.CELL))
        # Standard cells rely on adjacent public welltap cells. An isolated inv_1 has no taps.
        # Add the actual PDK tap cell on both sides, abutting the 1.38um inverter site.
        tap=l.create_cell('sky130_fd_sc_hd__tapvpwrvgnd_1'); tap.copy_tree(src.cell('sky130_fd_sc_hd__tapvpwrvgnd_1'))
        top.insert(k.CellInstArray(tap.cell_index(),k.Trans(round(-.46/l.dbu),0)))
        top.insert(k.CellInstArray(tap.cell_index(),k.Trans(round(1.38/l.dbu),0)))
        # Body labels are no longer independent terminals after the physical tap ties.
        for li in l.layer_indices():
            for shape in list(top.shapes(li).each()):
                if shape.is_text() and shape.text.string in {'VPB','VNB'}: shape.delete()
        p['schematic']['devices'][0]['pins']['B']='VGND'; p['schematic']['devices'][1]['pins']['B']='VPWR'
        p['template_source']='sky130_fd_sc_hd__inv_1'; p['layout_parameter_policy']='fixed_public_template'
    elif example=='mosfet':
        folder=STATE/'projects'/pid/'generator'; src=magic_generate(folder,cell)
        l.dbu=src.dbu; top.copy_tree(src.cell(cell)); p['layout_parameter_policy']='sky130_magic_pcell_nf1_m1'
    else:
        top.shapes(l.layer(68,20)).insert(k.Box(0,0,200000 if example=='wire' else 5000,1000))
        if example=='wire':
            top.shapes(l.layer(68,5)).insert(k.Text('IN',k.Trans(0,500)))
            top.shapes(l.layer(68,5)).insert(k.Text('OUT',k.Trans(200000,500)))
            top.shapes(l.layer(68,16)).insert(k.Box(0,0,1000,1000))
            top.shapes(l.layer(68,16)).insert(k.Box(199000,0,200000,1000))
            p['schematic']['devices']=[]
        else:
            top.shapes(l.layer(65,20)).insert(k.Box(1000,-1000,3500,2000)); top.shapes(l.layer(66,20)).insert(k.Box(2000,-2000,2500,3000))
    if starter:
        p.update(testbench=copy.deepcopy(starter['testbench']),semiconductor_starter=copy.deepcopy(starter['metadata']))
    return commit(p,l)

def edit(pid,c,mode,cell_name=None):
    with LOCK:
        p=get_project(pid)
        if c.get('type') in ('undo','redo'):
            if c['type']=='undo':
                undo=p.get('undo_stack')
                if undo is None:
                    undo=[]; cursor=p['revision']
                    while True:
                        row=DB.execute('SELECT parent_revision FROM history WHERE project_id=? AND revision=?',(pid,cursor)).fetchone()
                        if not row or row[0] is None: break
                        cursor=row[0]; undo.insert(0,cursor)
                if not undo: raise EDAError('NO_HISTORY','Nothing to undo.')
                target=undo[-1]; undo=undo[:-1]; redo=p.get('redo_stack',[])+[p['revision']]
            else:
                redo=p.get('redo_stack',[])
                if not redo: raise EDAError('NO_HISTORY','Nothing to redo.')
                target=redo[-1]; redo=redo[:-1]; undo=p.get('undo_stack',[])+[p['revision']]
            row=DB.execute('SELECT data FROM history WHERE project_id=? AND revision=?',(pid,target)).fetchone()
            restored=json.loads(row[0]); l=load_layout(restored)
            restored.update(revision=p['next_revision'],next_revision=p['next_revision']+1,undo_stack=undo,redo_stack=redo)
            return commit(restored,l,parent=p['revision'])
        l=load_layout(p); old=p['revision']; p['revision']=p['next_revision']; p['next_revision']+=1; p['redo_stack']=[]; p['undo_stack']=p.get('undo_stack',[])+[old]
        if mode=='schematic':
            if c.get('type')=='update_testbench': p['testbench']=native.testbench({**p.get('testbench',{}),**c.get('settings',{})})
            elif c.get('type')=='add_cell' and c.get('name','').lower()==p['cell'].lower():raise EDAError('INVALID_NAME','A schematic child cell cannot shadow the root cell name.')
            else: native.apply(p['schematic'],copy.deepcopy(c),cell_name)
        elif c.get('type')=='update_device':
            if p['example']!='mosfet': raise EDAError('UNSUPPORTED','Inverter layout is a fixed public template. Edit schematic independently or modify actual geometry and rerun LVS.')
            if c.get('id')!='mn1': raise EDAError('UNSUPPORTED','Only the public mn1 MOS PCell is linked to layout regeneration.')
            if p.get('manual_layout_edits'): raise EDAError('REGENERATION_CONFLICT','Manual geometry edits exist. Undo those edits before regenerating the MOS PCell parameters.')
            native.apply(p['schematic'],copy.deepcopy(c)); d=p['schematic']['devices'][0]; pars=d['parameters']
            if int(pars.get('nf',1))!=1 or int(pars.get('m',1))!=1: raise EDAError('UNSUPPORTED','Magic PCell nf/m layout mapping is tested only for nf=1,m=1.')
            src=magic_generate(STATE/'projects'/pid/'generator'/str(p['revision']),p['cell'],float(pars['w_um']),float(pars['l_um']))
            l=src
        else:
            geo.apply(l,p,c)
            if p['example']=='mosfet': p['manual_layout_edits']=True
        return commit(p,l,parent=old)

def export_layout(params):
    p=get_project(params['project_id']); l=load_layout(p); fmt=params.get('format','gds')
    if fmt not in ('gds','oas'): raise EDAError('UNSUPPORTED','Supported exchange formats: GDSII and OASIS.')
    d=STATE/'projects'/p['id']/'exports'; d.mkdir(exist_ok=True)
    basename=re.sub(r'[^A-Za-z0-9_-]','_',p['cell'])[:128]
    dest=d/f"{basename}-r{p['revision']}.{fmt}"; l.write(str(dest))
    after=k.Layout(); after.read(str(dest)); before_hash=geo.semantic_hash(l,l.cell(p['cell'])); after_hash=geo.semantic_hash(after,after.cell(p['cell']))
    sidecar=dest.with_suffix(dest.suffix+'.mos.json'); dump(sidecar,{'schema_version':1,'file_hash':profile.sha(dest),'project':p,'geometry_hash':before_hash})
    ids_before={s['id'] for s in geo.scene(l,p,p['layers'])['shapes']}; ids_after={s['id'] for s in geo.scene(after,p,p['layers'])['shapes']}
    return {'path':str(dest),'sidecar_path':str(sidecar),'roundtrip':{'geometry_equal':before_hash==after_hash,'before_hash':before_hash,'after_hash':after_hash,'hierarchy_preserved':geo.hierarchy_hash(l)==geo.hierarchy_hash(after),'stable_ids_preserved':ids_before==ids_after},'metadata':{'ids':'layout properties + app sidecar','schematic':'sidecar','physical_stack':'unknown','flattened':False}}

def generate_pcell(params):
    if params.get('kind')!='via': raise EDAError('UNSUPPORTED_PCELL','This endpoint supports verified public via1/via2 helpers; MOS parameters use layout update_device.')
    p=get_project(params['project_id']);l=load_layout(p)
    if abs(l.dbu-.001)>1e-12: raise EDAError('UNSUPPORTED_DBU','Public via helper import currently requires the verified 1nm database unit.')
    kind=params.get('via','via1');minimum=260 if kind=='via1' else 280;width=geo.coord(params.get('width',str(minimum)),p['grid_dbu']);height=geo.coord(params.get('height',str(minimum)),p['grid_dbu']);position=params.get('position',[])
    if len(position)!=2: raise EDAError('INVALID_COMMAND','Via position needs two decimal DBU strings.')
    old=p['revision'];p.update(revision=p['next_revision'],next_revision=p['next_revision']+1,undo_stack=p.get('undo_stack',[])+[old],redo_stack=[])
    cell=kind+'_'+uuid.uuid4().hex[:12];folder=STATE/'projects'/p['id']/'generator'/str(p['revision']);source=templates.via(folder,cell,kind,width,height);child=l.create_cell(cell);child.copy_tree(source.cell(cell))
    if params.get('net'):
        for li in l.layer_indices():
            for shape in child.shapes(li).each():shape.set_property(2,str(params['net'])[:128])
    geo.apply(l,p,{'type':'add_instance','cell_name':cell,'position':position,'rotation':0,'mirror':False})
    if p['example']=='mosfet':p['manual_layout_edits']=True
    return commit(p,l,old)

def import_layout(params):
    src=trusted(params['path'])
    if src.suffix.lower() not in ('.gds','.oas'): raise EDAError('UNSUPPORTED','Only GDSII/OASIS import is supported.')
    if src.stat().st_size>256*1024*1024: raise EDAError('FILE_TOO_LARGE','Import limit is 256 MiB.')
    p=get_project(params['project_id']); l=k.Layout()
    try: l.read(str(src))
    except Exception as e: raise EDAError('IMPORT_FAILED',str(e))
    tops=list(l.top_cells())
    selected=params.get('top_cell')
    if selected is None:
        if len(tops)!=1: raise EDAError('AMBIGUOUS_TOP','Import with multiple top cells requires explicit top_cell selection.')
        selected=tops[0].name
    elif selected not in [c.name for c in tops]:raise EDAError('TOP_CELL_NOT_FOUND','Selected import top_cell is not an actual top cell.')
    old=p['revision']; p['revision']=p['next_revision']; p['next_revision']+=1; p['redo_stack']=[]; p['undo_stack']=p.get('undo_stack',[])+[old]; p['cell']=selected
    p['dbu_um']=l.dbu; p['grid_dbu']=max(1,round(.005/l.dbu)); p['source']='fixture'; p['example']='fixture'; p['ports']=[];p['pdk_id']='fixture'
    p.pop('design_template',None);p.pop('pvt_point',None);p.pop('native_database',None);p.pop('testbench',None)
    side=src.with_suffix(src.suffix+'.mos.json'); preserved=False
    if side.is_file():
        if side.stat().st_size>2*1024*1024: raise EDAError('FILE_TOO_LARGE','Sidecar limit is 2 MiB.')
        meta=json.loads(side.read_text())
        if meta.get('file_hash')==profile.sha(src):
            origin=meta.get('project',{}); p['schematic']=origin.get('schematic',p['schematic']); p['source']=origin.get('source','fixture'); p['example']=origin.get('example','fixture'); p['ports']=origin.get('ports',[]); p['pdk_id']=origin.get('pdk_id','fixture'); preserved=True
            if origin.get('testbench'):p['testbench']=native.testbench(origin['testbench'])
            if origin.get('design_template'):
                p['design_template']=copy.deepcopy(origin['design_template']);design_tools.validate_template_project(p)
    p['import_metadata']={'sidecar_preserved':preserved,'source_path':str(src),'source_hash':profile.sha(src)}
    # Electrical setup belongs to the old geometry and can never survive import.
    p.pop('analysis_setup',None)
    p.pop('backend_setup',None);p.pop('active_backend',None)
    p.pop('interchange_netlist',None);p.pop('interchange_layout',None);p.pop('interchange_report',None)
    if not preserved:p['schematic']={'devices':[],'wires':[]};p.pop('testbench',None)
    return commit(p,l,parent=old)

def start_job(params,kind):
    p=get_project(params['project_id'])
    if not isinstance(p['cell'],str) or not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*',p['cell']): raise EDAError('UNSUPPORTED_NAME','Imported cell name is outside the supported engine identifier subset.')
    if not isinstance(p.get('ports'),list) or any(not isinstance(name,str) or not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*',name) for name in p['ports']): raise EDAError('UNSUPPORTED_NAME','Imported port metadata is outside the supported engine identifier subset.')
    template=bool(p.get('design_template'))
    digital=bool(p.get('digital_unit'))
    if digital:digital_units.validate_project(p)
    if template: design_tools.validate_template_project(p)
    if p['source']=='fixture' and not template and not digital: raise EDAError('UNSUPPORTED','Fixture geometry has no verified circuit/PDK profile.')
    if (template or digital) and (kind!='simulation' or params.get('post_layout')) and not any(not cell.is_empty() for cell in load_layout(p).each_cell()):
        raise EDAError('NO_PHYSICAL_LAYOUT','This circuit template has no physical layout. Create actual PDK geometry before physical verification or post-layout analysis.')
    if kind=='simulation':
        settings=native.testbench({**p.get('testbench',{}),**{key:params[key] for key in native.TESTBENCH if key in params}})
        params={**params,**settings}
        if not template and not digital and p['example'] not in {'inverter','mosfet','wire','current_mirror','differential_pair'}: raise EDAError('UNSUPPORTED','No testbench for this cell.')
        native.validate(p['schematic'])
        duration=native.num(params.get('duration_s',30e-9)); step=native.num(params.get('step_s',20e-12))
        if duration<=0 or duration>1e-3 or step<1e-12 or step>duration or duration/step>200000:
            raise EDAError('TESTBENCH_RANGE','Transient duration/step must be positive, at most 1ms and at most 200000 nominal points, with step >=1ps.')
    if kind=='lvs' and p['example']=='wire': raise EDAError('UNSUPPORTED','Wire fixture demonstrates extraction; it has no reference devices for LVS.')
    rid=uuid.uuid4().hex; folder=STATE/'runs'/rid; folder.mkdir(parents=True)
    shutil.copyfile(snapshot_dir(p)/'layout.oas',folder/'input.oas'); l=load_layout(p); l.write(str(folder/f"{p['cell']}.gds")); dump(folder/'project.json',p)
    run={'id':rid,'project_id':p['id'],'kind':kind,'revision':p['revision'],'execution_status':'queued','analysis_result':'unknown','freshness':'current','artifacts':{},'manifest_path':str(folder/'manifest.json'),'input_signature':input_signature()}
    if kind=='simulation':run['analysis_stage']='post-layout' if params.get('post_layout') else 'pre-layout'
    put_run(run); POOL.submit(execute_job,run,p,copy.deepcopy(params),folder); return run

def process(run,folder,cmd,name,manifest,timeout=120):
    manifest['commands'].append({'argv':cmd,'cwd':str(folder),'timeout_s':timeout})
    if get_run(run['id'])['execution_status']=='canceled': raise EDAError('CANCELED','Job canceled.')
    with (folder/f'{name}.log').open('w') as f:
        proc=subprocess.Popen(cmd,cwd=folder,stdout=f,stderr=subprocess.STDOUT,start_new_session=True)
        with LOCK: PROCESSES[run['id']]=proc
        try: code=proc.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid,signal.SIGKILL); proc.wait(); raise EDAError('TIMEOUT',f'{name} exceeded {timeout} seconds.')
        finally:
            with LOCK: PROCESSES.pop(run['id'],None)
    manifest['commands'][-1]['returncode']=code
    log=(folder/f'{name}.log').read_text(errors='replace')
    with (folder/'stdout.log').open('a') as f: f.write(f'\n--- {name} ---\n'+log)
    if get_run(run['id'])['execution_status']=='canceled': raise EDAError('CANCELED','Job canceled.')
    if code: raise EDAError('ENGINE_FAILED',f'{name} exited with code {code}. Raw log retained.')
    return log

def magic_input(p,folder,resources=None):
    text=''
    if resources:
        tech_name=pdk_registry.technology_name(resources['magic_tech'])
        text=f'path sys +{{{Path(resources["magic_tech"]).parent}}}\nif {{[catch {{tech load {{{resources["magic_tech"]}}}}} tech_error]}} {{puts stderr $tech_error; exit 77}}\nif {{[tech name] != {{{tech_name}}}}} {{puts stderr REGISTER_TECH_LOAD_FAILED; exit 77}}\n'
    text+=f'crashbackups stop\ngds read {{{folder/p["cell"]}.gds}}\nload {p["cell"]}\nselect top cell\n'
    # SKY130 GDS pin-purpose polygons carry the port declarations on import.
    return text

def magic_args(folder,script,resources=None):
    if resources:
        if resources.get('magic_rc'):rc=resources['magic_rc']
        else:
            rc=folder/'trusted-startup.magicrc';rc.write_text('set VDD VPWR\nset GND VGND\nset SUB VSUBS\n')
    else:rc=profile.MAGIC_RC
    return ['magic','-dnull','-noconsole','-rcfile',str(rc),str(script)]

def drc(run,p,folder,manifest,resources=None):
    script=folder/'drc.tcl'
    style=pdk_registry.drc_style(resources['magic_tech']) if resources else 'drc(full)'
    manifest['settings']['drc_style']=style
    script.write_text(magic_input(p,folder,resources)+f'drc euclidean on\nif {{[catch {{drc style {{{style}}}}} style_error]}} {{puts stderr $style_error; exit 77}}\n'+'''
drc check
drc catchup
set result [drc listall why]
set f [open markers.tsv w]
set oscale [cif scale out]
set count 0
foreach {rule boxes} $result {
    foreach b $boxes {
        set coords {}
        foreach n $b {lappend coords [expr {$n*$oscale}]}
        puts $f "[string map {\t { } \n { }} $rule]\t[join $coords \t]"
        incr count
    }
}
close $f
set f [open drc-status.json w]
puts $f "{\\\"marker_count\\\":$count}"
close $f
quit -noprompt
''')
    process(run,folder,magic_args(folder,script,resources),'magic-drc',manifest,timeout=600 if p.get('digital_unit',{}).get('kind')=='cpu16' else 120)
    status=json.loads((folder/'drc-status.json').read_text()); markers=[]
    for i,line in enumerate((folder/'markers.tsv').read_text().splitlines()):
        parts=line.split('\t'); parts=[parts[0]]+parts[1].split() if len(parts)==2 else parts
        if len(parts)!=5: raise EDAError('PARSER_FAILED','Magic DRC marker row malformed.')
        description=parts[0]; match=re.search(r'\(([^)]+)\)',description)
        bbox=[str(round(float(v)/p['dbu_um'])) for v in parts[1:]]
        markers.append({'id':f'{run["id"]}:{i}','rule':match.group(1) if match else 'magic-drc-full','description':description,'bbox':bbox,'cell_path':p['cell'],'severity':'error'})
    if len(markers)!=status['marker_count']: raise EDAError('PARSER_FAILED','DRC marker count differs from native report.')
    run.update(analysis_result='fail' if markers else 'pass',markers=markers,message=f'Magic {style}: {len(markers)} native violation rectangles. Selected deck; no signoff.')
    run['artifacts']['markers']=str(folder/'markers.tsv')

def extract(run,p,folder,manifest,pex=False,resources=None):
    script=folder/('pex.tcl' if pex else 'extract-lvs.tcl')
    text=magic_input(p,folder,resources)+'''extract all
ext2spice scale off
ext2spice format ngspice
ext2spice subcircuit on
ext2spice subcircuit top on
'''
    # extresist creates distributed nodes in a flat network. Hierarchical
    # ext2spice additionally emits lumped correction capacitors; these are not
    # a usable flat RC model (MUX4 reproduced 55 negative capacitors).
    text+=f"ext2spice hierarchy {'off' if pex else 'on'}\n"
    if pex:
        # 8.3.582 predates automatic resistance extraction (8.3.597): generate SIM/NODE first.
        text+='''ext2sim labels on
ext2sim
extresist tolerance 0.001
extresist all
ext2spice extresist on
ext2spice cthresh 0
ext2spice rthresh 0
ext2spice merge none
'''
    else: text+='ext2spice lvs\n'
    dest=folder/('pex.spice' if pex else 'layout.spice')
    text+=f'ext2spice -o {{{dest}}}\nquit -noprompt\n'; script.write_text(text)
    process(run,folder,magic_args(folder,script,resources),'magic-pex' if pex else 'magic-extract',manifest,timeout=600 if p.get('digital_unit',{}).get('kind')=='cpu16' else 120)
    if not dest.is_file(): raise EDAError('PARSER_FAILED','Magic exited without an extracted SPICE netlist.')
    content=dest.read_text(); mos=len(re.findall(r'^X\S+',content,re.M)); caps=len(re.findall(r'^C\S+',content,re.M)); resistors=len(re.findall(r'^R\S+',content,re.M))
    if not re.search(r'^\.subckt\s',content,re.M|re.I): raise EDAError('PARSER_FAILED','Extracted netlist has no top subcircuit.')
    if pex:
        run['parasitics']={'resistors':resistors,'capacitors':caps}; run['artifacts']['pex_netlist']=str(dest)
        invalid=[]
        for row in content.splitlines():
            fields=row.split()
            if fields and re.match(r'^[RC]\S+',fields[0]):
                value=fields[3] if len(fields)>3 else ''
                numeric=re.fullmatch(r'([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)([a-zA-Z]*)',value)
                scales={'':1,'t':1e12,'g':1e9,'meg':1e6,'k':1e3,'m':1e-3,'u':1e-6,'n':1e-9,'p':1e-12,'f':1e-15}
                suffix=numeric[2].lower() if numeric else None
                number=float(numeric[1])*scales[suffix] if numeric and suffix in scales else float('nan')
                if not math.isfinite(number) or number<0:invalid.append(row)
        quality=folder/'pex-quality.json'
        quality.write_text(json.dumps({'valid':not invalid,'invalid_elements':invalid,'resistors':resistors,'capacitors':caps,'output_hierarchy':False,'scope':'Native Magic interconnect RC; no clamping, deletion or synthetic parasitics.'},indent=2))
        run['artifacts']['pex_quality']=str(quality)
        manifest['settings']['extraction']={'cthresh_fF':0,'rthresh_ohm':0,'extresist_tolerance':.001,'hierarchy':False,'intrinsic_parasitics':'Original MOS model retained; additional layout interconnect R/C extracted by Magic.','mapping':'Native .ext/.nodes retained; no exact spatial RC heatmap.'}
        if invalid:raise EDAError('EXTRACTION_INVALID',f'Native PEX contains {len(invalid)} negative or non-finite R/C values; original netlist and quality report retained.')
        run.update(analysis_result='pass',message=f'Actual Magic RC extraction: {resistors} resistors, {caps} capacitors. Zero counts reflect native thresholds, not inserted elements.')
    else: run['artifacts']['layout_netlist']=str(dest)
    return dest

def lvs(run,p,folder,manifest):
    layout=extract(run,p,folder,manifest); reference=folder/'reference.spice'; reference.write_text(native.emit(p['schematic'],p['cell'],p['ports']))
    report=folder/'lvs.log'; cmd=['netgen','-batch','lvs',f'{layout} {p["cell"]}',f'{reference} {p["cell"]}',str(profile.SETUP),str(report),'-json']
    process(run,folder,cmd,'netgen-lvs',manifest,timeout=600 if p.get('digital_unit',{}).get('kind')=='cpu16' else 120)
    if not report.is_file(): raise EDAError('PARSER_FAILED','Netgen did not produce comparison report.')
    content=report.read_text(errors='replace')
    if 'Circuits match uniquely.' in content and 'Property errors were found.' not in content: result='pass'
    elif any(t in content for t in ('Circuits do not match.','Property errors were found.','Netlists do not match.','Circuits match with','failed pin matching')): result='fail'
    else: raise EDAError('PARSER_FAILED','Netgen result is not recognized; report preserved.')
    run.update(analysis_result=result,message='Actual Netgen comparison: '+('circuits match uniquely.' if result=='pass' else 'connectivity or property mismatch; inspect native report.'))
    run['artifacts'].update(reference_netlist=str(reference),lvs_report=str(report))

def spice_tb(p,folder,params,netlist):
    if p.get('digital_unit'):return digital_units.spice_tb(p,folder,params,netlist)
    if p.get('design_template'):
        deck,names,units,xunit,xlabel=design_tools.spice_tb(p,folder,params,netlist)
        return Path(deck).read_text(),names,units,xunit,xlabel
    analysis=params.get('analysis','tran'); example=p['example']; supply=params.get('supply_V',1.8); corner=params.get('corner','tt')
    match=re.search(r'^\.subckt\s+'+re.escape(p['cell'])+r'\s*([^\n]*)',Path(netlist).read_text(),re.M|re.I)
    if not match: raise EDAError('PARSER_FAILED','Top extracted subcircuit was not found.')
    actual_ports=match.group(1).split()
    if set(actual_ports)!=set(p['ports']): raise EDAError('PORT_MISMATCH','Extracted testbench ports differ from declared ports.',{'expected':p['ports'],'actual':actual_ports})
    # Use unchanged public TT models for the supported pair, rather than parsing every unrelated PDK device.
    # Parameters are copied verbatim from the public all.spice preamble; every source is hash-locked.
    public_all=profile.ROOT/'libs.tech/ngspice/all.spice'
    text=public_all.read_text().split('* include all individual diode models')[0]
    text=text.replace('.include "parameters/lod.spice"',f'.include "{profile.ROOT}/libs.tech/ngspice/parameters/lod.spice"')
    modeldeck=folder/f'supported-{corner}.spice'
    text='.param mc_mm_switch=0 mc_pr_switch=0\n'+text
    for model in ('sky130_fd_pr__nfet_01v8','sky130_fd_pr__pfet_01v8_hvt'):
        for suffix in (f'__{corner}.pm3.spice','__mismatch.corner.spice'):
            text+=f'\n.include "{profile.ROOT}/libs.ref/sky130_fd_pr/spice/{model}{suffix}"\n'
    modeldeck.write_text(text)
    lines=['Register public SKY130 testbench',f'.include "{modeldeck}"','.option scale=1e-6',f'.include "{netlist}"',f'.temp {params.get("temperature_C",27):.12g}']
    if example=='inverter':
        stimulus=f'PULSE(0 {supply:.12g} 1n 100p 100p 5n 10n)' if analysis=='tran' else f'DC {supply/2:.12g} AC 1'
        lines += [f'VVDD VPWR 0 {supply:.12g}','VGND VGND 0 0',f'VIN A 0 {stimulus}','XU '+' '.join(actual_ports)+' '+p['cell'],f'CLOAD Y 0 {params.get("load_F",5e-15):.12g}']
        vectors=['v(A)','v(Y)']; names=['A','Y']; units=['V','V']
    elif example=='mosfet':
        gate=native.num(params.get('vgs_V',supply/2))
        if not 0<=gate<=1.8: raise EDAError('PARAMETER_RANGE','vgs_V must be 0..1.8V.')
        lines += [f'VD D 0 {params.get("vds_V",1.8):.12g}',f'VG G 0 DC {gate:.12g} AC 1','VS S 0 0',f'VB B 0 {params.get("vbs_V",0):.12g}','XU '+' '.join(actual_ports)+' '+p['cell']]
        vectors=['v(G)','-i(VD)']; names=['Vgs','Id']; units=['V','A']
    elif example=='current_mirror':
        stimulus='PULSE(5u 100u 1n 100p 100p 5n 10n)' if analysis=='tran' else 'DC 100u AC 1'
        lines+=['VGND VGND 0 0',f'IREF 0 REF {stimulus}',f'VDOUT OUT 0 {supply:.12g}','XU '+' '.join(actual_ports)+' '+p['cell']]
        vectors=['v(REF)','-i(VDOUT)'];names=['Vref','Iout'];units=['V','A']
    elif example=='differential_pair':
        stimulus='PULSE(0.85 0.95 1n 100p 100p 5n 10n)' if analysis=='tran' else 'DC 0.9 AC 1'
        lines+=['VGND VGND 0 0',f'VINP INP 0 {stimulus}','VINN INN 0 0.9','VBIAS BIAS 0 0.7',f'VOP OUTP 0 {supply:.12g}',f'VON OUTN 0 {supply:.12g}','XU '+' '.join(actual_ports)+' '+p['cell']]
        vectors=['-i(VOP)','-i(VON)'];names=['IoutP','IoutN'];units=['A','A']
    else:
        lines += ['.global VSUBS','VSUB VSUBS 0 0',f'VIN IN 0 PULSE(0 {supply:.12g} 1n 100p 100p 5n 10n)','XU '+' '.join(actual_ports)+' '+p['cell'],'RLOAD OUT 0 1e6',f'CLOAD OUT 0 {params.get("load_F",1e-13):.12g}']
        vectors=['v(IN)','v(OUT)']; names=['IN','OUT']; units=['V','V']
    # The pinned image spinit starts eight OpenMP model-evaluation threads.
    # Two tiny native jobs then oversubscribe the desktop CPU; bound each job
    # explicitly rather than inheriting an unrelated global ngspice setting.
    lines+=['.control','set num_threads=1','set noaskquit','set wr_singlescale','set wr_vecnames']
    if analysis=='tran': lines+=[f'tran {native.num(params.get("step_s",20e-12)):.12g} {native.num(params.get("duration_s",30e-9)):.12g}']; xunit='s'; xlabel='time'
    elif analysis=='dc':
        if example=='current_mirror':lines+=['dc VDOUT 0 1.8 0.01'];xlabel='Vout'
        elif example=='differential_pair':lines+=['dc VINP 0.8 1.0 0.001'];xlabel='VinP'
        else:
            sweep=params.get('dc_sweep','vgs')
            if sweep not in {'vgs','vds'}: raise EDAError('UNSUPPORTED','MOS DC sweep must be vgs or vds.')
            source=('VD' if sweep=='vds' else 'VG') if example=='mosfet' else 'VIN';lines += ['dc '+source+f' 0 {supply:.12g} 0.01'];xlabel=('Vds' if sweep=='vds' else 'Vgs') if example=='mosfet' else 'Vin'
        xunit='V'
    elif analysis=='op':
        lines+=['op']; xunit='point'; xlabel='OP'
        if example=='mosfet':
            mos=re.search(r'^X(\S+)\s+[^\n]*\bsky130_fd_pr__nfet_01v8\b',Path(netlist).read_text(),re.M|re.I)
            if not mos: raise EDAError('MODEL_MAPPING_FAILED','Native MOS instance name could not be resolved for operating-point quantities.')
            device='@m.xu.x'+mos.group(1).lower()+'.msky130_fd_pr__nfet_01v8'
            vectors += [device+'['+key+']' for key in ('gm','gds','vth','vdsat')];names+=['gm','gds','vth','vdsat'];units+=['S','S','V','V']
    else:
        lines+=['ac dec 30 1 1e9']; output='v(Y)' if example=='inverter' else '-i(VD)' if example=='mosfet' else '-i(VDOUT)' if example=='current_mirror' else '-i(VOP)+i(VON)' if example=='differential_pair' else 'v(OUT)'
        vectors=[f'mag({output})',f'ph({output})']; names=['gain_magnitude','phase']; units=['V/V' if example=='inverter' else 'A/V','rad']; xunit='Hz'; xlabel='frequency'
    for i,vector in enumerate(vectors): lines.append(f'let mos_wave_{i} = {vector}')
    lines+=['wrdata waveform.dat '+' '.join(f'mos_wave_{i}' for i in range(len(vectors))),'write waveform.raw','quit','.endc','.end']
    return '\n'.join(lines)+'\n',names,units,xunit,xlabel

def simulation(run,p,folder,manifest,params):
    manifest['settings']['ngspice_num_threads']=1
    if params.get('post_layout'):
        if p.get('design_template') or p.get('digital_unit') or p['example'] in {'wire','mosfet','inverter','current_mirror','differential_pair'}: netlist=extract(run,p,folder,manifest,pex=True)
        else: raise EDAError('UNSUPPORTED','No post-layout testbench.')
    elif p['example']=='wire': raise EDAError('UNSUPPORTED','Wire has no pre-layout reference circuit; run post-layout analysis.')
    elif params.get('netlister')=='xschem':
        bridged=xschem_bridge.netlist(p,folder/'xschem'); netlist=Path(bridged['path']); run['artifacts'].update(xschem_schematic=bridged['schematic_path'],xschem_manifest=bridged['manifest_path']); manifest['xschem_bridge']=bridged['manifest_path']
    else:
        netlist=folder/'reference.spice'; netlist.write_text(native.emit(p['schematic'],p['cell'],p['ports']))
    analysis=params.get('analysis','tran');branches=[];warnings=[];probe_netlist=netlist
    if analysis!='ac':probe_netlist,branches,warnings=current_flow.prepare(p,netlist,folder,bool(params.get('post_layout')))
    tb,names,units,xunit,xlabel=spice_tb(p,folder,params,probe_netlist)
    if analysis!='ac':
        current_flow.add_testbench_voltage_branches(tb.split('.control')[0].splitlines(),branches)
        selected_vectors=[v.removeprefix('-') for v in digital_units.stimuli(p,params)[2]] if p.get('digital_unit') else None
        voltage_probes=current_flow.voltage_probes(branches,folder)
        tb=current_flow.instrument_control(tb,branches,selected_vectors,voltage_probes)
        if selected_vectors is not None:manifest['settings']['trace_scope']={'waveforms':selected_vectors,'signed_current_branches':len(branches),'all_extracted_RC_elements_retained':True}
    deck=folder/'testbench.spice'; deck.write_text(tb); run['artifacts']['testbench']=str(deck)
    log=process(run,folder,['ngspice','-b',str(deck)],'ngspice',manifest,timeout=600 if p.get('digital_unit',{}).get('kind') in ('cpu4','cpu16') else 120)
    path=folder/'waveform.dat'
    if not path.is_file() or any(t in log.lower() for t in ('fatal error','timestep too small','unknown subckt','singular matrix','error on line','simulation interrupted')):
        raise EDAError('SIMULATION_FAILED','ngspice failed/convergence or no waveform output. Raw log retained.')
    rows=path.read_text().splitlines(); values=[]
    for row in rows[1:]:
        try: nums=[float(v) for v in row.split()]
        except ValueError: raise EDAError('PARSER_FAILED','ngspice waveform contains a nonnumeric row.')
        if len(nums)!=len(names)+1 or any(not __import__('math').isfinite(v) for v in nums): raise EDAError('PARSER_FAILED','Unexpected/nonfinite waveform columns.')
        values.append(nums)
    if not values: raise EDAError('PARSER_FAILED','ngspice produced no data points.')
    run['waveforms']=[{'name':name,'unit':unit,'x':[v[0] for v in values],'y':[v[i+1] for v in values]} for i,(name,unit) in enumerate(zip(names,units))]
    measurements={'analysis':params.get('analysis','tran'),'x_unit':xunit,'x_label':xlabel,'corner':params.get('corner','tt'),'temperature_C':params.get('temperature_C',27),'supply_V':params.get('supply_V',1.8),'post_layout':str(bool(params.get('post_layout'))).lower(),'samples':len(values)}
    measurements['solver']='KLU' if 'Using KLU as Direct Linear Solver' in log else 'SPARSE 1.3' if 'Using SPARSE 1.3 as Direct Linear Solver' in log else 'unknown'
    manifest['settings']['solver_observed']=measurements['solver']
    for i,name in enumerate(names):
        measurements[name+'_min']=min(v[i+1] for v in values); measurements[name+'_max']=max(v[i+1] for v in values)
    if p['example']=='mosfet' and params.get('analysis')=='op':
        for i,name in enumerate(names):measurements[name]=values[0][i+1]
        measurements['region_estimate']='cutoff' if measurements['Vgs']<=measurements['vth'] else 'saturation' if params.get('vds_V',1.8)>=measurements['vdsat'] else 'linear'
        measurements['region_method']='Inferred from native BSIM operating-point Vth/Vdsat and applied biases; not a TCAD region classification.'
    if p['example']=='mosfet' and params.get('analysis')=='dc' and len(values)>2:
        derivative=[]
        for i in range(len(values)):
            a=values[max(0,i-1)];b=values[min(len(values)-1,i+1)];derivative.append((b[2]-a[2])/(b[0]-a[0]))
        quantity='gds_sampled' if params.get('dc_sweep')=='vds' else 'gm_sampled';run['waveforms'].append({'name':quantity,'unit':'S','x':[v[0] for v in values],'y':derivative});measurements[quantity+'_max']=max(derivative);measurements['derivative_method']='Finite difference of actual ngspice DC samples.'
    if p['example']=='inverter' and params.get('analysis','tran')=='tran':
        # Linear threshold crossing, real sampled waveform. Report first matched rising-input/falling-output pair.
        threshold=params.get('supply_V',1.8)/2
        def cross(index,rising):
            times=[]
            for a,b in zip(values,values[1:]):
                if (a[index]<threshold<=b[index]) if rising else (a[index]>threshold>=b[index]):
                    times.append(a[0]+(threshold-a[index])*(b[0]-a[0])/(b[index]-a[index]))
            return times
        ins=cross(1,True); outs=cross(2,False)
        delays=[next((o-t for o in outs if o>=t),None) for t in ins]; valid=[x for x in delays if x is not None]
        measurements['tpHL_s']=sum(valid)/len(valid) if valid else None
        measurements['delay_method']='Mean linearly interpolated half-supply rising-input to subsequent falling-output crossing.'
    if analysis=='ac':
        measurements['current_flow_status']='unsupported_complex_ac'
        manifest['current_flow']={'status':'unsupported_complex_ac','reason':'AC currents are complex phasors; a real scalar arrow would misrepresent their direction.'}
    else:
        run['current_flow']=current_flow.read(folder,p,analysis,xunit,branches,load_layout(p))
        run['current_flow'].update(project_id=p['id'],run_id=run['id'],layout_sha256=profile.sha(folder/'input.oas'),notes=[current_flow.METHOD,*warnings])
        measurements['current_flow_status']='available_partial' if warnings else 'available'
        manifest['current_flow']={'status':measurements['current_flow_status'],'method':current_flow.METHOD,'warnings':warnings,'branches':[dict(b,values_A=None) for b in run['current_flow']['branches']]}
        run['artifacts'].update(current_flow_data=str(folder/'current-flow.dat'),current_probe_netlist=str(probe_netlist))
        if run['current_flow'].get('node_voltages'):
            run['artifacts'].update(node_voltage_data=str(folder/'node-voltages.dat'),node_voltage_probes=str(folder/'voltage-probes.json'))
    if p.get('design_template'):
        run['measurements']=measurements
        design_tools.measurements(p,run,params)
        measurements=run['measurements']
    if p.get('digital_unit'):
        run['measurements']=measurements
        digital_units.verify(p,run,params)
        measurements=run['measurements']
    verdict=run.get('digital_verification') or run.get('unit_verification')
    result='fail' if verdict and not verdict['pass'] else 'pass'
    suffix=f"; {verdict.get('kind','MUX')} truth {verdict['passed_cases']}/{verdict['expected_cases']}" if verdict else ''
    run.update(analysis_result=result,waveforms=run['waveforms'],measurements=measurements,message=f'Actual ngspice {params.get("analysis","tran")}: {len(values)} samples.'+suffix)
    run['artifacts'].update(testbench=str(deck),waveform_data=str(path),waveform_raw=str(folder/'waveform.raw'),reference_netlist=str(netlist))

def execute_job(run,p,params,folder):
    begin=time.monotonic()
    with LOCK:
        current=json.loads(DB.execute('SELECT data FROM runs WHERE id=?',(run['id'],)).fetchone()[0])
        if current['execution_status']=='canceled':
            dump(folder/'manifest.json',{'schema_version':1,'run_id':run['id'],'project_id':p['id'],'revision':p['revision'],'execution_status':'canceled','analysis_result':'unknown',
                 'layout_hash':profile.sha(folder/'input.oas'),'input_signature':run['input_signature'],'settings':params,'commands':[],'ended_at':current.get('ended_at'),
                 'message':'Canceled while queued; no native engine was launched.'})
            return
        run.update(execution_status='running',started_at=now()); put_run(run)
    manifest={'schema_version':1,'parser_version':'mos-eda-1','run_id':run['id'],'project_id':p['id'],'cell':p['cell'],'revision':p['revision'],'started_at':run['started_at'],
              'input_signature':run['input_signature'],'settings':params,'commands':[]}
    try:
        manifest.update(layout_hash=profile.sha(folder/'input.oas'),schematic_hash=hashlib.sha256(json.dumps(p['schematic'],sort_keys=True).encode()).hexdigest(),pdk=profile.provenance(),
                        toolchain=doctor(),tool_binaries=tool_hashes(),model_files=initial_models())
        if params.get('_pvt'):pvt.execute(run,p,folder,manifest,params)
        elif params.get('_configured'):configured_analysis.execute(run,p,folder,manifest,params)
        elif run['kind']=='simulation': run['tool']='ngspice'; simulation(run,p,folder,manifest,params)
        elif run['kind']=='drc': run['tool']='Magic'; drc(run,p,folder,manifest)
        elif run['kind']=='lvs': run['tool']='Magic + Netgen'; lvs(run,p,folder,manifest)
        elif run['kind']=='pex': run['tool']='Magic'; extract(run,p,folder,manifest,pex=True)
        run['execution_status']='completed'
    except Exception as e:
        run.update(execution_status='canceled' if isinstance(e,EDAError) and e.code=='CANCELED' else 'failed',analysis_result='unknown',message=str(e))
        manifest['error']={'code':getattr(e,'code','ENGINE_ERROR'),'message':str(e)}
        try:
            with (folder/'stdout.log').open('a') as f: f.write('\nERROR: '+str(e)+'\n')
        except OSError as log_error:print('Job error log could not be saved: '+str(log_error),file=sys.stderr,flush=True)
    run.update(ended_at=now(),elapsed_s=time.monotonic()-begin)
    run['artifacts']['stdout']=str(folder/'stdout.log')
    write_job_evidence(run,manifest,folder,dump,profile.sha)
    # Canceled state is authoritative even if cancellation races process completion.
    with LOCK:
        current=json.loads(DB.execute('SELECT data FROM runs WHERE id=?',(run['id'],)).fetchone()[0])
        if current['execution_status']=='canceled':
            run.update(execution_status='canceled',analysis_result='unknown')
            write_job_evidence(run,manifest,folder,dump,profile.sha)
        put_run(run)

def rpc(method,params):
    if any(str(key).startswith('_') for key in params):raise EDAError('PRIVATE_PARAMETER','Internal engine settings cannot be supplied through public RPC.')
    if method.startswith('pvt.'):return pvt.rpc(method,params)
    if method.startswith('design.'):return design_tools.rpc(method,params)
    if method.startswith('starter.'):return semiconductor_starters.rpc(method,params)
    if method.startswith('digital.'):return digital_units.rpc(method,params)
    if method.startswith('hierarchy.'):return hierarchy_transfer.rpc(method,params)
    if method.startswith('database.'):return native_database.rpc(method,params)
    if method.startswith('compat.'):return interchange.rpc(method,params)
    if method=='backend.read_artifact' and get_run(params['run_id']).get('workflow')=='imported-results':return interchange.read_artifact(params)
    if method.startswith('backend.'):return commercial_backend.rpc(method,params)
    if method=='toolchain.doctor': return doctor(refresh=params.get('refresh') is True)
    if method=='pdk.list_profiles': return pdk_registry.list_profiles()
    if method=='pdk.register': return pdk_registry.register(params)
    if method=='pdk.validate': return pdk_registry.validate(params)
    if method=='analysis.inspect': return configured_analysis.inspect(params)
    if method=='analysis.configure':
        replay=completed_receipt(method,params)
        if replay is not None:return replay
        prepared=configured_analysis.prepare_configuration(params)
        return mutate(method,params,lambda:configured_analysis.configure_project(params,prepared))
    if method=='analysis.run': return mutate(method,params,lambda:configured_analysis.start(params,'simulation'))
    if method=='analysis.verify': return mutate(method,params,lambda:configured_analysis.start(params,params.get('kind')))
    if method=='pdk.capabilities': return profile.capabilities()
    if method=='experiment.create': return mutate(method,params,lambda:experiments.create(params))
    if method=='experiment.evaluate': return mutate(method,params,lambda:experiments.evaluate(params))
    if method=='experiment.status': return experiments.status(params)
    if method=='experiment.list':
        with LOCK: return [json.loads(row[0]) for row in DB.execute('SELECT data FROM experiments ORDER BY rowid ASC') if json.loads(row[0])['project_id']==params['project_id']]
    if method=='experiment.cancel': return experiments.cancel(params)
    if method=='experiment.compare': return experiments.compare(params)
    if method=='project.create': return create(params)
    if method=='project.rename': return mutate(method,params,lambda:rename_project(params))
    if method=='project.clone': return mutate(method,params,lambda:clone_project(params))
    if method=='project.export_bundle': return export_bundle(params)
    if method=='project.import_bundle': return mutate(method,params,lambda:import_bundle(params))
    if method=='project.command_receipt':
        with LOCK:
            row=DB.execute('SELECT payload_hash,result,revision FROM receipts WHERE project_id=? AND command_id=?',(params['project_id'],params['command_id'])).fetchone()
            return {'payload_hash':row[0],'result':json.loads(row[1]),'revision':row[2]} if row else None
    if method in ('project.open','project.save','project.snapshot'): return get_project(params['project_id'])
    if method=='project.list':
        with LOCK: return project_index.list_projects(DB,params.get('metadata_only') is True)
    if method=='view.get_scene':
        p=get_project(params['project_id']); layout=load_layout(p); return interchange.decorate_scene(layout,p,geo.scene(layout,p,p['layers'],params))
    if method=='extraction.get_net_mapping':
        p=get_project(params['project_id']); candidates=[r for r in p['runs'] if r.get('artifacts',{}).get('pex_netlist') and r['execution_status']=='completed']
        run=get_run(params['run_id']) if params.get('run_id') else (candidates[-1] if candidates else None)
        if run is None or run['project_id']!=p['id'] or not run.get('artifacts',{}).get('pex_netlist'): raise EDAError('NOT_FOUND','Run actual PEX before inspecting extracted elements.')
        elements=[]; scale={'':1,'t':1e12,'g':1e9,'meg':1e6,'k':1e3,'m':1e-3,'u':1e-6,'n':1e-9,'p':1e-12,'f':1e-15}; cell=''
        for row in Path(run['artifacts']['pex_netlist']).read_text().splitlines():
            fields=row.split()
            if fields and fields[0].lower()=='.subckt': cell=fields[1]
            if len(fields)<4 or fields[0][0].upper() not in {'R','C'}: continue
            match=re.fullmatch(r'([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?)(meg|[tgkmunpf]?)',fields[3],re.I)
            if not match: raise EDAError('PARSER_FAILED','Extracted R/C value uses unsupported native syntax.')
            value=float(match.group(1))*scale[match.group(2).lower()]; kind=fields[0][0].upper()
            elements.append({'id':cell+'/'+fields[0],'kind':kind,'nodes':fields[1:3],'value':value,'unit':'ohm' if kind=='R' else 'F'})
        return {'project_id':p['id'],'run_id':run['id'],'revision':run['revision'],'freshness':run['freshness'],'source':'actual-magic-pex-spice','elements':elements,'mapping_status':'native electrical nodes; exact polygon correspondence unknown','netlist_path':run['artifacts']['pex_netlist']}
    if method=='layout.apply_command': return mutate(method,params,lambda:edit(params['project_id'],params['command'],'layout'))
    if method=='schematic.apply_command': return mutate(method,params,lambda:edit(params['project_id'],params['command'],'schematic',params.get('cell_name')))
    if method=='schematic.validate': return native.validate(get_project(params['project_id'])['schematic'],params.get('cell_name'))
    if method=='schematic.export_spice':
        p=get_project(params['project_id']); text=native.emit(p['schematic'],p['cell'],p['ports']); d=STATE/'projects'/p['id']/'exports'; d.mkdir(exist_ok=True); dest=d/f'{p["cell"]}-r{p["revision"]}.spice'; dest.write_text(text); return {'path':str(dest),'text':text}
    if method=='schematic.netlist_xschem':
        p=get_project(params['project_id']); return xschem_bridge.netlist(p,STATE/'projects'/p['id']/'exports'/f'xschem-r{p["revision"]}')
    if method=='layout.export': return export_layout(params)
    if method=='layout.generate_pcell': return mutate(method,params,lambda:generate_pcell(params))
    if method=='layout.import': return mutate(method,params,lambda:import_layout(params))
    kinds={'simulation.run':'simulation','verification.run_drc':'drc','verification.run_lvs':'lvs','extraction.run_pex':'pex'}
    if method in kinds: return mutate(method,params,lambda:start_job(params,kinds[method]))
    if method=='job.status': return get_run(params['run_id'])
    if method=='job.logs':
        r=get_run(params['run_id']); folder=STATE/'runs'/r['id']; f=folder/'stdout.log'; logs=f.read_text(errors='replace') if f.is_file() else ''
        if not logs: logs='\n'.join(p.read_text(errors='replace') for p in sorted(folder.glob('*.log')))
        return {'text':logs[-1048576:]}
    if method=='job.cancel':
        with LOCK:
            r=get_run(params['run_id'])
            if r['execution_status'] in {'queued','running'}:
                r.update(execution_status='canceled',analysis_result='unknown',message='Canceled by user.',ended_at=now()); put_run(r)
                proc=PROCESSES.get(r['id'])
                if proc:
                    try: os.killpg(proc.pid,signal.SIGTERM)
                    except ProcessLookupError: pass
            return r
    raise EDAError('UNSUPPORTED',f'Unsupported method: {method}')

class Handler(BaseHTTPRequestHandler):
    server_version='MOSWorker/1'
    def log_message(self,*args): pass
    def send(self,status,value):
        payload=json.dumps(value,ensure_ascii=False).encode(); self.send_response(status); self.send_header('Content-Type','application/json; charset=utf-8'); self.send_header('Content-Length',str(len(payload))); self.send_header('Cache-Control','no-store'); self.end_headers(); self.wfile.write(payload)
    def do_GET(self):
        if self.path=='/health': return self.send(200,{'service':'mos-eda','protocol_version':1})
        self.send(404,{'ok':False,'error':{'code':'NOT_FOUND','message':'Unknown endpoint.'}})
    def do_POST(self):
        if self.path!='/rpc': return self.send(404,{'ok':False,'error':{'code':'NOT_FOUND','message':'Unknown endpoint.'}})
        supplied=self.headers.get('X-MOS-Token','')
        if not TOKEN or not hmac.compare_digest(supplied,TOKEN): return self.send(401,{'ok':False,'error':{'code':'UNAUTHORIZED','message':'Authenticated session required.'}})
        try:
            length=int(self.headers.get('Content-Length','0'))
            if length<1 or length>48*1024*1024: raise EDAError('INVALID_REQUEST','RPC request limit is 48 MiB including inline project bundles.')
            body=json.loads(self.rfile.read(length)); method=body.get('method'); params=body.get('params',{})
            if not isinstance(method,str) or not isinstance(params,dict): raise EDAError('INVALID_REQUEST','Expected method string and params object.')
            result=rpc(method,params); self.send(200,{'ok':True,'result':result})
        except EDAError as e: self.send(200,{'ok':False,'error':{'code':e.code,'message':str(e),'details':e.details}})
        except (ValueError,KeyError,TypeError) as e: self.send(200,{'ok':False,'error':{'code':'INVALID_REQUEST','message':str(e)}})
        except Exception as e: self.send(200,{'ok':False,'error':{'code':'ENGINE_ERROR','message':str(e)}})

experiments.configure(sys.modules[__name__])
pdk_registry.configure(sys.modules[__name__])
configured_analysis.configure(sys.modules[__name__])
commercial_backend.configure(sys.modules[__name__])
interchange.configure(sys.modules[__name__])
native_database.configure(sys.modules[__name__])
pvt.configure(sys.modules[__name__])
design_tools.configure(sys.modules[__name__])
semiconductor_starters.configure(sys.modules[__name__])
digital_units.configure(sys.modules[__name__])
hierarchy_transfer.configure(sys.modules[__name__])

if __name__=='__main__':
    if not TOKEN: raise SystemExit('MOS_TOKEN must be provided by the local runner.')
    # A worker restart cannot silently leave interrupted jobs marked running forever.
    for row in list(DB.execute("SELECT data FROM runs WHERE json_extract(data,'$.execution_status') IN ('queued','running')")):
        interrupted=json.loads(row[0])
        if interrupted['execution_status'] in {'queued','running'}:
            interrupted.update(execution_status='failed',analysis_result='unknown',ended_at=now(),message='Worker restarted before the job finished. Rerun required.')
            folder=STATE/'runs'/interrupted['id']; folder.mkdir(parents=True,exist_ok=True)
            with (folder/'stdout.log').open('a') as f: f.write('\nERROR: Worker restarted before job completion.\n')
            if not (folder/'manifest.json').is_file(): dump(folder/'manifest.json',{'schema_version':1,'run_id':interrupted['id'],'revision':interrupted['revision'],'execution_status':'failed','analysis_result':'unknown','error':{'code':'WORKER_RESTARTED','message':interrupted['message']}})
            put_run(interrupted)
    for row in list(DB.execute("SELECT data FROM experiments WHERE json_extract(data,'$.execution_status')='running'")):
        interrupted=json.loads(row[0])
        if interrupted['execution_status']=='running':
            interrupted.update(execution_status='failed',message='Worker restarted during experiment; completed native trial artifacts remain available.',ended_at=now(),active_run_ids=[])
            for trial in interrupted.get('trials',[]):
                if trial.get('execution_status') in {'queued','running'}:
                    trial.update(execution_status='failed',feasible=False,score=None,error_code='WORKER_RESTARTED',reason='Worker restarted before this trial completed; native runs are failed/unknown.')
            experiments.put(interrupted)
    pvt.recover_interrupted()
    # Containers must publish exclusively to 127.0.0.1; binding 0.0.0.0 here reaches the Docker bridge only.
    print('MOS EDA worker protocol 1 ready.',flush=True)
    ThreadingHTTPServer((os.environ.get('MOS_BIND','127.0.0.1'),int(os.environ.get('MOS_PORT','8765'))),Handler).serve_forever()
