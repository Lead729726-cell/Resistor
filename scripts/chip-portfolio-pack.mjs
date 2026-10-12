import {readFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {zipSync,strToU8,unzipSync} from 'fflate';
const root=path.resolve('examples/chip-portfolio'),archive={},inventory=[];
async function collect(folder){for(const entry of await readdir(folder,{withFileTypes:true})){const file=path.join(folder,entry.name);if(entry.isDirectory())await collect(file);else if(entry.isFile()&&entry.name!=='SHA256SUMS.json'){const bytes=await readFile(file);const relative=path.relative(root,file).replaceAll('\\','/');archive[relative]=new Uint8Array(bytes);inventory.push({file:relative,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}}}
await collect(root);const manifest=JSON.stringify(inventory,null,2)+'\n';await writeFile(path.join(root,'SHA256SUMS.json'),manifest);archive['SHA256SUMS.json']=strToU8(manifest);
const zip=zipSync(archive,{level:6}),opened=unzipSync(zip);
for(const item of inventory)if(createHash('sha256').update(opened[item.file]).digest('hex')!==item.sha256)throw Error('Archive differs: '+item.file);
await writeFile('examples/Resistor-Chip-Portfolio.zip',zip);
console.log(JSON.stringify({files:inventory.length,bytes:zip.length,sha256:createHash('sha256').update(zip).digest('hex'),all_entries_verified:true}));
