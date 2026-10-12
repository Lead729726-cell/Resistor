"""Reproducible, free-narrated lessons made from actual CUA browser recordings."""
import asyncio,hashlib,json,math,re,subprocess,sys
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[1]
RAW=ROOT/'.runtime/physical-tutorials-20261012'
FF=Path(r'C:\Program Files\Recordly\resources\app.asar.unpacked\node_modules\ffmpeg-static\ffmpeg.exe')
PROBE=Path(r'C:\Program Files\Recordly\resources\app.asar.unpacked\node_modules\ffprobe-static\bin\win32\x64\ffprobe.exe')
PLAN=json.loads((ROOT/'scripts/physical-tutorial-plan.json').read_text(encoding='utf-8'))
def call(args):subprocess.run([str(FF),'-hide_banner','-loglevel','error','-y',*map(str,args)],check=True)
def probe(p):return json.loads(subprocess.check_output([str(PROBE),'-v','error','-show_streams','-show_format','-of','json',str(p)]))
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def clock(t,sep=','):
    ms=round(t*1000);return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02}{sep}{ms%1000:03}'
async def voice(lesson,out):
    sys.path.insert(0,str(ROOT/'.tools/tutorial-voice-v2'));import edge_tts
    (out/'audio').mkdir(parents=True,exist_ok=True);rows=[]
    for i,line in enumerate(lesson['lines']):
        key=hashlib.sha256(line['speech'].encode()).hexdigest()[:12];p=out/'audio'/f'{i:02}-{key}.mp3';meta=p.with_suffix('.json')
        if not p.exists() or not meta.exists():
            bounds=[]
            with p.open('wb') as f:
                async for c in edge_tts.Communicate(line['speech'],'ko-KR-SunHiNeural',rate='-2%',boundary='WordBoundary').stream():
                    if c['type']=='audio':f.write(c['data'])
                    elif c['type']=='WordBoundary':bounds.append(c)
            if not bounds:raise RuntimeError('Voice timing unavailable')
            meta.write_text(json.dumps(bounds,ensure_ascii=False),encoding='utf-8')
        rows.append({**line,'index':i,'audio':str(p.relative_to(out)).replace('\\','/'),'audio_duration_s':float(probe(p)['format']['duration']),'boundaries':json.loads(meta.read_text(encoding='utf-8'))})
        print(json.dumps({'lesson':lesson['id'],'voice':i+1},ensure_ascii=False),flush=True)
    (out/'narration.json').write_text(json.dumps({'paid_calls':0,'voice':'ko-KR-SunHiNeural','rows':rows},ensure_ascii=False,indent=2),encoding='utf-8')
def source(row,work,out):
    folder=RAW/'raw'/row['clip'];meta=json.loads((folder/'capture.json').read_text(encoding='utf-8'))
    if meta.get('error') or meta.get('truncated') or not meta['frames']:raise RuntimeError('Recording invalid: '+row['clip'])
    frames=meta['frames'];duration=max(.05,meta['duration_s']);speed=min(8,max(1,row['duration_s']/duration));lines=['ffconcat version 1.0']
    times=[max(0,f['time_s']-frames[0]['time_s']) for f in frames]
    for i,f in enumerate(frames):
        p=(folder/f['file']).resolve().as_posix()
        dt=times[i+1]-times[i] if i+1<len(frames) else max(.04,duration-times[i])
        lines.extend([f"file '{p}'",f'duration {max(1/60,dt)*speed:.8f}'])
    p=(folder/frames[-1]['file']).resolve().as_posix();lines.extend([f"file '{p}'",'duration 0.2',f"file '{p}'"])
    dest=work/f'source-{row["index"]:02}.ffconcat';dest.write_text('\n'.join(lines)+'\n',encoding='utf-8')
    return dest,{'clip':row['clip'],'frame_count':len(frames),'source_duration_s':duration,'edit_time_factor':speed,'metadata_sha256':digest(folder/'capture.json'),'native_source_size':Image.open(folder/frames[0]['file']).size}
