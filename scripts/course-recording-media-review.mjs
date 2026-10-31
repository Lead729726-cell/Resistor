// Read-only technical review. Never records a microphone or edits the original video.
import {spawn} from 'node:child_process';
import {stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
const argv=process.argv.slice(2),file=argv.find(v=>!v.startsWith('--'));
if(!file)throw Error('Use: node scripts/course-recording-media-review.mjs "lesson.mp4" [--decode]');
const source=path.resolve(file),info=await stat(source);if(!info.isFile())throw Error('Choose one saved recording file.');
const bundled='C:/Program Files/Recordly/resources/app.asar.unpacked/node_modules';
const probe=process.env.RESISTOR_FFPROBE||(process.platform==='win32'?path.join(bundled,'ffprobe-static/bin/win32/x64/ffprobe.exe'):'ffprobe');
const ffmpeg=process.env.RESISTOR_FFMPEG||(process.platform==='win32'?path.join(bundled,'ffmpeg-static/ffmpeg.exe'):'ffmpeg');
const run=(exe,args)=>new Promise((resolve,reject)=>{const child=spawn(exe,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let text='';child.stdout.on('data',v=>text+=v);child.stderr.on('data',v=>text+=v);child.once('error',reject);child.once('close',code=>code===0?resolve(text):reject(Error('Media tool failed: '+text.slice(-1200))));});
const media=JSON.parse(await run(probe,['-v','error','-show_streams','-show_format','-of','json',source]));
const video=media.streams.find(s=>s.codec_type==='video'),audio=media.streams.find(s=>s.codec_type==='audio');
const ratio=(v)=>{const [a,b]=String(v??'0/1').split('/').map(Number);return b?a/b:0;};
const checks={video_present:!!video,audio_track_present:!!audio,duration_positive:Number(media.format.duration)>0,under_5GB:info.size<5e9,resolution_1080p_or_higher:!!video&&video.width>=1920&&video.height>=1080,aspect_16_9:!!video&&Math.abs(video.width/video.height-16/9)<.01,recommended_codec:!!video&&['h264','hevc'].includes(video.codec_name)};
const warnings=[];if(audio&&Number(audio.sample_rate)<44100)warnings.push('권장 샘플레이트 44.1 kHz 미만');if(audio?.channels!==2)warnings.push('권장 오디오 2채널 스테레오 확인');if(audio&&Number(audio.bit_rate||0)<256000)warnings.push('최종 오디오 256 kbps 이상 권장 · 실제 코덱 평균 비트레이트 확인');
if(video&&![23.976,24,29.97,30,59.94,60].some(v=>Math.abs(v-ratio(video.avg_frame_rate))<.01))warnings.push('권장 프레임 속도 확인');
if(video?.sample_aspect_ratio&&video.sample_aspect_ratio!=='1:1')warnings.push('정사각형 픽셀 SAR 1:1 확인');
let decode='not_run';if(argv.includes('--decode')){await run(ffmpeg,['-v','error','-xerror','-i',source,'-map','0:v:0','-map','0:a:0','-f','null','-']);decode='completed';}
const report={schema_version:1,edition:'edu',checked_at:new Date().toISOString(),file:path.basename(source),technical_checks:checks,warnings,video:video?{codec:video.codec_name,width:video.width,height:video.height,fps:video.avg_frame_rate}:null,audio:audio?{codec:audio.codec_name,sample_rate:audio.sample_rate,channels:audio.channels,bit_rate:audio.bit_rate}:null,full_decode:decode,human_audio_review:'not_run',human_content_review:'not_run',subtitle_accuracy:'not_run',microphone_captured:false,meaning:'Saved media technical review only; recording origin and educational quality are not certified.'};
await writeFile(source+'.technical-review.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(Object.values(checks).some(v=>!v))process.exitCode=1;
