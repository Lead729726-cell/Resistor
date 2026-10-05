"""Inspect actual Mac ZIPs without executing binaries on a Windows/Linux host."""
import argparse,hashlib,json,plistlib,posixpath,stat,struct,sys,zipfile
from pathlib import Path
from datetime import datetime,timezone

def verify_macho_pages(data,special_files=None):
    offset=32;signature=None
    for _ in range(struct.unpack_from('<I',data,16)[0]):
        command,length=struct.unpack_from('<II',data,offset)
        assert length>=8 and offset+length<=len(data),'Invalid Mach-O load command'
        if command==0x1d:
            at,size=struct.unpack_from('<II',data,offset+8);signature=data[at:at+size]
        offset+=length
    if signature is None:return [{'present':False,'scope':'Unsigned binary; no code signature or Apple trust claim'}]
    assert struct.unpack_from('>I',signature)[0]==0xfade0cc0,'Invalid code signature blob'
    embedded={};entitlements={}
    for index in range(struct.unpack_from('>I',signature,8)[0]):
        kind,start=struct.unpack_from('>II',signature,12+8*index)
        if kind in (2,5,7):
            length=struct.unpack_from('>I',signature,start+4)[0];embedded[kind]=signature[start:start+length]
            if kind==5:entitlements=plistlib.loads(embedded[kind][8:])
    bound_files={**embedded,**(special_files or {})};directories=[]
    for index in range(struct.unpack_from('>I',signature,8)[0]):
        kind,start=struct.unpack_from('>II',signature,12+8*index)
        if kind!=0 and not 0x1000<=kind<=0x1005:continue
        cd=signature[start:];magic,length,version,flags,hash_offset,ident,special,slots,limit=struct.unpack_from('>9I',cd)
        assert magic==0xfade0c02
        hash_size,hash_type,platform,page=struct.unpack_from('4B',cd,36)
        algorithm={1:'sha1',2:'sha256',3:'sha256',4:'sha384'}[hash_type]
        block_size=1<<page;assert slots==(limit+block_size-1)//block_size
        for slot in range(slots):
            expected=cd[hash_offset+slot*hash_size:hash_offset+(slot+1)*hash_size]
            actual=hashlib.new(algorithm,data[slot*block_size:min((slot+1)*block_size,limit)]).digest()[:hash_size]
            assert expected==actual,('Mach-O code page digest mismatch',slot)
        bound=[]
        for slot,payload in bound_files.items():
            assert slot<=special,('Missing special signature slot',slot)
            expected=cd[hash_offset-slot*hash_size:hash_offset-(slot-1)*hash_size]
            assert expected==hashlib.new(algorithm,payload).digest()[:hash_size],('Bundle signature special slot mismatch',slot)
            bound.append(slot)
        directories.append({'code_pages':slots,'algorithm':algorithm,'ad_hoc':bool(flags&2),'flags':flags,'hardened_runtime':bool(flags&0x10000),'bound_special_slots':bound,'entitlements':entitlements,'cdhash':hashlib.new(algorithm,cd[:length]).digest()[:20].hex(),'scope':'code pages and supplied bundle special slot digests; no Apple certificate trust or native execution claim'})
    assert directories,'No code directories'
    return directories

