import path from 'node:path';

export function eduNativeTarget(platform=process.platform,arch=process.arch){
 const target={ 'win32-x64':'windows-x64','darwin-arm64':'macos-arm64','darwin-x64':'macos-x64','linux-x64':'linux-x64'}[platform+'-'+arch];
 if(!target)throw Error('Build Resistor Edu on its native Windows x64, macOS arm64/x64, or Linux x64 host.');
 return target;
}
export function eduNativePaths(root,version,platform=process.platform,arch=process.arch){
 if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('A semantic release version is required.');
 const target=eduNativeTarget(platform,arch),name='Resistor Edu',folder=path.join(root,'release',version,`${name}-${platform}-${arch}`),app=platform==='darwin'?path.join(folder,name+'.app'):folder;
 const resources=platform==='darwin'?path.join(app,'Contents/Resources/app'):path.join(app,'resources/app'),executable=platform==='darwin'?path.join(app,'Contents/MacOS',name):path.join(app,name+(platform==='win32'?'.exe':''));
 const basename=`Resistor-Edu-${version}-${target}`,extension=platform==='win32'?'exe':platform==='darwin'?'zip':'tar.gz',output=path.join(root,'release/edu-installers');
 return {name,target,folder,app,resources,executable,output,basename,artifact:path.join(output,basename+'.'+extension),receipt:path.join(output,basename+'.json')};
}
export function eduWindowsBuilderConfig(base,version){
 eduNativePaths('.',version,'win32','x64');
 return {...structuredClone(base),appId:'org.resistor.edu',productName:'Resistor Edu',artifactName:`Resistor-Edu-${version}-windows-x64.exe`,directories:{...base.directories,output:'release/edu-installers'},nsis:{...base.nsis,shortcutName:'Resistor Edu',uninstallDisplayName:'Resistor Edu',deleteAppDataOnUninstall:false},win:{...base.win,target:[{target:'nsis',arch:['x64']}]}};
}
export function assertEduDesktopEvidence(desktop,binding){
 for(const name of ['edition','product_id','version','target','source_revision','packaged_executable_sha256','runtime_manifest_sha256'])if(desktop?.[name]!==binding[name])throw Error('Desktop observation belongs to a different build: '+name);
 if(!['native-cua','automated-electron'].includes(desktop.verification_method)||!Number.isFinite(Date.parse(desktop.checked_at))||Date.parse(desktop.checked_at)>Date.now()+60000)throw Error('Desktop observation method or timestamp is missing.');
 const checks=['activation_checked','window_loaded','license_required_before_activation','engine_rpc_checked','lease_released'];
 if(desktop.edition_title!=='Resistor Edu'||checks.some(name=>desktop[name]!==true))throw Error('The packaged app and real serial activation have not passed QA.');
 if(desktop.verification_method==='native-cua'&&checks.some(check=>!desktop.observations?.some(item=>item.check===check&&typeof item.evidence==='string'&&item.evidence.trim().length>0)))throw Error('Each native CUA result requires an actual observation reference.');
 return true;
}
export function assertEduNativeEvidence(evidence,{version,source_revision,target,runtime_manifest_sha256}){
 if(evidence?.edition!=='edu'||evidence.product_id!=='resistor.edu'||evidence.version!==version||evidence.source_revision!==source_revision||evidence.target!==target)throw Error('Native QA belongs to another edition, revision, version or target.');
 const e=evidence.native_qa?.engine,d=evidence.native_qa?.desktop;
 if(e?.completed!==true||e.resource_scope!=='packaged'||e.runtime_manifest_sha256!==runtime_manifest_sha256||e.docker_used!==false||e.public_pdk_available!==true||!Array.isArray(e.cases)||!e.cases.length||e.cases.some(c=>c.passed!==true))throw Error('Actual packaged native engine evidence is incomplete.');
 if(!e.cases.some(c=>c.name==='actual ideal-circuit OP: 0.9 V and 90 uA; functional verdict UNKNOWN'&&Math.abs(c.voltage_V-.9)<1e-8&&c.run_id)||!e.cases.some(c=>c.name==='GDSII and OASIS actual engine round trips')||!e.cases.some(c=>c.name==='actual SKY130 inverter model transient with signed currents'&&c.run_id))throw Error('Required native circuit, layout or model checks are missing.');
 if(d?.activation_checked!==true||d.edition_title!=='Resistor Edu'||d.window_loaded!==true||d.license_required_before_activation!==true||d.engine_rpc_checked!==true||d.lease_released!==true)throw Error('The packaged app and real serial activation have not passed QA.');
 return true;
}
