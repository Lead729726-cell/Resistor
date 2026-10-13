import {readFile,writeFile,readdir,mkdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root='examples/research-20261013',versions=(await readdir(root,{withFileTypes:true})).filter(v=>v.isDirectory()&&/^[a-f0-9]{12}$/.test(v.name)).map(v=>v.name);
const summaries=[];
for(const version of versions){
 const folder=path.join(root,version),stages=[];
 async function walk(dir){for(const f of await readdir(dir,{withFileTypes:true})){const full=path.join(dir,f.name);if(f.isDirectory()&&!['source','pre','post','drc','lvs','pex','psrr'].includes(f.name))await walk(full);else if(f.isFile()&&/^(pre|post|drc|lvs|pex|psrr)\.json$/.test(f.name))stages.push(JSON.parse(await readFile(full,'utf8')));}}
 await walk(folder);const groups=new Map();for(const r of stages){const rows=groups.get(r.key)||[];rows.push(r);groups.set(r.key,rows);}
 const catalog=JSON.parse(await readFile(path.join(folder,'catalog.json'),'utf8'));
 const row={source_version:version,records:[...groups].map(([key,runs])=>({key,id:runs[0].id,project_id:runs[0].project_id,stages:runs})),default_blocks:stages.filter(r=>r.stage==='pre'&&r.key.endsWith('/default')).length,matrix_conditions:stages.filter(r=>r.stage==='pre'&&/\/x[14]-slew/.test(r.key)).length,stage_counts:Object.fromEntries(['pre','post','drc','lvs','pex','psrr'].map(s=>[s,stages.filter(r=>r.stage===s).length])),outcomes:Object.fromEntries(['pass','fail','unknown'].map(s=>[s,stages.filter(r=>r.analysis_result===s).length])),execution_failures:stages.filter(r=>r.execution_status!=='completed').map(r=>({key:r.key,stage:r.stage,message:r.message})),criterion_failures:stages.filter(r=>r.execution_status==='completed'&&r.analysis_result==='fail').map(r=>({key:r.key,stage:r.stage,checks:r.verification?.checks,measurements:r.measurements})),literature:catalog.literature,scope:'Actual recorded native stages, grouped by their source version. Counts do not establish complete PVT, noise, timing closure, complete source power or manufacturing signoff.',foundry_signoff:false};
 await writeFile(path.join(folder,'summary.json'),JSON.stringify(row,null,2));summaries.push(row);
 if(['64f147d67f3e','9d62f8bdc7c8','9eb7adb9a008'].includes(version)){
  const state=JSON.parse(await readFile(version==='64f147d67f3e'?'.runtime/research/state-64f147d67f3e.json':`.runtime/research/state-${version}-catalog.json`,'utf8'));
  for(const[file,hash]of Object.entries(state.source)){const from=version==='9eb7adb9a008'?file:path.join(`.runtime/research/source-${version}`,file.slice('workers/eda/'.length));const body=await readFile(from);if(createHash('sha256').update(body).digest('hex')!==hash)throw Error('Source snapshot differs: '+file);const dest=path.join(folder,'source',file);await mkdir(path.dirname(dest),{recursive:true});await copyFile(from,dest);}
  await writeFile(path.join(folder,'source/SHA256SUMS.json'),JSON.stringify(state.source,null,2));
 }
 console.log(JSON.stringify({version,blocks:row.default_blocks,matrix:row.matrix_conditions,stages:row.stage_counts,outcomes:row.outcomes,execution_failures:row.execution_failures.length}));
}
await writeFile(root+'/versions.json',JSON.stringify(summaries.map(s=>({source_version:s.source_version,default_blocks:s.default_blocks,matrix_conditions:s.matrix_conditions,summary:`${s.source_version}/summary.json`})),null,2));
