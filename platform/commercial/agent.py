"""Authenticated operator companion for licensed Linux/Windows hosts; no remote registration API.

python agent.py --profiles operator-profiles.json --state private-state --token-file private-state/agent.token
The profiles file contains {allowed_roots:[...],profiles:[local BackendManifest,...]}.
"""
from __future__ import annotations
import argparse, base64, concurrent.futures, hmac, json, os, secrets, signal, sqlite3, threading, time, uuid
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import runner

def private_token(path):
    p=Path(path).absolute();p.parent.mkdir(parents=True,exist_ok=True)
    if p.is_symlink():runner.fail('UNSAFE_TOKEN_FILE','Token file must not be a symlink.')
    if not p.exists():
        fd=os.open(str(p),os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,'w') as f:f.write(secrets.token_urlsafe(48)+'\n')
        if os.name=='nt':
            import subprocess
            user=os.environ.get('USERNAME','')
            if not user:runner.fail('TOKEN_PERMISSION','Unable to determine Windows operator identity.')
            r=subprocess.run(['icacls',str(p),'/inheritance:r','/grant:r',user+':F'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            if r.returncode:runner.fail('TOKEN_PERMISSION','Unable to restrict Windows token ACL.')
    if os.name!='nt' and p.stat().st_mode&0o077:runner.fail('TOKEN_PERMISSION','Token file requires owner-only permissions (0600).')
    token=p.read_text().strip()
    if len(token)<32 or len(token)>512:runner.fail('INVALID_TOKEN','Expected a bounded private token file.')
    return token

class Service:
    def __init__(self,config,state):
        self.state=Path(state).resolve();self.state.mkdir(parents=True,exist_ok=True);self.lock=threading.RLock();self.pool=concurrent.futures.ThreadPoolExecutor(max_workers=2);self.processes={}
        if not isinstance(config,dict) or set(config)-{'allowed_roots','profiles'}:runner.fail('INVALID_CONFIG','Invalid operator config.')
        roots=config.get('allowed_roots')
        if not isinstance(roots,list) or not roots:runner.fail('INVALID_CONFIG','Operator must declare allowed resource roots.')
        self.profiles={}
        for manifest in config.get('profiles',[]):
            m=runner.normalize(manifest,roots)
            if m['id'] in self.profiles:runner.fail('INVALID_CONFIG','Profile IDs must be unique.')
            self.profiles[m['id']]=m
        self.db=sqlite3.connect(self.state/'jobs.sqlite3',check_same_thread=False);self.db.execute('PRAGMA busy_timeout=30000');self.db.executescript('CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,data TEXT); CREATE TABLE IF NOT EXISTS receipts(command_id TEXT PRIMARY KEY,payload_hash TEXT,job_id TEXT);');self.db.commit()
        for row in list(self.db.execute('SELECT data FROM jobs')):
            job=json.loads(row[0])
            if job['execution_status'] in ('queued','running'):
                if job.get('process_pid'):job['interrupted_process_stopped']=runner.stop_interrupted(job['process_pid'],job.get('process_identity'))
                # Record uncertainty; never replay a potentially completed licensed operation.
                job.update(execution_status='failed',analysis_result='unknown',error_code='AGENT_RESTARTED',message='Agent restarted before completion; retained outputs are unverified.',ended_at=time.time());self.put(job)
                d=self.state/'jobs'/job['id'];d.mkdir(parents=True,exist_ok=True);(d/'restart.json').write_text(json.dumps(job))
    def put(self,job):
        with self.lock:self.db.execute('INSERT OR REPLACE INTO jobs VALUES(?,?)',(job['id'],json.dumps(job)));self.db.commit()
    def get(self,jid):
        with self.lock:
            row=self.db.execute('SELECT data FROM jobs WHERE id=?',(jid,)).fetchone()
            if not row:runner.fail('NOT_FOUND','Agent job not found.')
            return json.loads(row[0])
    def profile(self,pid):
        m=self.profiles.get(pid)
        if not m:runner.fail('NOT_FOUND','Operator profile not found.')
        return m
    def submit(self,params):
        if set(params)-{'profile_id','settings','input_package','command_id','pinned_fingerprint'}:runner.fail('INVALID_REQUEST','Unknown submit fields.')
        cid=params.get('command_id')
        if not isinstance(cid,str) or not __import__('re').fullmatch(r'[A-Za-z0-9_.:-]{1,160}',cid):runner.fail('INVALID_COMMAND_ID','Command ID must be a bounded receipt identifier.')
        signature=runner.digest(params)
        with self.lock:
            receipt=self.db.execute('SELECT payload_hash,job_id FROM receipts WHERE command_id=?',(cid,)).fetchone()
            if receipt:
                if receipt[0]!=signature:runner.fail('IDEMPOTENCY_CONFLICT','Command ID already bound to another input.')
                return self.get(receipt[1])
        m=self.profile(params['profile_id']);locked=runner.lock(m)
        if params.get('pinned_fingerprint')!=locked['fingerprint']:runner.fail('BACKEND_CHANGED','Remote operator resources changed.')
        if not locked['available']:runner.fail('BACKEND_UNAVAILABLE','Native operator resources unavailable.')
        settings=params.get('settings',{})
        if not isinstance(settings,dict) or set(settings)-{'profile_id','profile_hash','operation','top_cell','parameters','netlist_text'}:runner.fail('INVALID_SETTINGS','Only typed analysis inputs are accepted.')
        op=settings.get('operation');recipe=m['runner']['recipes'].get(op)
        if recipe is None:runner.fail('UNSUPPORTED_OPERATION','No operator recipe for requested operation.')
        runner.identifier(settings.get('top_cell'));runner.parameters(recipe,settings.get('parameters',{}));inputs=runner.unpack(params['input_package'])
        if any(len(v)>runner.MAX_INPUT for v in inputs.values()) or sum(map(len,inputs.values()))>runner.MAX_INPUT:runner.fail('INPUT_TOO_LARGE','Bounded aggregate input size exceeded.')
        if inputs.get('reference.spice'):safe_reference(inputs['reference.spice'].decode('utf-8'))
        # The settings snapshot is generated on this authority; ignore uploaded settings JSON.
        inputs['settings.json']=runner.canonical(settings)
        with self.lock:
            receipt=self.db.execute('SELECT payload_hash,job_id FROM receipts WHERE command_id=?',(cid,)).fetchone()
            if receipt:
                if receipt[0]!=signature:runner.fail('IDEMPOTENCY_CONFLICT','Command ID already bound to another input.')
                return self.get(receipt[1])
            if self.db.execute("SELECT count(*) FROM jobs WHERE json_extract(data,'$.execution_status') IN ('queued','running')").fetchone()[0]>=16:runner.fail('QUEUE_LIMIT','Agent queue is limited to 16 jobs.')
            jid=uuid.uuid4().hex;folder=self.state/'jobs'/jid;folder.mkdir(parents=True);(folder/'request.json').write_bytes(runner.canonical({'profile_id':m['id'],'settings':settings,'payload_hash':signature,'fingerprint':locked['fingerprint'],'input_hashes':{n:__import__('hashlib').sha256(v).hexdigest() for n,v in inputs.items()}}))
            job={'id':jid,'profile_id':m['id'],'operation':op,'execution_status':'queued','analysis_result':'unknown','fingerprint':locked['fingerprint'],'outputs':{},'created_at':time.time(),'result_context':recipe['result_context']}
            self.db.execute('BEGIN IMMEDIATE');self.db.execute('INSERT INTO jobs VALUES(?,?)',(jid,json.dumps(job)));self.db.execute('INSERT INTO receipts VALUES(?,?,?)',(cid,signature,jid));self.db.commit()
            self.pool.submit(self.execute,job,m,settings,inputs,folder);return job
    def execute(self,job,m,settings,inputs,folder):
        with self.lock:
            if self.get(job['id'])['execution_status']=='canceled':return
            job.update(execution_status='running',started_at=time.time());self.put(job)
        def on_process(proc):
            with self.lock:
                current=self.get(job['id'])
                if proc is None:
                    self.processes.pop(job['id'],None);current.pop('process_pid',None);current.pop('process_identity',None)
                else:
                    self.processes[job['id']]=proc;current.update(process_pid=proc.pid,process_identity=runner.process_identity(proc.pid))
                self.put(current)
        try:
            result=runner.execute(m,settings,inputs,folder,job['fingerprint'],lambda:self.get(job['id'])['execution_status']=='canceled',on_process)
            job.update(result,execution_status='completed' if not result.get('error_code') else 'canceled' if result['error_code']=='CANCELED' else 'failed',analysis_result='unknown')
        except Exception as e:job.update(execution_status='canceled' if getattr(e,'code','')=='CANCELED' else 'failed',analysis_result='unknown',error_code=getattr(e,'code','EXECUTION_ERROR'),message=runner.scrub(str(e),m['runner']['env_names']))
        job['ended_at']=time.time()
        with self.lock:
            if self.get(job['id'])['execution_status']=='canceled':job.update(execution_status='canceled',analysis_result='unknown')
            self.put(job);(folder/'execution.json').write_bytes(runner.canonical(job))
    def rpc(self,method,p):
        if method=='profile.list':return [runner.public(m,runner.lock(m)) for m in self.profiles.values()]
        if method=='profile.validate':return runner.public(self.profile(p['profile_id']),runner.lock(self.profile(p['profile_id'])))
        if method=='profile.check_settings':
            m=self.profile(p['profile_id']);s=p['settings']
            if not isinstance(s,dict) or set(s)-{'profile_id','profile_hash','operation','top_cell','parameters','netlist_text'}:runner.fail('INVALID_SETTINGS','Only typed analysis inputs are accepted.')
            runner.identifier(s.get('top_cell'));recipe=m['runner']['recipes'].get(s.get('operation'))
            if recipe is None:runner.fail('UNSUPPORTED_OPERATION','Operator recipe unavailable.')
            if s.get('netlist_text') is not None:safe_reference(s['netlist_text'])
            return {'parameters':runner.parameters(recipe,s.get('parameters',{}))}
        if method=='job.submit':return self.submit(p)
        if method=='job.status':return self.get(p['job_id'])
        if method=='job.cancel':
            with self.lock:
                j=self.get(p['job_id'])
                if j['execution_status'] in ('queued','running'):j.update(execution_status='canceled',analysis_result='unknown',ended_at=time.time());self.put(j)
                return j
        if method=='job.artifact':
            j=self.get(p['job_id']);key=p['key'];folder=self.state/'jobs'/j['id'];data=None;name=None
            if key=='stdout':path=folder/'stdout.log';name='stdout.log'
            elif key in j.get('outputs',{}):name=runner.relative(j['outputs'][key]['path']);path=folder/'outputs'/name
            else:runner.fail('NOT_FOUND','Artifact is not declared by the completed recipe.')
            if not path.is_file() or path.is_symlink() or not path.resolve().is_relative_to(folder.resolve()) or path.stat().st_size>runner.MAX_ARTIFACT:runner.fail('NOT_FOUND','Bounded regular artifact unavailable.')
            data=path.read_bytes()
            if key!='stdout' and __import__('hashlib').sha256(data).hexdigest()!=j['outputs'][key]['sha256']:runner.fail('ARTIFACT_CHANGED','Immutable artifact changed.')
            return {'name':name,'base64':base64.b64encode(data).decode(),'sha256':__import__('hashlib').sha256(data).hexdigest()}
        runner.fail('UNSUPPORTED','Unsupported agent method.')

def safe_reference(text):
    if not isinstance(text,str):runner.fail('INVALID_REFERENCE','Netlist must be UTF-8 text.')
    if len(text.encode())>256*1024:runner.fail('INVALID_REFERENCE','Netlist input is limited to 256 KiB.')
    from re import match
    logical=[]
    for line in text.splitlines():
        if line.lstrip().startswith('+'):
            if not logical:runner.fail('UNSAFE_REFERENCE','Orphan SPICE continuation.')
            logical[-1]+=' '+line.lstrip()[1:]
        else:logical.append(line)
    for line in logical:
        line=line.strip()
        if not line or line.startswith('*'):continue
        if line.startswith('.') and line.split()[0].lower() not in {'.subckt','.ends','.model','.param','.global','.end','.op','.dc','.tran','.ac','.save','.print','.probe','.option','.options','.temp'}:runner.fail('UNSAFE_REFERENCE','Client netlists cannot contain scripts, includes, or runtime commands.')
        if not line.startswith('.') and (line[0].upper() not in 'RCLVIDQMEFGHX' or not match(r'[A-Za-z][A-Za-z0-9_.:!-]*\s',line)):runner.fail('UNSAFE_REFERENCE','Unsupported input element.')
        if any(x in line.lower() for x in ('d_process','osdi','codemodel','shell','exec','system(','file(','fopen','pwlfile','external')) or __import__('re').search(r'\b(?:file|filename)\s*=',line,__import__('re').I):runner.fail('UNSAFE_REFERENCE','Executable/external-file model syntax is unsupported.')
        if line.lower().startswith('.model'):
            fields=line.split()
            if len(fields)<3 or fields[2].split('(')[0].lower() not in {'nmos','pmos','njf','pjf','npn','pnp','d','r','c','l','sw','csw','urc'}:runner.fail('UNSAFE_REFERENCE','Only classic data-only model families are supported.')
    return text

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--profiles',required=True);parser.add_argument('--state',required=True);parser.add_argument('--token-file',required=True);parser.add_argument('--bind',default='127.0.0.1');parser.add_argument('--port',type=int,default=8878);args=parser.parse_args()
    token=private_token(args.token_file);service=Service(json.loads(Path(args.profiles).read_text()),args.state)
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args):pass
        def send(self,status,value):
            data=json.dumps(value).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data)
        def do_GET(self):self.send(200 if self.path=='/health' else 404,{'service':'register-commercial-agent','protocol_version':1} if self.path=='/health' else {'error':'NOT_FOUND'})
        def do_POST(self):
            if self.path!='/rpc':return self.send(404,{'ok':False,'error':{'code':'NOT_FOUND','message':'Unknown endpoint.'}})
            if not hmac.compare_digest(self.headers.get('X-Register-Agent-Token',''),token):return self.send(401,{'ok':False,'error':{'code':'UNAUTHORIZED','message':'Private agent token required.'}})
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 1<=length<=48*1024*1024:runner.fail('INVALID_REQUEST','Request must be bounded to 48 MiB.')
                body=json.loads(self.rfile.read(length));result=service.rpc(body['method'],body.get('params',{}));self.send(200,{'ok':True,'result':result})
            except Exception as e:self.send(200,{'ok':False,'error':{'code':getattr(e,'code','INVALID_REQUEST'),'message':runner.scrub(str(e),[n for m in service.profiles.values() for n in m['runner']['env_names']])}})
    server=ThreadingHTTPServer((args.bind,args.port),Handler)
    def stop(*_):
        for jid in list(service.processes):service.rpc('job.cancel',{'job_id':jid});runner.terminated(service.processes[jid])
        os._exit(0)
    signal.signal(signal.SIGTERM,stop)
    print('Register operator agent protocol 1 ready; credentials remain in private token file.',flush=True);server.serve_forever()
if __name__=='__main__':main()
