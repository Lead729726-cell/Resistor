import {readFile,mkdir,cp,writeFile} from 'node:fs/promises';
import path from 'node:path';
export async function copyNotices(target){
  await mkdir(target,{recursive:true});
  const lock=JSON.parse(await readFile('package-lock.json','utf8'));
  const inventory=[];
  for(const [location,entry] of Object.entries(lock.packages)){
    if(!location.startsWith('node_modules/')||entry.dev)continue;
    let pkg;try{pkg=JSON.parse(await readFile(path.join(location,'package.json'),'utf8'));}catch(e){if(e.code==='ENOENT')continue;throw e;}
    const copied=[];
    for(const file of ['LICENSE','LICENSE.md','LICENSE.txt','LICENSE-MIT','COPYING','NOTICE','NOTICE.txt'])try{
      await readFile(path.join(location,file));const dest=`${location.replaceAll('/','-')}-${file}`;
      await cp(path.join(location,file),path.join(target,dest));copied.push(dest);
    }catch(e){if(e.code!=='ENOENT')throw e;}
    inventory.push({name:pkg.name,version:pkg.version,license:pkg.license??entry.license??null,installed_path:location,license_files:copied});
  }
  await writeFile(path.join(target,'runtime-dependency-inventory.json'),JSON.stringify(inventory,null,2));
  await cp('LICENSE',path.join(target,'Register-LICENSE'));
  await cp('docs/THIRD-PARTY-NOTICES.md',path.join(target,'THIRD-PARTY-NOTICES.md'));
}
