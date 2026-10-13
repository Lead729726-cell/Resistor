"""Start the same authoritative engine on the host, with no Docker dependency."""
import json,os,sys,subprocess,tempfile
from pathlib import Path

root=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(root/'workers/eda'))
if '--detach' in sys.argv:
    # Python explicitly closes unrelated inherited OS handles. This keeps
    # Electron/debugger output channels from being held open by the worker.
    config=json.loads(sys.stdin.readline());sys.stdin.close()
    workspace=Path(config['MOS_WORKSPACE']).resolve()
    logdir=workspace/'.runtime/native-engine';logdir.mkdir(parents=True,exist_ok=True)
    options={'creationflags':subprocess.DETACHED_PROCESS|subprocess.CREATE_NEW_PROCESS_GROUP|subprocess.CREATE_NO_WINDOW} if os.name=='nt' else {'start_new_session':True}
    # WSL also gets local files rather than pipes tied to wsl.exe/Electron.
    with tempfile.TemporaryFile() as envelope,(logdir/'engine.log').open('ab') as log:
        envelope.write((json.dumps(config)+'\n').encode());envelope.seek(0)
        subprocess.Popen([sys.executable,'-B',str(Path(__file__).resolve()),'--stdin-config'],stdin=envelope,stdout=log,stderr=log,close_fds=True,**options)
    raise SystemExit(0)
if '--stdin-config' in sys.argv:
    config=json.loads(sys.stdin.readline())
    sys.stdin.close()
    allowed={'MOS_WORKSPACE','MOS_WORKSPACE_ID','MOS_STATE','MOS_TOKEN','MOS_PORT','MOS_BIND','MOS_RUNTIME_KIND','MOS_INSTANCE_ID','PDK_ROOT','YOSYS_SIMCELLS','XSCHEM_SHARE'}
    if set(config)-allowed:raise SystemExit('Invalid local engine launch configuration')
    os.environ.update({k:str(v) for k,v in config.items()})
if not os.environ.get('MOS_TOKEN'):raise SystemExit('Use the authenticated Resistor launcher.')
os.environ.setdefault('MOS_RUNTIME_KIND','native-'+sys.platform)
os.environ.setdefault('MOS_BIND','127.0.0.1')
if os.environ['MOS_BIND']!='127.0.0.1':raise SystemExit('Native engine must bind to IPv4 loopback.')
os.environ.setdefault('MOS_PORT','18765')
os.environ.setdefault('MOS_WORKSPACE',str(root))
import bootstrap
bootstrap.main()
