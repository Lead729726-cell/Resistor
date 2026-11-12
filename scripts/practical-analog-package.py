"""Package one completed practical-analog attempt without discarding previous attempts."""
import argparse
import hashlib
import json
import shutil
import zipfile
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('report', type=Path)
parser.add_argument('--destination', type=Path)
args = parser.parse_args()
attempt = args.report.resolve().parent
destination = (args.destination or attempt.parent).resolve()
if destination == attempt or attempt in destination.parents:
    raise SystemExit('Package destination must be outside the measured attempt.')
report = json.loads(args.report.read_text(encoding='utf-8'))
if not report.get('completed') or not report.get('all_directed_criteria_passed'):
    raise SystemExit('The measured reference gate must complete before packaging.')
destination.mkdir(parents=True, exist_ok=True)


def digest(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


# Recheck every published artifact, not only successful run labels.
for run in report['runs'] + report.get('supplemental_runs', []):
    for name, sha in run['files'].items():
        file = (attempt / run['artifact_directory'] / name).resolve()
        if attempt not in file.parents or digest(file) != sha:
            raise SystemExit('Artifact boundary or hash mismatch: ' + str(file))
for file, sha in report['source_sha256'].items():
    if digest(attempt / 'source' / file) != sha:
        raise SystemExit('Frozen source hash mismatch: ' + file)
published = []
for project in report['projects']:
    kind = project['template_id']
    bundle = attempt / project['bundle']['path']
    if digest(bundle) != project['bundle']['sha256']:
        raise SystemExit('Project bundle hash mismatch.')
    for source, name in ((bundle, kind + '.register.zip'), (attempt / kind / 'core.spice', kind + '.spice')):
        shutil.copyfile(source, destination / name); published.append(name)
for name in ('report.json', 'measured-overview.png', 'measured-overview.svg', 'measured-overview.pdf', 'plot-provenance.json'):
    shutil.copyfile(attempt / name, destination / name); published.append(name)
archive = destination / 'evidence.zip'
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=7) as output:
    for file in sorted(attempt.rglob('*')):
        if file.is_file():
            output.write(file, attempt.name + '/' + file.relative_to(attempt).as_posix())
with zipfile.ZipFile(archive) as check:
    if check.testzip() is not None:
        raise SystemExit('Compressed evidence failed CRC validation.')
published.append(archive.name)
record = dict(schema_version=1, edition='indust', attempt=attempt.name,
              report_sha256=digest(args.report), files={name:dict(sha256=digest(destination/name),bytes=(destination/name).stat().st_size) for name in published})
(destination / 'checksums.json').write_text(json.dumps(record, indent=2)+'\n', encoding='utf-8')
print(json.dumps(dict(destination=str(destination), published=len(published), archive_bytes=archive.stat().st_size)))
