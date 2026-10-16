"""Edit actual CUA recordings. Free Edge narration; no OpenAI key or paid API.

python scripts/edu-study-video.py --phase voice --voice-lib PATH_TO_EDGE_TTS
python scripts/edu-study-video.py --phase render
"""
import argparse,asyncio,hashlib,json,shutil,subprocess,sys
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont

ROOT=Path(__file__).resolve().parents[1]
P=argparse.ArgumentParser();P.add_argument('--phase',choices=['voice','render','verify','package'],required=True);P.add_argument('--voice-lib');P.add_argument('--raw',type=Path,default=ROOT/'.runtime/edu-study-video-20261016');P.add_argument('--out',type=Path,default=ROOT/'release/tutorials/Resistor-Edu-Self-Study-KO');A=P.parse_args()
PLAN=json.loads((ROOT/'scripts/edu-study-video-plan.json').read_text(encoding='utf-8'))
OUT=A.out;OUT.mkdir(parents=True,exist_ok=True);WORK=OUT/'edit';WORK.mkdir(exist_ok=True)
FF=shutil.which('ffmpeg') or r'C:\Program Files\Recordly\resources\app.asar.unpacked\node_modules\ffmpeg-static\ffmpeg.exe'
PROBE=shutil.which('ffprobe') or r'C:\Program Files\Recordly\resources\app.asar.unpacked\node_modules\ffprobe-static\bin\win32\x64\ffprobe.exe'
FONT=Path(r'C:\Windows\Fonts\malgun.ttf');BOLD=Path(r'C:\Windows\Fonts\malgunbd.ttf')
def font(n,bold=False):return ImageFont.truetype(str(BOLD if bold else FONT),n)
def probe(file):return json.loads(subprocess.check_output([PROBE,'-v','error','-show_streams','-show_format','-of','json',str(file)]))
def digest(file):return hashlib.sha256(Path(file).read_bytes()).hexdigest()
def ff(args):
 p=subprocess.run([FF,'-hide_banner','-loglevel','error','-y',*map(str,args)],capture_output=True,text=True,encoding='utf-8',errors='replace')
 if p.returncode:raise RuntimeError(p.stderr[-4000:])
def stamp(t,ass=False):
 u=100 if ass else 1000;n=round(t*u);h,n=divmod(n,3600*u);m,n=divmod(n,60*u);s,f=divmod(n,u)
 return f'{h}:{m:02}:{s:02}.{f:02}' if ass else f'{h:02}:{m:02}:{s:02},{f:03}'
def wrap(text,width,size):
 lines=[];line='';d=ImageDraw.Draw(Image.new('RGB',(1,1)))
 for word in text.split():
  if line and d.textlength(line+' '+word,font=font(size))>width:lines.append(line);line=word
  else:line=(line+' '+word).strip()
 if line:lines.append(line)
 return lines
async def voice():
 if A.voice_lib:sys.path.insert(0,A.voice_lib)
 import edge_tts
 for i,row in enumerate(PLAN['rows']):
  mp3=WORK/f'{i:02}.mp3';meta=WORK/f'{i:02}.voice.json'
  if not mp3.exists() or not meta.exists() or json.loads(meta.read_text(encoding='utf-8')).get('text')!=row['speech']:
   boundaries=[]
   with mp3.open('wb') as f:
    async for part in edge_tts.Communicate(row['speech'],PLAN['voice'],rate='-3%',boundary='WordBoundary').stream():
     if part['type']=='audio':f.write(part['data'])
     elif part['type']=='WordBoundary':boundaries.append(part)
   if not boundaries:raise RuntimeError('Missing narration timing')
   meta.write_text(json.dumps({'text':row['speech'],'boundaries':boundaries},ensure_ascii=False,indent=2),encoding='utf-8')
  print(json.dumps({'voice_row':i+1,'seconds':float(probe(mp3)['format']['duration']),'paid_calls':0}),flush=True)
def overlay(row,path):
 im=Image.new('RGBA',(1920,1080),(0,0,0,0));d=ImageDraw.Draw(im)
 d.rectangle((0,0,760,1080),fill='#111820');d.rectangle((66,78,72,1006),fill='#6bd3bc')
 d.text((104,77),'RESISTOR EDU',font=font(31,True),fill='#6bd3bc')
 d.text((106,141),'AI 자율학습 · 실제 회로 실험',font=font(23),fill='#a6b6c7')
 for i,line in enumerate(wrap(row['title'],600,49)):d.text((104,255+72*i),line,font=font(49,True),fill='#eff4f8')
 for i,line in enumerate(wrap(row['note'],600,26)):d.text((108,443+42*i),line,font=font(26),fill='#6bd3bc')
 d.text((108,925),'실제 앱 녹화 · 설명 구간 정지 화면 포함',font=font(21),fill='#a6b6c7')
 d.text((108,964),'ngspice / 모델별 조건 · 제조 검증 아님',font=font(21),fill='#a6b6c7')
 d.text((108,1003),'한국어 합성 음성 · 유료 AI 호출 0회',font=font(20),fill='#7f91a5');im.save(path)
