import os
from pathlib import Path
token=Path('/run/secrets/worker_session').read_text().strip()
if len(token)<32: raise SystemExit('Invalid private worker session file')
os.environ['MOS_TOKEN']=token
Path(os.environ.get('MOS_STATE','/workspace/.runtime/eda')).mkdir(parents=True,exist_ok=True)
os.execvp('python3',['python3','/workspace/workers/eda/server.py'])