def chunks(text):
    parts=[];part=[]
    for word in text.split():
        if part and len(' '.join(part+[word]))>40:parts.append(' '.join(part));part=[]
        part.append(word)
    if part:parts.append(' '.join(part))
    return parts
def render(lesson,out):
    rows=json.loads((out/'narration.json').read_text(encoding='utf-8-sig'))['rows'];work=out/'edit';work.mkdir(exist_ok=True)
    timeline=0;segments=[];chapters=[];cues=[];sources=[]
    for row in rows:
        row['audio_duration_s']=float(probe(out/row['audio'])['format']['duration'])
        row['duration_s']=math.ceil((row['audio_duration_s']+.8)*30)/30;row['start_s']=timeline
        if not chapters or chapters[-1]['title']!=row['chapter']:chapters.append({'title':row['chapter'],'start_s':timeline})
        src,record=source(row,work,out);sources.append(record);segment=work/f'{row["index"]:02}.mp4'
        call(['-f','concat','-safe','0','-i',src,'-i',out/row['audio'],'-vf','scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=900','-af','adelay=200|200,apad','-t',row['duration_s'],'-c:v','libx264','-preset','veryfast','-crf','22','-pix_fmt','yuv420p','-threads','2','-c:a','aac','-b:a','160k','-ar','48000','-ac','2',segment])
        segments.append(segment);parts=chunks(row['speech']);bounds=sorted(row['boundaries'],key=lambda b:b['offset']);total=sum(len(p.replace(' ','')) for p in parts);running=0;times=[]
        # Native SAPI's progress clock can drift against the written WAV.
        # Calibrate its final offset to the actual decoded audio duration.
        clock_scale=min(1,(row['audio_duration_s']-.15)/(bounds[-1]['offset']/1e7+.1))
        for part in parts:
            j=min(len(bounds)-1,round(running/total*len(bounds)));times.append(timeline+.2+bounds[j]['offset']/1e7*clock_scale);running+=len(part.replace(' ',''))
        end=timeline+.2+row['audio_duration_s']
        for i,part in enumerate(parts):cues.append({'start_s':times[i],'end_s':times[i+1]-.025 if i+1<len(times) else min(end,timeline+row['duration_s']-.1),'text':part})
        timeline+=row['duration_s'];print(json.dumps({'lesson':lesson['id'],'render':row['index']+1,'seconds':round(timeline,2)}),flush=True)
    listing=work/'segments.ffconcat';listing.write_text('ffconcat version 1.0\n'+'\n'.join(f"file '{p.resolve().as_posix()}'" for p in segments)+'\n',encoding='utf-8')
    clean=out/'guide-clean.mp4';call(['-f','concat','-safe','0','-i',listing,'-c','copy','-movflags','+faststart',clean])
    srt='\n\n'.join(f'{i+1}\n{clock(c["start_s"])} --> {clock(c["end_s"])}\n{c["text"]}' for i,c in enumerate(cues))+'\n'
    (out/'subtitles-ko.srt').write_text(srt,encoding='utf-8');(out/'subtitles-ko.vtt').write_text('WEBVTT\n\n'+'\n\n'.join(f'{clock(c["start_s"],".")} --> {clock(c["end_s"],".")}\n{c["text"]}' for c in cues)+'\n',encoding='utf-8')
    # Explicit 1080p ASS coordinates avoid SRT's default 288px canvas scaling.
    def ass_time(t):
        cs=round(t*100);return f'{cs//360000}:{cs//6000%60:02}:{cs//100%60:02}.{cs%100:02}'
    ass='[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nWrapStyle: 2\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Malgun Gothic,38,&H00FFFFFF,&H00FFFFFF,&H90000000,&H90000000,0,0,0,0,100,100,0,0,3,2,0,2,120,120,38,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n'
    for c in cues:ass+=f'Dialogue: 0,{ass_time(c["start_s"])},{ass_time(c["end_s"])},Default,,0,0,0,,{c["text"]}\n'
    (out/'subtitles-ko.ass').write_text(ass,encoding='utf-8')
    subprocess.run([str(FF),'-hide_banner','-loglevel','error','-y','-i',str(clean),'-vf','ass=subtitles-ko.ass','-c:v','libx264','-preset','veryfast','-crf','22','-threads','2','-c:a','copy','-movflags','+faststart','guide-captioned.mp4'],cwd=out,check=True)
    call(['-i',clean,'-vn','-c:a','copy',out/'narration.m4a'])
    poster=RAW/'posters'/f'{lesson["id"]}.png'
    if poster.exists():import shutil;shutil.copyfile(poster,out/'thumbnail.png')
    if any(c['end_s']<=c['start_s'] or c['end_s']>timeline for c in cues) or any(a['end_s']>b['start_s'] for a,b in zip(cues,cues[1:])):raise RuntimeError('Caption times overlap, reverse or leave the actual lesson.')
    (out/'caption-timeline.json').write_text(json.dumps(cues,ensure_ascii=False,indent=2),encoding='utf-8')
    result={'schema_version':1,'id':lesson['id'],'title':lesson['title'],'duration_s':float(probe(clean)['format']['duration']),'width':1920,'height':1080,'fps':30,'chapters':chapters,'sources':sources,'subtitle_cues':len(cues),'caption_timing':'Native word progress normalized to decoded audio duration; full manual listening/alignment review pending.','paid_calls':0,'full_human_listening_review':False,'capture_method':'Actual CUA app operations; native browser repaint timestamps; explicit slow/hold editing','files':{p.name:{'bytes':p.stat().st_size,'sha256':digest(p)} for p in out.iterdir() if p.suffix in ('.mp4','.srt','.vtt','.ass','.m4a','.png')}}
    (out/'evidence.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (out/'script.txt').write_text(lesson['title']+'\n\n'+'\n\n'.join(row['chapter']+'\n'+row['speech'] for row in rows),encoding='utf-8')
def verify(out):
    report=json.loads((out/'evidence.json').read_text(encoding='utf-8'));checks=[]
    for name,meta in report['files'].items():
        p=out/name;assert digest(p)==meta['sha256'];checks.append(name+' hash')
        if p.suffix=='.mp4':
            data=probe(p);v=next(s for s in data['streams'] if s['codec_type']=='video');a=next(s for s in data['streams'] if s['codec_type']=='audio');assert (v['width'],v['height'],v['r_frame_rate'],v['pix_fmt'])==(1920,1080,'30/1','yuv420p');assert a['codec_name']=='aac' and a['channels']==2
            call(['-i',p,'-f','null','NUL']);checks.append(name+' complete decode')
    report['technical_checks']=checks;report['technical_verification_pass']=True;(out/'evidence.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps({'verified':report['id'],'duration_s':report['duration_s'],'checks':len(checks)}),flush=True)
async def main():
    mode=sys.argv[1];requested=sys.argv[2:]
    for lesson in PLAN['lessons']:
        if requested and lesson['id'] not in requested:continue
        out=ROOT/'release/tutorials'/lesson['id'];out.mkdir(parents=True,exist_ok=True)
        if mode=='voice':await voice(lesson,out)
        elif mode=='voice-local':
            task_script=str(ROOT/'scripts/physical-tutorial-voice.ps1').replace("'","''")
            task_root=str(ROOT).replace("'","''")
            command=f"& ([scriptblock]::Create([IO.File]::ReadAllText('{task_script}'))) -LessonId '{lesson['id']}' -TaskRoot '{task_root}'"
            subprocess.run(['powershell.exe','-NoProfile','-Command',command],check=True)
        elif mode=='render':render(lesson,out)
        elif mode=='verify':verify(out)
        else:raise ValueError('voice/render/verify required')
if __name__=='__main__':asyncio.run(main())
