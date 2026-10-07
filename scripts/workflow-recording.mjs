import {readFile,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import path from 'node:path';
const source=path.resolve(process.argv[2]||'.runtime/cpu16/recording'),output=path.resolve(process.argv[3]||'examples/cpu16/workflow.webm');
const frames=JSON.parse(await readFile(path.join(source,'timeline.json'),'utf8'));
if(!frames.length||frames.some((f,i)=>!/^frame-\d+\.jpg$/.test(f.file)||!Number.isFinite(f.time_s)||f.time_s<0||i&&f.time_s<frames[i-1].time_s))throw Error('Expected ordered actual screenshot frames.');
const ffmpeg=process.env.REGISTER_FFMPEG||'C:/Users/tjrgu/AppData/Local/ms-playwright/ffmpeg-1011/ffmpeg-win64.exe';
const child=spawn(ffmpeg,['-y','-f','image2pipe','-c:v','mjpeg','-r','1','-i','pipe:0','-vf','scale=trunc(iw/2)*2:trunc(ih/2)*2','-c:v','libvpx','-b:v','200k','-crf','20','-deadline','realtime','-cpu-used','5','-an',output],{stdio:['pipe','ignore','pipe'],windowsHide:true});
let stderr='';child.stderr.on('data',chunk=>stderr=(stderr+chunk).slice(-4000));
const finished=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(stderr)));});
let index=0,buffer=await readFile(path.join(source,frames[0].file)),seconds=Math.ceil(frames.at(-1).time_s)+1;
try{
  for(let second=0;second<seconds;second++){
    while(index+1<frames.length&&frames[index+1].time_s<=second){index++;buffer=await readFile(path.join(source,frames[index].file));}
    if(!child.stdin.write(buffer))await Promise.race([once(child.stdin,'drain'),finished]);
  }
  child.stdin.end();await finished;
}catch(error){child.stdin.destroy();child.kill();throw error;}
await writeFile(path.join(path.dirname(output),'recording.json'),JSON.stringify({schema_version:1,created_at:new Date().toISOString(),actual_screenshot_frames:frames.length,timeline_seconds:seconds,playback_fps:1,scope:'Actual browser UI screenshots held until the next capture, preserving wall-clock gaps. Not continuous 30fps; code/terminal editing and unobserved transitions are not captured.',frames,full_playback_reviewed:false},null,2)+'\n');
console.log(JSON.stringify({frames:frames.length,seconds,output},null,2));
