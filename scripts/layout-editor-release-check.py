"""Verify the built editor resources; native OS execution is a separate check."""
import hashlib, json, tarfile, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
version = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
native = json.loads((ROOT / 'docs/evidence/layout-editor/native.json').read_text(encoding='utf-8'))
sha = lambda b: hashlib.sha256(b).hexdigest()
for name, expected in native['source_sha256'].items():
    assert sha((ROOT / name).read_bytes()) == expected, ('Native evidence is stale', name)
resources = [p.relative_to(ROOT).as_posix() for p in (ROOT / 'dist').rglob('*') if p.is_file()]
resources += ['workers/eda/geometry.py', 'workers/eda/server.py', 'docs/drawing-tools.md', 'docs/desktop-installation.md']
expected = {name: sha((ROOT / name).read_bytes()) for name in resources}
rows = []
for arch in ['arm64', 'x64']:
    p = ROOT / 'release/installers' / f'Resistor-{version}-mac-{arch}-r5.zip'
    with zipfile.ZipFile(p) as z:
        assert z.testzip() is None
        prefix = 'Resistor.app/Contents/Resources/app/'
        assert json.loads(z.read(prefix + 'package.json'))['version'] == version
        for name, digest in expected.items():
            assert sha(z.read(prefix + name)) == digest, (arch, name)
    rows.append({'file': p.name, 'bytes': p.stat().st_size, 'sha256': sha(p.read_bytes()), 'exact_resources': True, 'native_execution_verified': False})
p = ROOT / 'release/installers' / f'Resistor-{version}-linux-x64.tar.gz'
with tarfile.open(p) as t:
    prefix = next(n[:-len('workers/eda/server.py')] for n in t.getnames() if n.endswith('resources/app/workers/eda/server.py'))
    assert json.loads(t.extractfile(prefix + 'package.json').read())['version'] == version
    for name, digest in expected.items():
        assert sha(t.extractfile(prefix + name).read()) == digest, name
rows.append({'file': p.name, 'bytes': p.stat().st_size, 'sha256': sha(p.read_bytes()), 'exact_resources': True, 'native_execution_verified': False})
win = ROOT / 'release' / version / 'Resistor-win32-x64/resources/app'
for name, digest in expected.items():
    assert sha((win / name).read_bytes()) == digest, name
p = ROOT / 'release/installers' / f'Resistor-{version}-win-x64.exe'
rows.append({'file': p.name, 'bytes': p.stat().st_size, 'sha256': sha(p.read_bytes()), 'exact_resources': True, 'scope': 'NSIS package source folder; installer UI is separate', 'native_execution_verified': False})
(ROOT / 'docs/evidence/layout-editor/release.json').write_text(json.dumps({'version': version, 'native_evidence_matches_source': True, 'resource_sha256': expected, 'assets': rows, 'apple_notarized': False, 'foundry_signoff': False}, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'version': version, 'platform_packages': len(rows), 'editor_resources_match': True}))
