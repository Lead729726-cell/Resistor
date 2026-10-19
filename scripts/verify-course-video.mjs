import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const run=promisify(execFile);
const fpsNumber=text=>{const p=String(text).split('/').map(Number);return p.length===2?p[0]/p[1]:p[0];};
export function inspectCourseVideo(probe,{bytes,filename}){
  const checks=[],add=(name,pass,actual)=>checks.push({name,pass:!!pass,actual});
  const video=probe.streams?.find(s=>s.codec_type==='video'),audio=probe.streams?.filter(s=>s.codec_type==='audio')||[];
  const fps=fpsNumber(video?.avg_frame_rate),allowed=[24000/1001,24,30000/1001,30,60000/1001,60];
  add('supported container extension',['.mp4','.mov','.m4v','.mkv'].includes(path.extname(filename).toLowerCase()),path.extname(filename));
  add('file smaller than 5 GB',bytes>0&&bytes<5_000_000_000,bytes);
  add('positive recorded duration',Number(probe.format?.duration)>0,probe.format?.duration);
  add('1080p or greater, 16:9',video?.width>=1920&&video?.height>=1080&&Math.abs(video.width/video.height-16/9)<.001,video?`${video.width}x${video.height}`:null);
  add('square pixels',video?.sample_aspect_ratio==='1:1',video?.sample_aspect_ratio);
  add('H264 or HEVC',['h264','hevc'].includes(video?.codec_name),video?.codec_name);
  add('supported average frame rate',allowed.some(n=>Math.abs(n-fps)<.003),fps);
  add('audio track present',audio.length>0,audio.length);
  add('stereo audio',audio.length>0&&audio.every(s=>s.channels===2),audio.map(s=>s.channels));
  add('44.1 kHz course output target',audio.length>0&&audio.every(s=>Number(s.sample_rate)===44100),audio.map(s=>s.sample_rate));
  const warnings=[];
  if(audio.some(s=>!Number(s.bit_rate)||Number(s.bit_rate)<256000))warnings.push('256 kbps audio target cannot be confirmed or was not reached. Silence can encode below target; listen to the actual voice and inspect export settings.');
  if(video?.pix_fmt!=='yuv420p')warnings.push('yuv420p compatibility output target was not confirmed.');
  return {schema_version:1,filename:path.basename(filename),metadata_checks_passed:checks.every(c=>c.pass),checks,warnings,human_audio_review:'pending',subtitle_review:'pending',content_review:'pending',platform_approval:'not-submitted',note:'Metadata only. Silent audio is not evidence of narration. Human review remains required.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const file=process.argv[2];if(!file)throw Error('Usage: node scripts/verify-course-video.mjs video.mp4 [--ffprobe path]');
  const i=process.argv.indexOf('--ffprobe'),ffprobe=i>=0?process.argv[i+1]:'ffprobe';
  const {stdout}=await run(ffprobe,['-v','error','-show_streams','-show_format','-of','json',file],{windowsHide:true,maxBuffer:1024*1024,timeout:30000});
  const result=inspectCourseVideo(JSON.parse(stdout),{filename:file,bytes:(await stat(file)).size});
  const output=file+'.qa.json';await writeFile(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({report:output,...result}));if(!result.metadata_checks_passed)process.exitCode=1;
}
