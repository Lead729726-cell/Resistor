"""Check platform archives contain the exact backend used by native evidence."""
import hashlib,json,tarfile,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];e=json.loads((ROOT/'examples/physical-library/evidence.json').read_text(encoding='utf-8'));rows=[]
for arch in ['arm64','x64']:
 p=ROOT/'release/installers'/f'Resistor-0.17.0-mac-{arch}-r5.zip'
 with zipfile.ZipFile(p) as z:
  prefix='Resistor.app/Contents/Resources/app/'
  for name,sha in e['source_sha256'].items():assert hashlib.sha256(z.read(prefix+name)).hexdigest()==sha,(arch,name)
  assert z.read(prefix+'docs/desktop-installation.md')==(ROOT/'docs/desktop-installation.md').read_bytes()
 rows.append({'file':p.name,'backend_matches_native_source':True,'bytes':p.stat().st_size,'sha256':hashlib.file_digest(p.open('rb'),'sha256').hexdigest(),'native_execution_verified':False})
p=ROOT/'release/installers/Resistor-0.17.0-linux-x64.tar.gz'
with tarfile.open(p) as t:
 names=t.getnames();prefix=next(n[:-len('workers/eda/server.py')] for n in names if n.endswith('resources/app/workers/eda/server.py'))
 for name,sha in e['source_sha256'].items():assert hashlib.sha256(t.extractfile(prefix+name).read()).hexdigest()==sha,name
 assert t.extractfile(prefix+'docs/desktop-installation.md').read()==(ROOT/'docs/desktop-installation.md').read_bytes()
rows.append({'file':p.name,'backend_matches_native_source':True,'bytes':p.stat().st_size,'sha256':hashlib.file_digest(p.open('rb'),'sha256').hexdigest(),'native_execution_verified':False})
win=ROOT/'release/0.17.0/Resistor-win32-x64/resources/app'
for name,sha in e['source_sha256'].items():assert hashlib.sha256((win/name).read_bytes()).hexdigest()==sha,name
p=ROOT/'release/installers/Resistor-0.17.0-win-x64.exe'
rows.append({'file':p.name,'backend_matches_native_source':True,'source_scope':'The package folder used by NSIS; installer UI/native execution not checked','bytes':p.stat().st_size,'sha256':hashlib.file_digest(p.open('rb'),'sha256').hexdigest(),'native_execution_verified':False})
p=ROOT/'examples/Resistor-Physical-Library.zip'
with zipfile.ZipFile(p) as z:
 assert z.testzip() is None
 sums=json.loads(z.read('SHA256SUMS.json'))
 for entry in sums:assert hashlib.sha256(z.read(entry['file'])).hexdigest()==entry['sha256'],entry['file']
 assert json.loads(z.read('evidence.json'))==e
rows.append({'file':'Resistor-Physical-Library.zip','bytes':p.stat().st_size,'sha256':hashlib.file_digest(p.open('rb'),'sha256').hexdigest(),'crc_and_all_entry_hashes_verified':True})
out=ROOT/'docs/evidence/physical-release-0.17.0.json';out.write_text(json.dumps({'source_version':e['source_version'],'native_physical_pass':14,'native_post_criteria_pass':13,'foundry_signoff':False,'assets':rows},indent=2)+'\n',encoding='utf-8')
print(json.dumps({'version':'0.17.0','platform_archives':4,'physical_library':True,'all_checks_pass':True}))
