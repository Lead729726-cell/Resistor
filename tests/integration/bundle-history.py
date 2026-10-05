"""Reject rechecksummed bundles that rebind immutable native IDs/annotations.

Run: docker exec mos-studio-eda python3 /workspace/tests/integration/bundle-history.py
"""
import hashlib
import io
import json
from pathlib import Path
import urllib.request
import uuid
import zipfile
import klayout.db as k

config=json.loads(Path('/workspace/.runtime/worker.json').read_text())
def raw(method,params):
    request=urllib.request.Request('http://127.0.0.1:8765/rpc',json.dumps({'method':method,'params':params}).encode(),{'Content-Type':'application/json','X-MOS-Token':config['token']})
    with urllib.request.urlopen(request,timeout=30) as response:return json.load(response)
def rpc(method,params):
    result=raw(method,params);assert result['ok'],result.get('error');return result['result']

p=rpc('project.create',{'example':'fixture','name':'Immutable bundle identity binding regression'})
bundle=rpc('project.export_bundle',{'project_id':p['id']})
with zipfile.ZipFile(bundle['path']) as archive:original={name:archive.read(name) for name in archive.namelist()}
folder=Path('/workspace/.runtime/evidence/bundle-history');folder.mkdir(exist_ok=True)
evidence=[]
for case,property_key,value in [('stable shape ID changed',1,uuid.uuid4().hex),('electrical shape net changed',2,'DIFFERENT_NET')]:
    entries=dict(original);source=folder/'source.oas';source.write_bytes(entries['layout.oas']);layout=k.Layout();layout.read(str(source));top=layout.top_cell()
    shape=next(s for li in layout.layer_indices() for s in top.shapes(li).each() if s.is_box() or s.is_polygon());shape.set_property(property_key,value)
    dest=folder/'changed.oas';layout.write(str(dest));entries['layout.oas']=dest.read_bytes()
    manifest=json.loads(entries['manifest.json']);manifest['files']['layout.oas']=hashlib.sha256(entries['layout.oas']).hexdigest();entries['manifest.json']=json.dumps(manifest).encode()
    output=folder/('identity.register.zip' if property_key==1 else 'net.register.zip')
    with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as archive:
        for name,data in entries.items():archive.writestr(name,data)
    result=raw('project.import_bundle',{'project_id':p['id'],'expected_revision':p['revision'],'mode':'restore','path':str(output)})
    assert not result['ok'],result;assert result['error']['code']=='HISTORY_DIVERGENCE',result
    evidence.append({'case':case,'result':'pass','error_code':result['error']['code'],'project_id':p['id'],'revision':p['revision']})
assert rpc('project.snapshot',{'project_id':p['id']})['revision']==p['revision']
Path('/workspace/.runtime/evidence/bundle-history.json').write_text(json.dumps(evidence,indent=2))
print('Immutable shape IDs and net annotation bindings: actual bundle rejection PASS')
