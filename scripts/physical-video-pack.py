"""Package the rendered lessons for local editing or a later YouTube upload."""
from pathlib import Path
import json,hashlib,zipfile
ROOT=Path(__file__).resolve().parents[1]
for short in ['physical-logic','physical-chips']:
 folder=ROOT/'release/tutorials'/f'{short}-ko-v1';e=json.loads((folder/'evidence.json').read_text(encoding='utf-8'));assert e['technical_verification_pass']
 out=ROOT/'release/tutorials'/f'Resistor-{short}-YouTube-Pack.zip'
 names=['guide-clean.mp4','guide-captioned.mp4','narration.m4a','subtitles-ko.srt','subtitles-ko.vtt','subtitles-ko.ass','caption-timeline.json','script.txt','thumbnail.png','evidence.json']
 with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
  for name in names:z.write(folder/name,name)
  z.write(ROOT/'scripts/physical-tutorial-plan.json','editing/physical-tutorial-plan.json')
  z.write(ROOT/'scripts/physical-tutorials.py','editing/physical-tutorials.py')
  z.writestr('README.txt',f"{e['title']}\n\nActual CUA browser recording, 1920x1080 30fps, Korean synthetic narration.\nNo YouTube upload was performed. Use guide-clean.mp4 with SRT/VTT, or guide-captioned.mp4.\nFull human listening and fine caption alignment review remain pending.\nChapters:\n"+'\n'.join(f"{int(c['start_s']//60):02}:{int(c['start_s']%60):02} {c['title']}" for c in e['chapters'])+'\n\nPhysical references: https://resistor-downloads.vercel.app/references/\n')
 with zipfile.ZipFile(out,'r') as verified:assert verified.testzip() is None
 dest=ROOT/'docs/evidence/physical-tutorials';dest.mkdir(parents=True,exist_ok=True)
 (dest/f'{short}.json').write_text(json.dumps({**e,'package':{'file':out.name,'bytes':out.stat().st_size,'sha256':hashlib.file_digest(out.open('rb'),'sha256').hexdigest()}},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(out.name,out.stat().st_size)
