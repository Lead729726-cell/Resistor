import {chromium,expect} from '@playwright/test';
import {readFile,access,writeFile} from 'node:fs/promises';
import path from 'node:path';
const html=await readFile('examples/cpu4/replay.html','utf8');
for(const m of html.matchAll(/href="([^"]+)"/g))await access(path.resolve('examples/cpu4',m[1]));
const browser=await chromium.launch({headless:true}),page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto('http://127.0.0.1:5173/examples/cpu4/replay.html');
  const video=page.locator('video');await expect(video).toHaveJSProperty('readyState',4,{timeout:30000});
  const main=await video.evaluate(v=>({duration:v.duration,width:v.videoWidth,height:v.videoHeight}));expect(main.duration).toBeGreaterThan(100);expect(main.width).toBe(1600);
  await page.getByRole('button',{name:/전체 CPU 3D ·/}).click();
  await expect(video).toHaveAttribute('src','recording/cpu-full-preview.webm');
  await expect(video).toHaveJSProperty('readyState',4,{timeout:30000});const preview=await video.evaluate(v=>({duration:v.duration,width:v.videoWidth,height:v.videoHeight}));expect(preview.duration).toBeGreaterThan(10);expect(errors).toEqual([]);
  await writeFile('examples/cpu4/replay-verification.json',JSON.stringify({checked_at:new Date().toISOString(),main,preview,chapter_buttons:await page.locator('#chapters button').count(),page_errors:errors,all_linked_files_present:true},null,2));
  console.log(JSON.stringify({main,preview,errors}));
}finally{await browser.close();}
