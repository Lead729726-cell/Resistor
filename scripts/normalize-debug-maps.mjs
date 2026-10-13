// Canonical debug sources across Windows CRLF and native macOS/Linux builds.
// Runtime JS, mappings, names and source paths are preserved byte-for-byte.
import{readFile,writeFile,readdir}from'node:fs/promises';
import{pathToFileURL}from'node:url';
export function normalizeMap(text){const map=JSON.parse(text);if(map.version!==3||!Array.isArray(map.sourcesContent))throw Error('Unsupported debug source map');map.sourcesContent=map.sourcesContent.map(s=>typeof s==='string'?s.replaceAll('\r\n','\n'):s);return JSON.stringify(map);}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){let count=0;const visit=async folder=>{for(const e of await readdir(folder,{withFileTypes:true})){const p=folder+'/'+e.name;if(e.isDirectory())await visit(p);else if(e.name.endsWith('.js.map')){const before=await readFile(p,'utf8'),after=normalizeMap(before);if(before!==after)await writeFile(p,after);count++;}}};await visit('dist');console.log('Verified canonical debug maps: '+count);}
