import {readFile} from 'node:fs/promises';
const report=JSON.parse(await readFile(process.argv[2]||'.runtime/edition-download-deploy-dry.json','utf8'));
const learning=JSON.parse(await readFile('platform/download-site/learning-assets.json','utf8'));
const required=['index.html','editions.html','download-edu.html','download-industry.html','edition-downloads.json','system-detection.mjs','robots.txt','sitemap.xml','native-runtime.html','sar-adc8.html','tutorial-assets/guide-ko-v1.mp4','tutorial-assets/physical-logic.mp4','tutorial-assets/physical-chips.mp4',...learning.files.map(f=>f.file)];
const files=new Set(report.files.map(f=>f.path));
const missing=required.filter(f=>!files.has(f)),privatePaths=[...files].filter(f=>f.split('/').some(p=>p.startsWith('.'))||/(^|\/)(?:workers|node_modules|scripts)\//.test(f));
console.log(JSON.stringify({files:files.size,required:required.length,missing,privatePaths,totalSize:report.totalSize},null,2));
if(missing.length||privatePaths.length)process.exitCode=1;
