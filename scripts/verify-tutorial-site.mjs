import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const base='https://resistor-downloads.vercel.app';
const manifest=JSON.parse(await readFile('platform/download-site/tutorial.json','utf8'));
const result={checked_at:new Date().toISOString(),base,checks:[],human_listening_review:false};
const check=(name,details)=>{result.checks.push({name,passed:true,...details});};
for(const route of ['/', '/tutorial', '/tutorial/', '/pdk-links.html']){
 const r=await fetch(base+route,{signal:AbortSignal.timeout(15000)});assert.equal(r.status,200);const html=await r.text();
 if(route.startsWith('/tutorial')){assert.equal((html.match(/data-time=/g)||[]).length,10);assert.match(html,/Register 0\.16\.0/);assert.match(html,/tutorial-assets\/subtitles-ko\.vtt/);}
 if(route==='/')assert.match(html,/튜토리얼 보기/);
 check('page',{route,status:r.status});
}
const media=await fetch(base+'/'+manifest.playback.file,{signal:AbortSignal.timeout(30000)});assert.equal(media.status,200);
const body=Buffer.from(await media.arrayBuffer());assert.equal(body.length,manifest.playback.bytes);assert.equal(createHash('sha256').update(body).digest('hex'),manifest.playback.sha256);
assert.match(media.headers.get('content-type'),/^video\/mp4/);check('video bytes and hash',{bytes:body.length,sha256:manifest.playback.sha256});
for(const [start,end] of [[0,1023],[body.length-1024,body.length-1]]){
 const r=await fetch(base+'/'+manifest.playback.file,{headers:{Range:`bytes=${start}-${end}`},signal:AbortSignal.timeout(15000)});
 assert.equal(r.status,206);assert.equal(r.headers.get('content-range'),`bytes ${start}-${end}/${body.length}`);
 assert.deepEqual(Buffer.from(await r.arrayBuffer()),body.subarray(start,end+1));check('video range',{start,end,status:r.status});
}
for(const file of ['tutorial.css','tutorial.js','appearance.js','tutorial.json','tutorial-assets/thumbnail.png','tutorial-assets/subtitles-ko.srt','tutorial-assets/subtitles-ko.vtt','tutorial-assets/inverter.register.zip','tutorial-assets/inverter.gds','tutorial-assets/inverter.oas','tutorial-assets/inverter.spice']){
 const r=await fetch(base+'/'+file,{signal:AbortSignal.timeout(15000)});assert.equal(r.status,200);
 const published=Buffer.from(await r.arrayBuffer()), local=await readFile('platform/download-site/'+file);
 if(/\.(?:css|js|json|srt|vtt|spice)$/.test(file)) assert.equal(published.toString('utf8').replace(/\r\n/g,'\n'),local.toString('utf8').replace(/\r\n/g,'\n'));
 else assert.deepEqual(published,local);
 if(file.endsWith('.vtt'))assert.match(r.headers.get('content-type'),/^text\/vtt/);
 check('static file',{file,status:r.status});
}
for(const url of [manifest.downloads.captioned_video,manifest.downloads.video_package]){
 const r=await fetch(url,{method:'HEAD',signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);check('published download',{url,status:r.status,bytes:r.headers.get('content-length')});
}
const downloads=JSON.parse(await readFile('platform/download-site/downloads.json','utf8'));
for(const file of downloads.files){
 const r=await fetch(base+'/download/'+file.platform,{method:'HEAD',redirect:'manual',signal:AbortSignal.timeout(15000)});
 assert.equal(r.status,307);assert.equal(r.headers.get('location'),file.url);check('existing OS redirect',{platform:file.platform,status:r.status});
}
result.check_count=result.checks.length;result.all_passed=true;
await writeFile('docs/evidence/tutorial-site/public-http-verification.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({all_passed:true,check_count:result.check_count,video_bytes:body.length}));
