"""Negative integrity checks against actual arm64 ZIP bytes; not native Mac QA."""
import hashlib,importlib.util,json,struct,sys,zipfile
from pathlib import Path
from datetime import datetime,timezone

spec=importlib.util.spec_from_file_location('mac_archive',Path('scripts/verify-mac-archive.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
archive=Path(sys.argv[1]);root='Register.app/Contents/'
with zipfile.ZipFile(archive) as z:
    binary=z.read(root+'MacOS/Register');info=z.read(root+'Info.plist');resources=z.read(root+'_CodeSignature/CodeResources')
module.verify_macho_pages(binary,{1:info,3:resources})
changed=bytearray(binary);offset=max(4096,32+struct.unpack_from('<I',binary,20)[0]);changed[offset]^=1
cases=[('modified-executable',bytes(changed),info,resources,'code page digest mismatch'),('modified-info-plist',binary,info+b' ',resources,'special slot mismatch'),('modified-resource-seal',binary,info,resources+b' ','special slot mismatch')]
results=[]
for name,data,plist,seal,expected in cases:
    try:module.verify_macho_pages(data,{1:plist,3:seal})
    except AssertionError as error:
        assert expected in str(error),(name,str(error));results.append({'case':name,'rejected':True})
    else:raise AssertionError('Accepted changed signature data: '+name)
report={'checked_at':datetime.now(timezone.utc).isoformat(),'archive':str(archive),'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'scope':'Actual Mach-O page and bundle special-slot digest corruption checks; no macOS trust or execution claim','native_execution_verified':False,'cases':results}
Path('docs/evidence/mac-signature-integrity.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print('Rejected executable, Info.plist and resource seal corruption in actual M1 archive signatures.')