def verify(archive,require_bundle_signature=False):
    expected_arch='arm64' if '-mac-arm64' in archive.stem else 'x64'
    expected_cpu={'arm64':0x100000c,'x64':0x1000007}[expected_arch]
    with zipfile.ZipFile(archive) as z:
        entries={i.filename:i for i in z.infolist()}
        assert len(entries)==len(z.infolist()),'Duplicate ZIP entries'
        for name in entries:
            assert not name.startswith('/') and '..' not in name.split('/'),name
        root='Register.app/Contents/'
        plist=plistlib.loads(z.read(root+'Info.plist'))
        version=json.loads(z.read(root+'Resources/app/package.json'))['version']
        assert plist['CFBundleIdentifier']=='org.register.eda'
        assert plist['CFBundleShortVersionString']==version
        main=root+'MacOS/'+plist['CFBundleExecutable']
        assert main in entries and entries[main].external_attr>>16&0o111,'Missing executable mode'
        def resolve_link(value):
            visited=set()
            for _ in range(32):
                assert value not in visited,('Symlink cycle',value)
                visited.add(value);parts=value.split('/');changed=False
                for index in range(len(parts)):
                    prefix='/'.join(parts[:index+1]);item=entries.get(prefix)
                    if item and stat.S_ISLNK(item.external_attr>>16):
                        target=z.read(prefix).decode();assert not target.startswith('/'),prefix
                        value=posixpath.normpath(posixpath.join(posixpath.dirname(prefix),target,*parts[index+1:]))
                        assert value.startswith('Register.app/'),prefix
                        changed=True;break
                if not changed:return value
            raise AssertionError('Symlink resolution exceeded safe depth')
        mach=[];links=[];signatures={}
        for name,entry in entries.items():
            mode=entry.external_attr>>16
            if stat.S_ISLNK(mode):
                target=z.read(name).decode();assert not target.startswith('/'),name
                resolved=posixpath.normpath(posixpath.join(posixpath.dirname(name),target))
                assert resolved.startswith('Register.app/'),name
                resolved=resolve_link(resolved)
                assert resolved in entries or any(n.startswith(resolved+'/') for n in entries),name
                links.append({'path':name,'target':target})
            elif not entry.is_dir():
                with z.open(entry) as stream:header=stream.read(32)
                if len(header)>=8 and struct.unpack('<I',header[:4])[0]==0xfeedfacf:
                    cpu=struct.unpack('<I',header[4:8])[0];assert cpu==expected_cpu,(name,hex(cpu),expected_arch)
                    assert mode&0o111,('Mach-O not executable',name)
                    signatures[name]=verify_macho_pages(z.read(name))
                    if expected_arch=='arm64':assert all(s.get('present',True) for s in signatures[name]),('Apple Silicon binary lacks its original ad-hoc code signature',name)
                    mach.append(name)
        assert main in mach and len(mach)>=8,(len(mach),main)
        seals=[]
        for seal_path in entries:
            if not seal_path.endswith('/_CodeSignature/CodeResources'):continue
            base=posixpath.dirname(posixpath.dirname(seal_path))
            seal=plistlib.loads(z.read(seal_path));checked=0
            for relative,item in seal.get('files2',{}).items():
                resource=posixpath.normpath(posixpath.join(base,relative))
                assert resource.startswith('Register.app/'),('Resource seal escaped app',relative)
                if 'symlink' in item:
                    assert resource in entries and stat.S_ISLNK(entries[resource].external_attr>>16)
                    assert z.read(resource).decode()==item['symlink'],('Sealed symlink mismatch',resource)
                elif 'cdhash' in item:
                    if resource in signatures:
                        candidate=resource
                    elif relative.endswith('.framework'):
                        candidate=resource+'/Versions/A/'+posixpath.basename(resource).removesuffix('.framework')
                    else:
                        child_plist=plistlib.loads(z.read(resource+'/Contents/Info.plist'))
                        candidate=resource+'/Contents/MacOS/'+child_plist['CFBundleExecutable']
                    assert any(s['cdhash']==item['cdhash'].hex() for s in signatures[candidate]),('Nested signature mismatch',resource)
                else:
                    assert resource in entries,('Missing sealed resource',resource)
                    for key,algorithm in [('hash','sha1'),('hash2','sha256')]:
                        if key in item:assert hashlib.new(algorithm,z.read(resource)).digest()==item[key],('Sealed resource changed',resource)
                checked+=1
            info=base+'/Info.plist' if base.endswith('/Contents') else base+'/Resources/Info.plist'
            info_plist=plistlib.loads(z.read(info))
            executable=base+'/MacOS/'+info_plist['CFBundleExecutable'] if base.endswith('/Contents') else base+'/'+info_plist['CFBundleExecutable']
            signatures[executable]=verify_macho_pages(z.read(executable),{1:z.read(info),3:z.read(seal_path)})
            seals.append({'path':seal_path,'resources_checked':checked,'info_plist_bound':True,'resource_seal_bound':True})
        if require_bundle_signature:
            assert root+'_CodeSignature/CodeResources' in entries and len(seals)>=5,'Missing app/framework/helper bundle seals'
            assert all(s['ad_hoc'] and not s['hardened_runtime'] for values in signatures.values() for s in values),'Preview must use ad-hoc signing without hardened runtime'
            for executable,values in signatures.items():
                if executable==main or '/Register Helper' in executable:
                    assert all(s['entitlements'].get('com.apple.security.cs.allow-jit') is True for s in values),('Missing JIT entitlement',executable)
            assert 'Install Register.command' in entries and entries['Install Register.command'].external_attr>>16&0o111
            manifest=z.read('BUNDLE-SHA256SUMS.txt').decode().splitlines();manifest_names=[]
            for line in manifest:
                checksum,name=line.split('  ',1)
                assert name in entries and not stat.S_ISLNK(entries[name].external_attr>>16)
                assert hashlib.sha256(z.read(name)).hexdigest()==checksum,('Installer manifest mismatch',name)
                manifest_names.append(name)
            assert len(set(manifest_names))==len(manifest_names),'Duplicate installer manifest entries'
            assert {n for n,e in entries.items() if n.startswith('Register.app/') and not stat.S_ISLNK(e.external_attr>>16) and not e.is_dir()}<=set(manifest_names),'Installer manifest omitted app resources'
            link_manifest=dict(line.split('\t',1) for line in z.read('BUNDLE-SYMLINKS.tsv').decode().splitlines())
            assert link_manifest=={l['path']:l['target'] for l in links},'Installer symlink manifest mismatch'
        assert any('/Versions/Current' in l['path'] for l in links),'Framework symlinks lost'
        required=['dist/index.html','.dockerignore','scripts/docker-cli.mjs','scripts/worker.mjs','scripts/desktop-diagnostics.mjs','apps/desktop/main.cjs','apps/desktop/preload.cjs','apps/desktop/menu.cjs','apps/desktop/workspace.cjs','workers/eda/server.py','workers/eda/Dockerfile','examples/sky130/mosfet.gds','licenses/THIRD-PARTY-NOTICES.md','docs/desktop-installation.md']
        if 'Diagnose Register.command' in entries:
            required.extend(['apps/desktop/Diagnose Register.command','apps/desktop/Install Register.command','workers/eda/project_index.py'])
            assert b'\r' not in z.read('Install Register.command'),'Mac shell helper must use LF line endings'
            assert b'\r' not in z.read('Diagnose Register.command'),'Mac diagnostic helper must use LF line endings'
            assert entries['Diagnose Register.command'].external_attr>>16&0o111
            assert z.read('Diagnose Register.command')==z.read(root+'Resources/app/apps/desktop/Diagnose Register.command')
            template=z.read(root+'Resources/app/apps/desktop/Install Register.command').decode().replace('@VERSION@',version).replace('@ARCH@',expected_arch)
            assert z.read('Install Register.command').decode()==template,'Installer template differs from bundled source'
        for relative in required:assert root+'Resources/app/'+relative in entries,relative
        assert not any('/.runtime/' in name or '/.secrets/' in name or name.endswith('worker.json') for name in entries),'Private runtime data in archive'
        bad=z.testzip();assert bad is None,('ZIP CRC failure',bad)
        source_hashes={relative:hashlib.sha256(z.read(root+'Resources/app/'+relative)).hexdigest() for relative in required}
        with archive.open('rb') as stream:checksum=hashlib.file_digest(stream,'sha256').hexdigest()
        return {'file':str(archive),'bytes':archive.stat().st_size,'sha256':checksum,'version':version,'architecture':expected_arch,'minimum_macos':plist.get('LSMinimumSystemVersion'),'mach_o_count':len(mach),'code_page_signatures':signatures,'bundle_resource_seals':seals,'installer_manifest_checked':require_bundle_signature,'framework_symlinks':links,'crc_checked':True,'source_sha256':source_hashes,'native_execution_verified':False,'developer_id_signed':False,'notarized':False}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('archives',nargs='+',type=Path);parser.add_argument('--require-bundle-signature',action='store_true');parser.add_argument('--output',type=Path)
    options=parser.parse_args();receipts=[verify(p,options.require_bundle_signature) for p in options.archives]
    version=receipts[0]['version'];out=options.output or Path('docs/evidence')/f'macos-archive-{version}.json';out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps({'schema_version':1,'checked_at':datetime.now(timezone.utc).isoformat(),'host':sys.platform,'archives':receipts},indent=2),encoding='utf-8')
    for r in receipts:print(f"Verified {r['architecture']}: {r['mach_o_count']} Mach-O binaries, {len(r['framework_symlinks'])} symlinks, macOS {r['minimum_macos']}+, CRC and required resources; native execution unverified.")
