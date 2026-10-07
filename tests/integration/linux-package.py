"""Read-only release archive QA plus installation in an ephemeral Linux container."""
import hashlib,json,os,subprocess,tarfile,tempfile
import sys
version_arg=sys.argv[1] if len(sys.argv)>1 else '0.16.1'
from pathlib import Path
archive=Path('/input/Resistor-'+version_arg+'-linux-x64.tar.gz')
with tempfile.TemporaryDirectory(prefix='register-linux-qa-') as tmp:
    tmp=Path(tmp)
    with tarfile.open(archive) as tar:
        members=tar.getmembers();assert members
        for member in members:
            assert not member.name.startswith('/') and '..' not in Path(member.name).parts
            assert '/.runtime/' not in member.name and '/.secrets/' not in member.name and not member.name.endswith('.env.local')
        tar.extractall(tmp,filter='data')
    folder=tmp/('Resistor-'+version_arg+'-linux-x64');exe=folder/'Resistor/Resistor'
    assert exe.stat().st_mode&0o111 and (folder/'install.sh').stat().st_mode&0o111
    assert exe.read_bytes()[:4]==b'\x7fELF' and int.from_bytes(exe.read_bytes()[18:20],'little')==62
    meta=json.loads((folder/'Resistor/resources/app/package.json').read_text());assert meta['version']==version_arg
    version=subprocess.run([str(exe),'-p','process.versions.electron'],env={**os.environ,'ELECTRON_RUN_AS_NODE':'1'},text=True,capture_output=True,timeout=30)
    assert version.returncode==0,(version.stdout,version.stderr)
    installed=subprocess.run([str(folder/'install.sh')],text=True,capture_output=True,timeout=60)
    assert installed.returncode==0,(installed.stdout,installed.stderr)
    destination=Path.home()/'.local/opt/resistor'/meta['version'];assert (destination/'Resistor').is_file()
    desktop=Path.home()/'.local/share/applications/org.register.eda.desktop';assert desktop.is_file()
    assert str(destination/'Resistor') in desktop.read_text()
    second=subprocess.run([str(folder/'install.sh')],text=True,capture_output=True,timeout=30)
    assert second.returncode!=0 and 'already installed' in second.stderr
    with archive.open('rb') as file:checksum=hashlib.file_digest(file,'sha256').hexdigest()
    result={'schema_version':1,'version':meta['version'],'checked_archive':archive.name,'bytes':archive.stat().st_size,'sha256':checksum,'archive_members':len(members),'elf_arch':'x86-64','executable_modes_preserved':True,'private_data_absent':True,'electron_version':version.stdout.strip(),'ephemeral_linux_install_passed':True,'repeat_install_preserves_existing_version':True,'native_desktop_execution_verified':False,'scope':'Ubuntu container ELF Node-mode launch/version and user installer. The shipped launcher does not disable the sandbox. A graphical Linux desktop has not been tested.'}
    Path('/evidence/linux-'+version_arg+'-archive.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))
