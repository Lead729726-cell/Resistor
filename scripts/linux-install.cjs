const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
async function install(){
  if(process.platform!=='linux')throw Error('This installer is for Linux.');
  const source=path.join(__dirname,'Register');
  const {version}=JSON.parse(await fs.readFile(path.join(source,'resources/app/package.json'),'utf8'));
  if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('Invalid application version.');
  const destination=path.join(os.homedir(),'.local','opt','register',version);
  await fs.mkdir(path.dirname(destination),{recursive:true});
  try{await fs.access(destination);throw Error('This version is already installed: '+destination);}catch(e){if(e.code!=='ENOENT')throw e;}
  await fs.cp(source,destination,{recursive:true,errorOnExist:true,force:false});
  const desktopFolder=path.join(os.homedir(),'.local/share/applications');await fs.mkdir(desktopFolder,{recursive:true});
  const quote=value=>'"'+value.replace(/[\\"`$]/g,c=>'\\'+c)+'"';
  const desktop=['[Desktop Entry]','Type=Application','Name=Resistor','Comment=Schematic, layout and simulation workbench','Exec='+quote(path.join(destination,'Register')),'Icon='+path.join(destination,'resources/app/apps/desktop/assets/register.png'),'Terminal=false','Categories=Development;Electronics;','StartupWMClass=Register',''].join('\n');
  await fs.writeFile(path.join(desktopFolder,'org.register.eda.desktop'),desktop);
  console.log(`Installed Resistor ${version} in ${destination}\nOpen Resistor from the applications menu. User designs are preserved.`);
}
install().catch(e=>{console.error(e.message);process.exitCode=1;});
