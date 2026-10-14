// Fetch already-published, hash-pinned originals for fresh-checkout video QA.
// No generation, narration, editing or paid provider is invoked here.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tutorialMedia} from './download-tutorial.mjs';
const site='platform/download-site',base='https://resistor-downloads.vercel.app';
const series=JSON.parse(await readFile(site+'/physical-series.json','utf8'));
const files=[{file:tutorialMedia.file,bytes:tutorialMedia.bytes,sha256:tutorialMedia.sha256},...series.lessons.map(l=>({file:'tutorial-assets/'+(l.id==='physical-logic-ko-v1'?'physical-logic':l.id==='physical-chips-ko-v1'?'physical-chips':(()=>{throw Error('Unknown original guide');})())+'.mp4',...l.files['guide-clean.mp4']}))];
const hash=b=>createHash('sha256').update(b).digest('hex');
for(const file of files){let present;try{present=await readFile(site+'/'+file.file);}catch(e){if(e.code!=='ENOENT')throw e;}if(present){if(present.length!==file.bytes||hash(present)!==file.sha256)throw Error('Existing guide differs; preserve it and inspect '+file.file);console.log('Verified existing '+file.file);continue;}const r=await fetch(base+'/'+file.file,{signal:AbortSignal.timeout(120000)});if(!r.ok)throw Error('Original guide unavailable '+r.status);const body=Buffer.from(await r.arrayBuffer());if(body.length!==file.bytes||hash(body)!==file.sha256)throw Error('Original guide hash rejected');await mkdir(site+'/tutorial-assets',{recursive:true});await writeFile(site+'/'+file.file,body,{flag:'wx'});console.log('Verified original '+file.file);}
