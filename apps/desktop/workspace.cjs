const fs=require('node:fs/promises');
const path=require('node:path');

async function prepareWorkspace({root,userData,executable,override,packaged,edition='indust'}) {
  if(override)return path.resolve(override);
  if(!packaged&&edition!=='edu')return root;
  // A development package in the source checkout reuses its existing designs.
  let parent=edition==='edu'?path.parse(executable).root:path.dirname(executable);
  while(path.dirname(parent)!==parent){
    if(executable.startsWith(path.join(parent,'release')+path.sep)){
      try{await fs.access(path.join(parent,'.runtime/worker.json'));await fs.access(path.join(parent,'workers/eda/server.py'));return parent;}catch{}
    }
    parent=path.dirname(parent);
  }
  const workspace=path.join(userData,'workspace');
  await fs.mkdir(workspace,{recursive:true});
  // Seed a writable workspace outside the .app. Reopening/replacing the app
  // must not overwrite user adapters, samples, engine customizations or designs.
  for(const folder of edition==='edu'?['adapters','examples/sky130','platform/commercial']:['workers','adapters','examples','platform/commercial'])await fs.cp(path.join(root,folder),path.join(workspace,folder),{recursive:true,force:false,errorOnExist:false,filter:file=>edition!=='edu'||(!file.split(/[\\/]/).some(part=>['.secrets','__pycache__','.runtime'].includes(part))&&!path.basename(file).startsWith('.env')&&!/\.(?:pem|key|p12|pfx|sqlite3?)$/i.test(file))});
  await fs.cp(path.join(root,'.dockerignore'),path.join(workspace,'.dockerignore'),{force:false,errorOnExist:false});
  return workspace;
}
module.exports={prepareWorkspace};
