import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {documentFamily} from './site/course-document-design.mjs';

const hash=body=>createHash('sha256').update(body).digest('hex');
async function htmlFiles(directory,prefix=''){
 const files=[];
 for(const entry of await readdir(directory,{withFileTypes:true})){
  if(entry.name.startsWith('.')||['api','node_modules'].includes(entry.name))continue;
  const name=prefix+entry.name;
  if(entry.isDirectory())files.push(...await htmlFiles(path.join(directory,entry.name),name+'/'));
  else if(name.endsWith('.html'))files.push(name);
 }
 return files.sort();
}
export async function courseSiteInventory(site=path.resolve(process.env.RESISTOR_SITE_OUTPUT||'platform/download-site')){
 const config=JSON.parse(await readFile(path.join(site,'vercel.json'),'utf8')),pages=[];
 for(const file of await htmlFiles(site)){
  const html=await readFile(path.join(site,file),'utf8'),family=documentFamily(file);
  const body=html.match(/<body\b([^>]*)>/i)?.[1]||'',classes=body.match(/class="([^"]*)"/)?.[1]?.split(/\s+/)||[];
  const styles=[...html.matchAll(/<link\b[^>]*href="([^"]+\.css)"[^>]*>/g)].map(match=>match[1]);
  const header=html.includes('data-academy-header'),footer=html.includes('class="academy-footer"');
  const unified=header&&footer&&classes.includes('academy-page')&&(family==='course'||classes.includes('academy-document')&&styles.includes('/course-documents.css'));
  const directoryRoute=file.endsWith('/index.html')?'/'+file.slice(0,-'index.html'.length):file==='index.html'?'/':null;
  pages.push({file,family,routes:[...(directoryRoute?[directoryRoute]:[]),'/'+file,...(config.rewrites||[]).filter(rule=>rule.destination==='/'+file).map(rule=>rule.source)],title:html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]||'',sha256:hash(html),design:unified?'unified':header?'header_only':'legacy',shared_header:header,shared_footer:footer,document_stylesheet:styles.includes('/course-documents.css'),original_footer_note:html.includes('data-document-footer')});
 }
 const protectedFiles={};
 for(const file of ['vercel.json','package.json','api/shop.mjs','downloads.json','edition-downloads.json','updates.json','edu-updates.json','shop/catalog.json']){
  try{protectedFiles[file]=hash(await readFile(path.join(site,file)));}catch(error){if(error.code!=='ENOENT')throw error;}
 }
 return {schema_version:1,edition:'edu',scope:'public website design inventory; no deployment or engine execution',checked_at:new Date().toISOString(),html_pages:pages.length,rewrites:(config.rewrites||[]).length,redirects:(config.redirects||[]).length,families:Object.fromEntries([...new Set(pages.map(page=>page.family))].map(family=>[family,{pages:pages.filter(page=>page.family===family).length,unified:pages.filter(page=>page.family===family&&page.design==='unified').length}])),omitted_pages:pages.filter(page=>page.design!=='unified').map(page=>page.file),protected_sha256:protectedFiles,pages};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const inventory=await courseSiteInventory(),index=process.argv.indexOf('--output'),output=index<0?null:process.argv[index+1];
 if(index>=0&&!output)throw Error('--output needs a file path');
 if(output){await mkdir(path.dirname(path.resolve(output)),{recursive:true});await writeFile(output,JSON.stringify(inventory,null,2)+'\n');console.log(JSON.stringify({output,html_pages:inventory.html_pages,omitted_pages:inventory.omitted_pages.length,families:inventory.families}));}
 else console.log(JSON.stringify(inventory,null,2));
}
