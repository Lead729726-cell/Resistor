import cProfile
import json
from pathlib import Path
import pstats
import sqlite3
import sys
import time
sys.path.insert(0,'/workspace/workers/eda')
import geometry
import klayout.db as k
db=sqlite3.connect('/workspace/.runtime/eda/projects.sqlite3')
p=next(json.loads(r[0]) for r in db.execute('SELECT data FROM projects ORDER BY rowid DESC') if json.loads(r[0]).get('example')=='performance')
layout=k.Layout();layout.read(f'/workspace/.runtime/eda/projects/{p["id"]}/snapshots/{p["revision"]}/layout.oas')
profiler=cProfile.Profile();started=time.monotonic();profiler.enable();scene=geometry.scene(layout,p,p['layers']);profiler.disable();elapsed=time.monotonic()-started
assert len(scene['shapes'])==p['performance_shape_count'];assert len({s['id'] for s in scene['shapes']})==len(scene['shapes'])
print(json.dumps({'project_id':p['id'],'shape_count':len(scene['shapes']),'elapsed_s':elapsed,'json_bytes':len(json.dumps(scene))}));pstats.Stats(profiler).sort_stats('cumtime').print_stats(12)
