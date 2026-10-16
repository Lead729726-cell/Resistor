export interface LectureRecording {
  blob:Blob;mime:string;bytes:number;duration_s:number;started_at:string;
  video:MediaTrackSettings;microphone:boolean;stop_reason:string;
}
export type CaptureState='idle'|'requesting'|'recording'|'stopping'|'ready';
/** No remote upload. Capture begins only from a user gesture; all owned tracks close on every exit. */
export class LectureRecorder {
  private tracks:MediaStreamTrack[]=[];
  private recorder:MediaRecorder|null=null;
  private chunks:Blob[]=[];
  private timer:ReturnType<typeof setTimeout>|undefined;
  private started=0;
  private disposed=false;
  private pending=false;
  private reason='user';
  private failure='';
  readonly maxBytes=512*1024*1024;
  state:CaptureState='idle';
  constructor(private changed:(state:CaptureState)=>void,private done:(recording:LectureRecording)=>void,private failed:(message:string)=>void){}
  private set(state:CaptureState){this.state=state;if(!this.disposed)this.changed(state);}
  private cleanup(){clearTimeout(this.timer);for(const t of this.tracks)t.stop();this.tracks=[];this.recorder=null;}
  async start(microphone:boolean){
    if(this.pending||this.disposed||this.state==='recording'||this.state==='stopping'||this.state==='ready')return;
    this.pending=true;this.set('requesting');this.chunks=[];this.failure='';this.reason='user';
    let settings:MediaTrackSettings={},hasMic=false,startedAt='';
    try{
      const screen=await navigator.mediaDevices.getDisplayMedia({video:{width:{ideal:1920},height:{ideal:1080},frameRate:{ideal:30}},audio:false});
      this.tracks.push(...screen.getTracks());if(this.disposed){this.cleanup();return;}
      const video=screen.getVideoTracks()[0];if(!video||video.readyState==='ended')throw Error('선택한 화면 캡처가 종료되었습니다. 다시 선택하세요.');
      const actual=video.getSettings();settings={width:actual.width,height:actual.height,frameRate:actual.frameRate,displaySurface:actual.displaySurface};
      if(microphone){const mic=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true},video:false});this.tracks.push(...mic.getTracks());hasMic=mic.getAudioTracks().length>0;}
      if(this.disposed){this.cleanup();return;}
      if(screen.getVideoTracks().some(t=>t.readyState==='ended'))throw Error('마이크 선택 중 화면 공유가 종료되었습니다.');
      const mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4'].find(m=>MediaRecorder.isTypeSupported(m));
      const recorder=this.recorder=new MediaRecorder(new MediaStream(this.tracks),{...(mime?{mimeType:mime}:{}),videoBitsPerSecond:6000000});
      let bytes=0;
      recorder.ondataavailable=e=>{if(e.data.size){this.chunks.push(e.data);bytes+=e.data.size;if(bytes>=this.maxBytes)this.stop('size-limit');}};
      recorder.onerror=()=>{this.failure='녹화 인코딩 오류가 발생했습니다. 저장 가능한 조각이 있으면 보관하고 재생을 확인하세요.';this.stop('encoder-error');};
      recorder.onstop=()=>{
        const duration=Math.max(0,(performance.now()-this.started)/1000),blob=new Blob(this.chunks,{type:recorder.mimeType||mime||'video/webm'});this.chunks=[];this.cleanup();
        if(this.disposed)return;
        if(!blob.size){this.set('idle');this.failed('영상 데이터가 생성되지 않았습니다. 화면 선택과 녹화 권한을 확인하세요.');return;}
        this.done({blob,mime:blob.type,bytes:blob.size,duration_s:duration,started_at:startedAt,video:settings,microphone:hasMic,stop_reason:this.reason});this.set('ready');
        if(this.failure)this.failed(this.failure);
      };
      video.addEventListener('ended',()=>this.stop('screen-ended'),{once:true});
      this.started=performance.now();startedAt=new Date().toISOString();recorder.start(1000);this.set('recording');
      this.timer=setTimeout(()=>this.stop('time-limit'),30*60*1000);
    }catch(e){this.cleanup();this.set('idle');if(!this.disposed)this.failed(e instanceof DOMException&&e.name==='NotAllowedError'?'화면 또는 마이크 권한을 승인하지 않았습니다. 녹화를 시작하지 않았습니다.':e instanceof Error?e.message:String(e));}
    finally{this.pending=false;}
  }
  stop(reason='user'){if(this.recorder?.state==='recording'){this.reason=reason;this.set('stopping');this.recorder.stop();}}
  reset(){if(this.state==='ready'){this.chunks=[];this.set('idle');}}
  dispose(){this.disposed=true;this.stop('disposed');this.cleanup();this.chunks=[];}
}
