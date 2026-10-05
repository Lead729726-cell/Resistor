import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {DatabaseSync,backup} from 'node:sqlite';
const workspace=path.resolve(process.env.MOS_WORKSPACE||process.cwd());
const destination=path.join(workspace,'.runtime/backups',new Date().toISOString().replaceAll(/[:.]/g,'-'));
await fs.mkdir(destination,{recursive:true,mode:0o700});
const files=[];
const includeManagedPdks=process.argv.includes('--include-managed-pdks');
const includeBackendResources=process.argv.includes('--include-backend-resources');
const pdkFiles=[];
for(const [source,target] of [['.runtime/cloud/register.sqlite3','cloud/register.sqlite3'],['.runtime/eda/projects.sqlite3','eda/projects.sqlite3']]){
  try{await fs.access(path.join(workspace,source));}catch{continue;}
  const dest=path.join(destination,target);await fs.mkdir(path.dirname(dest),{recursive:true});
  const db=new DatabaseSync(path.join(workspace,source),{readOnly:true});try{await backup(db,dest);}finally{db.close();}
  const bytes=await fs.readFile(dest);files.push({path:target,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
}
if(!files.length)throw new Error('No Register database exists in this workspace.');
for(const dir of ['projects','runs','uploads']){
  const source=path.join(workspace,'.runtime/eda',dir);try{await fs.access(source);}catch{continue;}
  await fs.cp(source,path.join(destination,'eda',dir),{recursive:true,filter:async filename=>{
    const relative=path.relative(source,filename).split(path.sep);
    if(dir==='runs'&&!includeBackendResources&&relative.includes('resources'))return false;
    if(dir==='runs'&&!includeManagedPdks&&relative.includes('models'))return false;
    const info=await fs.lstat(filename);if(info.isSymbolicLink())throw new Error('Backup source must not contain symlink references.');
    return true;
  }});
}
if(includeManagedPdks){
  const source=path.join(workspace,'.runtime/eda/pdks');
  let present=true;try{await fs.access(source);}catch(e){if(e.code==='ENOENT')present=false;else throw e;}
  if(present){await fs.cp(source,path.join(destination,'eda/pdks'),{recursive:true});
    async function record(dir){for(const item of await fs.readdir(dir,{withFileTypes:true})){const filename=path.join(dir,item.name);if(item.isDirectory())await record(filename);else if(item.isFile()){const bytes=await fs.readFile(filename);pdkFiles.push({path:path.relative(destination,filename).replaceAll('\\','/'),bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});}else throw new Error('Managed PDK backups require regular files and directories.');}}
    await record(path.join(destination,'eda/pdks'));
  }
}
await fs.writeFile(path.join(destination,'manifest.json'),JSON.stringify({format:'register-backup-v1',created_at:new Date().toISOString(),databases:files,managed_pdk_resources:pdkFiles,managed_pdk_resources_included:includeManagedPdks,backend_resource_snapshots_included:includeBackendResources,notes:['SQLite uses the online backup API. Immutable snapshots and native artifacts copied after the database snapshot.','In-flight jobs are preserved as incomplete and must be re-run after restoring. Worker/agent tokens, agent private config/state, and installed system PDKs are excluded.','Registry metadata includes operator resource/token-file references, never agent token contents. Treat all server backups as private.',includeManagedPdks?'Operator explicitly included managed uploaded PDK resources. Keep this backup private and honor the PDK license.':'PDK registry metadata is in the database. Uploaded model/technology files are excluded; use --include-managed-pdks for a complete managed-PDK restore.',includeBackendResources?'Operator explicitly included immutable backend resource snapshots. Keep this backup private and honor native library/model licensing.':'Native backend resource snapshots are excluded by default; --include-backend-resources explicitly includes them. Restoring history does not provision licensed executables or agent credentials.']},null,2));
console.log(`Register backup: ${destination}`);
