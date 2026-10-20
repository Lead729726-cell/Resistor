"""Small importable project package; large native vectors stay individually available."""
import hashlib,json,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];SOURCE=ROOT/'examples/adc16-lab';TARGET=ROOT/'examples/Resistor-ADC16-Projects.zip'
BASE='https://raw.githubusercontent.com/Lead729726-cell/Resistor/codex/resistor-indust/examples/adc16-lab/'
files=[f for f in SOURCE.rglob('*')if f.is_file()and f.name!='SHA256SUMS.json'];hashes={str(f.relative_to(SOURCE)).replace('\\','/'):dict(bytes=f.stat().st_size,sha256=hashlib.sha256(f.read_bytes()).hexdigest())for f in files}
(SOURCE/'SHA256SUMS.json').write_text(json.dumps(hashes,indent=2)+'\n',encoding='utf-8');files.append(SOURCE/'SHA256SUMS.json')
omitted=[];included=[]
for f in files:
 relative=str(f.relative_to(SOURCE)).replace('\\','/')
 if relative in('README.md',):continue
 if f.name=='waveform.dat.gz'or f.name.endswith('.gds.gz'):
  omitted.append(dict(file=relative,**hashes[relative],url=BASE+relative));continue
 included.append((f,relative))
readme='''# Resistor Indust · ADC16 projects

16-bit SAR / second-order Sigma-delta / Pipeline; 23 editable circuit blocks
and 3 physical projects. These are research references, not silicon-qualified
16-effective-bit ADCs. No new application installer is included.

Open a `projects/*.register.zip` using Resistor Indust project import.
Use the current source engine. Imports inherit no engine PASS results.

- projects/index.json: editable hierarchy and physical projects
- native/index.json: actual execution summaries, including accuracy FAILs
- physical/index.json: public SKY130 DRC/LVS/extraction runs
- qa/verification.json: actual independent RTL/gate/CMOS replay
- import-exchange.json: GDS roundtrip and import checks
- ARCHIVE-SCOPE.json: individually downloadable original large raw/GDS files

SAR untrimmed maximum error: 19 LSB. Sigma-delta untrimmed maximum DC error:
119 LSB. Pipeline measured 1 LSB at 0.15V DC only. Noise, mismatch, full-input
INL/DNL, complete ADC post-layout accuracy and manufacturing signoff remain
unverified. Offline trim study does not change the RTL or raw verdicts.

Korean guide and reproduction:
https://github.com/Lead729726-cell/Resistor/blob/codex/resistor-indust/docs/adc16-lab.md
'''
with zipfile.ZipFile(TARGET,'w',zipfile.ZIP_DEFLATED,compresslevel=9)as archive:
 archive.writestr('Resistor-ADC16/README.md',readme)
 archive.writestr('Resistor-ADC16/ARCHIVE-SCOPE.json',json.dumps(dict(edition='Resistor Indust',scope='Project bundle plus compact evidence. Original large native vectors/GDS remain in the public repository and owned local runtime; hashes and download URLs below.',omitted_large_files=omitted),indent=2)+'\n')
 for f,relative in included:archive.write(f,'Resistor-ADC16/'+relative)
with zipfile.ZipFile(TARGET)as archive:
 total=sum(f.file_size for f in archive.infolist());assert total<200*1024**2;assert max(f.file_size for f in archive.infolist())<50*1024**2
 assert archive.testzip()is None
assert TARGET.stat().st_size<50*1024**2
print(json.dumps(dict(file=str(TARGET),bytes=TARGET.stat().st_size,sha256=hashlib.sha256(TARGET.read_bytes()).hexdigest(),expanded_bytes=total,omitted_original_vectors=len(omitted))))
