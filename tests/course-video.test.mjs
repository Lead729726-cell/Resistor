import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectCourseVideo} from '../scripts/verify-course-video.mjs';
const fixture=()=>({format:{duration:'60'},streams:[{codec_type:'video',codec_name:'h264',width:1920,height:1080,sample_aspect_ratio:'1:1',avg_frame_rate:'30000/1001',pix_fmt:'yuv420p'},{codec_type:'audio',codec_name:'aac',channels:2,sample_rate:'44100',bit_rate:'256000'}]});
test('video metadata acceptance never claims human listening or platform approval',()=>{
  const r=inspectCourseVideo(fixture(),{bytes:1_000_000,filename:'EP01.mp4'});assert(r.metadata_checks_passed);assert.equal(r.human_audio_review,'pending');assert.equal(r.platform_approval,'not-submitted');
});
test('low resolution, wrong aspect, missing audio, unsupported fps and oversized files fail',()=>{
  for(const change of [p=>p.streams[0].width=1280,p=>p.streams[0].height=1200,p=>p.streams.pop(),p=>p.streams[0].avg_frame_rate='25/1',p=>p.streams[0].sample_aspect_ratio='4:3',p=>p.streams[1].channels=1,p=>p.streams[1].sample_rate='48000']){const p=fixture();change(p);assert(!inspectCourseVideo(p,{bytes:1_000_000,filename:'test.mp4'}).metadata_checks_passed);}
  assert(!inspectCourseVideo(fixture(),{bytes:5_000_000_000,filename:'test.mp4'}).metadata_checks_passed);
  assert(!inspectCourseVideo(fixture(),{bytes:1_000_000,filename:'test.webm'}).metadata_checks_passed);
});
test('silence with low bitrate remains flagged for manual audio review',()=>{
  const p=fixture();p.streams[1].bit_rate='2300';const r=inspectCourseVideo(p,{bytes:10000,filename:'test.mp4'});assert(r.warnings.some(s=>s.includes('Silence')));assert.equal(r.human_audio_review,'pending');
});
