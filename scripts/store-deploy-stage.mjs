import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
// Build on the verified *current production* file tree, not the edition's
// potentially older release metadata. Supply the read-only Vercel API tree and
// decoded vercel.json; this command never reads CLI credentials.
const [treeFile,configFile,output]=process.argv.slice(2);if(!treeFile||!configFile||!output)throw Error('Usage: store-deploy-stage TREE_JSON LIVE_VERCEL_JSON OUTPUT_DIRECTORY');
const destination=path.resolve(output),source=path.resolve('platform/download-site'),raw=JSON.parse(await readFile(treeFile,'utf8')),tree=Array.isArray(raw)?raw[0]:raw;
const sha=b=>createHash('sha1').update(b).digest('hex'),files=[];
function visit(items,prefix=''){for(const f of items){const name=prefix+f.name;if(f.type==='directory')visit(f.children||[],name+'/');else files.push({name,sha1:f.uid});}}
visit(tree.children);if(files.length<10||files.some(f=>f.name.startsWith('.')||f.name.includes('..')||!f.sha1))throw Error('Unexpected production file tree');
await mkdir(destination,{recursive:true});let cursor=0;
await Promise.all(Array.from({length:6},async()=>{while(cursor<files.length){const f=files[cursor++],target=path.resolve(destination,f.name);if(!target.startsWith(destination+path.sep))throw Error('Path outside deployment');
 let b;if(f.name==='vercel.json')b=await readFile(configFile);else{
  try{b=await readFile(path.join(source,f.name));}catch{b=Buffer.alloc(0);}
  if(sha(b)!==f.sha1){const lf=Buffer.from(b.toString('utf8').replace(/\r\n/g,'\n'));if(sha(lf)===f.sha1)b=lf;else{const r=await fetch('https://resistor.kr/'+f.name,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Production file unavailable: '+f.name);b=Buffer.from(await r.arrayBuffer());}}
 }
 if(sha(b)!==f.sha1)throw Error('Production changed or hash mismatch: '+f.name);
 await mkdir(path.dirname(target),{recursive:true});await writeFile(target,b);
}}));
await copyFile(path.join(source,'.vercelignore'),path.join(destination,'.vercelignore'));
await mkdir(path.join(destination,'.vercel'),{recursive:true});await copyFile(path.join(source,'.vercel/project.json'),path.join(destination,'.vercel/project.json'));
await mkdir(path.join(destination,'api'),{recursive:true});await copyFile(path.join(source,'api/shop.mjs'),path.join(destination,'api/shop.mjs'));
await writeFile(path.join(destination,'package.json'),JSON.stringify({name:'resistor-store-site',private:true,type:'module',engines:{node:'24.x'}},null,2)+'\n');
await writeFile(path.join(destination,'../baseline-receipt.json'),JSON.stringify({schema_version:1,source:'current-production-deployment',files,checked_at:new Date().toISOString()},null,2)+'\n');
console.log('Preserved '+files.length+' production files with SHA-1 verification. Overlay new shop with RESISTOR_SITE_OUTPUT.');
