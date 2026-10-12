// Called from cua_repl only. Each start/action/stop must share one REPL call.
import fs from 'node:fs/promises';
export function recorder(root, {everyNthFrame=1, quality=92, sampleStillFrames=false}={}) {
  let active = null, loop = null;
  return {
    async start(name, cdp) {
      if (active) throw Error('A capture is already active');
      const folder = `${root}/raw/${name}`;
      await fs.mkdir(folder, {recursive:true});
      await cdp.send('Page.stopScreencast');
      const initial = await cdp.readEvents({methods:['Page.screencastFrame'],limit:1});
      const s = active = {name, folder, start:Date.now(), cursor:initial.cursor, frames:[], active:true, error:null, truncated:false, cdp};
      if(sampleStillFrames){const shot=await cdp.send('Page.captureScreenshot',{format:'jpeg',quality});const file='frame-000000.jpg';await fs.writeFile(`${folder}/${file}`,Buffer.from(shot.data,'base64'));s.frames.push({file,time_s:(Date.now()-s.start)/1000,metadata:{capture:'native-initial-still'}});}
      await cdp.send('Page.startScreencast',{format:'jpeg',quality,maxWidth:1920,maxHeight:1080,everyNthFrame});
      loop = (async()=>{
        try {
          while (s.active) {
            const r = await cdp.readEvents({afterSequence:s.cursor,methods:['Page.screencastFrame'],limit:100,timeoutMs:500});
            s.cursor=r.cursor; s.truncated ||= r.truncated;
            for(const ev of r.events) {
              const p=ev.params;
              await cdp.send('Page.screencastFrameAck',{sessionId:p.sessionId});
              const file=`frame-${String(s.frames.length).padStart(6,'0')}.jpg`;
              await fs.writeFile(`${folder}/${file}`,Buffer.from(p.data,'base64'));
              s.frames.push({file,time_s:Math.max(0,(p.metadata.timestamp*1000-s.start)/1000),metadata:p.metadata});
            }
          }
        } catch(e) {s.error=String(e);s.active=false;}
      })();
    },
    async stop() {
      const s=active; if(!s)return;
      await s.cdp.send('Page.stopScreencast');s.active=false;await loop;
      if(sampleStillFrames){const shot=await s.cdp.send('Page.captureScreenshot',{format:'jpeg',quality});const file=`frame-${String(s.frames.length).padStart(6,'0')}.jpg`;await fs.writeFile(`${s.folder}/${file}`,Buffer.from(shot.data,'base64'));s.frames.push({file,time_s:(Date.now()-s.start)/1000,metadata:{capture:'native-final-still'}});}
      const {cdp,...data}=s;
      data.duration_s=(Date.now()-s.start)/1000;data.frame_count=s.frames.length;
      data.capture_method=sampleStillFrames?'Native initial/final screenshots and browser repaint recording with native timestamps':'Chrome DevTools browser repaint recording with native timestamps';
      await fs.writeFile(`${s.folder}/capture.json`,JSON.stringify(data,null,2));active=null;
      return {name:s.name,frames:s.frames.length,duration_s:data.duration_s,error:s.error};
    }
  };
}
