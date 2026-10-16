// This helper runs with the bundled Electron's Node runtime. No system Node.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
async function install(){
 const meta=JSON.parse(await fs.readFile(path.join(__dirname,'edition-installer.json'),'utf8'));
 if(!['edu','indust'].includes(meta.edition)||!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(meta.version)||!['Resistor','Resistor Edu'].includes(meta.package_name))throw Error('Invalid installer identity.');
 const darwin=process.platform==='darwin';if(!darwin&&process.platform!=='linux')throw Error('Use the Windows EXE installer.');
 const source=path.join(__dirname,meta.package_name+(darwin?'.app':''));
 const identity=JSON.parse(await fs.readFile(path.join(source,darwin?'Contents/Resources/app/product-edition.json':'resources/app/product-edition.json'),'utf8'));
 if(identity.edition!==meta.edition)throw Error('App belongs to another edition.');
 const base=darwin?path.join(os.homedir(),'Applications'):path.join(os.homedir(),'.local','opt','resistor-'+meta.edition),dest=darwin?path.join(base,meta.package_name+'.app'):path.join(base,meta.version);
 await fs.mkdir(base,{recursive:true});
 const staging=dest+'.new-'+process.pid,backup=dest+'.backup-'+Date.now();await fs.cp(source,staging,{recursive:true,errorOnExist:true,force:false,verbatimSymlinks:true});
 let backed=false;try{try{await fs.rename(dest,backup);backed=true;}catch(e){if(e.code!=='ENOENT')throw e;}await fs.rename(staging,dest);}catch(e){if(backed)await fs.rename(backup,dest).catch(()=>{});throw e;}
 if(darwin){
   const signature=cp.spawnSync('/usr/bin/codesign',['--verify','--deep','--strict',dest],{stdio:'inherit'});
   if(signature.status!==0){if(backed){await fs.rename(dest,dest+'.failed-'+Date.now());await fs.rename(backup,dest);}throw Error('Application signature verification failed. The previous application was preserved.');}
   cp.spawnSync('/usr/bin/xattr',['-dr','com.apple.quarantine',dest],{stdio:'ignore'});
   console.log('Installed '+meta.name+' at '+dest+'. Developer ID / Apple notarization are not provided. Previous app backup: '+(backed?backup:'none'));
 }else{
   const folder=path.join(os.homedir(),'.local','share','applications');await fs.mkdir(folder,{recursive:true});const quote=s=>'"'+s.replace(/[\\"`$]/g,c=>'\\'+c)+'"';
   await fs.writeFile(path.join(folder,meta.bundle_id+'.desktop'),['[Desktop Entry]','Type=Application','Name='+meta.name,'Comment=Electronic engineering workbench','Exec='+quote(path.join(dest,meta.package_name)),'Icon='+path.join(dest,'resources/app/apps/desktop/assets/register.png'),'Terminal=false','Categories=Development;Electronics;',''].join('\n'));
   console.log('Installed '+meta.name+' at '+dest+'. User design data is preserved.');
 }
}
install().catch(e=>{console.error(e.message);process.exitCode=1;});