def cues(row,meta,duration,speed=1):
 # Group actual speech word boundaries; external CC and burned captions share timing.
 result=[];words=[];start=None;end=None
 for b in meta['boundaries']:
  text=b['text'];t=b['offset']/1e7/speed+.25;e=(b['offset']+b['duration'])/1e7/speed+.25
  if words and len(' '.join(words+[text]))>34:result.append({'start':start,'end':min(t-.025,duration-.1),'text':' '.join(words)});words=[];start=None
  if start is None:start=t
  words.append(text);end=e
 if words:result.append({'start':start,'end':min(end+.15,duration-.1),'text':' '.join(words)})
 return result
def ass(cues,file):
 head='''[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Default,Malgun Gothic,34,&H00F5F3EE,&H000000FF,&H00201811,&H00201811,0,0,0,0,100,100,0,0,1,0,0,7,108,1190,610,1
[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
'''
 file.write_text(head+''.join(f"Dialogue: 0,{stamp(c['start'],True)},{stamp(c['end'],True)},Default,,0,0,0,,{c['text']}\n" for c in cues),encoding='utf-8')
def ffpath(file):return str(file.resolve()).replace('\\','/').replace(':','\\:').replace("'","\\'")
def render():
 rows=[];allcues=[];clock=0;target=427;total_voice=sum(float(probe(WORK/f'{i:02}.mp3')['format']['duration']) for i in range(len(PLAN['rows'])));speed=total_voice/(target-len(PLAN['rows'])*.7);assert .85<speed<1.2
 for i,row in enumerate(PLAN['rows']):
  audio=WORK/f'{i:02}.mp3';seconds=round((float(probe(audio)['format']['duration'])/speed+.7)*30)/30 if i<len(PLAN['rows'])-1 else target-clock;folder=A.raw/'raw'/row['clip'];capture=json.loads((folder/'capture.json').read_text(encoding='utf-8'));assert not capture.get('error') and not capture.get('truncated');frames=[f for f in capture['frames'] if 'capture' not in f['metadata']];assert frames
  # Slow the actual input/repaint motion, then hold its final recorded frame for reading.
  scale=min(8,max(1,seconds*.7/max(capture['duration_s'],.05)));times=[max(0,f['time_s']-frames[0]['time_s']) for f in frames];motion=min(seconds-.4,capture['duration_s']*scale)
  source=WORK/f'{i:02}.ffconcat';lines=['ffconcat version 1.0'];elapsed=0
  for j,frame in enumerate(frames):
   file=(folder/frame['file']).resolve().as_posix();dt=max(.001,(times[j+1]-times[j]) if j+1<len(frames) else .05)*scale;dt=min(dt,max(.001,motion-elapsed));elapsed+=dt;lines.extend([f"file '{file}'",f'duration {dt:.8f}'])
  last=(folder/frames[-1]['file']).resolve().as_posix();lines.extend([f"file '{last}'",f'duration {max(.1,seconds-elapsed):.8f}',f"file '{last}'"]);source.write_text('\n'.join(lines)+'\n',encoding='utf-8')
  image=WORK/f'{i:02}.png';overlay(row,image);localcues=cues(row,json.loads((WORK/f'{i:02}.voice.json').read_text(encoding='utf-8')),seconds,speed);subtitle=WORK/f'{i:02}.ass';ass(localcues,subtitle);output=WORK/f'{i:02}.mp4'
  filters=f"[0:v]crop=1040:1080:440:0,pad=1920:1080:800:0:color=0x111820[base];[base][1:v]overlay=0:0,ass='{ffpath(subtitle)}',fps=30,format=yuv420p[v]"
  ff(['-f','concat','-safe','0','-i',source,'-loop','1','-i',image,'-i',audio,'-filter_complex',filters,'-map','[v]','-map','2:a','-af',f'atempo={speed:.9f},adelay=250|250,apad','-t',f'{seconds:.3f}','-c:v','libx264','-preset','veryfast','-crf','19','-c:a','aac','-b:a','160k','-ar','48000','-movflags','+faststart',output])
  actual=float(probe(output)['format']['duration']);rows.append({**row,'start_s':clock,'duration_s':actual,'source_capture_sha256':digest(folder/'capture.json'),'source_frames':len(frames),'excluded_stills':'Initial/final Page.captureScreenshot frames have a mismatched capture scale and are excluded; only native screencast frames are used.','source_duration_s':capture['duration_s'],'motion_time_scale':scale,'audio_sha256':digest(audio),'voice_speed':speed})
  allcues.extend({**c,'start':clock+c['start'],'end':clock+c['end']} for c in localcues);clock+=seconds;print(json.dumps({'render_row':i+1,'duration_s':actual}),flush=True)
 join=WORK/'join.txt';join.write_text(''.join(f"file '{(WORK/f'{i:02}.mp4').resolve().as_posix()}'\n" for i in range(len(rows))),encoding='utf-8');final=OUT/'Resistor-Edu-AI-Study-KO.mp4';ff(['-f','concat','-safe','0','-i',join,'-c','copy',WORK/'assembled.mp4']);ff(['-i',WORK/'assembled.mp4','-vf','fps=30,setpts=N/(30*TB)','-af','atrim=duration=427,asetpts=N/SR/TB','-frames:v','12810','-t','427','-c:v','libx264','-preset','veryfast','-crf','19','-c:a','aac','-b:a','160k','-movflags','+faststart',final])
 srt=''.join(f"{i+1}\n{stamp(c['start'])} --> {stamp(c['end'])}\n{c['text']}\n\n" for i,c in enumerate(allcues));(OUT/'captions.ko.srt').write_text(srt,encoding='utf-8');(OUT/'captions.ko.vtt').write_text('WEBVTT\n\n'+srt.replace(',','.'),encoding='utf-8')
 (OUT/'chapters.txt').write_text('\n'.join(f"{int(r['start_s'])//60:02}:{int(r['start_s'])%60:02} {r['title']}" for r in rows)+'\n',encoding='utf-8')
 (OUT/'edit-manifest.json').write_text(json.dumps({'edition':'edu','title':PLAN['title'],'paid_calls':0,'model_response_recorded':False,'source':'Actual CUA browser repaint recordings; native timestamps, slowed motion and final-frame holds; central panel crop','voice':PLAN['voice'],'rows':rows,'file_sha256':digest(final)},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 shutil.copyfile(WORK/'00.png',OUT/'chapter-art.png');print(json.dumps({'video':str(final),'seconds':float(probe(final)['format']['duration'])}),flush=True)
def verify():
 file=OUT/'Resistor-Edu-AI-Study-KO.mp4';p=probe(file);v=next(s for s in p['streams'] if s['codec_type']=='video');a=next(s for s in p['streams'] if s['codec_type']=='audio');assert(v['width'],v['height'],v['avg_frame_rate'])==(1920,1080,'30/1');assert abs(float(p['format']['duration'])-427)<.05;assert v['codec_name']=='h264' and a['codec_name']=='aac';ff(['-i',file,'-f','null','-']);report={'edition':'edu','duration_s':float(p['format']['duration']),'width':1920,'height':1080,'fps':30,'video_codec':v['codec_name'],'audio_codec':a['codec_name'],'sha256':digest(file),'full_decode':'passed','paid_calls':0,'human_full_listening_completed':False,'target_duration_s':427};manifest=json.loads((OUT/'edit-manifest.json').read_text(encoding='utf-8'));manifest['file_sha256']=digest(file);manifest['final_cfr_normalized']=True;(OUT/'edit-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');(OUT/'verification.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report),flush=True)
if A.phase=='voice':asyncio.run(voice())
elif A.phase=='render':render()
elif A.phase=='verify':verify()
else:
 import zipfile
 assert (OUT/'verification.json').is_file(),'Verify the final file before packaging'
 target=ROOT/'public/edu-study-tutorial';target.mkdir(parents=True,exist_ok=True)
 for name in ['Resistor-Edu-AI-Study-KO.mp4','captions.ko.srt','captions.ko.vtt']:shutil.copyfile(OUT/name,target/name)
 manifest=json.loads((OUT/'edit-manifest.json').read_text(encoding='utf-8'));(target/'chapters.json').write_text(json.dumps([{'title':r['title'],'start_s':r['start_s']} for r in manifest['rows']],ensure_ascii=False),encoding='utf-8')
 with zipfile.ZipFile(OUT/'Resistor-Edu-AI-Study-KO.zip','w',zipfile.ZIP_DEFLATED) as z:
  for name in ['Resistor-Edu-AI-Study-KO.mp4','captions.ko.srt','captions.ko.vtt','chapters.txt','edit-manifest.json','verification.json']:z.write(OUT/name,name)
  for name in ['edu-study-video.py','edu-study-video-plan.json','tutorial-capture.mjs']:z.write(ROOT/'scripts'/name,'source/'+name)
 with zipfile.ZipFile(OUT/'source-recordings.zip','w',zipfile.ZIP_DEFLATED) as z:
  for row in manifest['rows']:
   folder=A.raw/'raw'/row['clip'];metadata=json.loads((folder/'capture.json').read_text(encoding='utf-8'));z.write(folder/'capture.json',row['clip']+'/capture.json')
   for f in metadata['frames']:
    if 'capture' not in f['metadata']:z.write(folder/f['file'],row['clip']+'/'+f['file'])
 print(json.dumps({'player':'/edu-study-tutorial/index.html','package':str(OUT/'Resistor-Edu-AI-Study-KO.zip'),'source_recordings':str(OUT/'source-recordings.zip')}))
