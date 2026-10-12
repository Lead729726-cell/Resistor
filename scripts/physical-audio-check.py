"""Free local ASR spot checks; never represented as human listening approval."""
from pathlib import Path
import json,difflib,re
from faster_whisper import WhisperModel
ROOT=Path(__file__).resolve().parents[1]
model=WhisperModel('base',device='cpu',compute_type='int8',cpu_threads=3,num_workers=1,download_root=str(ROOT/'.tools/tutorial-asr'))
clean=lambda s:re.sub(r'[^가-힣a-z0-9]','',s.lower())
for lesson in ['physical-logic-ko-v1','physical-chips-ko-v1']:
 folder=ROOT/'release/tutorials'/lesson;n=json.loads((folder/'narration.json').read_text(encoding='utf-8-sig'));rows=[]
 for i in [0,5,9,len(n['rows'])-1]:
  row=n['rows'][i];segments,info=model.transcribe(str(folder/row['audio']),beam_size=3,condition_on_previous_text=False)
  text=' '.join(s.text.strip() for s in segments);ratio=difflib.SequenceMatcher(None,clean(row['speech']),clean(text)).ratio()
  rows.append({'row':i,'language':info.language,'expected':row['speech'],'transcript':text,'normalized_similarity':ratio});print(json.dumps({'lesson':lesson,'row':i,'similarity':round(ratio,3)},ensure_ascii=False),flush=True)
 dest=ROOT/'docs/evidence/physical-tutorials';dest.mkdir(parents=True,exist_ok=True);(dest/(lesson+'-audio.json')).write_text(json.dumps({'method':'local faster-whisper base CPU int8 / 4 segments per lesson','paid_calls':0,'human_listening_review':False,'rows':rows},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
