import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
const source=await readFile('public/register-symbol.svg','utf8');
const browser=await chromium.launch({headless:true});
const sizes=[16,24,32,48,64,128,256],images=[];
const macImages=[];
try{
  const page=await browser.newPage();
  for(const size of sizes){
    await page.setViewportSize({width:size,height:size});
    await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;background:transparent}svg{display:block;width:100%;height:100%}</style>${source}`);
    images.push(await page.screenshot({omitBackground:true}));
  }
  for(const [tag,size] of [['ic07',128],['ic08',256],['ic09',512],['ic10',1024]]){
    await page.setViewportSize({width:size,height:size});
    await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;background:transparent}svg{display:block;width:100%;height:100%}</style>${source}`);
    const bytes=await page.screenshot({omitBackground:true});const chunk=Buffer.alloc(8);chunk.write(tag,0,'ascii');chunk.writeUInt32BE(bytes.length+8,4);macImages.push(Buffer.concat([chunk,bytes]));
  }
}finally{await browser.close();}
const header=Buffer.alloc(6+sizes.length*16);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);
let offset=header.length;
for(let i=0;i<sizes.length;i++){
  const index=6+i*16;header[index]=sizes[i]===256?0:sizes[i];header[index+1]=header[index];
  header.writeUInt16LE(1,index+4);header.writeUInt16LE(32,index+6);header.writeUInt32LE(images[i].length,index+8);header.writeUInt32LE(offset,index+12);offset+=images[i].length;
}
await mkdir('apps/desktop/assets',{recursive:true});
await writeFile('apps/desktop/assets/register.ico',Buffer.concat([header,...images]));
await writeFile('apps/desktop/assets/register.png',images.at(-1));
const icnsHeader=Buffer.alloc(8);icnsHeader.write('icns',0,'ascii');icnsHeader.writeUInt32BE(8+macImages.reduce((n,b)=>n+b.length,0),4);
await writeFile('apps/desktop/assets/register.icns',Buffer.concat([icnsHeader,...macImages]));
await mkdir('docs/evidence',{recursive:true});
await writeFile('docs/evidence/brand-assets.json',JSON.stringify({checked_at:new Date().toISOString(),source:'public/register-symbol.svg',source_sha256:createHash('sha256').update(source).digest('hex'),icon_sizes:sizes,png_sha256:createHash('sha256').update(images.at(-1)).digest('hex'),ico_sha256:createHash('sha256').update(Buffer.concat([header,...images])).digest('hex'),renderer:'Chromium SVG rasterization; original vector artwork'},null,2));
console.log(`Register brand: SVG favicon, ${sizes.length} ICO sizes and desktop PNG.`);
