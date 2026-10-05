"""Actual open-source native/agent transport regression. Never a vendor-license test."""
import base64,copy,hashlib,json,os,secrets,shutil,signal,subprocess,time,urllib.request,uuid
from pathlib import Path

ROOT=Path('/workspace');folder=ROOT/'.runtime/evidence'/('commercial-'+uuid.uuid4().hex);folder.mkdir(parents=True);cases=[];worker=None;agent=None
port=8891;aport=8892;token=secrets.token_urlsafe(40);env={**os.environ,'MOS_STATE':str(folder/'native-state'),'MOS_BIND':'127.0.0.1','MOS_PORT':str(port),'MOS_TOKEN':token}
log=(folder/'worker.log').open('w');alog=(folder/'agent.log').open('w')
def call(method,params={}):
    request=urllib.request.Request(f'http://127.0.0.1:{port}/rpc',json.dumps({'method':method,'params':params}).encode(),{'Content-Type':'application/json','X-MOS-Token':token})
    with urllib.request.urlopen(request,timeout=15) as response:return json.load(response)
def rpc(method,params={}):
    result=call(method,params);assert result['ok'],result.get('error');return result['result']
def reject(name,method,params,code):
    result=call(method,params);assert not result['ok'] and result['error']['code']==code,result;cases.append({'case':name,'result':'pass','error_code':code})
def wait(run,status='completed',result='pass'):
    start=time.monotonic()
    while time.monotonic()-start<40:
        run=rpc('job.status',{'run_id':run['id']})
        if run['execution_status'] not in ('queued','running'):
            assert run['execution_status']==status and run['analysis_result']==result,(run.get('message'),run);return run
        time.sleep(.1)
    raise AssertionError('Actual transport/native job exceeded bounded test time')
def entry(name,run=None,**extra):cases.append({'case':name,'result':'pass',**({'run_id':run['id'],'manifest_path':run['manifest_path'],'elapsed_s':run.get('elapsed_s')} if run else {}),**extra})
def configure(p,pid,op='simulation',**extra):
    return rpc('backend.configure',{'project_id':p['id'],'settings':{'profile_id':pid,'operation':op,'top_cell':p['cell'],**extra},'expected_revision':p['revision'],'command_id':uuid.uuid4().hex})
def startup(proc_port):
    for _ in range(200):
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{proc_port}/health',timeout=1) as response:
                if response.status==200:return
        except OSError:time.sleep(.05)
    raise AssertionError('Isolated service startup failed')
