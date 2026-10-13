"""Start the same authoritative engine on the host, with no Docker dependency."""
import json,os,sys
from pathlib import Path

root=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(root/'workers/eda'))
if '--stdin-config' in sys.argv:
    config=json.loads(sys.stdin.readline())
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
