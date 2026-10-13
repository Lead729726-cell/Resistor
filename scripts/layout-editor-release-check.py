"""Verify the built editor resources; native OS execution is a separate check."""
import argparse, hashlib, json, tarfile, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
version = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
parser = argparse.ArgumentParser()
parser.add_argument('--evidence', default='docs/evidence/layout-editor')
args = parser.parse_args()
evidence = (ROOT / args.evidence).resolve()
assert evidence.parent == ROOT / 'docs/evidence' and evidence.is_dir()
native = json.loads((evidence / 'native.json').read_text(encoding='utf-8'))
sha = lambda b: hashlib.sha256(b).hexdigest()
for name, expected in native['source_sha256'].items():
    assert sha((ROOT / name).read_bytes()) == expected, ('Native evidence is stale', name)
resources = [p.relative_to(ROOT).as_posix() for p in (ROOT / 'dist').rglob('*') if p.is_file()]
resources += ['workers/eda/geometry.py', 'workers/eda/server.py', 'docs/drawing-tools.md', 'docs/desktop-installation.md', 'apps/desktop/menu.cjs', 'apps/desktop/preload.cjs']
if (ROOT / 'docs/shortcuts.md').exists():
    resources.append('docs/shortcuts.md')
if (ROOT / 'workers/eda/sigma_delta.py').exists():
    resources += ['workers/eda/sigma_delta.py','workers/eda/design_tools.py','workers/eda/native.py',*[p.relative_to(ROOT).as_posix() for p in (ROOT/'workers/eda/rtl').glob('sigma_delta8*') if p.is_file()]]
expected = {name: sha((ROOT / name).read_bytes()) for name in resources}
if (ROOT / 'workers/eda/analog_soc.py').exists():
    resources += ['workers/eda/analog_soc.py','workers/eda/characterization.py','workers/eda/digital_units.py','workers/eda/physical_library.py','docs/analog-soc.md']
    expected = {name: sha((ROOT / name).read_bytes()) for name in resources}
if (ROOT / 'workers/eda/sar_adc.py').exists():
    resources += ['workers/eda/sar_adc.py','workers/eda/floorplan.py','docs/sar-adc.md',*[p.relative_to(ROOT).as_posix() for p in (ROOT/'workers/eda/rtl').glob('sar8*') if p.is_file()]]
    expected = {name: sha((ROOT / name).read_bytes()) for name in resources}
if (ROOT / 'apps/desktop/updates.mjs').exists():
    resources += ['apps/desktop/main.cjs','apps/desktop/builder.json','apps/desktop/update-network.cjs','apps/desktop/update-feed.mjs','apps/desktop/updates.mjs','apps/desktop/update-install.mjs','apps/desktop/update-helper.mjs','docs/online-updates.md']
    expected = {name: sha((ROOT / name).read_bytes()) for name in resources}
rows = []
if (ROOT / 'workers/eda/research.py').exists():
    resources += ['workers/eda/research.py','workers/eda/literature.json','docs/literature-update-2026.md']
    expected = {name: sha((ROOT / name).read_bytes()) for name in resources}
line_endings = {}
def verify_resource(name, body, platform):
    if sha(body) == expected[name]:return
    original=(ROOT/name).read_bytes()
    assert Path(name).suffix in {'.py','.md','.cjs','.mjs','.v','.sv','.tcl','.json'}, (platform,name,'Unexpected binary/runtime asset difference')
    assert body.replace(b'\r\n',b'\n') == original.replace(b'\r\n',b'\n'), (platform,name,'Content differs beyond CRLF/LF')
    line_endings.setdefault(platform,[]).append(name)
for arch in ['arm64', 'x64']:
    p = ROOT / 'release/installers' / f'Resistor-{version}-mac-{arch}-r5.zip'
    with zipfile.ZipFile(p) as z:
        assert z.testzip() is None
        prefix = 'Resistor.app/Contents/Resources/app/'
        assert json.loads(z.read(prefix + 'package.json'))['version'] == version
        for name, digest in expected.items():
            verify_resource(name,z.read(prefix + name),arch)
    rows.append({'file': p.name, 'bytes': p.stat().st_size, 'sha256': sha(p.read_bytes()), 'exact_resources': not line_endings.get(arch), 'canonical_text_and_exact_binary_resources':True,'line_ending_only_differences':line_endings.get(arch,[]), 'native_execution_verified': False})
p = ROOT / 'release/installers' / f'Resistor-{version}-linux-x64.tar.gz'
with tarfile.open(p) as t:
    prefix = next(n[:-len('workers/eda/server.py')] for n in t.getnames() if n.endswith('resources/app/workers/eda/server.py'))
    assert json.loads(t.extractfile(prefix + 'package.json').read())['version'] == version
    for name, digest in expected.items():
        verify_resource(name,t.extractfile(prefix + name).read(),'linux')
rows.append({'file': p.name, 'bytes': p.stat().st_size, 'sha256': sha(p.read_bytes()), 'exact_resources': True, 'native_execution_verified': False})
win = ROOT / 'release' / version / 'Resistor-win32-x64/resources/app'
for name, digest in expected.items():
    verify_resource(name,(win / name).read_bytes(),'windows')
p = ROOT / 'release/installers' / f'Resistor-{version}-win-x64.exe'
rows.append({'file': p.name, 'bytes': p.stat().st_size, 'sha256': sha(p.read_bytes()), 'exact_resources': True, 'scope': 'NSIS package source folder; installer UI is separate', 'native_execution_verified': False})
(evidence / 'release.json').write_text(json.dumps({'version': version, 'native_evidence_matches_source': True, 'resource_sha256': expected, 'line_ending_only_differences':line_endings,'resource_scope':'Runtime JS/CSS, binary assets and debug maps match exact bytes. Explicit source/document CRLF/LF differences are recorded; any other content difference fails.','assets': rows, 'apple_notarized': False, 'foundry_signoff': False}, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'version': version, 'platform_packages': len(rows), 'editor_resources_match': True}))