try:
    worker=subprocess.Popen(['python3',str(ROOT/'workers/eda/server.py')],env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True);startup(port)
    cat=rpc('backend.catalog');assert len(cat['tools'])==18 and all(t['verification']=='unverified' for t in cat['tools'] if t['vendor']!='Open source');entry('All seventeen commercial families are install-later/unverified; ngspice explicitly open source')
    original=json.loads((ROOT/'adapters/commercial/calibration-ngspice.manifest.json').read_text());original['runner']['executable']=shutil.which('ngspice')
    original['id']='actual-local-'+uuid.uuid4().hex[:8];deck=folder/'calibration.spice';deck.write_bytes((ROOT/'adapters/commercial/examples/resistor-calibration.spice').read_bytes());original['runner']['resources']['deck']=str(deck)
    public=rpc('backend.register',{'manifest':original});assert public['available'] and public['status']=='available-unverified';assert not {'executable','env_names','token_file','resources','recipes'}&set(public);assert str(deck) not in json.dumps(public);entry('Local operator profile registration/hash; no public resources/credentials',fingerprint=public['fingerprint'])
    assert rpc('backend.validate',{'profile_id':original['id']})['valid'];entry('Actual local native executable/resource availability; license remains unverified')
    unavailable=json.loads((ROOT/'adapters/commercial/templates/spectre.json').read_text());unavailable['id']='absent-spectre';pvendor=rpc('backend.register',{'manifest':unavailable});assert not pvendor['available'];entry('Absent licensed Spectre remains unavailable')
    p=rpc('project.create',{'example':'fixture','name':'Commercial transport actual fixture'});p=configure(p,unavailable['id']);reject('No vendor process or fake result when native binary absent','backend.run',{'project_id':p['id']},'BACKEND_UNAVAILABLE')
    bad=copy.deepcopy(original);bad['id']='shell-reject';bad['runner']['executable']='/usr/bin/bash';reject('Shell/interpreter executable is outside named native-tool API','backend.register',{'manifest':bad},'UNSUPPORTED_EXECUTABLE')
    bad=copy.deepcopy(original);bad['id']='env-reject';bad['runner']['env']={'PASSWORD':'not-a-real-secret'};reject('Environment values rejected; only names allowed','backend.register',{'manifest':bad},'INVALID_BACKEND_MANIFEST')
    p=configure(p,original['id']);params={'project_id':p['id'],'expected_revision':p['revision'],'command_id':uuid.uuid4().hex};submitted=rpc('backend.run',params);assert rpc('backend.run',params)['id']==submitted['id'];run=wait(submitted)
    assert abs(run['waveforms'][0]['y'][0]-1)<1e-10;currents=run['current_flow']['branches'];assert abs(currents[0]['values_A'][0]+.001)<1e-10 and abs(currents[1]['values_A'][0]-.001)<1e-10;assert all(b['mapping']=='unmapped' for b in currents)
    entry('Actual local ngspice OP: 1 V and signed source/resistor -/+1 mA; exact-once receipt',run)
    data=rpc('backend.read_artifact',{'run_id':run['id'],'key':'currents'});assert b'1.00000000e-03' in base64.b64decode(data['base64']);entry('Scoped actual current artifact download',run)
    reject('Arbitrary filesystem artifact key rejected','backend.read_artifact',{'run_id':run['id'],'key':'../../agent.token'},'NOT_FOUND')
    reject('Client control scripting rejected before native run','backend.configure',{'project_id':p['id'],'settings':{'profile_id':original['id'],'operation':'simulation','top_cell':p['cell'],'netlist_text':'.control\nshell touch /tmp/no\n.endc'}},'UNSAFE_REFERENCE')
    reject('Client external source-file reading rejected','backend.configure',{'project_id':p['id'],'settings':{'profile_id':original['id'],'operation':'simulation','top_cell':p['cell'],'netlist_text':'V1 n 0 PWL FILE="/etc/passwd"'}},'UNSAFE_REFERENCE')
    reject('Stale project precondition rejected','backend.run',{'project_id':p['id'],'expected_revision':1},'REVISION_CONFLICT')
    deck.write_text(deck.read_text().replace('V1 out 0 1','V1 out 0 2'));assert rpc('job.status',{'run_id':run['id']})['freshness']=='stale';entry('Changed operator model/deck invalidates stored run at same project revision',run)
    reject('Changed resource signature blocks new native job','backend.run',{'project_id':p['id']},'BACKEND_CHANGED');assert rpc('backend.run',params)['id']==run['id'];entry('Successful receipt survives changed profile without duplicated process',run)
    deck.write_text(deck.read_text().replace('V1 out 0 2','V1 out 0 1'))
    # Real standard-library HTTP companion on a distinct operator state/profile.
    remote_profile=copy.deepcopy(original);remote_profile['id']='agent-open-source';remote_slow=copy.deepcopy(original);remote_slow['id']='agent-slow';remote_deck=folder/'remote-slow.spice';remote_deck.write_text('* actual long transient restart calibration\nV1 out 0 1\nR1 out 0 1000\nC1 out 0 1p\n.control\nset num_threads=1\ntran 1p 1m\nquit\n.endc\n.end\n');remote_slow['runner']['resources']['deck']=str(remote_deck);remote_slow['runner']['recipes']['simulation']['timeout_s']=3
    cfg=folder/'operator-profiles.json';cfg.write_text(json.dumps({'allowed_roots':['/workspace','/foss'],'profiles':[remote_profile,remote_slow]}));token_file=folder/'private-agent.token'
    agent=subprocess.Popen(['python3',str(ROOT/'platform/commercial/agent.py'),'--profiles',str(cfg),'--state',str(folder/'agent-state'),'--token-file',str(token_file),'--port',str(aport)],stdout=alog,stderr=subprocess.STDOUT,start_new_session=True);startup(aport)
    assert token_file.stat().st_mode&0o077==0;entry('Companion auto-generated owner-only token_FILE (no API/log value)')
    request=urllib.request.Request(f'http://127.0.0.1:{aport}/rpc',b'{"method":"profile.list"}',{'Content-Type':'application/json'})
    try:urllib.request.urlopen(request);raise AssertionError('Unauthenticated agent access accepted')
    except urllib.error.HTTPError as e:assert e.code==401
    entry('Companion transport rejects unauthenticated requests')
    am={'schema_version':1,'id':'remote-open-source','name':'Actual ngspice HTTP calibration','tool_id':'ngspice','version':'45.2','runner':{'kind':'agent','url':f'http://127.0.0.1:{aport}','token_file':str(token_file),'profile_id':remote_profile['id']}}
    ap=rpc('backend.register',{'manifest':am});assert ap['available'];p=configure(p,am['id']);r=wait(rpc('backend.run',{'project_id':p['id'],'command_id':'agent-once'}));assert r['remote_job_id'] and abs(r['current_flow']['branches'][0]['values_A'][0]+.001)<1e-10;entry('Actual authenticated remote agent ngspice execution/artifact/hash transfer',r)
    assert rpc('backend.run',{'project_id':p['id'],'command_id':'agent-once'})['id']==r['id'];entry('Remote worker receipt replays same actual process identity',r)
    # Native ngspice rejects this operator-owned deck; exit code/result must not become pass.
    failed=copy.deepcopy(original);failed['id']='bad-native-deck';broken=folder/'broken.spice';broken.write_text('* actual native error\nX1 a b missing_model\n.end\n');failed['runner']['resources']['deck']=str(broken);rpc('backend.register',{'manifest':failed});p=configure(p,failed['id']);r=wait(rpc('backend.run',{'project_id':p['id']}),'failed','unknown');entry('Actual ngspice invalid model/failure is failed/unknown with retained log',r)
    # Canceled queued job cannot later launch once two genuine native analyses drain.
    slow=copy.deepcopy(original);slow['id']='slow-ngspice';slowdeck=folder/'slow.spice';slowdeck.write_text('* actual long transient calibration\nV1 out 0 1\nR1 out 0 1000\nC1 out 0 1p\n.control\nset num_threads=1\ntran 1p 1m\nquit\n.endc\n.end\n');slow['runner']['resources']['deck']=str(slowdeck);slow['runner']['recipes']['simulation']['timeout_s']=3;rpc('backend.register',{'manifest':slow});p=configure(p,slow['id']);busy=[rpc('backend.run',{'project_id':p['id']}) for _ in range(2)];queued=rpc('backend.run',{'project_id':p['id']});rpc('job.cancel',{'run_id':queued['id']})
    for b in busy:wait(b,'failed','unknown')
    qr=rpc('job.status',{'run_id':queued['id']});assert qr['execution_status']=='canceled' and qr['analysis_result']=='unknown';assert not Path(qr['manifest_path']).parent.joinpath('resources').exists();entry('Two real native jobs time out; queued cancellation retains unknown/no launch',qr)
    # All evidence is from genuine subprocesses or explicit negative validation, never licensed outputs.
    private=token_file.read_text().strip()
    for path in [folder/'agent.log',folder/'worker.log',*folder.rglob('stdout.log')]:assert private not in path.read_text(errors='replace')
    entry('Private agent token never appears in retained native/HTTP logs')
    diagnostic=copy.deepcopy(original);diagnostic['id']='actual-stdout-license-diagnostic';diagnostic_deck=folder/'diagnostic.spice';diagnostic_deck.write_text(deck.read_text().replace('op\n','op\necho license checkout failed\n'));diagnostic['runner']['resources']['deck']=str(diagnostic_deck);rpc('backend.register',{'manifest':diagnostic});p=configure(p,diagnostic['id']);diag=wait(rpc('backend.run',{'project_id':p['id']}),'completed','unknown');assert 'current_flow' not in diag;entry('Exit-zero actual numeric data plus license failure in stdout stays unknown',diag)
    copied=copy.deepcopy(original);copied['id']='private-resource-copy';copied_deck=folder/'private-copy.spice';copied_deck.write_text('* trusted operator copy calibration\nV1 out 0 1\nR1 out 0 1000\n.control\nshell cp '+str(deck)+' copied.spice\nquit\n.endc\n.end\n');copied['runner']['resources']={'deck':str(copied_deck),'private_model':str(deck)};copied['runner']['recipes']['simulation']['outputs']={'summary':'copied.spice'};rpc('backend.register',{'manifest':copied});p=configure(p,copied['id']);cr=wait(rpc('backend.run',{'project_id':p['id']}),'failed','unknown');assert 'summary' not in cr['artifacts'];entry('Exact private site resource copy cannot become a downloadable native result',cr)
    # Opaque proprietary-like directory hashing/copy is calibration data only, never a decoded OA library.
    opaque=folder/'opaque-library.ndm';opaque.mkdir();(opaque/'metadata.bin').write_bytes(b'opaque transport calibration fixture\x00');nested=opaque/'nested';nested.mkdir();(nested/'data.bin').write_bytes(b'unchanged native bytes')
    opq=copy.deepcopy(original);opq['id']='opaque-dir';opq['runner']['resources']['library']=str(opaque);pub=rpc('backend.register',{'manifest':opq});assert pub['available'];p=configure(p,opq['id']);orun=wait(rpc('backend.run',{'project_id':p['id']}));assert orun['current_flow']['input_origin']=='external-native-database' and orun['current_flow']['geometry_linkage']=='unverified' and 'layout_sha256' not in orun['current_flow'];entry('Bounded opaque library snapshot/hash; currents do not imply proprietary database/GDS linkage',orun)
    (nested/'data.bin').write_bytes(b'changed native bytes');assert rpc('job.status',{'run_id':orun['id']})['freshness']=='stale';entry('Nested opaque library file mutation invalidates run at same revision',orun)
    unsafe=folder/'unsafe-library';unsafe.mkdir();(unsafe/'outside').symlink_to('/etc/passwd');bad=copy.deepcopy(original);bad['id']='symlink-library';bad['runner']['resources']['library']=str(unsafe);assert not rpc('backend.register',{'manifest':bad})['available'];entry('Opaque library traversal refuses symlink dependencies')
    # Genuine exported GDS bytes copied by an explicit trusted calibration deck. No vendor exporter claim.
    exported=rpc('layout.export',{'project_id':p['id']});exporter=copy.deepcopy(original);exporter['id']='actual-gds-copy-calibration';export_deck=folder/'gds-export.spice';export_deck.write_text('* actual GDS exchange transport calibration\nV1 out 0 1\nR1 out 0 1000\n.control\nshell cp '+exported['path']+' export.gds\nquit\n.endc\n.end\n');exporter['runner']['resources']['deck']=str(export_deck);exporter['runner']['recipes']={'layout_export':{'argv':['-b','{resource.deck}'],'outputs':{'exchange':'export.gds'},'timeout_s':10,'parameters':{},'result_context':{}}};rpc('backend.register',{'manifest':exporter});p=configure(p,exporter['id'],'layout_export');erun=wait(rpc('backend.run',{'project_id':p['id']}));ex=rpc('backend.read_artifact',{'run_id':erun['id'],'key':'exchange'});assert hashlib.sha256(base64.b64decode(ex['base64'])).hexdigest()==hashlib.sha256(Path(exported['path']).read_bytes()).hexdigest();entry('Actual GDS binary exchange bypasses text parser and decodes through KLayout',erun)
    other=rpc('project.create',{'example':'fixture'});reject('Another project cannot import this native output','backend.import_layout',{'project_id':other['id'],'run_id':erun['id'],'key':'exchange','expected_revision':other['revision']},'REVISION_CONFLICT')
    old_revision=p['revision'];request={'project_id':p['id'],'run_id':erun['id'],'key':'exchange','expected_revision':old_revision,'command_id':'actual-import-once'};p=rpc('backend.import_layout',request);assert p['revision']>old_revision and not p.get('backend_setup') and not p.get('analysis_setup');assert rpc('backend.import_layout',request)['revision']==p['revision'];entry('Explicit same-project GDS import creates immutable revision, clears old electrical setup and replays receipt',erun,new_revision=p['revision'])
    # Restart a companion during a real native process. Original job is uncertain, never auto-replayed.
    def agent_rpc(method,params={}):
        req=urllib.request.Request(f'http://127.0.0.1:{aport}/rpc',json.dumps({'method':method,'params':params}).encode(),{'Content-Type':'application/json','X-Register-Agent-Token':token_file.read_text().strip()})
        with urllib.request.urlopen(req,timeout=10) as response:value=json.load(response)
        assert value['ok'],value;return value['result']
    import sys
    sys.path.insert(0,str(ROOT/'platform/commercial'));import runner
    remote_public=agent_rpc('profile.validate',{'profile_id':'agent-slow'});payload={'profile_id':'agent-slow','settings':{'operation':'simulation','top_cell':p['cell']},'command_id':'restart-once','pinned_fingerprint':remote_public['fingerprint'],'input_package':runner.pack({'project.json':b'{}'})};aj=agent_rpc('job.submit',payload)
    for _ in range(100):
        aj=agent_rpc('job.status',{'job_id':aj['id']})
        if aj.get('process_identity'):break
        time.sleep(.02)
    assert aj.get('process_identity');os.killpg(agent.pid,signal.SIGKILL);agent.wait();agent=subprocess.Popen(['python3',str(ROOT/'platform/commercial/agent.py'),'--profiles',str(cfg),'--state',str(folder/'agent-state'),'--token-file',str(token_file),'--port',str(aport)],stdout=alog,stderr=subprocess.STDOUT,start_new_session=True);startup(aport)
    interrupted=agent_rpc('job.status',{'job_id':aj['id']});assert interrupted['execution_status']=='failed' and interrupted['analysis_result']=='unknown' and interrupted['error_code']=='AGENT_RESTARTED' and interrupted['interrupted_process_stopped'];assert agent_rpc('job.submit',payload)['id']==aj['id'];entry('Actual companion interruption stops identified native process and preserves failed/unknown exact-once receipt',remote_job_id=aj['id'])
    # Bounded stream redaction keeps a sensitive value split at the read boundary out of logs.
    import io
    os.environ['REGISTER_TEST_SECRET']='calibration-boundary-private-value';redacted=folder/'redaction.log';runner.write_redacted_stream(io.BytesIO(b'A'*65525+os.environ['REGISTER_TEST_SECRET'].encode()+b'\nshort '+os.environ['REGISTER_TEST_SECRET'].encode()+b'\n'),redacted,['REGISTER_TEST_SECRET']);assert os.environ['REGISTER_TEST_SECRET'] not in redacted.read_text() and 'OVERLONG_NATIVE_LINE_DISCARDED' in redacted.read_text();entry('Sensitive environment values cannot leak across stdout chunk boundaries')
    truncated=folder/'truncated.log';runner.write_redacted_stream(io.BytesIO((b'X'*60000+b'\n')*80),truncated,[]);assert '[NATIVE_LOG_TRUNCATED]' in truncated.read_text() and truncated.stat().st_size<4*1024*1024+100;entry('Explicit native log truncation marker prevents false completeness')
    summary={'case_count':len(cases),'cases':cases,'source_state':str(folder),'commercial_execution':'unavailable/unverified; no licensed executable installed','calibration':'actual ngspice open-source resistor; no foundry/signoff claim'}
    (ROOT/'.runtime/evidence/commercial-backend.json').write_text(json.dumps(summary,indent=2));(folder/'summary.json').write_text(json.dumps(summary,indent=2));print(json.dumps(summary))
finally:
    for proc in (worker,agent):
        if proc is not None and proc.poll() is None:
            os.killpg(proc.pid,signal.SIGTERM)
            try:proc.wait(timeout=5)
            except subprocess.TimeoutExpired:os.killpg(proc.pid,signal.SIGKILL);proc.wait()
    log.close();alog.close()
