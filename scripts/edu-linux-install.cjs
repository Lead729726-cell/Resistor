const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
async function install(){
 if(process.platform!=='linux'||process.arch!=='x64')throw Error('This package requires Linux x64.');
 const source=path.join(__dirname,'Resistor Edu'),resources=path.join(source,'resources/app');
 const metadata=JSON.parse(await fs.readFile(path.join(resources,'package.json'),'utf8')),edition=JSON.parse(await fs.readFile(path.join(resources,'product-edition.json'),'utf8'));
 if(metadata.productName!=='Resistor Edu'||edition.edition!=='edu'||!/^\d+\.\d+\.\d+$/.test(metadata.version))throw Error('This is not a verified Edu application tree.');
 const parent=path.join(os.homedir(),'.local/opt/resistor-edu'),destination=path.join(parent,metadata.version);
 await fs.mkdir(parent,{recursive:true});if((await fs.lstat(parent)).isSymbolicLink())throw Error('Installation directory must not be a symlink.');
 try{await fs.access(destination);throw Error('This version already exists. Use the app updater or open '+destination);}catch(error){if(error.code!=='ENOENT')throw error;}
 await fs.cp(source,destination,{recursive:true,errorOnExist:true,force:false,verbatimSymlinks:true});
 const desktopFolder=path.join(os.homedir(),'.local/share/applications');await fs.mkdir(desktopFolder,{recursive:true});
 const quote=value=>'"'+value.replace(/[\\"`$]/g,c=>'\\'+c)+'"';
 await fs.writeFile(path.join(desktopFolder,'org.resistor.edu.desktop'),['[Desktop Entry]','Type=Application','Name=Resistor Edu','Comment=Guided circuit and layout practice','Exec='+quote(path.join(destination,'Resistor Edu')),'Icon='+path.join(destination,'resources/app/apps/desktop/assets/register.png'),'Terminal=false','Categories=Education;Development;Electronics;','StartupWMClass=Resistor Edu',''].join('\n'));
 console.log('Resistor Edu installed: '+destination+'\nOpen Resistor Edu in the application menu. Edu and Industry data folders are unchanged.');
}
install().catch(error=>{console.error(error.message);process.exitCode=1;});
