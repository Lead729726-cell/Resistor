import test from 'node:test';
import assert from 'node:assert/strict';
import {lecturePlans,lectureTime,chapterText,lectureHandout,lectureEvidence,lectureProjectRequest,requestedLectureProject} from '../packages/ui/src/lecture-model';
import type {Project,Run} from '../packages/contracts/src/index';
import {LectureRecorder} from '../packages/ui/src/lecture-recorder';

test('lecture plans point at existing public demos and contain actions, limits and presenter notes',()=>{
  assert.deepEqual(lecturePlans.slice(0,3).map(p=>p.example),['rc_lowpass','layout','inverter']);
  assert.deepEqual(lecturePlans.slice(3,7).map(p=>p.example),['osc_ring5','osc_rc_sensor','osc_beat','osc_burst']);
  assert.equal(lecturePlans[7].example,'schematic');
  for(const p of lecturePlans){assert(p.requirements);assert(p.steps.length>=3&&p.steps.length<=10);for(const s of p.steps)assert(s.action&&s.notes&&s.observe&&s.minutes>0);const text=lectureHandout(p,'Resistor Indust','내 메모');assert(text.includes('내 메모'));assert(text.includes('강의 단계 이동과 학습 완료는 실제 엔진 실행'));}
});
test('lecture demos route through their actual engine API without auto simulation',()=>{
  for(const p of lecturePlans){const r=lectureProjectRequest(p,'test-command');assert.equal(r.method,['layout','inverter','schematic'].includes(p.example)?'project.create':'design.create_template');assert(!('analysis' in r.params));if(r.method==='design.create_template')assert.equal(r.params.command_id,'test-command');}
});
test('project links accept only a bounded local project ID',()=>{
  const id='a'.repeat(32);assert.equal(requestedLectureProject('?project='+id),id);
  for(const query of ['?project=../outside','?project=https://example.com','?project='+id.repeat(4),'?project=',''])assert.equal(requestedLectureProject(query),null);
});
test('chapter timestamps roll over hours and strip injected newlines',()=>{
  assert.equal(lectureTime(427.367),'00:07:07');assert.equal(lectureTime(3601),'01:00:01');assert.equal(lectureTime(NaN),'00:00:00');assert.equal(lectureTime(-1),'00:00:00');
  assert.equal(chapterText([{seconds:61.9,title:'입력\n조건',project_id:'p',revision:3,view:'schematic'}]),'00:01:01 입력 조건\n');
});
test('lecture evidence preserves failure, stale revisions and unknown verdicts without copying other projects',()=>{
  const project={id:'p',name:'Demo',revision:4} as Project;
  const runs=[{id:'failed',project_id:'p',revision:3,tool:'ngspice',execution_status:'failed',analysis_result:'unknown',freshness:'stale'},{id:'foreign',project_id:'q',revision:4}] as Run[];
  const result=lectureEvidence(project,runs);assert.equal(result.runs.length,1);assert.equal(result.runs[0].execution_status,'failed');assert.equal(result.runs[0].analysis_result,'unknown');assert.equal(result.runs[0].freshness,'stale');assert.equal(result.runs[0].current_revision,false);assert.equal(result.lecture_progress_is_engine_verification,false);assert.deepEqual(lectureEvidence(null,runs).runs,[]);
});

class Track extends EventTarget {readyState='live';stopped=0;constructor(public kind:string){super();}stop(){this.readyState='ended';this.stopped++;}getSettings(){return this.kind==='video'?{width:1280,height:720,frameRate:24}:{};}}
class Stream {constructor(private tracks:Track[]){}getTracks(){return this.tracks;}getVideoTracks(){return this.tracks.filter(t=>t.kind==='video');}getAudioTracks(){return this.tracks.filter(t=>t.kind==='audio');}}
class Recorder {static isTypeSupported(m:string){return m==='video/webm';}state='inactive';mimeType='video/webm';onstop:()=>void=()=>{};ondataavailable:(v:{data:Blob})=>void=()=>{};onerror:()=>void=()=>{};constructor(public stream:Stream){}start(){this.state='recording';}stop(){this.state='inactive';this.ondataavailable({data:new Blob(['fixture encoded bytes'])});queueMicrotask(()=>this.onstop());}}
test('recorder handles denied permission, microphone failure, real source dimensions, stop and disposal',async()=>{
  const original={navigator:Object.getOwnPropertyDescriptor(globalThis,'navigator'),MediaRecorder:Object.getOwnPropertyDescriptor(globalThis,'MediaRecorder'),MediaStream:Object.getOwnPropertyDescriptor(globalThis,'MediaStream')};
  let track=new Track('video'),mic=new Track('audio'),displayCalls=0,micCalls=0,deny=false,micDeny=false,resolvePending:((s:Stream)=>void)|undefined,pending=false;
  Object.defineProperty(globalThis,'MediaRecorder',{value:Recorder,configurable:true});Object.defineProperty(globalThis,'MediaStream',{value:Stream,configurable:true});
  Object.defineProperty(globalThis,'navigator',{value:{mediaDevices:{getDisplayMedia:async(options:DisplayMediaStreamOptions)=>{displayCalls++;assert.equal(options.audio,false);if(deny)throw new DOMException('denied','NotAllowedError');if(pending)return new Promise<Stream>(r=>{resolvePending=r;});return new Stream([track]);},getUserMedia:async()=>{micCalls++;if(micDeny)throw new DOMException('denied','NotAllowedError');return new Stream([mic]);}}},configurable:true});
  const states:string[]=[],errors:string[]=[],videos:unknown[]=[];const make=()=>new LectureRecorder(s=>states.push(s),r=>videos.push(r),e=>errors.push(e));
  try{
    deny=true;const a=make();await a.start(false);assert.equal(a.state,'idle');assert.equal(micCalls,0);assert(errors[0].includes('녹화를 시작하지 않았습니다'));a.dispose();
    deny=false;micDeny=true;const b=make();await b.start(true);assert.equal(track.stopped,1);assert.equal(b.state,'idle');b.dispose();
    micDeny=false;track=new Track('video');const c=make();await c.start(true);assert.equal(c.state,'recording');const before=displayCalls;await c.start(false);assert.equal(displayCalls,before);c.stop();await new Promise(r=>setTimeout(r,0));assert.equal(c.state,'ready');assert.equal(track.stopped,1);assert.equal(mic.stopped,1);assert.equal(videos.length,1);
    const video=videos[0] as {video:{width:number;frameRate:number};microphone:boolean;bytes:number;stop_reason:string};assert.equal(video.video.width,1280);assert.equal(video.video.frameRate,24);assert.equal(video.microphone,true);assert(video.bytes>0);assert.equal(video.stop_reason,'user');c.reset();assert.equal(c.state,'idle');c.dispose();
    track=new Track('video');const d=make();await d.start(false);track.dispatchEvent(new Event('ended'));await new Promise(r=>setTimeout(r,0));assert.equal(d.state,'ready');assert.equal((videos.at(-1) as {stop_reason:string}).stop_reason,'screen-ended');d.dispose();
    pending=true;track=new Track('video');const e=make(),start=e.start(false);e.dispose();resolvePending!(new Stream([track]));await start;assert.equal(track.stopped,1);assert.equal(videos.length,2);
  }finally{for(const [key,descriptor] of Object.entries(original)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}}
});
